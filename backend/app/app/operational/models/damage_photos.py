# ============================================================
# backend/app/app/operational/models/damage_photos.py
# ============================================================
#
# Purpose:
#   SQLAlchemy ORM model for the damage_photos table. Each row
#   is one photo attached to a damage entry in a named slot
#   ("before" or "after"). Multiple photos are allowed per slot
#   to support a full before/after gallery per damage event.
#
# Design:
#   No FK constraints on any column so rows survive deletion of
#   the parent damage entry, vehicle, or user. The GDPR erasure
#   service sweeps by account_id. display_order controls the
#   gallery sort within a slot.
#
# Consumed by:
#   - backend/app/app/operational/models/__init__.py
#   - backend/app/app/operational/repositories/damage_photo_repository.py
# ============================================================

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base

# ==================================================
# MODEL
# ==================================================


class DamagePhoto(Base):
    __tablename__ = "damage_photos"

    # ------------------------------ Identity --------------------------------
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    # No FK constraints — rows survive parent deletion.
    entry_id:   Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    account_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    vehicle_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)

    # ------------------------------ Photo fields ----------------------------
    slot:          Mapped[str] = mapped_column(String(10), nullable=False)  # "before" | "after"
    r2_key:        Mapped[str] = mapped_column(Text,       nullable=False)
    display_order: Mapped[int] = mapped_column(Integer,    nullable=False, default=0)

    # ------------------------------ Timestamps ------------------------------
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
