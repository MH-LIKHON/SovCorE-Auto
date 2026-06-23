# ============================================================
# backend/app/app/accounts/models/user.py
# ============================================================
#
# Purpose:
#   SQLAlchemy ORM models for users and memberships.
#   A User is a person who signs in. A Membership links a user
#   to an account with a role. One user may belong to many
#   accounts (personal plus a business, for example).
#
# Design:
#   Email is stored lower-cased; the service layer enforces
#   this on write. Role is an enum column on Membership so the
#   constraint lives in the database. The TOTP secret is stored
#   encrypted at the service layer; here it is a plain column
#   that holds the encrypted ciphertext.
#
#   A membership row is the only place a role is stored. Every
#   permission check starts by querying the membership for the
#   current user + account pair, which is a composite-unique
#   index lookup.
#
# Consumed by:
#   - backend/app/app/accounts/models/__init__.py (re-export)
#   - backend/app/alembic/env.py (metadata)
#   - backend/app/app/accounts/repositories/user_repository.py
# ============================================================

import uuid
from datetime import datetime, timezone
from enum import Enum

from sqlalchemy import Boolean, DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.accounts.models.account import Account
from app.core.database import Base

# ==================================================
# ENUMS
# ==================================================

# ------------------------------ Role -----------------------------------------


class Role(str, Enum):
    owner = "owner"
    admin = "admin"
    editor = "editor"
    viewer = "viewer"


# ==================================================
# USER
# ==================================================


class User(Base):
    __tablename__ = "users"

    # ------------------------------ Identity --------------------------------
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    # email is always lower-cased by the service layer before storage.
    email: Mapped[str] = mapped_column(String(254), nullable=False, unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(200), nullable=False, default="")

    # ------------------------------ Status ----------------------------------
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    is_email_verified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # ------------------------------ 2FA (TOTP) ------------------------------
    # Encrypted TOTP secret; null until the user enables 2FA.
    totp_secret_enc: Mapped[str | None] = mapped_column(String(512), nullable=True)
    totp_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # ------------------------------ Timestamps ------------------------------
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    # ------------------------------ Relationships ---------------------------
    memberships: Mapped[list["Membership"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    sso_identities: Mapped[list["SSOIdentity"]] = relationship(  # noqa: F821
        back_populates="user", cascade="all, delete-orphan"
    )


# ==================================================
# MEMBERSHIP
# ==================================================


class Membership(Base):
    __tablename__ = "memberships"
    __table_args__ = (
        UniqueConstraint("account_id", "user_id", name="uq_membership_account_user"),
    )

    # ------------------------------ Identity --------------------------------
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    account_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    role: Mapped[Role] = mapped_column(
        SAEnum(Role, name="role"), nullable=False
    )

    # ------------------------------ Timestamps ------------------------------
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )

    # ------------------------------ Relationships ---------------------------
    account: Mapped["Account"] = relationship(back_populates="memberships")
    user: Mapped["User"] = relationship(back_populates="memberships")
