# ============================================================
# backend/app/app/auth/services/trusted_device_service.py
# ============================================================
#
# Purpose:
#   2FA bypass for recognised browsers. When a user completes a
#   TOTP challenge and ticks "Remember this browser", this service
#   generates a device token, stores its SHA-256 hash in the DB,
#   and returns the plaintext token so the router can set an
#   HTTP-only cookie (sva_td). On future logins the cookie is
#   checked here; if it matches a live row for that user the TOTP
#   step is skipped entirely.
#
# Design:
#   Only the hash is persisted; the plaintext travels in an
#   HTTP-only cookie only. A compromised DB therefore does not
#   expose device tokens to an attacker.
#
#   Expiry (15 days) is enforced at query time. Expired rows are
#   left in place and cleaned by a future scheduled job or by a
#   DB trigger; they cause no harm since the WHERE clause filters
#   them out.
#
#   _DEVICE_TOKEN_LIFETIME_DAYS is the only constant a future
#   admin UI needs to expose; everything else is internal.
#
# Consumed by:
#   - backend/app/app/api/v1/auth.py (2fa/verify endpoint)
#   - backend/app/app/auth/services/auth_service.py (verify_code)
# ============================================================

import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models.trusted_device import TrustedDevice

logger = structlog.get_logger(__name__)

# ==================================================
# CONSTANTS
# ==================================================

_DEVICE_TOKEN_LIFETIME_DAYS = 15
TRUSTED_DEVICE_COOKIE_NAME = "sva_td"
TRUSTED_DEVICE_COOKIE_MAX_AGE = _DEVICE_TOKEN_LIFETIME_DAYS * 86400


# ==================================================
# HELPERS
# ==================================================


def _hash_token(plaintext: str) -> str:
    """Return the SHA-256 hex digest of a plaintext device token."""
    return hashlib.sha256(plaintext.encode()).hexdigest()


# ==================================================
# TRUSTED DEVICE SERVICE
# ==================================================


class TrustedDeviceService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    # ------------------------------ Check -----------------------------------

    async def is_trusted(self, user_id: uuid.UUID, token_cookie: str | None) -> bool:
        """
        Return True if token_cookie is a valid unexpired device token for user_id.
        Called during verify_code to decide whether to skip the TOTP step.
        """
        if not token_cookie:
            return False

        token_hash = _hash_token(token_cookie)
        now = datetime.now(timezone.utc)

        result = await self._session.execute(
            select(TrustedDevice).where(
                TrustedDevice.user_id == user_id,
                TrustedDevice.device_token_hash == token_hash,
                TrustedDevice.expires_at > now,
            )
        )
        row = result.scalar_one_or_none()
        if row:
            logger.info("trusted_device_accepted", user_id=str(user_id))
        return row is not None

    # ------------------------------ Create ----------------------------------

    async def create(self, user_id: uuid.UUID) -> str:
        """
        Generate a new device token, persist its hash, and return the plaintext
        token so the caller can set it in an HTTP-only cookie.
        """
        plaintext = secrets.token_hex(32)
        token_hash = _hash_token(plaintext)
        now = datetime.now(timezone.utc)

        row = TrustedDevice(
            id=uuid.uuid4(),
            user_id=user_id,
            device_token_hash=token_hash,
            created_at=now,
            expires_at=now + timedelta(days=_DEVICE_TOKEN_LIFETIME_DAYS),
        )
        self._session.add(row)
        await self._session.flush()

        logger.info("trusted_device_created", user_id=str(user_id))
        return plaintext
