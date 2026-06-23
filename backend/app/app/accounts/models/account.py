# ============================================================
# backend/app/app/accounts/models/account.py
# ============================================================
#
# Purpose:
#   SQLAlchemy ORM models for the accounts domain tenant
#   boundary. An account is the tenant; every domain row
#   carries an account_id foreign key so no query can cross
#   tenant lines.
#
# Design:
#   Account types are an enum column so the constraint is in
#   the database, not in application code. AccountPreferences
#   is one-to-one with Account (one row per tenant, created
#   at account creation time). Stored values are always
#   canonical (metres stored as miles for display, pence for
#   money); the preference column controls display only.
#
# Consumed by:
#   - backend/app/app/accounts/models/__init__.py (re-export)
#   - backend/app/alembic/env.py (metadata)
#   - backend/app/app/accounts/repositories/account_repository.py
# ============================================================

import uuid
from datetime import datetime, timezone
from enum import Enum

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

# ==================================================
# ENUMS
# ==================================================

# ------------------------------ Account Type --------------------------------


class AccountType(str, Enum):
    personal = "personal"
    family = "family"
    business = "business"
    fleet = "fleet"


# ------------------------------ Distance Unit --------------------------------


class DistanceUnit(str, Enum):
    miles = "miles"
    kilometres = "kilometres"


# ------------------------------ Volume Unit ---------------------------------


class VolumeUnit(str, Enum):
    litres = "litres"
    gallons = "gallons"


# ------------------------------ Economy Unit --------------------------------


class EconomyUnit(str, Enum):
    mpg = "mpg"
    l_per_100km = "l_per_100km"


# ==================================================
# ACCOUNT
# ==================================================


class Account(Base):
    __tablename__ = "accounts"

    # ------------------------------ Identity --------------------------------
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    type: Mapped[AccountType] = mapped_column(
        SAEnum(AccountType, name="accounttype"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)

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
    preferences: Mapped["AccountPreferences"] = relationship(
        back_populates="account", uselist=False, cascade="all, delete-orphan"
    )
    memberships: Mapped[list["Membership"]] = relationship(  # noqa: F821
        back_populates="account", cascade="all, delete-orphan"
    )


# ==================================================
# ACCOUNT PREFERENCES
# ==================================================


class AccountPreferences(Base):
    __tablename__ = "account_preferences"

    # ------------------------------ Identity --------------------------------
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    account_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("accounts.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,  # one row per account
    )

    # ------------------------------ Display preferences --------------------
    # The UK quirk: distance in miles, fuel sold in litres, economy in MPG.
    # Default values match UK conventions so a new account works out of the box.
    distance_unit: Mapped[DistanceUnit] = mapped_column(
        SAEnum(DistanceUnit, name="distanceunit"), nullable=False, default=DistanceUnit.miles
    )
    volume_unit: Mapped[VolumeUnit] = mapped_column(
        SAEnum(VolumeUnit, name="volumeunit"), nullable=False, default=VolumeUnit.litres
    )
    economy_unit: Mapped[EconomyUnit] = mapped_column(
        SAEnum(EconomyUnit, name="economyunit"), nullable=False, default=EconomyUnit.mpg
    )
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="GBP")

    # ------------------------------ Timestamps ------------------------------
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    # ------------------------------ Relationships ---------------------------
    account: Mapped["Account"] = relationship(back_populates="preferences")
