# ============================================================
# backend/app/app/tasks/models/task.py
# ============================================================
#
# Purpose:
#   SQLAlchemy ORM model for the tasks table. A task is a unit
#   of work scoped to a vehicle, optionally assigned to a user,
#   with a status that moves from open through in_progress to
#   completed.
#
# Design:
#   Status is a Python enum validated on the application side
#   but stored as VARCHAR(20) in PostgreSQL. VARCHAR avoids the
#   ALTER TYPE migration cost when new statuses are added later.
#
#   created_by and assignee_user_id are nullable foreign keys so
#   tasks survive user deletion (SET NULL rather than CASCADE).
#
# Consumed by:
#   - backend/app/app/tasks/models/__init__.py
#   - backend/app/app/tasks/repositories/task_repository.py
# ============================================================

import uuid
from datetime import date, datetime, timezone
from enum import Enum

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base

# ==================================================
# ENUMS
# ==================================================

# ------------------------------ Task Status ---------------------------------


class TaskStatus(str, Enum):
    open = "open"
    in_progress = "in_progress"
    completed = "completed"


# ==================================================
# TASK
# ==================================================


class Task(Base):
    __tablename__ = "tasks"

    # ------------------------------ Identity --------------------------------
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    account_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("accounts.id", ondelete="CASCADE"),
        nullable=False,
    )
    vehicle_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("vehicles.id", ondelete="CASCADE"),
        nullable=False,
    )

    # ------------------------------ Author and assignee ---------------------
    # Nullable so tasks survive user deletion (ON DELETE SET NULL).
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    assignee_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    # ------------------------------ Content ---------------------------------
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="open")
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Set True for platform-seeded tasks; the delete endpoint rejects these.
    is_system_default: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # ------------------------------ Timestamps ------------------------------
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
