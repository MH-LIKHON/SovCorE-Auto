# ============================================================
# backend/app/app/api/v1/auth.py
# ============================================================
#
# Purpose:
#   FastAPI router for /api/v1/auth/*. Handles the passwordless
#   login flow (request-code, verify-code), token refresh,
#   logout, TOTP two-factor authentication, Microsoft OpenID
#   Connect SSO, session conflict resolution, and per-user
#   session preferences.
#
# Design:
#   The router owns HTTP concerns only: request parsing, cookie
#   setting, response status codes. Business rules live in the
#   respective service classes.
#
#   Cookies managed by this router:
#     sva_refresh   — HTTP-only refresh token (30-day lifetime,
#                     path restricted to /api/v1/auth).
#     sva_td        — trusted-device token for 2FA bypass
#                     (15-day lifetime, path="/").
#
#   Session conflict flow:
#     verify_code / 2fa/verify / SSO callback detect a second
#     concurrent session. Instead of issuing tokens they return
#     session_conflict=True + conflict_token in the JSON body
#     (no cookie is set). The frontend shows a modal; the user
#     either calls POST /session/resolve with action="replace"
#     (revokes old session, issues new tokens + cookie) or
#     action="cancel" (discards the new login).
#
#   Idle timeout preference:
#     PATCH /me/preferences updates idle_timeout_minutes on the
#     User row. The frontend reads it from GET /me on load and
#     uses it to configure the idle timer.
#
# Consumed by:
#   - backend/app/app/api/v1/router.py
# ============================================================

import time
import uuid
from collections import defaultdict
from datetime import datetime, timezone

from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response, status
from fastapi.responses import RedirectResponse
from jose import JWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.accounts.models.user import User
from app.accounts.repositories.account_repository import AccountRepository
from app.auth.schemas.auth_schemas import (
    ChangePasswordIn,
    PasswordLoginIn,
    PreferencesIn,
    RemovePasswordIn,
    RequestCodeIn,
    RequestCodeOut,
    SessionResolveIn,
    SessionResolveOut,
    SetPasswordIn,
    TokenPairOut,
    TotpChallengeIn,
    TotpSetupOut,
    TotpVerifyOut,
    TrustedDeviceOut,
    VerifyCodeIn,
)
from app.auth.services.auth_service import AuthService, InvalidCodeError, InvalidPasswordError
from app.auth.services.session_service import SessionService
from app.auth.services.sso_service import (
    MicrosoftSSOService,
    SSOError,
    generate_state,
)
from app.auth.services.totp_service import TotpError, TotpService
from app.auth.services.trusted_device_service import (
    TRUSTED_DEVICE_COOKIE_MAX_AGE,
    TRUSTED_DEVICE_COOKIE_NAME,
    TrustedDeviceService,
)
from app.core.database import get_db
from app.core.dependencies import get_current_user, require_partial_token
from app.core.rate_limit import limiter
from app.core.security import (
    decode_token,
    hash_password,
    issue_access_token,
    jti_blocklist,
    validate_password_strength,
    verify_password,
)
from app.core.settings import get_settings

router = APIRouter()
_settings = get_settings()

# ==================================================
# PER-EMAIL RATE LIMIT
# ==================================================

# In-memory tracker for per-email request-code rate limiting.
# Stores a list of monotonic timestamps per email address.
# Must be moved to Redis before horizontal scaling.
_EMAIL_RATE_WINDOW = 600  # 10 minutes in seconds
_EMAIL_RATE_MAX = 5
_email_request_times: defaultdict[str, list[float]] = defaultdict(list)

# ==================================================
# COOKIE HELPERS
# ==================================================

# ------------------------------ Refresh cookie config -----------------------
# Restricted to /api/v1/auth so the browser does not send it on every request.

REFRESH_COOKIE_NAME = "sva_refresh"
REFRESH_COOKIE_PATH = "/api/v1/auth"
REFRESH_COOKIE_MAX_AGE = _settings.jwt_refresh_token_expire_days * 86400


def _set_refresh_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=token,
        httponly=True,
        secure=_settings.app_env == "production",
        samesite="lax",
        path=REFRESH_COOKIE_PATH,
        max_age=REFRESH_COOKIE_MAX_AGE,
    )


def _clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(key=REFRESH_COOKIE_NAME, path=REFRESH_COOKIE_PATH)


# ------------------------------ Trusted-device cookie config ----------------

def _set_trusted_device_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=TRUSTED_DEVICE_COOKIE_NAME,
        value=token,
        httponly=True,
        secure=_settings.app_env == "production",
        samesite="lax",
        path="/",
        max_age=TRUSTED_DEVICE_COOKIE_MAX_AGE,
    )


# ==================================================
# HELPERS
# ==================================================


def _browser_label(user_agent: str) -> str:
    """Derive a short human-readable label from the User-Agent string."""
    ua = user_agent.lower()
    # Check Edge before Chrome — Edge UAs contain both "edg/" and "chrome/".
    if "edg/" in ua:
        browser = "Edge"
    elif "firefox/" in ua:
        browser = "Firefox"
    elif "opr/" in ua or "opera/" in ua:
        browser = "Opera"
    elif "chrome/" in ua:
        browser = "Chrome"
    elif "safari/" in ua:
        browser = "Safari"
    else:
        browser = "Browser"

    if "windows" in ua:
        os_ = "Windows"
    elif "android" in ua:
        os_ = "Android"
    elif "ipad" in ua:
        os_ = "iPad"
    elif "iphone" in ua:
        os_ = "iPhone"
    elif "mac os" in ua or "macos" in ua:
        os_ = "Mac"
    elif "linux" in ua:
        os_ = "Linux"
    else:
        os_ = None

    return f"{browser} on {os_}" if os_ else browser


# ==================================================
# ENDPOINTS
# ==================================================

# ------------------------------ Request Code --------------------------------


@router.post(
    "/request-code",
    response_model=RequestCodeOut,
    summary="Request a six-digit login code",
)
@limiter.limit("5/minute")
async def request_code(
    request: Request,
    body: RequestCodeIn,
    db: AsyncSession = Depends(get_db),
) -> RequestCodeOut:
    """
    Send a six-digit OTP to the supplied email address.
    Returns a generic acknowledgment whether or not the address
    is registered — prevents user enumeration.
    """
    # ~~~~~~~~~ Per-email rate limit ~~~~~~~~~
    now = time.monotonic()
    cutoff = now - _EMAIL_RATE_WINDOW
    recent = [t for t in _email_request_times[body.email] if t > cutoff]
    if len(recent) >= _EMAIL_RATE_MAX:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many code requests for this address. Wait ten minutes and try again.",
        )
    recent.append(now)
    _email_request_times[body.email] = recent

    service = AuthService(db)
    return await service.request_code(email=body.email)


# ------------------------------ Verify Code ---------------------------------


@router.post(
    "/verify-code",
    response_model=TokenPairOut,
    summary="Verify the login code and receive tokens",
)
@limiter.limit("10/minute")
async def verify_code(
    request: Request,
    body: VerifyCodeIn,
    response: Response,
    db: AsyncSession = Depends(get_db),
    sva_td: str | None = Cookie(default=None),
) -> TokenPairOut:
    """
    Verify the six-digit code. On success, issues a JWT access token
    (JSON body) and a refresh token (HTTP-only cookie).

    If the user has TOTP enabled and the browser is not trusted,
    returns requires_2fa=true and no refresh cookie; the 2FA challenge
    endpoint issues the real tokens.

    If a concurrent session is detected, returns session_conflict=true
    and a conflict_token. No cookie is set; the frontend must call
    POST /session/resolve to proceed.
    """
    service = AuthService(db)
    user_agent = request.headers.get("user-agent", "")
    try:
        result = await service.verify_code(
            email=body.email,
            code=body.code,
            sva_td_cookie=sva_td,
            remember_device=body.remember_device,
            device_label=_browser_label(user_agent),
        )
    except InvalidCodeError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc),
        ) from exc

    # Only set the cookie when we actually have a refresh token (not 2FA
    # pending and not a session conflict).
    if result.refresh_token:
        _set_refresh_cookie(response, result.refresh_token)

    if result.device_token:
        _set_trusted_device_cookie(response, result.device_token)

    return result.token_pair


# ------------------------------ Refresh ---------------------------------


