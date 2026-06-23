# ============================================================
# backend/app/app/reports/schemas/report_schemas.py
# ============================================================
#
# Purpose:
#   Pydantic response schemas for the reports API. Three report
#   types: costs (all-vehicle spending), fuel (fleet fuel), and
#   maintenance (jobs by category).
#
# Design:
#   All monetary values are in pence (integers) to match the
#   convention used throughout the platform. The frontend divides
#   by 100 before formatting with Intl.NumberFormat.
#
# Consumed by:
#   - backend/app/app/reports/services/report_service.py
#   - backend/app/app/api/v1/reports.py
# ============================================================

from __future__ import annotations

from pydantic import BaseModel

# ==================================================
# SHARED
# ==================================================


class MonthlyTotal(BaseModel):
    month: str          # YYYY-MM
    total_pence: int


# ==================================================
# COSTS REPORT
# ==================================================

# ------------------------------ Per-vehicle row ----------------------------


class VehicleCostRow(BaseModel):
    vehicle_id: str
    registration: str
    make: str
    model: str
    year: int | None
    annual_spend_pence: int     # current calendar year
    total_spend_pence: int      # all time


# ------------------------------ Category breakdown -------------------------


class CategoryTotal(BaseModel):
    record_type: str            # RecordType enum value string
    label: str                  # human-readable label
    total_pence: int
    count: int


# ------------------------------ Full costs report --------------------------


class CostsReportOut(BaseModel):
    total_spend_pence: int              # all time, all vehicles
    annual_spend_pence: int             # current year, all vehicles
    by_category: list[CategoryTotal]    # sorted by spend descending
    monthly: list[MonthlyTotal]         # last 12 months, all vehicles
    by_vehicle: list[VehicleCostRow]    # per-vehicle breakdown, sorted by spend descending


# ==================================================
# FUEL REPORT
# ==================================================


class FuelReportOut(BaseModel):
    total_fills: int
    total_litres: float
    total_spend_pence: int
    annual_spend_pence: int             # current calendar year
    avg_mpg: float | None               # fleet average across all valid segments
    monthly: list[MonthlyTotal]         # last 12 months


# ==================================================
# MAINTENANCE REPORT
# ==================================================


class MaintenanceCategoryRow(BaseModel):
    category: str               # MaintenanceCategory enum value string
    label: str                  # human-readable label
    total_pence: int
    count: int


class MaintenanceReportOut(BaseModel):
    total_jobs: int
    total_spend_pence: int
    annual_spend_pence: int
    by_category: list[MaintenanceCategoryRow]   # sorted by count descending
    monthly: list[MonthlyTotal]                 # last 12 months
