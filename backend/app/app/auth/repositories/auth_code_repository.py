# ============================================================
# backend/app/app/auth/repositories/auth_code_repository.py
# ============================================================
#
# Purpose:
#   Persistence layer for auth codes. The only place raw SQL
#   or ORM queries for auth_codes and users are written.
#
# Design:
#   Each method is async so it awaits the SQLAlchemy async
#   session. Callers (services) never touch the session
#   directly; they receive model instances or None.
#
#   get_user_by_email: used by both the code-request path
#   (does this address have an account?) and the code-verify
#   path (load the user after the code passes).
#
#   create_user: used by the code-verify path when the email
#   is not yet in the system (first-time login creates the
#   account implicitly).
#
# Consumed by:
#   - backend/app/app/auth/services/auth_service.py
# ============================================================

import hashlib
import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.accounts.models.user import User
from app.auth.models.auth_code import AuthCode
from app.auth.models.sso_identity import SSOIdentity, SSOProvider

# ==================================================
# AUTH CODE REPOSITORY
# ==================================================


class AuthCodeRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    # ------------------------------ Code management -------------------------

    async def create_code(self, email: str, code_hash: str, expires_at: datetime) -> AuthCode:
        """Insert a new auth code row. Caller provides the hash; plaintext is never stored."""
        row = AuthCode(
            id=uuid.uuid4(),
            email=email,
            code_hash=code_hash,
            expires_at=expires_at,
        )
        self._session.add(row)
        await self._session.flush()
        return row

    async def get_valid_code(self, email: str, code_hash: str) -> AuthCode | None:
        """
        Return the most recent valid code for this email + hash pair, or None.
        Valid means: not consumed AND not expired.
        """
        now = datetime.now(timezone.utc)
        result = await self._session.execute(
            select(AuthCode)
            .where(AuthCode.email == email)
            .where(AuthCode.code_hash == code_hash)
            .where(AuthCode.consumed_at.is_(None))
            .where(AuthCode.expires_at > now)
            .order_by(AuthCode.created_at.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def consume_code(self, code: AuthCode) -> None:
        """Mark a code as consumed so it cannot be reused."""
        code.consumed_at = datetime.now(timezone.utc)
        await self._session.flush()

    async def purge_expired_codes(self, email: str) -> None:
        """Remove old expired codes for an address to keep the table lean."""
        now = datetime.now(timezone.utc)
        result = await self._session.execute(
            select(AuthCode)
            .where(AuthCode.email == email)
            .where(AuthCode.expires_at < now)
        )
        for row in result.scalars():
            await self._session.delete(row)
        await self._session.flush()

    # ------------------------------ User management --------------------------

    async def get_user_by_email(self, email: str) -> User | None:
        result = await self._session.execute(
            select(User).where(User.email == email)
        )
        return result.scalar_one_or_none()

    async def create_user(self, email: str, full_name: str = "") -> User:
        """Create a minimal user row. The caller creates the account + membership."""
        user = User(id=uuid.uuid4(), email=email, full_name=full_name)
        self._session.add(user)
        await self._session.flush()
        return user

    # ------------------------------ SSO identity ----------------------------

    async def get_sso_identity(
        self, provider: SSOProvider, subject: str
    ) -> SSOIdentity | None:
        result = await self._session.execute(
            select(SSOIdentity)
            .where(SSOIdentity.provider == provider)
            .where(SSOIdentity.subject == subject)
        )
        return result.scalar_one_or_none()

    async def create_sso_identity(
        self, user_id: uuid.UUID, provider: SSOProvider, subject: str
    ) -> SSOIdentity:
        identity = SSOIdentity(
            id=uuid.uuid4(), user_id=user_id, provider=provider, subject=subject
        )
        self._session.add(identity)
        await self._session.flush()
        return identity


# ==================================================
# HELPERS
# ==================================================


def hash_code(plaintext: str) -> str:
    """SHA-256 hex digest of a six-digit code string."""
    return hashlib.sha256(plaintext.encode()).hexdigest()
