# ============================================================
# backend/app/app/backups/models/backup.py
# ============================================================
#
# Purpose:
#   SQLAlchemy model for the backups table. One row per backup
#   run, tracking kind, status, R2 location, and timing.
#
# Design:
#   Status lifecycle: running → complete | failed. The row is
#   created as 'running' at the start of the backup job. Once
#   the ZIP is uploaded to R2 the row is updated to 'complete'
#   with r2_key, size_bytes, and completed_at. On any exception
#   the row is updated to 'failed'.
#
# Consumed by:
#   - backend/app/app/backups/repositories/backup_repository.py
#   - backend/app/alembic/versions/0008_backups.py
# ============================================================

import uuid

from sqlalchemy import BigInteger, DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.core.database import Base

# ==================================================
# BACKUP MODEL
# ==================================================


class Backup(Base):
    __tablename__ = "backups"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    account_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False
    )

    # 'manual' (user-triggered) or 'scheduled' (APScheduler daily job).
    kind: Mapped[str] = mapped_column(String(20), nullable=False, default="manual")

    # Null until the R2 upload completes.
    r2_key: Mapped[str | None] = mapped_column(String(500), nullable=True)
    size_bytes: Mapped[int | None] = mapped_column(BigInteger, nullable=True)

    # 'running' → 'complete' | 'failed'.
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="running")

    created_at: Mapped[object] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    completed_at: Mapped[object | None] = mapped_column(DateTime(timezone=True), nullable=True)
