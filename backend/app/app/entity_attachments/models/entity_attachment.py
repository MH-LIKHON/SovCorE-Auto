# ============================================================
# backend/app/app/entity_attachments/models/entity_attachment.py
# ============================================================
#
# Purpose:
#   SQLAlchemy ORM model for the entity_attachments table.
#   Stores files (receipts, invoices, documents) attached to
#   any entity type: damage entries, PCNs, or warranty records.
#
# Design:
#   entity_type is VARCHAR(50) — not a PG enum — so new entity
#   types can be added without a schema migration.
#   entity_id is a plain UUID column with no FK constraint
#   because a single FK cannot reference multiple tables.
#   Ownership is enforced by account_id on every read/write.
#
# Consumed by:
#   - backend/app/app/entity_attachments/models/__init__.py
#   - backend/app/app/entity_attachments/repositories/
#       entity_attachment_repository.py
# ============================================================

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class EntityAttachment(Base):
    __tablename__ = "entity_attachments"

    # ------------------------------ Identity --------------------------------
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    account_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("accounts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # ------------------------------ Polymorphic key -------------------------
    entity_type: Mapped[str] = mapped_column(String(50), nullable=False)
    entity_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)

    # ------------------------------ Payload --------------------------------
    label: Mapped[str] = mapped_column(String(500), nullable=False, default="")
    r2_key: Mapped[str] = mapped_column(String(500), nullable=False)
    filename: Mapped[str] = mapped_column(String(500), nullable=False)
    content_type: Mapped[str] = mapped_column(String(200), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)

    # ------------------------------ Audit ----------------------------------
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
