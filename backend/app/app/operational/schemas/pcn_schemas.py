# ============================================================
# backend/app/app/operational/schemas/pcn_schemas.py
# ============================================================
#
# Purpose:
#   Pydantic schemas for the PCN (penalty charge notice) module.
#   Covers create, patch, and response shapes.
#
# Consumed by:
#   - backend/app/app/operational/schemas/__init__.py
#   - backend/app/app/api/v1/operational.py
# ============================================================

import uuid
from datetime import date as _Date, datetime

from pydantic import BaseModel

from app.operational.models.pcn import PCNStatus

# ==================================================
# CREATE
# ==================================================


class PCNCreateIn(BaseModel):
    reference: str | None = None
    authority: str | None = None
    date: _Date
    amount: int                         # pence
    status: PCNStatus = PCNStatus.open
    notes: str | None = None


# ==================================================
# PATCH (all optional)
# ==================================================


class PCNPatchIn(BaseModel):
    reference: str | None = None
    authority: str | None = None
    date: _Date | None = None
    amount: int | None = None           # pence
    status: PCNStatus | None = None
    notes: str | None = None


# ==================================================
# RESPONSE
# ==================================================


class PCNOut(BaseModel):
    id: uuid.UUID
    account_id: uuid.UUID
    vehicle_id: uuid.UUID
    reference: str | None
    authority: str | None
    date: _Date
    amount: int
    status: PCNStatus
    notes: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ==================================================
# PAGE ENVELOPE
# ==================================================


class PCNPage(BaseModel):
    items: list[PCNOut]
    total: int
    page: int
    page_size: int