@router.post(
    "/refresh",
    response_model=TokenPairOut,
    summary="Exchange a refresh token for a new access token",
)
@limiter.limit("20/minute")
async def refresh_token(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
    sva_refresh: str | None = Cookie(default=None),
) -> TokenPairOut:
    """
    Read the HTTP-only refresh cookie and issue a new access token.
    Also bumps last_seen_at on the session row so the audit trail
    reflects real activity.
    Returns 401 if the cookie is missing or the token is invalid.
    """
    if not sva_refresh:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No refresh token.",
        )

    try:
        payload = decode_token(sva_refresh)
    except JWTError as exc:
        _clear_refresh_cookie(response)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token is invalid or has expired.",
        ) from exc

    if payload.get("type") != "refresh":
        _clear_refresh_cookie(response)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token type mismatch.",
        )

    user_id = uuid.UUID(payload["sub"])

    # ~~~~~~~~~ Backend idle timeout enforcement ~~~~~~~~~
    # Check BEFORE issuing a new token and BEFORE touching last_seen_at.
    # last_seen_at is updated by real API calls (get_current_user) so it
    # reflects genuine user activity, not just refresh heartbeats.
    # This catches the case where the browser was closed and reopened after
    # the idle window elapsed — the frontend timer cannot fire then.
    svc = SessionService(db)
    sess = await svc.get_session(user_id)
    if sess:
        user_result = await db.execute(select(User).where(User.id == user_id))
        db_user = user_result.scalar_one_or_none()
        if db_user:
            elapsed = (datetime.now(timezone.utc) - sess.last_seen_at).total_seconds()
            if elapsed > db_user.idle_timeout_minutes * 60:
                _clear_refresh_cookie(response)
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Session expired due to inactivity. Please sign in again.",
                )

    # Pass the refresh token's JTI as session_jti so get_current_user
    # can validate the session row on each request.
    session_jti = payload.get("jti", "")
    access = issue_access_token(user_id, session_jti=session_jti)
    settings = get_settings()

    account_repo = AccountRepository(db)
    accounts = await account_repo.get_user_accounts(user_id)
    account_id = str(accounts[0].id) if accounts else None

    # Touch the session row AFTER the idle check — updating last_seen_at
    # before the check would defeat the purpose.
    await svc.touch_session(user_id)

    return TokenPairOut(
        access_token=access,
        expires_in=settings.jwt_access_token_expire_minutes * 60,
        account_id=account_id,
    )


# ------------------------------ Logout --------------------------------------


@router.post(
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Revoke the refresh token and clear the session",
)
async def logout(
    response: Response,
    db: AsyncSession = Depends(get_db),
    sva_refresh: str | None = Cookie(default=None),
) -> None:
    """
    Revoke the refresh token by adding its JTI to the blocklist,
    remove the user_sessions row, and clear the cookies. The access
    token expires on its own schedule; the frontend discards it.
    """
    if sva_refresh:
        try:
            payload = decode_token(sva_refresh)
            user_id_str = payload.get("sub")
            jti = payload.get("jti")
            if user_id_str and jti:
                svc = SessionService(db)
                await svc.revoke_session(uuid.UUID(user_id_str), jti)
        except (JWTError, ValueError):
            # Already invalid or malformed — still clear the cookie.
            pass

    _clear_refresh_cookie(response)
    # Also clear the trusted-device cookie on explicit logout so the
    # user must re-verify 2FA on the next login from this browser.
    response.delete_cookie(key=TRUSTED_DEVICE_COOKIE_NAME, path="/")


# ==================================================
# SESSION CONFLICT RESOLUTION
# ==================================================


@router.post(
    "/session/resolve",
    response_model=SessionResolveOut,
    summary="Resolve a concurrent-session conflict",
)
async def resolve_session(
    body: SessionResolveIn,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> SessionResolveOut:
    """
    Called by the frontend session-conflict modal.

    action="replace": revoke the existing session, claim the new one,
    set the refresh cookie, and return the new access token.

    action="cancel": discard the pending login. No cookie is set;
    the frontend redirects the user back to /login.
    """
    svc = SessionService(db)
    result = await svc.resolve_conflict(body.conflict_token, body.action)

    if result is None:
        if body.action == "cancel":
            return SessionResolveOut(ok=True)
        # conflict_token was not found or expired.
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="Conflict token has expired or is invalid. Please sign in again.",
        )

    _set_refresh_cookie(response, result.refresh_token)
    return SessionResolveOut(
        ok=True,
        access_token=result.access_token,
        expires_in=result.expires_in,
        account_id=result.account_id,
    )


