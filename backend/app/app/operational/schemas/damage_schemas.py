# ============================================================
# backend/app/app/operational/schemas/damage_schemas.py
# ============================================================
#
# Purpose:
#   Pydantic schemas for the damage history module. Covers CRUD
#   schemas for damage entries and the proxy photo upload flow
#   for before and after images.
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
# CREATE
# ==================================================


class DamageCreateIn(BaseModel):
    kind: DamageKind
    status: DamageStatus = DamageStatus.in_progress
    description: str | None = None
    date: _Date
    repair_cost: int | None = None     # pence
    before_key: str | None = None
    after_key: str | None = None


# ==================================================
# PATCH (all optional)
# ==================================================


class DamagePatchIn(BaseModel):
    kind: DamageKind | None = None
    status: DamageStatus | None = None
    description: str | None = None
    date: _Date | None = None
    repair_cost: int | None = None     # pence
    before_key: str | None = None
    after_key: str | None = None


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
    before_key: str | None
    after_key: str | None
    # Signed GET URLs — populated by the API endpoint, not the ORM.
    before_url: str | None = None
    after_url: str | None = None
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

# ------------------------------ Sign In -------------------------------------


class DamagePhotoSignIn(BaseModel):
    # Which image slot to sign. "before" = pre-repair, "after" = post-repair.
    slot: Literal["before", "after"]
    # File extension without a dot. Accepted values: jpg, jpeg, png, webp.
    ext: str


# ------------------------------ Sign Out ------------------------------------


class DamagePhotoSignOut(BaseModel):
    upload_url: str
    key: str
