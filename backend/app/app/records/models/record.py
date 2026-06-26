# ============================================================
# backend/app/app/records/models/record.py
# ============================================================
#
# Purpose:
#   SQLAlchemy ORM models for the records domain. Seven tables:
#   records (the central action row per vehicle), record_attachments
#   (R2 file references attached to a record), record_tags (free-text
#   tags for search), maintenance_details (taxonomy fields for
#   maintenance and repair records), fuel_details (volume and price
#   fields that power fuel analytics), diagnostic_details (inspection
#   type and findings for diagnostics records), and
#   diagnostic_fault_codes (one-to-many fault code rows per
#   diagnostics record).
#
# Design:
#   Every user action (maintenance job, fuel fill, MOT, tax payment,
#   parking charge, PCN, cleaning, diagnostics) lands as a row in
#   records. The record_type determines which detail table, if any,
#   is joined. The timeline, expense totals and health score read
#   from these rows; they are never stored twice.
#
#   Money columns (cost, labour_cost, parts_cost, price_per_litre) are
#   stored in minor units (pence) as integers so floating-point rounding
#   cannot corrupt monetary data.
#
#   Fuel volume (litres) uses Numeric(10, 3) so 45.250 litres survives a
#   round-trip without floating-point drift.
#
#   maintenance_details and fuel_details are one-to-one with the owning
#   record; unique constraints on record_id enforce this at the database
#   level rather than relying on application enforcement alone.
#   diagnostic_details is also one-to-one. diagnostic_fault_codes is
#   one-to-many (multiple fault codes per diagnostics record).
#
# Consumed by:
#   - backend/app/app/records/models/__init__.py (re-export)
#   - backend/app/alembic/env.py (metadata)
#   - backend/app/app/records/repositories/record_repository.py
# ============================================================

import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
from enum import Enum

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
)
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

# ==================================================
# ENUMS
# ==================================================

# ------------------------------ Record Type ---------------------------------


class RecordType(str, Enum):
    maintenance = "maintenance"
    repair = "repair"
    fuel = "fuel"
    mot = "mot"
    tax = "tax"
    insurance = "insurance"
    parking = "parking"
    pcn = "pcn"
    cleaning = "cleaning"
    accessories = "accessories"
    warranty = "warranty"
    diagnostics = "diagnostics"
    damage = "damage"
    roadside = "roadside"
    custom = "custom"
    odometer = "odometer"


# ------------------------------ Attachment Kind -----------------------------


class AttachmentKind(str, Enum):
    invoice = "invoice"
    photo = "photo"
    document = "document"
    other = "other"


# ------------------------------ Maintenance Category ------------------------


class MaintenanceCategory(str, Enum):
    engine = "engine"
    transmission = "transmission"
    brakes = "brakes"
    suspension = "suspension"
    steering = "steering"
    wheels = "wheels"
    cooling = "cooling"
    electrical = "electrical"
    hvac = "hvac"
    exhaust = "exhaust"
    miscellaneous = "miscellaneous"


# ==================================================
# RECORD
# ==================================================


class Record(Base):
    __tablename__ = "records"

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

    # ------------------------------ Record type -----------------------------
    type: Mapped[RecordType] = mapped_column(
        SAEnum(RecordType, name="recordtype"), nullable=False
    )

    # ------------------------------ Core fields -----------------------------
    date: Mapped[date] = mapped_column(Date, nullable=False)
    mileage: Mapped[int | None] = mapped_column(Integer, nullable=True)
    cost: Mapped[int | None] = mapped_column(Integer, nullable=True)  # pence
    currency: Mapped[str] = mapped_column(
        String(3), nullable=False, default="GBP", server_default="GBP"
    )
    supplier: Mapped[str | None] = mapped_column(String(300), nullable=True)
    garage: Mapped[str | None] = mapped_column(String(300), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # ------------------------------ Scheduling fields -----------------------
    reminder_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    warranty_expiry: Mapped[date | None] = mapped_column(Date, nullable=True)
    next_due_mileage: Mapped[int | None] = mapped_column(Integer, nullable=True)
    next_due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    # Stores user-defined key/value pairs for custom record type.
    custom_fields: Mapped[list | None] = mapped_column(JSONB, nullable=True)

    # ------------------------------ Audit fields ----------------------------
    # SET NULL on delete so deleting a user does not cascade-delete records.
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    updated_by: Mapped[uuid.UUID | None] = mapped_column(
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
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    # ------------------------------ Relationships ---------------------------
    attachments: Mapped[list["RecordAttachment"]] = relationship(
        back_populates="record", cascade="all, delete-orphan"
    )
    tags: Mapped[list["RecordTag"]] = relationship(
        back_populates="record", cascade="all, delete-orphan"
    )
    maintenance_detail: Mapped["MaintenanceDetail | None"] = relationship(
        back_populates="record", uselist=False, cascade="all, delete-orphan"
    )
    fuel_detail: Mapped["FuelDetail | None"] = relationship(
        back_populates="record", uselist=False, cascade="all, delete-orphan"
    )
    diagnostic_detail: Mapped["DiagnosticDetail | None"] = relationship(
        back_populates="record", uselist=False, cascade="all, delete-orphan"
    )
    diagnostic_fault_codes: Mapped[list["DiagnosticFaultCode"]] = relationship(
        back_populates="record", cascade="all, delete-orphan"
    )


# ==================================================
# RECORD ATTACHMENTS
# ==================================================


class RecordAttachment(Base):
    __tablename__ = "record_attachments"

    # ------------------------------ Identity --------------------------------
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    record_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("records.id", ondelete="CASCADE"),
        nullable=False,
    )

    # ------------------------------ File reference --------------------------
    kind: Mapped[str] = mapped_column(String(100), nullable=False)
    r2_key: Mapped[str] = mapped_column(String(500), nullable=False)
    filename: Mapped[str] = mapped_column(String(500), nullable=False)
    content_type: Mapped[str] = mapped_column(String(200), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)

    # ------------------------------ Timestamp -------------------------------
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    # ------------------------------ Relationships ---------------------------
    record: Mapped["Record"] = relationship(back_populates="attachments")


# ==================================================
# RECORD TAGS
# ==================================================


class RecordTag(Base):
    __tablename__ = "record_tags"

    # ------------------------------ Identity --------------------------------
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    record_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("records.id", ondelete="CASCADE"),
        nullable=False,
    )
    tag: Mapped[str] = mapped_column(String(100), nullable=False)

    # ------------------------------ Relationships ---------------------------
    record: Mapped["Record"] = relationship(back_populates="tags")


