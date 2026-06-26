# ============================================================
# backend/app/app/tasks/services/task_service.py
# ============================================================
#
# Purpose:
#   Business logic for the tasks resource. Sits between the
#   API router and the task repository. Handles 404 guards,
#   tenant boundary checks, and schema-to-ORM mapping.
#
# Design:
#   Task status transitions are not enforced here beyond the
#   VARCHAR enum validated by the application. The frontend
#   presents the valid transitions; the backend accepts any
#   string in {open, in_progress, completed}.
#
# Consumed by:
#   - backend/app/app/api/v1/tasks.py
# ============================================================

import uuid

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.tasks.repositories.task_repository import TaskRepository
from app.tasks.schemas.task_schemas import (
    TaskCreateIn,
    TaskOut,
    TaskPage,
    TaskPatchIn,
)

# ==================================================
# TASK SERVICE
# ==================================================


class TaskService:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db
        self._repo = TaskRepository(db)

    # ==================================================
    # LIST
    # ==================================================

    async def list_tasks(
        self,
        vehicle_id: uuid.UUID,
        account_id: uuid.UUID,
        *,
        page: int = 1,
        page_size: int = 50,
        status_filter: str | None = None,
    ) -> TaskPage:
        await self._repo.ensure_defaults(vehicle_id, account_id)
        return await self._repo.list_by_vehicle(
            vehicle_id, account_id,
            page=page,
            page_size=page_size,
            status_filter=status_filter,
        )

    # ==================================================
    # CREATE
    # ==================================================

    async def create_task(
        self,
        vehicle_id: uuid.UUID,
        account_id: uuid.UUID,
        created_by: uuid.UUID | None,
        data: TaskCreateIn,
    ) -> TaskOut:
        task = await self._repo.create(vehicle_id, account_id, created_by, data)
        return TaskOut.model_validate(task)

    # ==================================================
    # PATCH
    # ==================================================

    async def patch_task(
        self,
        task_id: uuid.UUID,
        account_id: uuid.UUID,
        data: TaskPatchIn,
    ) -> TaskOut:
        task = await self._repo.get_by_id(task_id, account_id)
        if task is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Task not found."
            )
        updated = await self._repo.patch(task, data)
        return TaskOut.model_validate(updated)

    # ==================================================
    # DELETE
    # ==================================================

    async def delete_task(
        self,
        task_id: uuid.UUID,
        account_id: uuid.UUID,
    ) -> None:
        task = await self._repo.get_by_id(task_id, account_id)
        if task is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Task not found."
            )
        if task.is_system_default:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="System tasks cannot be deleted. You can edit or mark them completed.",
            )
        await self._repo.delete(task)
