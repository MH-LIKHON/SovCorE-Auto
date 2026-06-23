# ============================================================
# backend/app/app/api/v1/auth.py
# ============================================================
#
# Purpose:
#   FastAPI router for /api/v1/auth/*. Handles the passwordless
#   login flow (request-code, verify-code), token refresh,
#   and logout. Microsoft SSO endpoints are added in Step 1.6.
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

from fastapi import APIRouter, Cookie, Depends, HTTPException, Response, status
from jose import JWTError
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.schemas.auth_schemas import (
    RequestCodeIn,
    RequestCodeOut,
    TokenPairOut,
    VerifyCodeIn,
)
from app.auth.services.auth_service import AuthService, InvalidCodeError
from app.core.database import get_db
from app.core.security import decode_token, issue_access_token
from app.core.settings import get_settings

import uuid

router = APIRouter()
_settings = get_settings()

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
async def request_code(
    body: RequestCodeIn,
    db: AsyncSession = Depends(get_db),
) -> RequestCodeOut:
    """
    Send a six-digit OTP to the supplied email address.
    Returns a generic acknowledgment whether or not the address
    is registered — prevents user enumeration.
    """
    service = AuthService(db)
    return await service.request_code(email=body.email)


# ------------------------------ Verify Code ---------------------------------


@router.post(
    "/verify-code",
    response_model=TokenPairOut,
    summary="Verify the login code and receive tokens",
)
async def verify_code(
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
async def refresh_token(
    response: Response,
    sva_refresh: str | None = Cookie(default=None),
) -> TokenPairOut:
    """
    Read the HTTP-only refresh cookie and issue a new access token.
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
    access = issue_access_token(user_id)
    settings = get_settings()

    return TokenPairOut(
        access_token=access,
        expires_in=settings.jwt_access_token_expire_minutes * 60,
    )


# ------------------------------ Logout --------------------------------------


@router.post(
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Revoke the refresh token",
)
async def logout(response: Response) -> None:
    """
    Clear the refresh-token cookie. The access token expires on its
    own schedule; the frontend should discard it immediately.
    """
    _clear_refresh_cookie(response)
