# ============================================================
# backend/app/app/accounts/repositories/account_repository.py
# ============================================================
#
# Purpose:
#   Persistence layer for accounts, preferences and memberships.
#   The only place ORM queries for these tables are written.
#
# Design:
#   Every write uses flush() (not commit()) so the caller's
#   service controls the transaction boundary. The session is
#   committed by the FastAPI dependency get_db() on exit.
#
# Consumed by:
#   - backend/app/app/auth/services/auth_service.py
#     (create_account_for_user on first login)
#   - backend/app/app/accounts/services/account_service.py
# ============================================================

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.accounts.models.account import Account, AccountPreferences, AccountType
from app.accounts.models.user import Membership, Role

# ==================================================
# ACCOUNT REPOSITORY
# ==================================================


class AccountRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    # ------------------------------ Account ---------------------------------

    async def create_account(
        self, name: str, account_type: AccountType = AccountType.personal
    ) -> Account:
        account = Account(id=uuid.uuid4(), name=name, type=account_type)
        self._session.add(account)
        await self._session.flush()

        # Create default preferences alongside the account so there
        # is always a preferences row — callers never need to handle None.
        prefs = AccountPreferences(id=uuid.uuid4(), account_id=account.id)
        self._session.add(prefs)
        await self._session.flush()

        return account

    async def get_account_by_id(self, account_id: uuid.UUID) -> Account | None:
        result = await self._session.execute(
            select(Account)
            .where(Account.id == account_id)
            .options(selectinload(Account.preferences))
        )
        return result.scalar_one_or_none()

    # ------------------------------ Membership ------------------------------

    async def create_membership(
        self, account_id: uuid.UUID, user_id: uuid.UUID, role: Role
    ) -> Membership:
        membership = Membership(
            id=uuid.uuid4(), account_id=account_id, user_id=user_id, role=role
        )
        self._session.add(membership)
        await self._session.flush()
        return membership

    async def get_membership(
        self, account_id: uuid.UUID, user_id: uuid.UUID
    ) -> Membership | None:
        result = await self._session.execute(
            select(Membership)
            .where(Membership.account_id == account_id)
            .where(Membership.user_id == user_id)
        )
        return result.scalar_one_or_none()

    async def get_user_accounts(self, user_id: uuid.UUID) -> list[Account]:
        """Return all accounts a user is a member of."""
        result = await self._session.execute(
            select(Account)
            .join(Membership, Membership.account_id == Account.id)
            .where(Membership.user_id == user_id)
            .options(selectinload(Account.preferences))
        )
        return list(result.scalars().all())

    # ------------------------------ Preferences -----------------------------

    async def get_preferences(self, account_id: uuid.UUID) -> AccountPreferences | None:
        result = await self._session.execute(
            select(AccountPreferences).where(AccountPreferences.account_id == account_id)
        )
        return result.scalar_one_or_none()
