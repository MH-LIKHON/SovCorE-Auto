# ============================================================
# backend/app/app/auth/models/trusted_device.py
# ============================================================
#
# Purpose:
#   SQLAlchemy ORM model for the trusted_devices table.
#   Each row represents a browser/device that the user chose to
#   trust during a 2FA challenge. While the row is alive and
#   unexpired, the device can skip the TOTP step on login.
#
# Design:
#   The plaintext device token travels only in an HTTP-only
#   cookie (sva_td). Only the SHA-256 hex digest is stored here.
#   A user may trust multiple devices, so there is no UNIQUE
#   constraint on user_id. Expiry is enforced at query time:
#   WHERE expires_at > now() AND user_id = ?.
#
#   15-day expiry is the SovCorE default, configurable only via
#   the constant in trusted_device_service.py (not user-facing).
#
# Consumed by:
#   - backend/app/app/auth/services/trusted_device_service.py
#   - backend/app/app/auth/models/__init__.py (re-export)
# ============================================================

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


# ==================================================
# TRUSTED DEVICE
# ==================================================


class TrustedDevice(Base):
    __tablename__ = "trusted_devices"

    # ------------------------------ Identity --------------------------------
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # SHA-256 hex digest of the plaintext token that lives in the cookie.
    device_token_hash: Mapped[str] = mapped_column(Text(), nullable=False, unique=True)

    # Human-readable label derived from the User-Agent at registration time.
    label: Mapped[str] = mapped_column(Text(), nullable=False, default="")

    # ------------------------------ Timestamps ------------------------------
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )

    # ------------------------------ Relationships ---------------------------
    user: Mapped["User"] = relationship(back_populates="trusted_devices")  # noqa: F821
