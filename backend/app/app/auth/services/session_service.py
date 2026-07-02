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
#   The conflict token is a signed JWT (HS256, same key as auth
#   tokens) carrying: sub (user_id), old_jti (to revoke on
#   replace), account_id, expires_in, type="conflict", and an
#   exp 120 seconds from issue. This is stateless — no in-memory
#   dict, no DB row — so it survives backend restarts and works
#   correctly across multiple uvicorn workers.
#
#   On resolve(action="replace") the old JTI is blocklisted,
#   the old session row deleted, and fresh tokens are issued for
#   the new session. The pre-generated tokens passed to
#   check_and_claim on the conflict path are discarded; fresh
#   ones are issued at resolve time. This is intentional: tokens
#   should not sit in any store longer than necessary.
#
#   DB interaction:
#     _write_session  — INSERT into user_sessions
#     revoke_session  — DELETE from user_sessions + JTI blocklist
#     touch_session   — UPDATE last_seen_at (called on /refresh)
#
#   Conflict flow:
#     check_and_claim  — if session row exists, encode a signed
#                        conflict JWT and return session_conflict=True.
#                        No cookie is set by the caller.
#
#     resolve_conflict — called by POST /auth/session/resolve.
#                        action="replace": verify JWT → blocklist old
#                        JTI → delete old row → issue fresh token pair
#                        → write new row → return tokens to router.
#                        action="cancel": verify JWT → return None
#                        (router returns ok=True, no tokens issued).
#
# Consumed by:
#   - backend/app/app/api/v1/auth.py
# ============================================================

import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Literal

import structlog
from jose import JWTError
from jose import jwt as _jwt
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models.session import UserSession
from app.core.security import issue_access_token, issue_refresh_token, jti_blocklist
from app.core.settings import get_settings

logger = structlog.get_logger(__name__)

# ==================================================
# CONSTANTS
# ==================================================

# Window for a conflict token: long enough for the user to read the modal
# and decide, plus headroom for slow connections.
_CONFLICT_TTL_SECONDS = 120

# ==================================================
# SERVICE RESULTS
# ==================================================


@dataclass
class ConflictCheckResult:
    """
    Returned by check_and_claim.

    session_conflict=False means tokens were claimed and the caller may
    proceed to set the refresh cookie and return the full token pair.
    session_conflict=True means a signed conflict JWT was generated; the
    caller must return session_conflict=True + conflict_token to the frontend.
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
        If yes, return a signed conflict JWT so the frontend can ask
        the user which session to keep. The pre-generated tokens are
        returned as-is on the no-conflict path; they are discarded on
        the conflict path and re-issued fresh at resolve time.
        """
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

        # ~~~~~~~~~ Conflict: encode context in a signed JWT ~~~~~~~~~
        # The JWT carries everything resolve_conflict needs so no
        # server-side state is required.
        settings = get_settings()
        now = datetime.now(timezone.utc)
        conflict_payload = {
            "sub": str(user_id),
            "old_jti": existing.refresh_jti,
            "account_id": account_id,
            "expires_in": expires_in,
            "type": "conflict",
            "exp": now + timedelta(seconds=_CONFLICT_TTL_SECONDS),
            "iat": now,
        }
        conflict_token = _jwt.encode(
            conflict_payload,
            settings.app_secret_key,
            algorithm=settings.jwt_algorithm,
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

        Decodes and verifies the signed conflict JWT. Returns None if the
        token is invalid or expired (router raises HTTP 410 for replace,
        ok=True for cancel).

        action="replace": blocklist the old JTI, delete the old session
        row, issue fresh tokens, claim the new session, return tokens so
        the router can set the cookie.

        action="cancel": discard the new login; return None.
        """
        settings = get_settings()
        try:
            payload = _jwt.decode(
                conflict_token,
                settings.app_secret_key,
                algorithms=[settings.jwt_algorithm],
            )
        except JWTError:
            # Expired, tampered, or malformed token.
            return None

        if payload.get("type") != "conflict":
            return None

        if action == "cancel":
            logger.info("session_conflict_cancelled", user_id=payload.get("sub"))
            return None

        # ~~~~~~~~~ Replace: revoke old session, issue fresh tokens ~~~~~~~~~
        user_id = uuid.UUID(payload["sub"])
        old_jti: str = payload["old_jti"]
        account_id: str | None = payload.get("account_id")
        expires_in: int = int(payload.get("expires_in", 900))

        # Add the old JTI to the blocklist so the existing session stops working.
        jti_blocklist.add(old_jti)

        # Delete the old session row.
        await self._session.execute(
            delete(UserSession).where(UserSession.user_id == user_id)
        )

        # Issue fresh tokens — pre-generated tokens are not carried in the JWT.
        access = issue_access_token(user_id)
        refresh = issue_refresh_token(user_id)

        # Extract the new JTI to write into user_sessions.
        new_jti = _jwt.get_unverified_claims(refresh).get("jti", "")
        await self._write_session(user_id, new_jti)

        logger.info("session_conflict_replaced", user_id=str(user_id))
        return ResolveResult(
            access_token=access,
            refresh_token=refresh,
            expires_in=expires_in,
            account_id=account_id,
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
