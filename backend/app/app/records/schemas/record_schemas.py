# ============================================================
# backend/app/app/records/schemas/record_schemas.py
# ============================================================
#
# Purpose:
#   Pydantic input and output schemas for the records domain.
#   Input schemas validate API payloads; output schemas define
#   the wire format returned to the frontend.
#
# Design:
#   Money fields (cost, labour_cost, parts_cost, price_per_litre)
#   are always integers (pence) on the wire. The frontend converts
#   to pounds for display. Fuel volume (litres) is a Decimal.
#
#   RecordCreateIn includes optional maintenance and fuel detail
#   blocks. The service creates detail rows only when the relevant
#   block is present and the type matches.
#
#   RecordListOut is a lighter projection for the list view;
#   RecordOut is the full detail including attachments, tags and
#   type-specific detail.
#
#   The page envelope (RecordPage) matches the convention from
#   BLUEPRINT/04-routes-and-api.md: items, total, page, page_size.
#
# Consumed by:
#   - backend/app/app/records/services/record_service.py
#   - backend/app/app/api/v1/records.py
# ============================================================

import uuid
from datetime import date as _Date, datetime
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.records.models.record import MaintenanceCategory, RecordType

# ==================================================
# ATTACHMENT SCHEMAS
# ==================================================

# ------------------------------ Create In -----------------------------------


class AttachmentCreateIn(BaseModel):
    kind: str
    r2_key: str
    filename: str
    content_type: str
    size_bytes: int


# ------------------------------ Output --------------------------------------


class AttachmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    record_id: uuid.UUID
    kind: str
    r2_key: str
    filename: str
    content_type: str
    size_bytes: int
    created_at: datetime


# ------------------------------ Sign In -------------------------------------
# Request body for the presigned upload endpoint. The vehicle_id is used
# to build the R2 key path; the record and vehicle ownership are verified
# server-side before the URL is issued.


class AttachmentSignIn(BaseModel):
    kind: str
    # Original filename, used to derive the extension.
    filename: str
    content_type: str
    # File size in bytes — stored on the attachment row after confirm.
    size_bytes: int = Field(gt=0)


# ------------------------------ Sign Out ------------------------------------


class AttachmentSignOut(BaseModel):
    upload_url: str
    # R2 key to pass back to POST /attachments after the browser PUT completes.
    key: str


# ==================================================
# MAINTENANCE DETAIL SCHEMAS
# ==================================================

# ------------------------------ Input ---------------------------------------


class MaintenanceDetailIn(BaseModel):
    category: MaintenanceCategory
    item: str | None = None
    part_number: str | None = None
    labour_cost: int | None = None  # pence
    parts_cost: int | None = None   # pence


# ------------------------------ Output --------------------------------------


class MaintenanceDetailOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    record_id: uuid.UUID
    category: MaintenanceCategory
    item: str | None
    part_number: str | None
    labour_cost: int | None
    parts_cost: int | None


# ==================================================
# FUEL DETAIL SCHEMAS
# ==================================================

# ------------------------------ Input ---------------------------------------


class FuelDetailIn(BaseModel):
    litres: Decimal
    price_per_litre: int  # pence per litre
    station: str | None = None
    full_tank: bool = True


# ------------------------------ Output --------------------------------------


class FuelDetailOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    record_id: uuid.UUID
    litres: Decimal
    price_per_litre: int
    station: str | None
    full_tank: bool


# ==================================================
# RECORD SCHEMAS
# ==================================================

# ------------------------------ Create input --------------------------------


class RecordCreateIn(BaseModel):
    type: RecordType
    date: _Date
    mileage: int | None = None
    cost: int | None = None  # pence
    currency: str = "GBP"
    supplier: str | None = None
    garage: str | None = None
    notes: str | None = None
    reminder_date: _Date | None = None
    warranty_expiry: _Date | None = None
    next_due_mileage: int | None = None
    next_due_date: _Date | None = None
    # Type-specific detail blocks — service ignores if type does not match
    maintenance: MaintenanceDetailIn | None = None
    fuel: FuelDetailIn | None = None
    # User-defined key/value pairs; only stored for custom type records.
    custom_fields: list[dict[str, str]] | None = None
    # Attachments known at creation time (pre-uploaded to R2)
    attachments: list[AttachmentCreateIn] = []
    tags: list[str] = []


# ------------------------------ Patch input ---------------------------------


class RecordPatchIn(BaseModel):
    date: _Date | None = None
    mileage: int | None = None
    cost: int | None = None
    currency: str | None = None
    supplier: str | None = None
    garage: str | None = None
    notes: str | None = None
    reminder_date: _Date | None = None
    warranty_expiry: _Date | None = None
    next_due_mileage: int | None = None
    next_due_date: _Date | None = None
    # Allow updating the type-specific detail in the same PATCH call
    maintenance: MaintenanceDetailIn | None = None
    fuel: FuelDetailIn | None = None
    custom_fields: list[dict[str, str]] | None = None


# ------------------------------ List output (lightweight) -------------------


class RecordListOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    vehicle_id: uuid.UUID
    type: RecordType
    date: _Date
    mileage: int | None
    cost: int | None
    currency: str
    supplier: str | None
    garage: str | None
    notes: str | None
    created_at: datetime
    # Populated by the repository via a batch count query; defaults to 0
    # so the field is safe even when the ORM object has no attribute set.
    attachment_count: int = 0


# ------------------------------ Full detail output --------------------------


class RecordOut(BaseModel):
    # from_attributes=True: Pydantic reads fields directly from ORM attributes.
    # populate_by_name=True: allow both the field name and alias to populate a field.
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: uuid.UUID
    account_id: uuid.UUID
    vehicle_id: uuid.UUID
    type: RecordType
    date: _Date
    mileage: int | None
    cost: int | None
    currency: str
    supplier: str | None
    garage: str | None
    notes: str | None
    reminder_date: _Date | None
    warranty_expiry: _Date | None
    next_due_mileage: int | None
    next_due_date: _Date | None
    created_by: uuid.UUID | None
    updated_by: uuid.UUID | None
    created_at: datetime
    updated_at: datetime
    attachments: list[AttachmentOut]
    # ORM relationship is `tags` (list[RecordTag]); validator flattens to strings.
    tags: list[str]
    custom_fields: list[dict[str, str]] | None
    # ORM relationships are `maintenance_detail` and `fuel_detail`; aliases map them.
    maintenance: MaintenanceDetailOut | None = Field(None, alias="maintenance_detail")
    fuel: FuelDetailOut | None = Field(None, alias="fuel_detail")

    @field_validator("tags", mode="before")
    @classmethod
    def _flatten_tags(cls, v: Any) -> list[str]:
        # ORM gives list[RecordTag]; direct assignment gives list[str].
        return [item.tag if hasattr(item, "tag") else str(item) for item in (v or [])]


# ------------------------------ Page envelope -------------------------------


class RecordPage(BaseModel):
    items: list[RecordListOut]
    total: int
    page: int
    page_size: int