# ==================================================
# TWO-FACTOR AUTHENTICATION
# ==================================================

# ------------------------------ Post-login 2FA challenge --------------------


@router.post(
    "/2fa/verify",
    response_model=TokenPairOut,
    summary="Complete the TOTP challenge after passwordless code login",
)
@limiter.limit("10/minute")
async def verify_2fa_login(
    request: Request,
    body: TotpChallengeIn,
    response: Response,
    current_user: User = Depends(require_partial_token),
    db: AsyncSession = Depends(get_db),
) -> TokenPairOut:
    """
    Called when verify-code returned requires_2fa=true. Verifies the
    six-digit TOTP code and issues the full access + refresh token pair.
    Requires a type=partial token; full access tokens are rejected here.

    When body.remember_device=True and no session conflict exists, a
    trusted-device token is set in an HTTP-only cookie (sva_td) so
    future logins on this browser skip the TOTP step for 15 days.

    When a session conflict is detected, returns session_conflict=True
    and a conflict_token; no cookies are set.
    """
    service = TotpService(db)
    user_agent = request.headers.get("user-agent", "")
    try:
        result = await service.verify_login(
            current_user.id,
            body.totp_code,
            remember_device=body.remember_device,
            device_label=_browser_label(user_agent),
        )
    except TotpError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc

    if result.refresh_token:
        _set_refresh_cookie(response, result.refresh_token)

    if result.device_token:
        _set_trusted_device_cookie(response, result.device_token)

    return result.token_pair


# ------------------------------ TOTP setup (from account settings) ----------


