# ============================================================
# backend/app/app/auth/services/session_service.py
# ============================================================
#
# Purpose:
#   Single-session enforcement. Each user may hold exactly one
#   active refresh token at a time. When a second login arrives
#   this service detects the collision and issues a short-lived
#   conflict token so the frontend can ask the user what to do.
#
# Design:
#   The conflict token is a random UUID stored in an in-memory
#   dict (_pending) alongside the pending access/refresh tokens
#   and the old session JTI. It expires after 120 seconds.
#   This is the same Phase 1 caveat as jti_blocklist: the dict
#   is not shared across workers and is lost on restart. For a
#   single-process deployment this is correct behaviour.
#
#   DB interaction:
#     claim_session  — INSERT OR REPLACE into user_sessions
#     revoke_session — DELETE from user_sessions + add old JTI
#                      to jti_blocklist
#     touch_session  — UPDATE last_seen_at (called on /refresh)
#
#   Conflict flow:
#     check_and_claim  — if session row exists, generate conflict
#                        token and park the new tokens in _pending;
#                        caller returns session_conflict=True to
#                        the frontend WITHOUT setting any cookie.
#
#     resolve_conflict — called by POST /auth/session/resolve.
#                        action="replace": revoke old session, claim
#                        new session, return new tokens to caller so
#                        the router can set the refresh cookie.
#                        action="cancel": discard pending tokens.
#
# Consumed by:
#   - backend/app/app/api/v1/auth.py
# ============================================================

import secrets
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Literal

import structlog
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models.session import UserSession
from app.core.security import jti_blocklist

logger = structlog.get_logger(__name__)

# ==================================================
# IN-MEMORY CONFLICT STORE
# ==================================================

# Phase 1: single-process, in-memory. Must move to Redis before horizontal scaling.
# Keys are random hex tokens; values carry everything needed to either complete
# or discard the pending login.

@dataclass
class _PendingConflict:
    user_id: uuid.UUID
    old_jti: str               # JTI to revoke if action="replace"
    new_access_token: str
    new_refresh_token: str
    new_refresh_jti: str
    account_id: str | None
    expires_in: int
    expires_at: datetime       # Wall-clock expiry for the conflict window


_pending: dict[str, _PendingConflict] = {}

_CONFLICT_TTL_SECONDS = 120   # 2-minute window: 60 s for UI + headroom for latency


# ==================================================
# SERVICE RESULT
# ==================================================


@dataclass
class ConflictCheckResult:
    """
    Returned by check_and_claim.

    session_conflict=False means tokens were claimed and the caller may
    proceed to set the refresh cookie and return the full token pair.
    session_conflict=True means the tokens are parked; the caller must
    return session_conflict=True + conflict_token to the frontend.
    """
    session_conflict: bool
    conflict_token: str | None = None
    # Populated only when session_conflict is False (no existing session).
    access_token: str = ""
    refresh_token: str = ""
    expires_in: int = 0
    account_id: str | None = None


@dataclass
class ResolveResult:
    """Returned by resolve_conflict when action="replace"."""
    access_token: str
    refresh_token: str
    expires_in: int
    account_id: str | None


# ==================================================
# SESSION SERVICE
# ==================================================


