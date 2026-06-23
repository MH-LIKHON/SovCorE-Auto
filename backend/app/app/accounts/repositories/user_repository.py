# ============================================================
# backend/app/app/accounts/repositories/user_repository.py
# ============================================================
#
# Purpose:
#   Persistence layer for the users table. The only place ORM
#   queries for users are written in the accounts domain.
#
# Design:
#   Kept intentionally thin — each method does one thing. The
#   service layer owns all business logic.
#
# Consumed by:
#   - backend/app/app/accounts/services/account_service.py
# ============================================================

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.accounts.models.user import User

# ==================================================
# USER REPOSITORY
# ==================================================


class UserRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_by_id(self, user_id: uuid.UUID) -> User | None:
        result = await self._session.execute(
            select(User).where(User.id == user_id)
        )
        return result.scalar_one_or_none()

    async def get_by_email(self, email: str) -> User | None:
        result = await self._session.execute(
            select(User).where(User.email == email.lower())
        )
        return result.scalar_one_or_none()

    async def create(self, email: str) -> User:
        user = User(id=uuid.uuid4(), email=email.lower())
        self._session.add(user)
        await self._session.flush()
        return user

    async def update_full_name(self, user: User, full_name: str) -> User:
        user.full_name = full_name.strip()
        await self._session.flush()
        return user