@router.post(
    "/2fa/setup",
    response_model=TotpSetupOut,
    summary="Begin TOTP two-factor authentication setup",
)
async def setup_2fa(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TotpSetupOut:
    """
    Generate a new TOTP secret and return the provisioning URI.
    2FA is not active until /2fa/confirm is called with a valid code.
    """
    service = TotpService(db)
    return await service.setup(current_user.id)


# ------------------------------ TOTP confirm --------------------------------


@router.post(
    "/2fa/confirm",
    response_model=TotpVerifyOut,
    summary="Confirm TOTP setup with the first authenticator code",
)
async def confirm_2fa(
    body: TotpChallengeIn,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TotpVerifyOut:
    """
    Verify the first TOTP code after setup. On success, 2FA is active
    and every future login requires a TOTP code after the email code.
    """
    service = TotpService(db)
    try:
        return await service.confirm(current_user.id, body.totp_code)
    except TotpError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


# ------------------------------ Disable 2FA --------------------------------


@router.post(
    "/2fa/disable",
    response_model=TotpVerifyOut,
    summary="Disable TOTP two-factor authentication",
)
async def disable_2fa(
    body: TotpChallengeIn,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TotpVerifyOut:
    """
    Disable 2FA for the account. A valid TOTP code is required so a
    stolen session cannot silently remove the second factor.
    """
    service = TotpService(db)
    try:
        return await service.disable(current_user.id, body.totp_code)
    except TotpError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


# ==================================================
# MICROSOFT SSO — OPENID CONNECT
# ==================================================

# ------------------------------ Cookie config --------------------------------

_STATE_COOKIE_NAME = "sva_oauth_state"
_STATE_COOKIE_MAX_AGE = 300  # seconds


# ------------------------------ Start ---------------------------------------


@router.get(
    "/sso/microsoft/start",
    summary="Begin the Microsoft OpenID Connect sign-in flow",
    response_class=RedirectResponse,
)
async def sso_microsoft_start(response: Response) -> RedirectResponse:
    """
    Generate a CSRF state token, set it as an HTTP-only cookie, and
    redirect the browser to Microsoft's authorization endpoint.
    """
    settings = get_settings()
    if not settings.ms_client_id or not settings.ms_client_secret:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Microsoft SSO is not configured on this instance.",
        )

    state = generate_state()
    auth_url = MicrosoftSSOService.build_auth_url(state)

    redirect = RedirectResponse(url=auth_url, status_code=status.HTTP_302_FOUND)
    redirect.set_cookie(
        key=_STATE_COOKIE_NAME,
        value=state,
        httponly=True,
        secure=settings.app_env == "production",
        samesite="lax",
        max_age=_STATE_COOKIE_MAX_AGE,
    )
    return redirect


# ------------------------------ Callback ------------------------------------


@router.get(
    "/sso/microsoft/callback",
    summary="Complete the Microsoft OpenID Connect flow",
)
async def sso_microsoft_callback(
    db: AsyncSession = Depends(get_db),
    sva_oauth_state: str | None = Cookie(default=None),
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    error_description: str | None = None,
) -> RedirectResponse:
    """
    Receive the callback from Microsoft. On success sets the refresh cookie
    and redirects to the dashboard. On session conflict redirects to
    /login?conflict=<token> so the frontend can show the conflict modal.
    """
    settings = get_settings()
    frontend = settings.cors_origins_list[0] if settings.cors_origins_list else "http://localhost:3000"

    if error:
        return RedirectResponse(
            url=f"{frontend}/login?sso_error={error}",
            status_code=status.HTTP_302_FOUND,
        )

    if not code or not state:
        return RedirectResponse(
            url=f"{frontend}/login?sso_error=missing_code",
            status_code=status.HTTP_302_FOUND,
        )

    if not sva_oauth_state or sva_oauth_state != state:
        return RedirectResponse(
            url=f"{frontend}/login?sso_error=state_mismatch",
            status_code=status.HTTP_302_FOUND,
        )

    service = MicrosoftSSOService(db)
    try:
        result = await service.login(code)
    except Exception as exc:  # noqa: BLE001
        import structlog as _sl
        _sl.get_logger(__name__).error("sso_callback_error", error=str(exc), exc_info=True)
        return RedirectResponse(
            url=f"{frontend}/login?sso_error=sso_failed",
            status_code=status.HTTP_302_FOUND,
        )

    # ~~~~~~~~~ Single-session enforcement ~~~~~~~~~
    # Decode user_id from the access token rather than adding user_id to SSOResult.
    from jose import jwt as _jwt
    access_claims = _jwt.get_unverified_claims(result.token_pair.access_token)
    sso_user_id = uuid.UUID(access_claims["sub"])
    refresh_jti = _jwt.get_unverified_claims(result.refresh_token).get("jti", "")

    sso_svc = SessionService(db)
    conflict = await sso_svc.check_and_claim(
        user_id=sso_user_id,
        access_token=result.token_pair.access_token,
        refresh_token=result.refresh_token,
        refresh_jti=refresh_jti,
        expires_in=result.token_pair.expires_in,
        account_id=result.token_pair.account_id,
    )

    if conflict.session_conflict:
        # Cannot set tokens via redirect; send the conflict token as a query
        # param so the login page can show the conflict modal.
        return RedirectResponse(
            url=f"{frontend}/login?conflict={conflict.conflict_token}",
            status_code=status.HTTP_302_FOUND,
        )

    redirect = RedirectResponse(
        url=f"{frontend}/dashboard",
        status_code=status.HTTP_302_FOUND,
    )
    redirect.delete_cookie(key=_STATE_COOKIE_NAME, samesite="lax")
    redirect.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=conflict.refresh_token,
        httponly=True,
        secure=settings.app_env == "production",
        samesite="lax",
        path=REFRESH_COOKIE_PATH,
        max_age=REFRESH_COOKIE_MAX_AGE,
    )
    return redirect


# ==================================================
# CURRENT USER
# ==================================================


@router.get(
    "/me",
    summary="Return the currently authenticated user's profile",
)
async def me(current_user: User = Depends(get_current_user)) -> dict:
    """
    Returns id, email, full_name, is_email_verified, totp_enabled,
    idle_timeout_minutes, and created_at for the bearer-token holder.
    """
    from app.accounts.schemas.account_schemas import UserMeOut
    return UserMeOut.model_validate(current_user).model_dump(mode="json")


# ==================================================
# USER PREFERENCES
# ==================================================


@router.patch(
    "/me/preferences",
    summary="Update per-user session preferences",
)
async def update_preferences(
    body: PreferencesIn,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Update idle_timeout_minutes for the authenticated user.
    Accepted values: 5, 10, 15, 20, 25, 30.
    """
    result = await db.execute(select(User).where(User.id == current_user.id))
    user = result.scalar_one()
    user.idle_timeout_minutes = body.idle_timeout_minutes
    await db.flush()

    from app.accounts.schemas.account_schemas import UserMeOut
    return UserMeOut.model_validate(user).model_dump(mode="json")


# ==================================================
# TRUSTED BROWSER MANAGEMENT
# ==================================================


@router.get(
    "/trusted-devices",
    response_model=list[TrustedDeviceOut],
    summary="List trusted browsers for the authenticated user",
)
async def list_trusted_devices(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[TrustedDeviceOut]:
    """
    Return all non-expired trusted browsers saved by the current user,
    newest first. Each entry shows the browser label and expiry date so
    the settings page can display them for review or removal.
    """
    svc = TrustedDeviceService(db)
    devices = await svc.list_for_user(current_user.id)
    return [TrustedDeviceOut.model_validate(d) for d in devices]


@router.delete(
    "/trusted-devices/{device_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Remove a trusted browser by ID",
)
async def delete_trusted_device(
    device_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """
    Remove a specific trusted browser. Ownership is enforced: a user
    cannot remove another user's device. Returns 404 if the device does
    not exist or belongs to a different user.
    """
    svc = TrustedDeviceService(db)
    deleted = await svc.delete_for_user(device_id, current_user.id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Trusted device not found.",
        )


# ==================================================
# PASSWORD MANAGEMENT
# ==================================================


@router.post(
    "/password/login",
    response_model=TokenPairOut,
    summary="Sign in with email and password",
)
@limiter.limit("5/minute")
async def password_login(
    request: Request,
    body: PasswordLoginIn,
    response: Response,
    db: AsyncSession = Depends(get_db),
    sva_td: str | None = Cookie(default=None),
) -> TokenPairOut:
    """
    Alternative to the email-OTP flow. Accepts email + password and
    returns the same token pair. Session conflict and TOTP flow are
    identical to verify-code. Rate limit is stricter (5/min) to reduce
    brute-force exposure.
    """
    service = AuthService(db)
    user_agent = request.headers.get("user-agent", "")
    try:
        result = await service.login_with_password(
            email=body.email,
            password=body.password,
            sva_td_cookie=sva_td,
            remember_device=body.remember_device,
            device_label=_browser_label(user_agent),
        )
    except InvalidPasswordError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc

    if result.refresh_token:
        _set_refresh_cookie(response, result.refresh_token)

    if result.device_token:
        _set_trusted_device_cookie(response, result.device_token)

    return result.token_pair


@router.post(
    "/password/set",
    summary="Set a password for the account (no existing password required)",
)
async def set_password(
    body: SetPasswordIn,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Set an initial password. Requires an active session (not available
    before login). Rejects weak passwords per ISO 27001 / NIST 800-63B.
    If a password is already set, use /password/change instead.
    """
    if current_user.password_hash is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A password is already set. Use change-password to update it.",
        )

    errors = validate_password_strength(body.password, current_user.email)
    if errors:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=errors[0])

    result = await db.execute(select(User).where(User.id == current_user.id))
    user = result.scalar_one()
    from datetime import datetime, timezone as _tz
    user.password_hash = hash_password(body.password)
    user.password_updated_at = datetime.now(_tz.utc)
    await db.flush()
    return {"ok": True}