# ==================================================
# MAINTENANCE DETAILS
# ==================================================


class MaintenanceDetail(Base):
    __tablename__ = "maintenance_details"

    # ------------------------------ Identity --------------------------------
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    # unique=True: one detail row per maintenance/repair record.
    record_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("records.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )

    # ------------------------------ Taxonomy --------------------------------
    category: Mapped[MaintenanceCategory] = mapped_column(
        SAEnum(MaintenanceCategory, name="maintenancecategory"), nullable=False
    )
    item: Mapped[str | None] = mapped_column(String(300), nullable=True)
    part_number: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # ------------------------------ Costs (pence) ---------------------------
    labour_cost: Mapped[int | None] = mapped_column(Integer, nullable=True)
    parts_cost: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # ------------------------------ Relationships ---------------------------
    record: Mapped["Record"] = relationship(back_populates="maintenance_detail")


# ==================================================
# FUEL DETAILS
# ==================================================


class FuelDetail(Base):
    __tablename__ = "fuel_details"

    # ------------------------------ Identity --------------------------------
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    # unique=True: one detail row per fuel record.
    record_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("records.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )

    # ------------------------------ Fuel fields -----------------------------
    # Numeric(10, 3): 7 digits before the point, 3 after. 45.250 litres
    # is stored exactly; a float column would drift at the third decimal.
    litres: Mapped[Decimal] = mapped_column(Numeric(10, 3), nullable=False)
    price_per_litre: Mapped[int] = mapped_column(Integer, nullable=False)  # pence
    station: Mapped[str | None] = mapped_column(String(300), nullable=True)
    full_tank: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )

    # ------------------------------ Relationships ---------------------------
    record: Mapped["Record"] = relationship(back_populates="fuel_detail")


# ==================================================
# FAULT CODE SEVERITY + INSPECTION TYPE
# ==================================================


class FaultCodeSeverity(str, Enum):
    advisory = "advisory"   # watch, no immediate action
    amber = "amber"         # attention needed soon
    red = "red"             # urgent
    resolved = "resolved"   # fault has been addressed


class InspectionType(str, Enum):
    # self_ attribute avoids conflict with Python's built-in `self`.
    # The stored value in the database is "self".
    self_ = "self"
    garage = "garage"


# ==================================================
# DIAGNOSTIC DETAILS
# ==================================================


class DiagnosticDetail(Base):
    __tablename__ = "diagnostic_details"

    # ------------------------------ Identity --------------------------------
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    # unique=True: one detail row per diagnostics record.
    record_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("records.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )

    # ------------------------------ Inspection fields -----------------------
    inspection_type: Mapped[InspectionType] = mapped_column(
        SAEnum(InspectionType, name="inspectiontype"), nullable=False
    )
    # Free-text findings; stored uppercase by convention.
    findings: Mapped[str | None] = mapped_column(Text, nullable=True)

    # ------------------------------ Costs (pence) ---------------------------
    labour_cost: Mapped[int | None] = mapped_column(Integer, nullable=True)
    parts_cost: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # ------------------------------ Relationships ---------------------------
    record: Mapped["Record"] = relationship(back_populates="diagnostic_detail")


# ==================================================
# DIAGNOSTIC FAULT CODES
# ==================================================


class DiagnosticFaultCode(Base):
    __tablename__ = "diagnostic_fault_codes"

    # ------------------------------ Identity --------------------------------
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    # No unique constraint: one record can have many fault codes.
    record_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("records.id", ondelete="CASCADE"),
        nullable=False,
    )

    # ------------------------------ Fault fields ----------------------------
    # code is nullable: non-coded findings (sounds, visual) have no OBD code.
    code: Mapped[str | None] = mapped_column(String(50), nullable=True)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    severity: Mapped[FaultCodeSeverity] = mapped_column(
        SAEnum(FaultCodeSeverity, name="faultcodeseverity"),
        nullable=False,
        default=FaultCodeSeverity.advisory,
    )

    # ------------------------------ Trigger fields --------------------------
    # When set, a trigger fires email + dashboard attention at that date/mileage.
    trigger_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    trigger_mileage: Mapped[int | None] = mapped_column(Integer, nullable=True)
    resolved_at: Mapped[date | None] = mapped_column(Date, nullable=True)

    # ------------------------------ Display order ---------------------------
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # ------------------------------ Timestamps ------------------------------
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    # ------------------------------ Relationships ---------------------------
    record: Mapped["Record"] = relationship(back_populates="diagnostic_fault_codes")
