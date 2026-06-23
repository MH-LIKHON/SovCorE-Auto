# ============================================================
# backend/app/app/fuel/schemas/fuel_schemas.py
# ============================================================
#
# Purpose:
#   Pydantic response schemas for fuel analytics. All monetary
#   values are in pence; the frontend converts to pounds.
#
# Design:
#   FuelFillOut is a flat projection of a records + fuel_details
#   join — one row per fill. FuelAnalyticsOut wraps the computed
#   aggregates plus the fill list and monthly breakdown.
#
#   avg_mpg and cost_per_mile_pence are None when fewer than two
#   sequential full-tank fills exist (MPG cannot be calculated
#   from a single fill because there is no prior mileage delta).
#
# Consumed by:
#   - backend/app/app/fuel/services/fuel_service.py
#   - backend/app/app/api/v1/fuel.py
# ============================================================

from __future__ import annotations

from datetime import date
from decimal import Decimal

from pydantic import BaseModel

# ==================================================
# FILL ROW
# ==================================================


class FuelFillOut(BaseModel):
    # ------------------------------ Record identity -------------------------
    record_id: str
    date: date
    mileage: int | None

    # ------------------------------ Fuel fields -----------------------------
    litres: Decimal
    price_per_litre_pence: int
    station: str | None
    full_tank: bool
    cost_pence: int | None

    model_config = {"from_attributes": True}


# ==================================================
# ANALYTICS SUMMARY
# ==================================================


class MonthlySpend(BaseModel):
    # YYYY-MM label for charting on the frontend.
    month: str
    total_pence: int


class FuelAnalyticsOut(BaseModel):
    # ------------------------------ Counts ----------------------------------
    total_fills: int
    full_tank_fills: int

    # ------------------------------ Volume and spend ------------------------
    total_litres: Decimal
    total_spend_pence: int
    annual_spend_pence: int   # current calendar year
    monthly_spend: list[MonthlySpend]   # last 12 months, ascending

    # ------------------------------ Efficiency ------------------------------
    # None when fewer than two consecutive full-tank fills are present.
    avg_mpg: float | None
    cost_per_mile_pence: float | None   # pence per mile, None if no mileage data

    # ------------------------------ Fill log --------------------------------
    fills: list[FuelFillOut]
