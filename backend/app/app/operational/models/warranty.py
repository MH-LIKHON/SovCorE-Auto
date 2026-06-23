# ============================================================
# backend/app/app/operational/models/warranty.py
# ============================================================
#
# Purpose:
#   SQLAlchemy ORM model for the warranties table. Tracks warranty
#   cover for a vehicle component: component name, supplier, expiry
#   date, labour and parts costs, notes, and an optional invoice R2
#   key.
#
# Design:
#   expiry_date drives the red/amber/green status displayed on the
#   frontend (same threshold logic as MOT and insurance renewals,
#   defined in KB/VEHICLE-HEALTH-SCORE.md in Phase 5). The model
#   stores the date; the status is computed on the frontend.
#
#   invoice_key is nullable; not every warranty carries a paper
#   invoice and the R2 upload is optional.
#
# Consumed by:
#   - backend/app/app/operational/models/__init__.py
#   - backend/app/app/operational/repositories/warranty_repository.py
# ============================================================

import uuid
from datetime import date, datetime, timezone

from sqlalchemy import Date, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base

# ==================================================
# MODEL
# ==================================================


class Warranty(Base):
    __tablename__ = "warranties"

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

    # ------------------------------ Warranty fields -------------------------
    component: Mapped[str] = mapped_column(String(300), nullable=False)
    supplier: Mapped[str | None] = mapped_column(String(300), nullable=True)
    expiry_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    labour_cost: Mapped[int | None] = mapped_column(Integer, nullable=True)  # pence
    parts_cost: Mapped[int | None] = mapped_column(Integer, nullable=True)   # pence
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    invoice_key: Mapped[str | None] = mapped_column(String(500), nullable=True)

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