@router.post(
    "/password/change",
    summary="Change an existing password",
)
async def change_password(
    body: ChangePasswordIn,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Replace an existing password. Requires the current password to
    prevent account takeover via a stolen session token.
    """
    if not current_user.password_hash:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No password is set on this account. Use set-password first.",
        )

    if not verify_password(body.current_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Current password is incorrect.",
        )

    errors = validate_password_strength(body.new_password, current_user.email)
    if errors:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=errors[0])

    result = await db.execute(select(User).where(User.id == current_user.id))
    user = result.scalar_one()
    from datetime import datetime, timezone as _tz
    user.password_hash = hash_password(body.new_password)
    user.password_updated_at = datetime.now(_tz.utc)
    await db.flush()
    return {"ok": True}


@router.post(
    "/password/remove",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Remove the password from the account",
)
async def remove_password(
    body: RemovePasswordIn,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """
    Remove the password from the account. Requires the current password
    as confirmation. After removal, only email OTP and SSO can be used.
    """
    if not current_user.password_hash:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No password is set on this account.",
        )

    if not verify_password(body.current_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Current password is incorrect.",
        )

    result = await db.execute(select(User).where(User.id == current_user.id))
    user = result.scalar_one()
    user.password_hash = None
    user.password_updated_at = None
    await db.flush()
