# ============================================================
# backend/app/app/operational/schemas/warranty_schemas.py
# ============================================================
#
# Purpose:
#   Pydantic schemas for the warranty module.
#
# Consumed by:
#   - backend/app/app/operational/schemas/__init__.py
#   - backend/app/app/api/v1/operational.py
# ============================================================

from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel

# ==================================================
# CREATE
# ==================================================


class WarrantyCreateIn(BaseModel):
    component: str
    supplier: str | None = None
    expiry_date: date | None = None
    labour_cost: int | None = None     # pence
    parts_cost: int | None = None      # pence
    notes: str | None = None
    invoice_key: str | None = None


# ==================================================
# PATCH (all optional)
# ==================================================


class WarrantyPatchIn(BaseModel):
    component: str | None = None
    supplier: str | None = None
    expiry_date: date | None = None
    labour_cost: int | None = None     # pence
    parts_cost: int | None = None      # pence
    notes: str | None = None
    invoice_key: str | None = None


# ==================================================
# RESPONSE
# ==================================================


class WarrantyOut(BaseModel):
    id: str
    account_id: str
    vehicle_id: str
    component: str
    supplier: str | None
    expiry_date: date | None
    labour_cost: int | None
    parts_cost: int | None
    notes: str | None
    invoice_key: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ==================================================
# PAGE ENVELOPE
# ==================================================


class WarrantyPage(BaseModel):
    items: list[WarrantyOut]
    total: int
    page: int
    page_size: int
