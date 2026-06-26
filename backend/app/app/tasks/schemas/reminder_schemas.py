# ============================================================
# backend/app/app/tasks/schemas/reminder_schemas.py
# ============================================================
#
# Purpose:
#   Pydantic schemas for the reminders resource: create, patch,
#   and response shapes. The intervals field is a list of integers
#   (days before due_date at which notifications fire).
#
# Consumed by:
#   - backend/app/app/tasks/services/reminder_service.py
#   - backend/app/app/api/v1/tasks.py
# ============================================================

import uuid
from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, Field

# ==================================================
# DEFAULT INTERVALS
# ==================================================

# Standard notification schedule: 90, 60, 30, 14, 7 and 1 day before due.
_DEFAULT_INTERVALS: list[int] = [90, 60, 30, 14, 7, 1]

# ==================================================
# CREATE
# ==================================================


class ReminderCreateIn(BaseModel):
    type: str                            # ReminderType enum value
    due_date: date
    intervals: list[int] = Field(default_factory=lambda: list(_DEFAULT_INTERVALS))
    # Optional mileage-based trigger. Set for dual-trigger types (service,
    # tyres, brake_fluid, battery, finance, custom). Not used for mot, tax,
    # insurance, warranty, breakdown_cover.
    due_mileage: Optional[int] = None
    miles_warning: int = 500
    notes: Optional[str] = None


# ==================================================
# PATCH
# ==================================================


class ReminderPatchIn(BaseModel):
    due_date: Optional[date] = None
    intervals: Optional[list[int]] = None
    due_mileage: Optional[int] = None
    miles_warning: Optional[int] = None
    active: Optional[bool] = None
    notes: Optional[str] = None


# ==================================================
# RESPONSE
# ==================================================


class ReminderOut(BaseModel):
    id: uuid.UUID
    account_id: uuid.UUID
    vehicle_id: uuid.UUID
    type: str
    due_date: date
    intervals: list[int]
    last_sent_interval: Optional[int]
    due_mileage: Optional[int]
    miles_warning: int
    active: bool
    notes: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}


# ==================================================
# PAGE ENVELOPE
# ==================================================


class ReminderPage(BaseModel):
    items: list[ReminderOut]
    total: int
    page: int
    page_size: int
