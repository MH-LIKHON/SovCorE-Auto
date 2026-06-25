# ============================================================
# backend/app/app/api/v1/auth.py
# ============================================================
#
# Purpose:
#   FastAPI router for /api/v1/auth/*. Handles the passwordless
#   login flow (request-code, verify-code), token refresh,
#   logout, TOTP two-factor authentication, and Microsoft
#   OpenID Connect SSO.
#
# Design:
#   The router owns HTTP concerns only: request parsing, cookie
#   setting, response status codes. Business rules live in
#   AuthService. Refresh tokens are stored exclusively in
#   HTTP-only, Secure, SameSite=Lax cookies so they are never
#   accessible to JavaScript running on the page (XSS protection).
#
#   refresh endpoint: reads the cookie, verifies the refresh token,
#   issues a new access token. Does not rotate the refresh token
#   in Phase 1 (rotation is a Phase 8 hardening item).
#
#   logout endpoint: clears the refresh-token cookie.
#
# Consumed by:
#   - backend/app/app/api/v1/router.py
# ============================================================

import time
import uuid
from collections import defaultdict

from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response, status
from fastapi.responses import RedirectResponse
from jose import JWTError
from sqlalchemy.ext.asyncio import AsyncSession

from app.accounts.models.user import User
from app.accounts.repositories.account_repository import AccountRepository
from app.auth.schemas.auth_schemas import (
    RequestCodeIn,
    RequestCodeOut,
    TokenPairOut,
    TotpChallengeIn,
    TotpSetupOut,
    TotpVerifyOut,
    VerifyCodeIn,
)
from app.auth.services.auth_service import AuthService, InvalidCodeError
from app.auth.services.sso_service import (
    MicrosoftSSOService,
    SSOError,
    generate_state,
)
from app.auth.services.totp_service import TotpError, TotpService
from app.core.database import get_db
from app.core.dependencies import get_current_user, require_partial_token
from app.core.rate_limit import limiter
from app.core.security import decode_token, issue_access_token, jti_blocklist
from app.core.settings import get_settings

router = APIRouter()
_settings = get_settings()

# ==================================================
# PER-EMAIL RATE LIMIT
# ==================================================

# In-memory tracker for per-email request-code rate limiting.
# Stores a list of monotonic timestamps per email address.
# Must be moved to Redis before horizontal scaling (same caveat as jti_blocklist).
_EMAIL_RATE_WINDOW = 600  # 10 minutes in seconds
_EMAIL_RATE_MAX = 5
_email_request_times: defaultdict[str, list[float]] = defaultdict(list)

# ==================================================
# COOKIE HELPER
# ==================================================

# ------------------------------ Cookie config --------------------------------
# The refresh token is a long-lived HTTP-only cookie. The path is
# restricted to /api/v1/auth so it is not sent on every request.

REFRESH_COOKIE_NAME = "sva_refresh"
REFRESH_COOKIE_PATH = "/api/v1/auth"
REFRESH_COOKIE_MAX_AGE = _settings.jwt_refresh_token_expire_days * 86400


def _set_refresh_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=token,
        httponly=True,
        secure=_settings.app_env == "production",  # HTTPS-only in production
        samesite="lax",
        path=REFRESH_COOKIE_PATH,
        max_age=REFRESH_COOKIE_MAX_AGE,
    )


def _clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(
        key=REFRESH_COOKIE_NAME,
        path=REFRESH_COOKIE_PATH,
    )


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
    # Sliding window: 5 requests per 10 minutes per email address.
    # Complements the IP-level @limiter.limit above; an attacker who rotates
    # IPs could otherwise spam codes to a single mailbox without triggering
    # the IP limit.
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
) -> TokenPairOut:
    """
    Verify the six-digit code. On success, issues a JWT access token
    (JSON body) and a refresh token (HTTP-only cookie).
    If the user has TOTP enabled, returns requires_2fa=true and no
    refresh cookie; the 2FA challenge endpoint issues the real tokens.
    """
    service = AuthService(db)
    try:
        result = await service.verify_code(email=body.email, code=body.code)
    except InvalidCodeError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc),
        ) from exc

    if result.refresh_token:
        _set_refresh_cookie(response, result.refresh_token)

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
    Returns 401 if the cookie is missing or the token is invalid.
    Includes account_id so SSO users who land via redirect get it
    stored in sessionStorage without an extra roundtrip.
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
    access = issue_access_token(user_id)
    settings = get_settings()

    account_repo = AccountRepository(db)
    accounts = await account_repo.get_user_accounts(user_id)
    account_id = str(accounts[0].id) if accounts else None

    return TokenPairOut(
        access_token=access,
        expires_in=settings.jwt_access_token_expire_minutes * 60,
        account_id=account_id,
    )


# ------------------------------ Logout --------------------------------------


@router.post(
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Revoke the refresh token",
)
async def logout(
    response: Response,
    sva_refresh: str | None = Cookie(default=None),
) -> None:
    """
    Revoke the refresh token by adding its jti to the blocklist, then
    clear the cookie. The access token expires on its own schedule;
    the frontend should discard it immediately.
    """
    if sva_refresh:
        try:
            payload = decode_token(sva_refresh)
            jti = payload.get("jti")
            if jti:
                jti_blocklist.add(jti)
        except JWTError:
            pass  # Already invalid — nothing to revoke.
    _clear_refresh_cookie(response)


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
    """
    service = TotpService(db)
    try:
        result = await service.verify_login(current_user.id, body.totp_code)
    except TotpError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc

    _set_refresh_cookie(response, result.refresh_token)
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
# The CSRF state token lives in an HTTP-only cookie for the duration of the
# redirect round-trip. It expires after 5 minutes; that is more than enough
# for the user to complete the Microsoft sign-in screen.

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
    redirect the browser to Microsoft's authorization endpoint. Microsoft
    redirects back to /sso/microsoft/callback with the code and state.
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
    error_description: str | None = None,  # accepted to avoid 422; not used in logic
) -> RedirectResponse:
    """
    Receive the callback from Microsoft. Any error from Microsoft
    (consent denied, app not consented) redirects to /login with a
    query param so the frontend can show a friendly message instead
    of a raw 422 or JSON blob.
    On success, sets the refresh cookie and redirects to the dashboard.
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
        # Log the real error so it appears in server logs, then redirect
        # gracefully rather than serving a raw 500 to the browser.
        import structlog as _sl
        _sl.get_logger(__name__).error("sso_callback_error", error=str(exc), exc_info=True)
        return RedirectResponse(
            url=f"{frontend}/login?sso_error=sso_failed",
            status_code=status.HTTP_302_FOUND,
        )

    redirect = RedirectResponse(
        url=f"{frontend}/dashboard",
        status_code=status.HTTP_302_FOUND,
    )
    redirect.delete_cookie(key=_STATE_COOKIE_NAME, samesite="lax")
    redirect.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=result.refresh_token,
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
    Returns id, email, full_name, is_email_verified, totp_enabled, and
    created_at for the bearer-token holder. Used by the dashboard to
    display user info without an additional account lookup.
    """
    from app.accounts.schemas.account_schemas import UserMeOut  # local import avoids circular

    return UserMeOut.model_validate(current_user).model_dump(mode="json")
