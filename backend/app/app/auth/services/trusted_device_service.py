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
#   Device cap (MAX_TRUSTED_DEVICES = 5): on every create, expired
#   rows for the user are pruned first. If the user is still at
#   the cap after pruning, the oldest active device is removed
#   before the new one is created.
#
#   Label (e.g. "Chrome on Windows") is provided by the caller
#   at create time, derived from the User-Agent header by the
#   route handler. Stored as plaintext for display on the
#   settings page. Existing rows (migration 0022) carry an empty
#   string and display as "Unknown browser".
#
#   list_for_user: returns all non-expired rows, newest first.
#
#   delete_for_user: deletes by (id, user_id) — the user_id
#   check prevents removing another user's device.
#
# Consumed by:
#   - backend/app/app/api/v1/auth.py
# ============================================================

import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone

import structlog
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models.trusted_device import TrustedDevice

logger = structlog.get_logger(__name__)

# ==================================================
# CONSTANTS
# ==================================================

_DEVICE_TOKEN_LIFETIME_DAYS = 15
MAX_TRUSTED_DEVICES = 5
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

    async def create(self, user_id: uuid.UUID, label: str = "") -> str:
        """
        Generate a new device token, persist its hash, and return the plaintext
        token so the caller can set it in an HTTP-only cookie.

        Prunes expired rows first, then enforces MAX_TRUSTED_DEVICES by deleting
        the oldest active device before creating the new one.
        """
        now = datetime.now(timezone.utc)

        # Prune expired rows so they do not count against the cap.
        await self._session.execute(
            delete(TrustedDevice).where(
                TrustedDevice.user_id == user_id,
                TrustedDevice.expires_at <= now,
            )
        )

        # Enforce cap: remove the oldest device if at the limit.
        count_result = await self._session.execute(
            select(func.count()).select_from(TrustedDevice).where(
                TrustedDevice.user_id == user_id,
            )
        )
        if count_result.scalar_one() >= MAX_TRUSTED_DEVICES:
            oldest_result = await self._session.execute(
                select(TrustedDevice)
                .where(TrustedDevice.user_id == user_id)
                .order_by(TrustedDevice.created_at.asc())
                .limit(1)
            )
            oldest = oldest_result.scalar_one_or_none()
            if oldest:
                await self._session.delete(oldest)

        plaintext = secrets.token_hex(32)
        row = TrustedDevice(
            id=uuid.uuid4(),
            user_id=user_id,
            device_token_hash=_hash_token(plaintext),
            label=label,
            created_at=now,
            expires_at=now + timedelta(days=_DEVICE_TOKEN_LIFETIME_DAYS),
        )
        self._session.add(row)
        await self._session.flush()

        logger.info("trusted_device_created", user_id=str(user_id), label=label)
        return plaintext

    # ------------------------------ List -----------------------------------

    async def list_for_user(self, user_id: uuid.UUID) -> list[TrustedDevice]:
        """
        Return all non-expired trusted devices for user_id, newest first.
        Used by the settings page for user review and removal.
        """
        now = datetime.now(timezone.utc)
        result = await self._session.execute(
            select(TrustedDevice)
            .where(
                TrustedDevice.user_id == user_id,
                TrustedDevice.expires_at > now,
            )
            .order_by(TrustedDevice.created_at.desc())
        )
        return list(result.scalars().all())

    # ------------------------------ Delete ---------------------------------

    async def delete_for_user(self, device_id: uuid.UUID, user_id: uuid.UUID) -> bool:
        """
        Delete the trusted device with the given ID, only if it belongs to user_id.
        Returns True if deleted, False if not found or wrong owner.
        """
        result = await self._session.execute(
            select(TrustedDevice).where(
                TrustedDevice.id == device_id,
                TrustedDevice.user_id == user_id,
            )
        )
        row = result.scalar_one_or_none()
        if row is None:
            return False
        await self._session.delete(row)
        await self._session.flush()
        logger.info("trusted_device_removed", user_id=str(user_id), device_id=str(device_id))
        return True
