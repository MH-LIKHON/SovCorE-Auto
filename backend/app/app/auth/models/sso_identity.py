# ============================================================
# backend/app/app/auth/models/sso_identity.py
# ============================================================
#
# Purpose:
#   SQLAlchemy ORM model for linked external SSO identities.
#   One row per (provider, subject) pair. A user may link
#   multiple providers; each gets its own row.
#
# Design:
#   `subject` is the provider's stable, immutable user ID
#   (Microsoft: object ID / OID claim). The (provider, subject)
#   pair is unique across the system so the callback can find
#   the local user without touching the users table. Email from
#   the token is not used for lookup — it can change on the
#   provider side.
#
# Consumed by:
#   - backend/app/app/auth/models/__init__.py (re-export)
#   - backend/app/alembic/env.py (metadata)
#   - backend/app/app/auth/repositories/sso_repository.py
# ============================================================

import uuid
from datetime import datetime, timezone
from enum import Enum

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

# ==================================================
# ENUMS
# ==================================================


class SSOProvider(str, Enum):
    microsoft = "microsoft"
    google = "google"
    github = "github"
    apple = "apple"


# ==================================================
# SSO IDENTITY
# ==================================================


class SSOIdentity(Base):
    __tablename__ = "sso_identities"
    __table_args__ = (
        UniqueConstraint("provider", "subject", name="uq_sso_provider_subject"),
    )

    # ------------------------------ Identity --------------------------------
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    provider: Mapped[SSOProvider] = mapped_column(
        SAEnum(SSOProvider, name="ssoprovider"), nullable=False
    )
    # The provider's stable user identifier (OID for Microsoft, sub for Google/Apple).
    subject: Mapped[str] = mapped_column(String(256), nullable=False)

    # ------------------------------ Timestamps ------------------------------
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )

    # ------------------------------ Relationships ---------------------------
    user: Mapped["User"] = relationship(back_populates="sso_identities")  # noqa: F821
