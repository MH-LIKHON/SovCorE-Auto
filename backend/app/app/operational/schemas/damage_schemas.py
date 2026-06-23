# ============================================================
# backend/app/app/operational/schemas/damage_schemas.py
# ============================================================
#
# Purpose:
#   Pydantic schemas for the damage history module.
#
# Consumed by:
#   - backend/app/app/operational/schemas/__init__.py
#   - backend/app/app/api/v1/operational.py
# ============================================================

from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel

from app.operational.models.damage import DamageKind

# ==================================================
# CREATE
# ==================================================


class DamageCreateIn(BaseModel):
    kind: DamageKind
    description: str | None = None
    date: date
    repair_cost: int | None = None     # pence
    before_key: str | None = None
    after_key: str | None = None


# ==================================================
# PATCH (all optional)
# ==================================================


class DamagePatchIn(BaseModel):
    kind: DamageKind | None = None
    description: str | None = None
    date: date | None = None
    repair_cost: int | None = None     # pence
    before_key: str | None = None
    after_key: str | None = None


# ==================================================
# RESPONSE
# ==================================================


class DamageOut(BaseModel):
    id: str
    account_id: str
    vehicle_id: str
    kind: DamageKind
    description: str | None
    date: date
    repair_cost: int | None
    before_key: str | None
    after_key: str | None
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
