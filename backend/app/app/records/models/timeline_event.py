# ============================================================
# backend/app/app/records/models/timeline_event.py
# ============================================================
#
# Purpose:
#   SQLAlchemy ORM model for the timeline_events table. A
#   timeline event is a read-optimised projection of the record
#   system: one row per meaningful change so the vehicle timeline
#   renders in a single query without joining multiple tables.
#
# Design:
#   This table is append-only. Rows are written automatically by
#   the service layer when records are created or deleted; they are
#   never hand-edited. The table can be rebuilt from records and
#   documents if it goes out of sync.
#
#   ref_table and ref_id point to the source row. kind is free text
#   (e.g. "record.maintenance", "document.v5c", "lifecycle.sold")
#   rather than an enum so new event types need no schema migration.
#
#   vehicle_id is nullable because future account-level events
#   (user invite, setting change) do not belong to a single vehicle.
#
# Consumed by:
#   - backend/app/app/records/models/__init__.py (re-export)
#   - backend/app/alembic/env.py (metadata)
#   - backend/app/app/records/services/record_service.py
#   - backend/app/app/api/v1/timeline.py (step 3.4)
# ============================================================

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base

# ==================================================
# TIMELINE EVENT
# ==================================================


class TimelineEvent(Base):
    __tablename__ = "timeline_events"

    # ------------------------------ Identity --------------------------------
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    account_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("accounts.id", ondelete="CASCADE"),
        nullable=False,
    )
    vehicle_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("vehicles.id", ondelete="CASCADE"),
        nullable=True,
    )

    # ------------------------------ Event details ---------------------------
    kind: Mapped[str] = mapped_column(String(100), nullable=False)
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    ref_table: Mapped[str | None] = mapped_column(String(100), nullable=True)
    ref_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)

    # ------------------------------ Timestamp -------------------------------
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
