# ============================================================
# backend/app/app/tasks/models/reminder.py
# ============================================================
#
# Purpose:
#   SQLAlchemy ORM model for the reminders table. A reminder
#   is a date-triggered notification scoped to a vehicle renewal
#   type. The background scheduler reads active reminders daily
#   and dispatches emails via Resend at each configured interval.
#
# Design:
#   Reminder type is stored as VARCHAR(30) so new types can be
#   added without ALTER TYPE.
#
#   intervals is a PostgreSQL INTEGER ARRAY. Each value is a
#   number of days before due_date at which a notification
#   fires. Default is [90, 60, 30, 14, 7, 1].
#
#   last_sent_interval records the most recent interval that
#   fired successfully. The scheduler compares today's gap
#   (due_date - today) against intervals and only sends when
#   the gap matches an interval and is greater than
#   last_sent_interval (or last_sent_interval is null).
#
# Consumed by:
#   - backend/app/app/tasks/models/__init__.py
#   - backend/app/app/tasks/repositories/reminder_repository.py
#   - backend/app/app/scheduler/jobs.py
# ============================================================

import uuid
from datetime import date, datetime, timezone
from enum import Enum

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base

# ==================================================
# ENUMS
# ==================================================

# ------------------------------ Reminder Type --------------------------------


class ReminderType(str, Enum):
    mot = "mot"
    tax = "tax"
    insurance = "insurance"
    service = "service"
    tyres = "tyres"
    brake_fluid = "brake_fluid"
    battery = "battery"
    warranty = "warranty"
    finance = "finance"
    breakdown_cover = "breakdown_cover"
    custom = "custom"


# ==================================================
# REMINDER
# ==================================================


class Reminder(Base):
    __tablename__ = "reminders"

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

    # ------------------------------ Content ---------------------------------
    type: Mapped[str] = mapped_column(String(30), nullable=False)
    due_date: Mapped[date] = mapped_column(Date, nullable=False)

    # Notification intervals as an integer array (days before due_date).
    intervals: Mapped[list[int]] = mapped_column(
        ARRAY(Integer), nullable=False, default=list
    )

    # Tracks the last interval sent to prevent duplicate notifications.
    last_sent_interval: Mapped[int | None] = mapped_column(Integer, nullable=True)

    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # ------------------------------ Timestamps ------------------------------
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
