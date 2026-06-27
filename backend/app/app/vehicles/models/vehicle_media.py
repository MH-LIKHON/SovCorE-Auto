# ============================================================
# backend/app/app/vehicles/models/vehicle_media.py
# ============================================================
#
# Purpose:
#   ORM model for the vehicle_media table. Stores all-round
#   vehicle photos — any number per vehicle — distinct from the
#   single cover photo on the vehicles table itself.
#
# Design:
#   r2_key is the Cloudflare R2 object key. display_order allows
#   the user to reorder photos in future without a new migration.
#   Cascade DELETE when the vehicle is deleted.
#
# Consumed by:
#   - backend/app/app/vehicles/models/__init__.py
#   - backend/app/app/vehicles/repositories/vehicle_media_repository.py
# ============================================================

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base

# ==================================================
# MODEL
# ==================================================


class VehicleMedia(Base):
    __tablename__ = "vehicle_media"

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
    r2_key: Mapped[str] = mapped_column(String(500), nullable=False)
    display_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
