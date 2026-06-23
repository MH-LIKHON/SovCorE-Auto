# ============================================================
# backend/app/app/api/v1/tasks.py
# ============================================================
#
# Purpose:
#   Task and reminder endpoints for the Phase 5 tasks domain.
#   Covers the full CRUD lifecycle for both resources, scoped
#   to a vehicle and account.
#
# Design:
#   Tasks and reminders are served from one router module
#   because they are closely related (both are per-vehicle
#   items introduced together in Phase 5) and the combined
#   module stays well within a manageable size.
#
#   The database session is committed automatically by the
#   dependency injection layer via the get_db context manager.
#
# Consumed by:
#   - backend/app/app/api/v1/router.py
# ============================================================

import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.tasks.schemas.reminder_schemas import ReminderCreateIn, ReminderOut, ReminderPage, ReminderPatchIn
from app.tasks.schemas.task_schemas import TaskCreateIn, TaskOut, TaskPage, TaskPatchIn
from app.tasks.services.reminder_service import ReminderService
from app.tasks.services.task_service import TaskService

# ==================================================
# ROUTER
# ==================================================

router = APIRouter()

# ==================================================
# TASK ENDPOINTS
# ==================================================

# ------------------------------ List / create tasks -------------------------


@router.get(
    "/accounts/{account_id}/vehicles/{vehicle_id}/tasks",
    response_model=TaskPage,
)
async def list_tasks(
    account_id: uuid.UUID,
    vehicle_id: uuid.UUID,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    status_filter: str | None = Query(None, alias="status"),
    _user: object = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TaskPage:
    return await TaskService(db).list_tasks(
        vehicle_id, account_id,
        page=page,
        page_size=page_size,
        status_filter=status_filter,
    )


@router.post(
    "/accounts/{account_id}/vehicles/{vehicle_id}/tasks",
    response_model=TaskOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_task(
    account_id: uuid.UUID,
    vehicle_id: uuid.UUID,
    body: TaskCreateIn,
    current_user: object = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TaskOut:
    created_by = getattr(current_user, "id", None)
    return await TaskService(db).create_task(vehicle_id, account_id, created_by, body)


# ------------------------------ Patch / delete a task -----------------------


@router.patch("/tasks/{task_id}", response_model=TaskOut)
async def patch_task(
    task_id: uuid.UUID,
    body: TaskPatchIn,
    current_user: object = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TaskOut:
    account_id = getattr(current_user, "account_id", None)
    return await TaskService(db).patch_task(task_id, account_id, body)


@router.delete("/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(
    task_id: uuid.UUID,
    current_user: object = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    account_id = getattr(current_user, "account_id", None)
    await TaskService(db).delete_task(task_id, account_id)


# ==================================================
# REMINDER ENDPOINTS
# ==================================================

# ------------------------------ List / create reminders ---------------------


@router.get(
    "/accounts/{account_id}/vehicles/{vehicle_id}/reminders",
    response_model=ReminderPage,
)
async def list_reminders(
    account_id: uuid.UUID,
    vehicle_id: uuid.UUID,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    _user: object = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ReminderPage:
    return await ReminderService(db).list_reminders(
        vehicle_id, account_id, page=page, page_size=page_size
    )


@router.post(
    "/accounts/{account_id}/vehicles/{vehicle_id}/reminders",
    response_model=ReminderOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_reminder(
    account_id: uuid.UUID,
    vehicle_id: uuid.UUID,
    body: ReminderCreateIn,
    _user: object = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ReminderOut:
    return await ReminderService(db).create_reminder(vehicle_id, account_id, body)


# ------------------------------ Patch / delete a reminder -------------------


@router.patch("/reminders/{reminder_id}", response_model=ReminderOut)
async def patch_reminder(
    reminder_id: uuid.UUID,
    body: ReminderPatchIn,
    current_user: object = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ReminderOut:
    account_id = getattr(current_user, "account_id", None)
    return await ReminderService(db).patch_reminder(reminder_id, account_id, body)


@router.delete("/reminders/{reminder_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_reminder(
    reminder_id: uuid.UUID,
    current_user: object = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    account_id = getattr(current_user, "account_id", None)
    await ReminderService(db).delete_reminder(reminder_id, account_id)
