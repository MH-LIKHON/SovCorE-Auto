# ============================================================
# backend/app/app/tasks/schemas/task_schemas.py
# ============================================================
#
# Purpose:
#   Pydantic schemas for the tasks resource: create, patch,
#   and response shapes. Task status is a string enum validated
#   on the application side and stored as VARCHAR in the DB.
#
# Consumed by:
#   - backend/app/app/tasks/services/task_service.py
#   - backend/app/app/api/v1/tasks.py
# ============================================================

import uuid
from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel

# ==================================================
# CREATE
# ==================================================


class TaskCreateIn(BaseModel):
    title: str
    assignee_user_id: Optional[uuid.UUID] = None
    due_date: Optional[date] = None
    notes: Optional[str] = None


# ==================================================
# PATCH
# ==================================================


class TaskPatchIn(BaseModel):
    title: Optional[str] = None
    assignee_user_id: Optional[uuid.UUID] = None
    status: Optional[str] = None      # "open" | "in_progress" | "completed"
    due_date: Optional[date] = None
    notes: Optional[str] = None


# ==================================================
# RESPONSE
# ==================================================


class TaskOut(BaseModel):
    id: uuid.UUID
    account_id: uuid.UUID
    vehicle_id: uuid.UUID
    created_by: Optional[uuid.UUID]
    assignee_user_id: Optional[uuid.UUID]
    title: str
    status: str
    due_date: Optional[date]
    notes: Optional[str]
    is_system_default: bool = False
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ==================================================
# PAGE ENVELOPE
# ==================================================


class TaskPage(BaseModel):
    items: list[TaskOut]
    total: int
    page: int
    page_size: int
