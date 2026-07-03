# ============================================================
# backend/app/app/vehicles/models/vehicle.py
# ============================================================
#
# Purpose:
#   SQLAlchemy ORM models for the vehicles domain. Four tables:
#   vehicles (basic information and lifecycle), vehicle_renewals
#   (canonical MOT, tax, insurance, service dates that drive the
#   card RAG indicators), vehicle_ownership (keeper and purchase
#   information), and vehicle_previous_owners (ownership chain).
#
# Design:
#   Every vehicle row is scoped to an account via account_id.
#   A vehicle is never hard-deleted while it carries history;
#   the lifecycle_state column (active, sold, scrapped, archived)
#   is the everyday "I no longer own this" mechanism. Hard
#   deletion is reserved for the GDPR erasure path (Phase 7).
#
#   Money is stored in minor units (pence). Dates that carry no
#   time component are stored as `date`, not `timestamptz`.
#
#   vehicle_renewals is one-to-one with vehicles; a row is
#   created alongside every new vehicle so the card always has
#   a renewals record to read from, even when all dates are null.
#
# Consumed by:
#   - backend/app/app/vehicles/models/__init__.py (re-export)
#   - backend/app/alembic/env.py (metadata)
#   - backend/app/app/vehicles/repositories/vehicle_repository.py
# ============================================================

import uuid
from datetime import date, datetime, timezone
from enum import Enum

from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

# ==================================================
# ENUMS
# ==================================================

# ------------------------------ Body Type -----------------------------------


class BodyType(str, Enum):
    hatchback = "hatchback"
    saloon = "saloon"
    estate = "estate"
    suv = "suv"
    convertible = "convertible"
    van = "van"
    mpv = "mpv"


# ------------------------------ Lifecycle State -----------------------------


class LifecycleState(str, Enum):
    active = "active"
    sold = "sold"
    scrapped = "scrapped"
    archived = "archived"


# ==================================================
# VEHICLE
# ==================================================


class Vehicle(Base):
    __tablename__ = "vehicles"

    # ------------------------------ Identity --------------------------------
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    account_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("accounts.id", ondelete="CASCADE"),
        nullable=False,
    )

    # ------------------------------ Basic information -----------------------
    registration: Mapped[str | None] = mapped_column(String(20), nullable=True)
    vin: Mapped[str | None] = mapped_column(String(17), nullable=True)
    make: Mapped[str | None] = mapped_column(String(100), nullable=True)
    model: Mapped[str | None] = mapped_column(String(100), nullable=True)
    variant: Mapped[str | None] = mapped_column(String(100), nullable=True)
    year: Mapped[int | None] = mapped_column(Integer, nullable=True)
    engine: Mapped[str | None] = mapped_column(String(50), nullable=True)
    fuel_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    transmission: Mapped[str | None] = mapped_column(String(50), nullable=True)
    body_type: Mapped[BodyType | None] = mapped_column(
        SAEnum(BodyType, name="bodytype"), nullable=True
    )
    colour: Mapped[str | None] = mapped_column(String(50), nullable=True)
    doors: Mapped[int | None] = mapped_column(Integer, nullable=True)
    seats: Mapped[int | None] = mapped_column(Integer, nullable=True)
    horsepower: Mapped[int | None] = mapped_column(Integer, nullable=True)
    torque: Mapped[int | None] = mapped_column(Integer, nullable=True)
    emission_class: Mapped[str | None] = mapped_column(String(50), nullable=True)
    tyre_sizes: Mapped[str | None] = mapped_column(String(200), nullable=True)
    battery_size: Mapped[str | None] = mapped_column(String(50), nullable=True)
    wheel_sizes: Mapped[str | None] = mapped_column(String(200), nullable=True)
    mileage: Mapped[int | None] = mapped_column(Integer, nullable=True)
    image_key: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # ------------------------------ V5C: identity extensions -----------------
    # Fields present on a UK V5C (Registration Certificate) that go beyond the
    # original basic-information set. Grouped to mirror the Vehicle Details
    # accordion categories in the frontend.
    v5c_reference_number: Mapped[str | None] = mapped_column(String(20), nullable=True)
    type_designation: Mapped[str | None] = mapped_column(String(50), nullable=True)
    version: Mapped[str | None] = mapped_column(String(50), nullable=True)
    date_first_registered: Mapped[date | None] = mapped_column(Date, nullable=True)
    date_first_registered_uk: Mapped[date | None] = mapped_column(Date, nullable=True)

    # ------------------------------ V5C: specification ------------------------
    wheelplan: Mapped[str | None] = mapped_column(String(100), nullable=True)
    suspension_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    engine_number: Mapped[str | None] = mapped_column(String(50), nullable=True)
    standing_places: Mapped[int | None] = mapped_column(Integer, nullable=True)
    is_automated_vehicle: Mapped[bool | None] = mapped_column(Boolean, nullable=True)

    # ------------------------------ V5C: performance --------------------------
    max_net_power_kw: Mapped[int | None] = mapped_column(Integer, nullable=True)
    power_to_weight_ratio: Mapped[float | None] = mapped_column(Float, nullable=True)

    # ------------------------------ V5C: emissions and tax ---------------------
    taxation_class: Mapped[str | None] = mapped_column(String(50), nullable=True)
    vehicle_category: Mapped[str | None] = mapped_column(String(20), nullable=True)
    type_approval_number: Mapped[str | None] = mapped_column(String(50), nullable=True)
    euro_status: Mapped[str | None] = mapped_column(String(50), nullable=True)
    real_driving_emissions: Mapped[str | None] = mapped_column(String(100), nullable=True)
    co2_emissions: Mapped[int | None] = mapped_column(Integer, nullable=True)
    exhaust_co: Mapped[float | None] = mapped_column(Float, nullable=True)
    exhaust_hc: Mapped[float | None] = mapped_column(Float, nullable=True)
    exhaust_nox: Mapped[float | None] = mapped_column(Float, nullable=True)
    exhaust_hc_nox: Mapped[float | None] = mapped_column(Float, nullable=True)
    exhaust_particulates: Mapped[float | None] = mapped_column(Float, nullable=True)

    # ------------------------------ V5C: weights and towing --------------------
    kerb_weight: Mapped[int | None] = mapped_column(Integer, nullable=True)
    max_permissible_mass: Mapped[int | None] = mapped_column(Integer, nullable=True)
    revenue_weight: Mapped[int | None] = mapped_column(Integer, nullable=True)
    max_towable_mass_braked: Mapped[int | None] = mapped_column(Integer, nullable=True)
    max_towable_mass_unbraked: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # ------------------------------ V5C: sound level ----------------------------
    sound_level_stationary: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sound_level_engine_speed: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sound_level_drive_by: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # ------------------------------ V5C: usage extensions -----------------------
    number_of_previous_keepers: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # ------------------------------ Lifecycle state -------------------------
    # A vehicle leaves active use by transitioning to sold, scrapped or
    # archived — never by deletion while history exists.
    lifecycle_state: Mapped[LifecycleState] = mapped_column(
        SAEnum(LifecycleState, name="lifecyclestate"),
        nullable=False,
        default=LifecycleState.active,
        server_default="active",
    )

    # ------------------------------ Timestamps ------------------------------
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    # ------------------------------ Relationships ---------------------------
    renewal: Mapped["VehicleRenewal"] = relationship(
        back_populates="vehicle", uselist=False, cascade="all, delete-orphan"
    )
    ownership: Mapped["VehicleOwnership"] = relationship(
        back_populates="vehicle", uselist=False, cascade="all, delete-orphan"
    )
    previous_owners: Mapped[list["VehiclePreviousOwner"]] = relationship(
        back_populates="vehicle", cascade="all, delete-orphan"
    )


