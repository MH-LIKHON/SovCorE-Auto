# ============================================================
# backend/app/app/core/dependencies.py
# ============================================================
#
# Purpose:
#   FastAPI dependency functions shared across all domain routers.
#   Provides the current authenticated user as an injectable
#   dependency so route handlers never handle token parsing.
#
# Design:
#   get_current_user: reads the Authorization header, decodes
#   the access token, loads the User row. Raises 401 if the
#   token is missing, invalid, expired, or the user is inactive.
#
#   require_verified_email: raises 403 if the user's email has
#   not been verified. Composed on top of get_current_user.
#
#   The access token is expected in the Authorization header as
#   `Bearer <token>`. Storing it in memory on the frontend (not
#   localStorage) is the XSS mitigation; the HTTP-only refresh
#   cookie is the persistence mechanism.
#
# Consumed by:
#   - Every protected route via `Depends(get_current_user)`
# ============================================================

import uuid

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.accounts.models.user import User
from app.core.database import get_db
from app.core.security import decode_token

# ==================================================
# BEARER SCHEME
# ==================================================

# auto_error=False so we can return a clean 401 instead of a 403.
_bearer = HTTPBearer(auto_error=False)

# ==================================================
# DEPENDENCIES
# ==================================================

# ------------------------------ Current User --------------------------------


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: AsyncSession = Depends(get_db),
) -> User:
    """
    Decode the Bearer token from the Authorization header and return
    the active User. Raises HTTP 401 on any failure.
    """
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        payload = decode_token(credentials.credentials)
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token is invalid or has expired.",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    # ~~~~~~~~~ Check token type ~~~~~~~~~
    if payload.get("type") not in ("access", "partial"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token type is not accepted here.",
        )

    # ~~~~~~~~~ Load the user ~~~~~~~~~
    user_id_str = payload.get("sub")
    if not user_id_str:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token.")

    try:
        user_id = uuid.UUID(user_id_str)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token.") from exc

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or deactivated.",
        )

    return user


# ------------------------------ Verified email ------------------------------


async def require_verified_email(
    user: User = Depends(get_current_user),
) -> User:
    """
    Extends get_current_user. Raises 403 if the user's email address
    has not been verified. Most app routes require this.
    """
    if not user.is_email_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Email address is not yet verified.",
        )
    return user
