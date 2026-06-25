# ============================================================
# backend/app/app/tasks/schemas/custom_alert_schemas.py
# ============================================================
#
# Purpose:
#   Pydantic schemas for the custom_alerts resource: create,
#   patch, and response shapes.
#
# Design:
#   conditions is typed as list[dict] on the wire. The service
#   layer validates that each element has a "type" key with a
#   known value. Storing raw dicts keeps the schema open to
#   new condition types without a migration.
#
#   email_days_before defaults to [30, 14, 7, 1] — slightly
#   tighter than the reminder default (90,60,30,14,7,1) because
#   custom alerts tend to be shorter-cycle items.
#
#   miles_warning defaults to 500 miles before the threshold.
#
# Consumed by:
#   - backend/app/app/tasks/services/custom_alert_service.py
#   - backend/app/app/api/v1/custom_alerts.py
# ============================================================

import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field

# ==================================================
# KNOWN CONDITION TYPES
# ==================================================

VALID_CONDITION_TYPES = {"date", "recurring", "mileage", "mileage_recurring"}

# ==================================================
# CREATE
# ==================================================


class CustomAlertCreateIn(BaseModel):
    name: str
    conditions: list[dict] = Field(default_factory=list)
    condition_mode: str = "any"
    email_days_before: list[int] = Field(default_factory=lambda: [30, 14, 7, 1])
    miles_warning: int = 500
    notes: Optional[str] = None


# ==================================================
# PATCH
# ==================================================


class CustomAlertPatchIn(BaseModel):
    name: Optional[str] = None
    conditions: Optional[list[dict]] = None
    condition_mode: Optional[str] = None
    email_days_before: Optional[list[int]] = None
    miles_warning: Optional[int] = None
    active: Optional[bool] = None
    notes: Optional[str] = None


# ==================================================
# RESPONSE
# ==================================================


class CustomAlertOut(BaseModel):
    id: uuid.UUID
    account_id: uuid.UUID
    vehicle_id: uuid.UUID
    name: str
    conditions: list[dict]
    condition_mode: str
    email_days_before: list[int]
    miles_warning: int
    active: bool
    last_notified_at: Optional[datetime]
    notes: Optional[str]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ==================================================
# PAGE ENVELOPE
# ==================================================


class CustomAlertPage(BaseModel):
    items: list[CustomAlertOut]
    total: int
    page: int
    page_size: int
