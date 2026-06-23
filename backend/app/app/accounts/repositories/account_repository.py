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
from datetime import date, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.accounts.models.account import Account, AccountPreferences, AccountType
from app.accounts.models.user import Membership, Role, User

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

    async def update_account(
        self, account: Account, name: str | None = None, account_type: AccountType | None = None
    ) -> Account:
        if name is not None:
            account.name = name
        if account_type is not None:
            account.type = account_type
        await self._session.flush()
        return account

    async def list_members(self, account_id: uuid.UUID) -> list[Membership]:
        result = await self._session.execute(
            select(Membership)
            .where(Membership.account_id == account_id)
            .options(selectinload(Membership.user))
            .order_by(Membership.created_at)
        )
        return list(result.scalars().all())

    async def get_member_by_id(
        self, account_id: uuid.UUID, member_id: uuid.UUID
    ) -> Membership | None:
        result = await self._session.execute(
            select(Membership)
            .where(Membership.id == member_id)
            .where(Membership.account_id == account_id)
            .options(selectinload(Membership.user))
        )
        return result.scalar_one_or_none()

    async def update_member_role(self, membership: Membership, role: Role) -> Membership:
        membership.role = role
        await self._session.flush()
        return membership

    async def delete_member(self, membership: Membership) -> None:
        await self._session.delete(membership)
        await self._session.flush()

    # ------------------------------ Preferences -----------------------------

    async def get_preferences(self, account_id: uuid.UUID) -> AccountPreferences | None:
        result = await self._session.execute(
            select(AccountPreferences).where(AccountPreferences.account_id == account_id)
        )
        return result.scalar_one_or_none()

    # ------------------------------ Dashboard summary ----------------------

    async def get_dashboard_summary(self, account_id: uuid.UUID) -> dict[str, int]:
        """
        Returns five aggregated counts for the dashboard overview panel.
        All queries run against already-indexed account_id columns.
        """
        from app.records.models.record import Record
        from app.tasks.models.reminder import Reminder
        from app.tasks.models.task import Task
        from app.vehicles.models.vehicle import Vehicle

        today = date.today()
        month_start = today.replace(day=1)
        due_soon_cutoff = today + timedelta(days=30)

        # ~~~~~~~~~ Active vehicle count ~~~~~~~~~
        veh_res = await self._session.execute(
            select(func.count(Vehicle.id))
            .where(Vehicle.account_id == account_id)
            .where(Vehicle.lifecycle_state == "active")
        )
        active_vehicle_count: int = veh_res.scalar_one() or 0

        # ~~~~~~~~~ Member count ~~~~~~~~~
        mem_res = await self._session.execute(
            select(func.count(Membership.id))
            .where(Membership.account_id == account_id)
        )
        member_count: int = mem_res.scalar_one() or 0

        # ~~~~~~~~~ Open task count (not completed) ~~~~~~~~~
        task_res = await self._session.execute(
            select(func.count(Task.id))
            .where(Task.account_id == account_id)
            .where(Task.status != "completed")
        )
        open_task_count: int = task_res.scalar_one() or 0

        # ~~~~~~~~~ Due-soon reminder count (active, due within 30 days) ~~~~~~~~~
        rem_res = await self._session.execute(
            select(func.count(Reminder.id))
            .where(Reminder.account_id == account_id)
            .where(Reminder.active.is_(True))
            .where(Reminder.due_date >= today)
            .where(Reminder.due_date <= due_soon_cutoff)
        )
        due_soon_reminder_count: int = rem_res.scalar_one() or 0

        # ~~~~~~~~~ Monthly spend in pence (current calendar month) ~~~~~~~~~
        spend_res = await self._session.execute(
            select(func.coalesce(func.sum(Record.cost), 0))
            .where(Record.account_id == account_id)
            .where(Record.date >= month_start)
        )
        monthly_spend_pence: int = spend_res.scalar_one() or 0

        return {
            "active_vehicle_count": active_vehicle_count,
            "member_count": member_count,
            "open_task_count": open_task_count,
            "due_soon_reminder_count": due_soon_reminder_count,
            "monthly_spend_pence": monthly_spend_pence,
        }
