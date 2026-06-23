# ============================================================
# backend/app/app/operational/models/pcn.py
# ============================================================
#
# Purpose:
#   SQLAlchemy ORM model for the pcns table. A PCN (penalty
#   charge notice) is a council or private parking charge raised
#   against a vehicle. The table tracks reference, authority,
#   date issued, amount, status, and notes.
#
# Design:
#   Status progresses: open → paid, appealed, or cancelled.
#   Amount is stored in pence (integer) per the platform money
#   convention. There is no soft-delete; status changes are the
#   lifecycle mechanism.
#
#   PCNs do not carry record_id because they are a first-class
#   operational entity, not a sub-type of the record system.
#   The audit log and timeline write-path (if needed in a future
#   phase) will reference the pcns table directly.
#
# Consumed by:
#   - backend/app/app/operational/models/__init__.py
#   - backend/app/app/operational/repositories/pcn_repository.py
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


class PCNStatus(str, Enum):
    open      = "open"
    paid      = "paid"
    appealed  = "appealed"
    cancelled = "cancelled"


# ==================================================
# MODEL
# ==================================================


class PCN(Base):
    __tablename__ = "pcns"

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

    # ------------------------------ PCN fields ------------------------------
    reference: Mapped[str | None] = mapped_column(String(100), nullable=True)
    authority: Mapped[str | None] = mapped_column(String(300), nullable=True)
    date: Mapped[date] = mapped_column(Date, nullable=False)
    amount: Mapped[int] = mapped_column(Integer, nullable=False)  # pence
    status: Mapped[PCNStatus] = mapped_column(
        SAEnum(PCNStatus, name="pcnstatus"),
        nullable=False,
        default=PCNStatus.open,
        server_default="open",
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
        onupdate=lambda: datetime.now(timezone.utc),
    )