# ==================================================
# VEHICLE RENEWALS
# ==================================================


class VehicleRenewal(Base):
    __tablename__ = "vehicle_renewals"

    # ------------------------------ Identity --------------------------------
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    vehicle_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("vehicles.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,  # one renewals row per vehicle
    )

    # ------------------------------ Renewal dates ---------------------------
    # Nullable by design: a new vehicle may not have these dates yet. The
    # card and health score treat null as unknown (grey), not as overdue.
    mot_expiry: Mapped[date | None] = mapped_column(Date, nullable=True)
    tax_due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    insurance_expiry: Mapped[date | None] = mapped_column(Date, nullable=True)
    service_due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    service_due_mileage: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # ------------------------------ Timestamps ------------------------------
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    # ------------------------------ Relationships ---------------------------
    vehicle: Mapped["Vehicle"] = relationship(back_populates="renewal")


# ==================================================
# VEHICLE OWNERSHIP
# ==================================================


class VehicleOwnership(Base):
    __tablename__ = "vehicle_ownership"

    # ------------------------------ Identity --------------------------------
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    vehicle_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("vehicles.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,  # one ownership row per vehicle
    )

    # ------------------------------ Ownership details -----------------------
    current_owner: Mapped[str | None] = mapped_column(String(200), nullable=True)
    registered_keeper: Mapped[str | None] = mapped_column(String(200), nullable=True)
    purchase_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    purchase_price: Mapped[int | None] = mapped_column(Integer, nullable=True)  # pence
    seller: Mapped[str | None] = mapped_column(String(200), nullable=True)
    dealer: Mapped[str | None] = mapped_column(String(200), nullable=True)
    finance_company: Mapped[str | None] = mapped_column(String(200), nullable=True)
    finance_status: Mapped[str | None] = mapped_column(String(50), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # ------------------------------ Timestamps ------------------------------
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    # ------------------------------ Relationships ---------------------------
    vehicle: Mapped["Vehicle"] = relationship(back_populates="ownership")


# ==================================================
# VEHICLE PREVIOUS OWNERS
# ==================================================


class VehiclePreviousOwner(Base):
    __tablename__ = "vehicle_previous_owners"

    # ------------------------------ Identity --------------------------------
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    vehicle_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("vehicles.id", ondelete="CASCADE"),
        nullable=False,
    )

    # ------------------------------ Prior keeper ----------------------------
    name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    from_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    to_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # ------------------------------ Relationships ---------------------------
    vehicle: Mapped["Vehicle"] = relationship(back_populates="previous_owners")
