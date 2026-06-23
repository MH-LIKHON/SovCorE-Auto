# ============================================================
# backend/app/app/health/schemas/health_schemas.py
# ============================================================
#
# Purpose:
#   Pydantic response schemas for the vehicle health score
#   endpoint. The score is 0–100 (or null when no data) and
#   each input is broken out individually so the frontend can
#   render a detailed breakdown panel.
#
# Design:
#   HealthInputDetail uses Optional fields so null inputs are
#   represented as null in JSON rather than omitted. This lets
#   the frontend distinguish "score exists but is zero" from
#   "this input was not recorded".
#
# Consumed by:
#   - backend/app/app/health/services/health_service.py
#   - backend/app/app/api/v1/vehicle_health.py
# ============================================================

from typing import Optional

from pydantic import BaseModel

# ==================================================
# HEALTH INPUT DETAIL
# ==================================================


class HealthInputDetail(BaseModel):
    # ------------------------------ Per-input breakdown ---------------------
    score: float                         # 0.0, 0.5, or 1.0
    rag: str                             # "green", "amber", or "red"
    days_remaining: Optional[int] = None  # set for date-based inputs
    miles_remaining: Optional[int] = None  # set for the mileage-based input


# ==================================================
# HEALTH SCORE OUT
# ==================================================


class HealthScoreOut(BaseModel):
    # ------------------------------ Aggregate result ------------------------
    score: Optional[int]  # 0–100, or null when all inputs are null
    rag: Optional[str]    # "green", "amber", "red", or null

    # ------------------------------ Per-input breakdown ---------------------
    # Each key is null when that input has not been recorded for the vehicle.
    mot: Optional[HealthInputDetail] = None
    insurance: Optional[HealthInputDetail] = None
    service_date: Optional[HealthInputDetail] = None
    tax: Optional[HealthInputDetail] = None
    service_mileage: Optional[HealthInputDetail] = None
