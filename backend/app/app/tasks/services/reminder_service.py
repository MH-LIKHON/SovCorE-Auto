# ============================================================
# backend/app/app/tasks/services/reminder_service.py
# ============================================================
#
# Purpose:
#   Business logic for the reminders resource. Sits between the
#   API router and the reminder repository. Handles 404 guards,
#   tenant boundary checks, and schema-to-ORM mapping.
#
# Design:
#   Reminders store the due_date and a list of notification
#   intervals (days before due_date). The actual dispatch lives
#   in the scheduler job (backend/app/app/scheduler/jobs.py)
#   and is not triggered by the API. The API creates, reads,
#   patches, and deletes reminder rows; the scheduler reads
#   them and dispatches via Resend.
#
# Consumed by:
#   - backend/app/app/api/v1/tasks.py
# ============================================================

import uuid

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.tasks.repositories.reminder_repository import ReminderRepository
from app.tasks.schemas.reminder_schemas import (
    ReminderCreateIn,
    ReminderOut,
    ReminderPage,
    ReminderPatchIn,
)

# ==================================================
# REMINDER SERVICE
# ==================================================


class ReminderService:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db
        self._repo = ReminderRepository(db)

    # ==================================================
    # LIST
    # ==================================================

    async def list_reminders(
        self,
        vehicle_id: uuid.UUID,
        account_id: uuid.UUID,
        *,
        page: int = 1,
        page_size: int = 50,
    ) -> ReminderPage:
        return await self._repo.list_by_vehicle(
            vehicle_id, account_id, page=page, page_size=page_size
        )

    # ==================================================
    # CREATE
    # ==================================================

    async def create_reminder(
        self,
        vehicle_id: uuid.UUID,
        account_id: uuid.UUID,
        data: ReminderCreateIn,
    ) -> ReminderOut:
        reminder = await self._repo.create(vehicle_id, account_id, data)
        return ReminderOut.model_validate(reminder)

    # ==================================================
    # PATCH
    # ==================================================

    async def patch_reminder(
        self,
        reminder_id: uuid.UUID,
        account_id: uuid.UUID,
        data: ReminderPatchIn,
    ) -> ReminderOut:
        reminder = await self._repo.get_by_id(reminder_id, account_id)
        if reminder is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Reminder not found."
            )
        updated = await self._repo.patch(reminder, data)
        return ReminderOut.model_validate(updated)

    # ==================================================
    # DELETE
    # ==================================================

    async def delete_reminder(
        self,
        reminder_id: uuid.UUID,
        account_id: uuid.UUID,
    ) -> None:
        reminder = await self._repo.get_by_id(reminder_id, account_id)
        if reminder is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Reminder not found."
            )
        await self._repo.delete(reminder)
