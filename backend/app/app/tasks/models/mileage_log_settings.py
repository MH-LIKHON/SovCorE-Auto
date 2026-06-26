# ============================================================
# backend/app/app/tasks/models/mileage_log_settings.py
# ============================================================
#
# Purpose:
#   Per-account configuration for the monthly mileage log
#   prompt email. One row per account. If no row exists the
#   defaults apply (day 1, active=True).
#
# Design:
#   reminder_day is constrained to 1–28 (not 1–31) so it is
#   valid every month, avoiding issues in February or months
#   with 30 days.
#
#   last_sent_month ("YYYY-MM") prevents the scheduler from
#   sending the prompt more than once per calendar month even
#   if the daily job misfires and runs twice.
#
# Consumed by:
#   - backend/app/app/tasks/models/__init__.py
#   - backend/app/app/scheduler/jobs.py
#   - backend/app/app/api/v1/mileage.py
# ============================================================

import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, SmallInteger, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class MileageLogSettings(Base):
    __tablename__ = "mileage_log_settings"

    # ------------------------------ Identity --------------------------------
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    # unique=True: exactly one settings row per account.
    account_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("accounts.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )

    # Day of month (1–28) on which the log-mileage prompt fires.
    reminder_day: Mapped[int] = mapped_column(
        SmallInteger,
        nullable=False,
        default=1,
        server_default="1",
    )

    active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )

    # "YYYY-MM" of the most recent month a prompt was sent; null = never sent.
    last_sent_month: Mapped[str | None] = mapped_column(String(7), nullable=True)

    # ------------------------------ Timestamp -------------------------------
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    # ------------------------------ Constraints -----------------------------
    __table_args__ = (
        CheckConstraint("reminder_day >= 1 AND reminder_day <= 28", name="ck_mileage_reminder_day"),
    )
