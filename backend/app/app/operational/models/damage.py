# ============================================================
# backend/app/app/operational/models/damage.py
# ============================================================
#
# Purpose:
#   SQLAlchemy ORM model for the damage_entries table. Records
#   damage events on a vehicle: kind, description, repair cost,
#   before and after images stored in R2, and the date.
#
# Design:
#   before_key and after_key are R2 object keys, nullable because
#   images are optional (not every damage entry has photos).
#   repair_cost is in pence; nullable when cost is unknown.
#   There is no soft-delete: a damage entry is a permanent record
#   of a physical event.
#
# Consumed by:
#   - backend/app/app/operational/models/__init__.py
#   - backend/app/app/operational/repositories/damage_repository.py
# ============================================================

import uuid
from datetime import date, datetime, timezone
from enum import Enum

from sqlalchemy import Date, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base

# ==================================================
# ENUMS
# ==================================================


class DamageKind(str, Enum):
    scratch    = "scratch"
    dent       = "dent"
    paintwork  = "paintwork"
    accident   = "accident"
    glass      = "glass"
    stone_chip = "stone_chip"


# ==================================================
# MODEL
# ==================================================


class DamageEntry(Base):
    __tablename__ = "damage_entries"

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

    # ------------------------------ Damage fields ---------------------------
    kind: Mapped[DamageKind] = mapped_column(
        SAEnum(DamageKind, name="damagekind", native_enum=False), nullable=False
    )
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    date: Mapped[date] = mapped_column(Date, nullable=False)
    repair_cost: Mapped[int | None] = mapped_column(Integer, nullable=True)  # pence

    # ------------------------------ R2 image keys ---------------------------
    # Keys are nullable: images are optional.
    before_key: Mapped[str | None] = mapped_column(String(500), nullable=True)
    after_key: Mapped[str | None] = mapped_column(String(500), nullable=True)

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
