# ============================================================
# backend/app/app/tasks/models/custom_alert.py
# ============================================================
#
# Purpose:
#   SQLAlchemy ORM model for the custom_alerts table. A custom
#   alert is a user-defined notification attached to a vehicle
#   with one or more flexible trigger conditions (date, recurring
#   date, mileage threshold, recurring mileage).
#
# Design:
#   conditions is a JSONB array. Each element is a condition
#   object discriminated by "type". The scheduler reads and
#   mutates this array in-place when advancing recurring
#   conditions after they fire.
#
#   email_days_before mirrors the intervals field on Reminder:
#   it is an INTEGER ARRAY specifying how many days before a
#   date-based condition's next_due to send an email.
#
#   miles_warning specifies the miles-before threshold for
#   mileage-based conditions.
#
#   last_notified_at is updated by the scheduler each time any
#   condition on this alert fires. Used to compute the custom
#   alert RAG status on the vehicle card.
#
# Consumed by:
#   - backend/app/app/tasks/models/__init__.py
#   - backend/app/app/tasks/repositories/custom_alert_repository.py
#   - backend/app/app/scheduler/jobs.py
# ============================================================

import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base

# ==================================================
# CUSTOM ALERT
# ==================================================


class CustomAlert(Base):
    __tablename__ = "custom_alerts"

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
    name: Mapped[str] = mapped_column(String(200), nullable=False)

    # JSONB array of condition objects — each discriminated by a "type" field.
    conditions: Mapped[list] = mapped_column(
        JSONB, nullable=False, default=list
    )

    # "any" = first condition to fire triggers the alert.
    condition_mode: Mapped[str] = mapped_column(
        String(10), nullable=False, default="any"
    )

    # Days before a date/recurring condition's next_due to send email.
    email_days_before: Mapped[list[int]] = mapped_column(
        ARRAY(Integer), nullable=False, default=list
    )

    # Miles below a mileage condition threshold to trigger a warning email.
    miles_warning: Mapped[int] = mapped_column(Integer, nullable=False, default=500)

    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    # Updated by the scheduler when any condition on this alert fires.
    last_notified_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

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
    )
