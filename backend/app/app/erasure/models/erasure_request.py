# ============================================================
# backend/app/app/erasure/models/erasure_request.py
# ============================================================
#
# Purpose:
#   SQLAlchemy model for the erasure_requests table. Records
#   the lifecycle of a UK GDPR right-to-erasure request from
#   submission through confirmation to completed purge.
#
# Design:
#   account_id and requested_by use SET NULL on DELETE rather
#   than CASCADE. The erasure row must survive the account
#   deletion so the event is recorded in the system audit trail
#   without retaining the personal data that was deleted.
#
# Consumed by:
#   - backend/app/app/erasure/repositories/erasure_repository.py
#   - backend/app/alembic/versions/0009_erasure_requests.py
# ============================================================

import uuid

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.core.database import Base

# ==================================================
# ERASURE REQUEST MODEL
# ==================================================


class ErasureRequest(Base):
    __tablename__ = "erasure_requests"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # SET NULL — the row must survive account deletion.
    account_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("accounts.id", ondelete="SET NULL"), nullable=True
    )
    requested_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    requested_at: Mapped[object] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    confirmed_at: Mapped[object | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # 'requested' → 'confirmed' → 'completed' | 'cancelled'.
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="requested")

    completed_at: Mapped[object | None] = mapped_column(DateTime(timezone=True), nullable=True)
