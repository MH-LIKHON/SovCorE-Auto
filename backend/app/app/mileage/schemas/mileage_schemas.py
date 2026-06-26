# ============================================================
# backend/app/app/mileage/schemas/mileage_schemas.py
# ============================================================
#
# Purpose:
#   Pydantic schemas for the mileage analytics and log-settings
#   API responses and request bodies.
#
# Consumed by:
#   - backend/app/app/mileage/services/mileage_service.py
#   - backend/app/app/api/v1/mileage.py
# ============================================================

from __future__ import annotations

from datetime import date
from typing import Optional

from pydantic import BaseModel

# ==================================================
# ANALYTICS
# ==================================================


class MonthlyMileage(BaseModel):
    """One calendar month in the mileage history."""
    month: str                          # "YYYY-MM"
    odometer: int                       # odometer reading at end of month
    miles_this_month: Optional[int]     # difference vs previous log; None for first log


class MileageAnalyticsOut(BaseModel):
    total_logs: int
    current_mileage: Optional[int]      # latest odometer reading
    annual_mileage: Optional[int]       # miles driven in the selected year
    monthly_avg: Optional[int]          # average miles per month (rolling 12 months)
    last_logged_date: Optional[date]    # date of most recent log
    monthly_history: list[MonthlyMileage]
    oldest_year: int


# ==================================================
# MILEAGE LOG SETTINGS
# ==================================================


class MileageLogSettingsOut(BaseModel):
    reminder_day: int       # 1–28
    active: bool

    model_config = {"from_attributes": True}


class MileageLogSettingsPatchIn(BaseModel):
    reminder_day: Optional[int] = None   # 1–28
    active: Optional[bool] = None
