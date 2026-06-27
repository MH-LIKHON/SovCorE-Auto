# ============================================================
# backend/app/app/operational/models/damage_audit.py
# ============================================================
#
# Purpose:
#   Immutable audit log for damage photo upload and delete
#   actions. Every photo change on a damage entry writes one row.
#
# Design:
#   No FK constraints on account_id, vehicle_id, entry_id, or
#   performed_by. The log must survive deletion of the source
#   rows (GDPR erasure sweeps the table by account_id, not via
#   CASCADE). action is one of "uploaded" or "deleted".
#
# Consumed by:
#   - backend/app/app/operational/models/__init__.py
#   - backend/app/app/api/v1/operational.py (write-only)
# ============================================================

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base

# ==================================================
# MODEL
# ==================================================


class DamagePhotoAuditLog(Base):
    __tablename__ = "damage_photo_audit_log"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    # Stored as plain UUIDs — no FK constraints (log outlives source rows).
    account_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    vehicle_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    entry_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)

    slot: Mapped[str] = mapped_column(String(10), nullable=False)    # "before" or "after"
    action: Mapped[str] = mapped_column(String(20), nullable=False)  # "uploaded" or "deleted"
    r2_key: Mapped[str | None] = mapped_column(String(500), nullable=True)

    performed_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    performed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
