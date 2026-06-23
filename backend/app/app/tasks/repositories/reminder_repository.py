# ============================================================
# backend/app/app/tasks/repositories/reminder_repository.py
# ============================================================
#
# Purpose:
#   Data access layer for the reminders table. Queries are
#   scoped to account_id and vehicle_id for tenant isolation.
#
# Design:
#   list_by_vehicle orders by due_date ascending so the
#   soonest-due reminder appears first. The scheduler uses
#   list_due_today to find reminders that fire today without
#   loading the full page envelope.
#
# Consumed by:
#   - backend/app/app/tasks/services/reminder_service.py
#   - backend/app/app/scheduler/jobs.py
# ============================================================

import uuid
from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.tasks.models.reminder import Reminder
from app.tasks.schemas.reminder_schemas import (
    ReminderCreateIn,
    ReminderOut,
    ReminderPage,
    ReminderPatchIn,
)

# ==================================================
# REMINDER REPOSITORY
# ==================================================


class ReminderRepository:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    # ==================================================
    # LIST
    # ==================================================

    async def list_by_vehicle(
        self,
        vehicle_id: uuid.UUID,
        account_id: uuid.UUID,
        *,
        page: int = 1,
        page_size: int = 50,
    ) -> ReminderPage:
        from sqlalchemy import func

        predicates = [
            Reminder.vehicle_id == vehicle_id,
            Reminder.account_id == account_id,
        ]

        count_stmt = select(func.count()).where(*predicates)
        count_result = await self._db.execute(count_stmt)
        total = count_result.scalar_one()

        offset = (page - 1) * page_size
        stmt = (
            select(Reminder)
            .where(*predicates)
            .order_by(Reminder.due_date.asc())
            .offset(offset)
            .limit(page_size)
        )
        result = await self._db.execute(stmt)
        items = list(result.scalars().all())

        return ReminderPage(
            items=[ReminderOut.model_validate(r) for r in items],
            total=total,
            page=page,
            page_size=page_size,
        )

    # ==================================================
    # GET
    # ==================================================

    async def get_by_id(
        self, reminder_id: uuid.UUID, account_id: uuid.UUID
    ) -> Reminder | None:
        stmt = select(Reminder).where(
            Reminder.id == reminder_id,
            Reminder.account_id == account_id,
        )
        result = await self._db.execute(stmt)
        return result.scalar_one_or_none()

    # ==================================================
    # CREATE
    # ==================================================

    async def create(
        self,
        vehicle_id: uuid.UUID,
        account_id: uuid.UUID,
        data: ReminderCreateIn,
    ) -> Reminder:
        reminder = Reminder(
            vehicle_id=vehicle_id,
            account_id=account_id,
            type=data.type,
            due_date=data.due_date,
            intervals=data.intervals,
            active=True,
            notes=data.notes,
        )
        self._db.add(reminder)
        await self._db.flush()
        return reminder

    # ==================================================
    # PATCH
    # ==================================================

    async def patch(self, reminder: Reminder, data: ReminderPatchIn) -> Reminder:
        if data.due_date is not None:
            reminder.due_date = data.due_date
            # ~~~~~~~~~ Reset last_sent_interval when due date changes ~~~~~~~~~
            # A changed due date means a new cycle; prior notifications should
            # not suppress the new interval sequence.
            reminder.last_sent_interval = None
        if data.intervals is not None:
            reminder.intervals = data.intervals
        if data.active is not None:
            reminder.active = data.active
        if data.notes is not None:
            reminder.notes = data.notes
        self._db.add(reminder)
        await self._db.flush()
        return reminder

    # ==================================================
    # DELETE
    # ==================================================

    async def delete(self, reminder: Reminder) -> None:
        await self._db.delete(reminder)
        await self._db.flush()

    # ==================================================
    # SCHEDULER QUERY
    # ==================================================

    async def list_due_today(self, today: date) -> list[Reminder]:
        # ~~~~~~~~~ Returns all active reminders that need a notification today ~~~~~~~~~
        # The scheduler calls this once per day to avoid scanning all reminders
        # per-reminder-per-interval. The Python-side job then checks each
        # reminder's intervals array to decide whether to send.
        stmt = select(Reminder).where(
            Reminder.active.is_(True),
            Reminder.due_date >= today,
        )
        result = await self._db.execute(stmt)
        return list(result.scalars().all())

    async def mark_sent(self, reminder: Reminder, interval: int) -> None:
        reminder.last_sent_interval = interval
        self._db.add(reminder)
        await self._db.flush()
