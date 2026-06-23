# ============================================================
# backend/app/app/documents/documents/models/document.py
# ============================================================
#
# Purpose:
#   SQLAlchemy ORM model for vehicle documents. Documents are
#   files stored in Cloudflare R2 and indexed here; they are
#   not records (a record tracks an action or event; a document
#   is a file like a V5C or insurance certificate).
#
# Design:
#   r2_key is the canonical reference. The file itself lives in
#   R2; the row here carries the metadata (type, filename,
#   content type, size, expiry). Deleting a row does not
#   delete the R2 object — the document service handles both.
#
#   DocumentType enum covers the main categories. An "other"
#   value handles anything outside the enumerated list.
#
# Consumed by:
#   - backend/app/app/documents/models/__init__.py (re-export)
#   - backend/app/alembic/env.py (metadata)
#   - backend/app/app/documents/repositories/document_repository.py
# ============================================================

import uuid
from datetime import date, datetime, timezone
from enum import Enum

from sqlalchemy import Date, DateTime, ForeignKey, Integer, String
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base

# ==================================================
# ENUMS
# ==================================================

# ------------------------------ Document Type --------------------------------


class DocumentType(str, Enum):
    v5c = "v5c"
    insurance = "insurance"
    mot = "mot"
    service = "service"
    finance = "finance"
    warranty = "warranty"
    invoice = "invoice"
    other = "other"


# ==================================================
# DOCUMENT
# ==================================================


class Document(Base):
    __tablename__ = "documents"

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

    # ------------------------------ File metadata ---------------------------
    type: Mapped[DocumentType] = mapped_column(
        SAEnum(DocumentType, name="documenttype"), nullable=False
    )
    r2_key: Mapped[str] = mapped_column(String(500), nullable=False)
    filename: Mapped[str] = mapped_column(String(500), nullable=False)
    content_type: Mapped[str] = mapped_column(String(200), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    expiry_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    # ------------------------------ Authorship ------------------------------
    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    # ------------------------------ Timestamps ------------------------------
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
