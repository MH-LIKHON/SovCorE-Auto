# ============================================================
# backend/app/app/operational/schemas/damage_schemas.py
# ============================================================
#
# Purpose:
#   Pydantic schemas for the damage history module. Covers CRUD
#   schemas for damage entries and the proxy photo upload flow.
#
#   Photos are stored in the separate damage_photos table and are
#   returned as before_photos / after_photos lists on DamageOut.
#   Each list item is a DamagePhotoOut with a signed GET URL.
#
# Consumed by:
#   - backend/app/app/operational/schemas/__init__.py
#   - backend/app/app/api/v1/operational.py
# ============================================================

import uuid
from datetime import date as _Date, datetime
from typing import Literal

from pydantic import BaseModel

from app.operational.models.damage import DamageKind, DamageStatus

# ==================================================
# DAMAGE PHOTO
# ==================================================


class DamagePhotoOut(BaseModel):
    id: uuid.UUID
    r2_key: str
    url: str | None = None
    display_order: int

    model_config = {"from_attributes": True}


# ==================================================
# CREATE
# ==================================================


class DamageCreateIn(BaseModel):
    kind: DamageKind
    status: DamageStatus = DamageStatus.in_progress
    description: str | None = None
    date: _Date
    repair_cost: int | None = None  # pence


# ==================================================
# PATCH (all optional)
# ==================================================


class DamagePatchIn(BaseModel):
    kind: DamageKind | None = None
    status: DamageStatus | None = None
    description: str | None = None
    date: _Date | None = None
    repair_cost: int | None = None  # pence


# ==================================================
# RESPONSE
# ==================================================


class DamageOut(BaseModel):
    id: uuid.UUID
    account_id: uuid.UUID
    vehicle_id: uuid.UUID
    kind: DamageKind
    status: DamageStatus
    description: str | None
    date: _Date
    repair_cost: int | None
    # Populated by the API endpoint after loading from damage_photos table.
    before_photos: list[DamagePhotoOut] = []
    after_photos: list[DamagePhotoOut] = []
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ==================================================
# PAGE ENVELOPE
# ==================================================


class DamagePage(BaseModel):
    items: list[DamageOut]
    total: int
    page: int
    page_size: int


# ==================================================
# PHOTO SIGN (legacy presigned flow — kept for reference)
# ==================================================


class DamagePhotoSignIn(BaseModel):
    slot: Literal["before", "after"]
    ext: str


class DamagePhotoSignOut(BaseModel):
    upload_url: str
    key: str
