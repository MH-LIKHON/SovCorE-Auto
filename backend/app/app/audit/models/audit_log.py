# ============================================================
# backend/app/app/audit/models/audit_log.py
# ============================================================
#
# Purpose:
#   SQLAlchemy ORM model for the audit_log table. The audit log
#   records every create, update and delete on tracked tables.
#   It is the compliance-grade change record for the account.
#
# Design:
#   old_value and new_value are stored as JSONB so the full row
#   state is captured without a schema migration when tracked
#   tables gain columns. JSONB supports index-based queries on
#   nested keys if future reporting needs them.
#
#   actor_user_id is nullable because system-initiated writes
#   (e.g. the GDPR erasure worker) have no human actor. The row
#   is still written so the change is recorded.
#
#   ip_address holds up to 45 characters to accommodate IPv6
#   addresses. It is nullable because background jobs carry no
#   client IP.
#
#   The audit log is append-only. No update or delete method
#   is exposed by the repository; that guarantee is enforced
#   by convention and code review.
#
# Consumed by:
#   - backend/app/app/audit/models/__init__.py (re-export)
#   - backend/app/alembic/env.py (metadata)
#   - backend/app/app/audit/repositories/audit_repository.py
#   - backend/app/app/api/v1/audit.py (step 3.5)
# ============================================================

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base

# ==================================================
# AUDIT LOG
# ==================================================


class AuditLog(Base):
    __tablename__ = "audit_log"

    # ------------------------------ Identity --------------------------------
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    account_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("accounts.id", ondelete="CASCADE"),
        nullable=False,
    )

    # ------------------------------ Actor -----------------------------------
    # Nullable: system-initiated writes (erasure worker, background jobs)
    # have no human actor. The row is still written to record the event.
    actor_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    # ------------------------------ Change record ---------------------------
    action: Mapped[str] = mapped_column(
        String(10), nullable=False
    )  # "create", "update", "delete"
    table_name: Mapped[str] = mapped_column(String(100), nullable=False)
    row_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    old_value: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    new_value: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    # ------------------------------ Context ---------------------------------
    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)

    # ------------------------------ Timestamp -------------------------------
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
