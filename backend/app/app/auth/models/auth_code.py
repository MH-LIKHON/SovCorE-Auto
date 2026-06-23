# ============================================================
# backend/app/app/auth/models/auth_code.py
# ============================================================
#
# Purpose:
#   SQLAlchemy ORM model for passwordless login codes.
#   Each row represents one code sent to one email address.
#   Codes are single-use; consumed_at is set when the code is
#   accepted and the row is never reused.
#
# Design:
#   Only the hash is stored, never the plaintext six digits.
#   The service layer hashes the code with SHA-256 before
#   writing here. On verify it hashes the supplied digits and
#   compares to code_hash. This means a database breach does
#   not reveal any code that is still within its window.
#
#   expires_at is set to issue time plus ten minutes. The
#   service checks expires_at > now() AND consumed_at IS NULL
#   before accepting a code.
#
# Consumed by:
#   - backend/app/app/auth/models/__init__.py (re-export)
#   - backend/app/alembic/env.py (metadata)
#   - backend/app/app/auth/repositories/auth_code_repository.py
# ============================================================

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base

# ==================================================
# AUTH CODE
# ==================================================


class AuthCode(Base):
    __tablename__ = "auth_codes"

    # ------------------------------ Identity --------------------------------
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    # The email that requested the code (lower-cased).
    email: Mapped[str] = mapped_column(String(254), nullable=False, index=True)

    # ------------------------------ Code (hashed) ---------------------------
    # SHA-256 hex digest of the six-digit code. Never store the plaintext.
    code_hash: Mapped[str] = mapped_column(String(64), nullable=False)

    # ------------------------------ Lifecycle -------------------------------
    # Issue time plus ten minutes; checked before the code is accepted.
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    # Set when the code is consumed. A code with consumed_at set cannot be used again.
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # ------------------------------ Timestamps ------------------------------
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )
