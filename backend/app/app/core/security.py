# ============================================================
# backend/app/app/core/security.py
# ============================================================
#
# Purpose:
#   JWT token issue and verification, plus the six-digit code
#   generator for passwordless login. All cryptographic
#   operations for the core auth flow live here.
#
# Design:
#   Access tokens: HS256-signed JWTs, short-lived (30 min default).
#   Refresh tokens: HS256-signed JWTs, long-lived (30 days default).
#   Both tokens carry: sub (user_id UUID), type ("access"/"refresh"),
#   jti (unique token ID for revocation), iat, exp.
#
#   Passwordless code: six random decimal digits generated with
#   secrets.randbelow() to avoid the small modulo bias in
#   random.randint(0, 999999). Only the SHA-256 hash of the code
#   is stored; the plaintext is never persisted.
#
#   TOTP helpers live in core/totp.py and are wired in Phase 1
#   step 1.4.
#
# Consumed by:
#   - backend/app/app/auth/services/auth_service.py
#   - backend/app/app/core/dependencies.py
# ============================================================

import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from jose import JWTError, jwt

from app.core.settings import get_settings

# ==================================================
# SETTINGS
# ==================================================

_settings = get_settings()

# ==================================================
# JTI BLOCKLIST
# ==================================================

# In-memory set of revoked JWT IDs. Populated on logout; checked in decode_token.
# Must be moved to Redis before horizontal scaling — entries are not shared
# between worker processes and are lost on restart.
jti_blocklist: set[str] = set()

# ==================================================
# JWT
# ==================================================

# ------------------------------ Issue tokens --------------------------------


def issue_access_token(user_id: uuid.UUID, extra: dict[str, Any] | None = None) -> str:
    """Issue a short-lived access token for the given user."""
    now = datetime.now(timezone.utc)
    expire = now + timedelta(minutes=_settings.jwt_access_token_expire_minutes)
    payload: dict[str, Any] = {
        "sub": str(user_id),
        "type": "access",
        "jti": str(uuid.uuid4()),
        "iat": now,
        "exp": expire,
        "expires_in": _settings.jwt_access_token_expire_minutes * 60,
    }
    if extra:
        payload.update(extra)
    return jwt.encode(payload, _settings.app_secret_key, algorithm=_settings.jwt_algorithm)


def issue_refresh_token(user_id: uuid.UUID) -> str:
    """Issue a long-lived refresh token for the given user."""
    now = datetime.now(timezone.utc)
    expire = now + timedelta(days=_settings.jwt_refresh_token_expire_days)
    jti = str(uuid.uuid4())
    payload: dict[str, Any] = {
        "sub": str(user_id),
        "type": "refresh",
        "jti": jti,
        "iat": now,
        "exp": expire,
    }
    return jwt.encode(payload, _settings.app_secret_key, algorithm=_settings.jwt_algorithm)


# ------------------------------ Verify tokens --------------------------------


def decode_token(token: str) -> dict[str, Any]:
    """
    Decode and verify a JWT. Raises JWTError on any failure.
    Callers catch JWTError and return HTTP 401.
    """
    payload: dict[str, Any] = jwt.decode(
        token, _settings.app_secret_key, algorithms=[_settings.jwt_algorithm]
    )
    jti = payload.get("jti")
    if jti and jti in jti_blocklist:
        raise JWTError("Token has been revoked.")
    return payload


def get_token_user_id(token: str) -> uuid.UUID:
    """
    Decode a token and return the user UUID from the 'sub' claim.
    Raises JWTError on invalid token, ValueError if 'sub' is missing.
    """
    payload = decode_token(token)
    sub = payload.get("sub")
    if not sub:
        raise JWTError("Missing sub claim")
    return uuid.UUID(sub)


# ==================================================
# PASSWORDLESS CODE
# ==================================================


def generate_six_digit_code() -> str:
    """
    Return a six-digit decimal string.
    secrets.randbelow(1_000_000) produces [0, 999999] without
    the small high-digit bias that random.randint introduces.
    """
    return str(secrets.randbelow(1_000_000)).zfill(6)
