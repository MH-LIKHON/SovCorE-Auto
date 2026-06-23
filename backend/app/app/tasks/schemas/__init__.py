# ============================================================
# backend/app/app/tasks/schemas/__init__.py
# ============================================================
#
# Purpose:
#   Package marker for tasks domain schemas.
#
# Consumed by:
#   - backend/app/app/api/v1/tasks.py
# ============================================================

from app.tasks.schemas.reminder_schemas import (
    ReminderCreateIn,
    ReminderOut,
    ReminderPatchIn,
)
from app.tasks.schemas.task_schemas import TaskCreateIn, TaskOut, TaskPatchIn

__all__ = [
    "TaskCreateIn",
    "TaskOut",
    "TaskPatchIn",
    "ReminderCreateIn",
    "ReminderOut",
    "ReminderPatchIn",
]
