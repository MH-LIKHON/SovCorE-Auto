# ============================================================
# backend/app/app/tasks/repositories/task_repository.py
# ============================================================
#
# Purpose:
#   Data access layer for the tasks table. All queries are
#   scoped to account_id and vehicle_id for tenant isolation.
#
# Design:
#   list_by_vehicle returns a page envelope consistent with all
#   other list endpoints in the platform. Tasks are ordered
#   by due_date ascending (soonest due first), then created_at
#   descending for tasks without a due date.
#
# Consumed by:
#   - backend/app/app/tasks/services/task_service.py
# ============================================================

import uuid
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.tasks.models.task import Task
from app.tasks.schemas.task_schemas import TaskCreateIn, TaskPatchIn, TaskPage, TaskOut

# ==================================================
# DEFAULTS
# ==================================================

# Titles for the five mandatory setup tasks seeded on every vehicle.
# Defined here so vehicle_service and ensure_defaults share one source.
DEFAULT_TASK_TITLES: tuple[str, ...] = (
    "Log Initial Odometer Reading",
    "Add MOT Renewal Date",
    "Add Insurance Renewal Date",
    "Add Road Tax Renewal Date",
    "Add Service Date and Interval",
)

# ==================================================
# TASK REPOSITORY
# ==================================================


class TaskRepository:
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
        status_filter: str | None = None,
    ) -> TaskPage:
        # ~~~~~~~~~ Base filter predicate ~~~~~~~~~
        predicates = [
            Task.vehicle_id == vehicle_id,
            Task.account_id == account_id,
        ]
        if status_filter:
            predicates.append(Task.status == status_filter)

        # ~~~~~~~~~ Count total matching rows ~~~~~~~~~
        count_stmt = select(func.count()).where(*predicates)
        count_result = await self._db.execute(count_stmt)
        total = count_result.scalar_one()

        # ~~~~~~~~~ Fetch page ~~~~~~~~~
        offset = (page - 1) * page_size
        stmt = (
            select(Task)
            .where(*predicates)
            .order_by(
                Task.is_system_default.desc(),  # defaults always first
                Task.due_date.asc().nulls_last(),
                Task.created_at.desc(),
            )
            .offset(offset)
            .limit(page_size)
        )
        result = await self._db.execute(stmt)
        tasks = list(result.scalars().all())

        return TaskPage(
            items=[TaskOut.model_validate(t) for t in tasks],
            total=total,
            page=page,
            page_size=page_size,
        )

    # ==================================================
    # GET
    # ==================================================

    async def get_by_id(
        self, task_id: uuid.UUID, account_id: uuid.UUID
    ) -> Task | None:
        stmt = select(Task).where(
            Task.id == task_id,
            Task.account_id == account_id,
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
        created_by: uuid.UUID | None,
        data: TaskCreateIn,
    ) -> Task:
        task = Task(
            vehicle_id=vehicle_id,
            account_id=account_id,
            created_by=created_by,
            assignee_user_id=data.assignee_user_id,
            title=data.title,
            status="open",
            due_date=data.due_date,
            notes=data.notes,
        )
        self._db.add(task)
        await self._db.flush()
        return task

    async def ensure_defaults(
        self,
        vehicle_id: uuid.UUID,
        account_id: uuid.UUID,
    ) -> None:
        # ~~~~~~~~~ Idempotent seed + title normalisation ~~~~~~~~~
        # Fetches existing system defaults so we can both guard against
        # re-seeding and normalise any stale titles (e.g. ALL-CAPS → title case)
        # in the same pass without a separate migration.
        result = await self._db.execute(
            select(Task).where(
                Task.vehicle_id == vehicle_id,
                Task.account_id == account_id,
                Task.is_system_default.is_(True),
            )
        )
        existing = list(result.scalars().all())

        if existing:
            canonical_map = {t.upper(): t for t in DEFAULT_TASK_TITLES}
            for task in existing:
                canonical = canonical_map.get(task.title.upper())
                if canonical and task.title != canonical:
                    task.title = canonical
            await self._db.flush()
            return

        for title in DEFAULT_TASK_TITLES:
            self._db.add(Task(
                vehicle_id=vehicle_id,
                account_id=account_id,
                created_by=None,
                title=title,
                status="open",
                is_system_default=True,
            ))
        await self._db.flush()

    async def create_system_default(
        self,
        vehicle_id: uuid.UUID,
        account_id: uuid.UUID,
        title: str,
        notes: str | None = None,
    ) -> Task:
        task = Task(
            vehicle_id=vehicle_id,
            account_id=account_id,
            created_by=None,
            title=title,
            status="open",
            notes=notes,
            is_system_default=True,
        )
        self._db.add(task)
        await self._db.flush()
        return task

    # ==================================================
    # PATCH
    # ==================================================

    async def patch(self, task: Task, data: TaskPatchIn) -> Task:
        if data.title is not None:
            task.title = data.title
        if data.assignee_user_id is not None:
            task.assignee_user_id = data.assignee_user_id
        if data.status is not None:
            task.status = data.status
        if data.due_date is not None:
            task.due_date = data.due_date
        if data.notes is not None:
            task.notes = data.notes
        task.updated_at = datetime.now(timezone.utc)
        self._db.add(task)
        await self._db.flush()
        return task

    # ==================================================
    # DELETE
    # ==================================================

    async def delete(self, task: Task) -> None:
        await self._db.delete(task)
        await self._db.flush()

    # ==================================================
    # COUNT (used by health score)
    # ==================================================

    async def count_open(
        self, vehicle_id: uuid.UUID, account_id: uuid.UUID
    ) -> int:
        stmt = select(func.count()).where(
            Task.vehicle_id == vehicle_id,
            Task.account_id == account_id,
            Task.status == "open",
        )
        result = await self._db.execute(stmt)
        return result.scalar_one_or_none() or 0
