# ============================================================
# backend/app/app/tasks/models/__init__.py
# ============================================================
#
# Purpose:
#   Re-exports all tasks domain ORM models so Alembic env.py
#   can import a single package and discover both tables.
#
# Consumed by:
#   - backend/app/alembic/env.py (metadata discovery)
#   - tasks repositories (model imports)
# ============================================================

from app.tasks.models.custom_alert import CustomAlert
from app.tasks.models.mileage_log_settings import MileageLogSettings
from app.tasks.models.reminder import Reminder, ReminderType
from app.tasks.models.task import Task, TaskStatus

__all__ = ["Task", "TaskStatus", "Reminder", "ReminderType", "CustomAlert", "MileageLogSettings"]
