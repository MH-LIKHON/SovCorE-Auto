# ============================================================
# backend/app/app/auth/models/session.py
# ============================================================
#
# Purpose:
#   SQLAlchemy ORM model for the user_sessions table.
#   One row per user; enforces the single-active-session rule
#   at the database level via a UNIQUE constraint on user_id.
#
# Design:
#   refresh_jti stores the JWT ID of the currently live refresh
#   token. When a new login arrives and this row already exists,
#   the application issues a session-conflict response instead of
#   silently issuing a second session. The old JTI is added to
#   the in-memory blocklist when the conflict is resolved with
#   action="replace".
#
#   last_seen_at is bumped on every /auth/refresh call so the
#   row provides a coarse audit trail of when the session was
#   last active. It is not used for enforcement.
#
# Consumed by:
#   - backend/app/app/auth/services/session_service.py
#   - backend/app/app/auth/models/__init__.py (re-export)
# ============================================================

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


# ==================================================
# USER SESSION
# ==================================================


class UserSession(Base):
    __tablename__ = "user_sessions"
    __table_args__ = (
        # Belt-and-braces: the migration already adds a UNIQUE index on
        # user_id; repeating it here keeps the ORM model consistent with
        # the schema so introspection tools do not report a mismatch.
        UniqueConstraint("user_id", name="uq_user_sessions_user_id"),
    )

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

    # JTI of the active refresh token; used to revoke on conflict resolution.
    refresh_jti: Mapped[str] = mapped_column(Text(), nullable=False)

    # ------------------------------ Timestamps ------------------------------
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    # ------------------------------ Relationships ---------------------------
    user: Mapped["User"] = relationship(back_populates="session")  # noqa: F821