class SessionService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    # ------------------------------ Check and claim -------------------------

    async def check_and_claim(
        self,
        user_id: uuid.UUID,
        access_token: str,
        refresh_token: str,
        refresh_jti: str,
        expires_in: int,
        account_id: str | None,
    ) -> ConflictCheckResult:
        """
        Check whether an active session already exists for user_id.
        If not, write the new session to the DB and return no conflict.
        If yes, park the new tokens in the in-memory conflict store and
        return session_conflict=True with a short-lived conflict token.
        """
        # ~~~~~~~~~ Expire stale pending conflicts for this user ~~~~~~~~~
        _prune_expired()

        # ~~~~~~~~~ Look up existing session row ~~~~~~~~~
        result = await self._session.execute(
            select(UserSession).where(UserSession.user_id == user_id)
        )
        existing = result.scalar_one_or_none()

        if existing is None:
            # Happy path: no existing session — claim it.
            await self._write_session(user_id, refresh_jti)
            return ConflictCheckResult(
                session_conflict=False,
                access_token=access_token,
                refresh_token=refresh_token,
                expires_in=expires_in,
                account_id=account_id,
            )

        # ~~~~~~~~~ Conflict: park the new tokens ~~~~~~~~~
        conflict_token = secrets.token_hex(32)
        _pending[conflict_token] = _PendingConflict(
            user_id=user_id,
            old_jti=existing.refresh_jti,
            new_access_token=access_token,
            new_refresh_token=refresh_token,
            new_refresh_jti=refresh_jti,
            account_id=account_id,
            expires_in=expires_in,
            expires_at=datetime.now(timezone.utc) + timedelta(seconds=_CONFLICT_TTL_SECONDS),
        )
        logger.info("session_conflict_detected", user_id=str(user_id))
        return ConflictCheckResult(
            session_conflict=True,
            conflict_token=conflict_token,
        )

    # ------------------------------ Resolve conflict ------------------------

    async def resolve_conflict(
        self,
        conflict_token: str,
        action: Literal["replace", "cancel"],
    ) -> ResolveResult | None:
        """
        Resolve a session conflict.

        action="replace": revoke the old session, claim the new one,
        and return the new access + refresh tokens so the router can
        set the cookie.
        action="cancel": discard the pending login; return None.
        """
        _prune_expired()
        pending = _pending.pop(conflict_token, None)

        if pending is None:
            return None  # Token not found or already expired.

        if action == "cancel":
            logger.info("session_conflict_cancelled", user_id=str(pending.user_id))
            return None

        # ~~~~~~~~~ Replace: revoke old, claim new ~~~~~~~~~
        # Add the old JTI to the blocklist so the existing session stops working.
        jti_blocklist.add(pending.old_jti)

        # Delete the old session row and write the new one.
        await self._session.execute(
            delete(UserSession).where(UserSession.user_id == pending.user_id)
        )
        await self._write_session(pending.user_id, pending.new_refresh_jti)

        logger.info("session_conflict_replaced", user_id=str(pending.user_id))
        return ResolveResult(
            access_token=pending.new_access_token,
            refresh_token=pending.new_refresh_token,
            expires_in=pending.expires_in,
            account_id=pending.account_id,
        )

    # ------------------------------ Revoke on logout ------------------------

    async def revoke_session(self, user_id: uuid.UUID, refresh_jti: str | None) -> None:
        """
        Remove the session row for this user and blocklist the JTI.
        Called by the logout endpoint.
        """
        if refresh_jti:
            jti_blocklist.add(refresh_jti)
        await self._session.execute(
            delete(UserSession).where(UserSession.user_id == user_id)
        )

    # ------------------------------ Touch on refresh ------------------------

    async def touch_session(self, user_id: uuid.UUID) -> None:
        """
        Update last_seen_at for the user's session row.
        Called by POST /auth/refresh so the row reflects real activity.
        """
        result = await self._session.execute(
            select(UserSession).where(UserSession.user_id == user_id)
        )
        row = result.scalar_one_or_none()
        if row:
            row.last_seen_at = datetime.now(timezone.utc)
            await self._session.flush()

    # ------------------------------ Internal helpers ------------------------

    async def _write_session(self, user_id: uuid.UUID, refresh_jti: str) -> None:
        row = UserSession(
            id=uuid.uuid4(),
            user_id=user_id,
            refresh_jti=refresh_jti,
            created_at=datetime.now(timezone.utc),
            last_seen_at=datetime.now(timezone.utc),
        )
        self._session.add(row)
        await self._session.flush()


# ==================================================
# HELPERS
# ==================================================


def _prune_expired() -> None:
    """Remove stale entries from _pending to prevent unbounded growth."""
    now = datetime.now(timezone.utc)
    stale = [k for k, v in _pending.items() if v.expires_at < now]
    for k in stale:
        _pending.pop(k, None)
