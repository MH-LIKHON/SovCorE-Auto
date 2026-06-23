# ============================================================
# backend/app/app/reports/services/report_service.py
# ============================================================
#
# Purpose:
#   Aggregation logic for the three fleet reports: costs, fuel,
#   and maintenance. Each method fetches raw rows from the
#   repository and aggregates entirely in Python.
#
# Design:
#   Python aggregation over SQL GROUP BY is the consistent choice
#   on this platform (see fuel_service.py and expense_service.py
#   for the same pattern). Record counts per account are in the
#   low thousands at most, so memory cost is negligible.
#
#   MPG is computed only from consecutive full-tank fills per
#   vehicle (same algorithm as FuelService._compute_efficiency).
#   Fleet-wide MPG is the mean of per-vehicle MPG values, not the
#   mean across all fill segments — this avoids bias from vehicles
#   with more fill records.
#
#   Monthly breakdown uses the last 12 calendar months, current
#   month inclusive, ascending. Months with no spend show 0 so
#   the frontend bar chart always has a 12-column grid.
#
# Consumed by:
#   - backend/app/app/api/v1/reports.py
# ============================================================

from __future__ import annotations

import uuid
from collections import defaultdict
from datetime import date
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.reports.repositories.report_repository import ReportRepository
from app.reports.schemas.report_schemas import (
    CategoryTotal,
    CostsReportOut,
    FuelReportOut,
    MaintenanceCategoryRow,
    MaintenanceReportOut,
    MonthlyTotal,
    VehicleCostRow,
)

# ==================================================
# CONSTANTS
# ==================================================

# ------------------------------ Human-readable labels ----------------------

_COST_LABELS: dict[str, str] = {
    "maintenance":  "Maintenance",
    "repair":       "Repairs",
    "mot":          "MOT",
    "tax":          "Road tax",
    "insurance":    "Insurance",
    "parking":      "Parking",
    "cleaning":     "Cleaning",
    "accessories":  "Accessories",
    "warranty":     "Warranty",
    "diagnostics":  "Diagnostics",
    "damage":       "Damage",
    "pcn":          "Penalty notices",
    "custom":       "Other",
}

_MAINT_LABELS: dict[str, str] = {
    "engine":           "Engine",
    "transmission":     "Transmission",
    "brakes":           "Brakes",
    "suspension":       "Suspension",
    "steering":         "Steering",
    "wheels":           "Wheels and tyres",
    "cooling":          "Cooling",
    "electrical":       "Electrical",
    "hvac":             "HVAC",
    "exhaust":          "Exhaust",
    "miscellaneous":    "Miscellaneous",
}

# ------------------------------ Unit conversion ----------------------------
_LITRES_PER_GALLON = Decimal("4.54609")

# ==================================================
# SERVICE
# ==================================================


class ReportService:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db
        self._repo = ReportRepository(db)

    # ==================================================
    # COSTS REPORT
    # ==================================================

    async def get_costs_report(self, account_id: uuid.UUID) -> CostsReportOut:
        rows = await self._repo.fetch_cost_rows(account_id)

        current_year = date.today().year
        total_spend = 0
        annual_spend = 0

        # ~~~~~~~~~ Per-category aggregation ~~~~~~~~~
        cat_spend: dict[str, int] = defaultdict(int)
        cat_count: dict[str, int] = defaultdict(int)

        # ~~~~~~~~~ Per-vehicle aggregation ~~~~~~~~~
        veh_total: dict[str, int] = defaultdict(int)
        veh_annual: dict[str, int] = defaultdict(int)
        veh_meta: dict[str, dict] = {}

        # ~~~~~~~~~ Monthly breakdown setup ~~~~~~~~~
        months = _last_12_months()
        monthly_bucket: dict[str, int] = {m: 0 for m in months}

        for row in rows:
            cost: int = row["cost"] or 0
            rec_type: str = (
                row["type"].value
                if hasattr(row["type"], "value")
                else str(row["type"])
            )
            row_date: date = row["date"]
            vid = str(row["vehicle_id"])

            total_spend += cost
            cat_spend[rec_type] += cost
            cat_count[rec_type] += 1

            if row_date.year == current_year:
                annual_spend += cost
                veh_annual[vid] += cost

            veh_total[vid] += cost

            label = _month_label(row_date)
            if label in monthly_bucket:
                monthly_bucket[label] += cost

            # Capture vehicle metadata from the first row seen.
            if vid not in veh_meta:
                veh_meta[vid] = {
                    "registration": row["registration"],
                    "make": row["make"],
                    "model": row["model"],
                    "year": row["year"],
                }

        # ~~~~~~~~~ Build output structures ~~~~~~~~~
        by_category = [
            CategoryTotal(
                record_type=rt,
                label=_COST_LABELS.get(rt, rt.capitalize()),
                total_pence=cat_spend[rt],
                count=cat_count[rt],
            )
            for rt in sorted(cat_spend, key=lambda k: cat_spend[k], reverse=True)
        ]

        by_vehicle = [
            VehicleCostRow(
                vehicle_id=vid,
                registration=veh_meta[vid]["registration"],
                make=veh_meta[vid]["make"],
                model=veh_meta[vid]["model"],
                year=veh_meta[vid]["year"],
                annual_spend_pence=veh_annual.get(vid, 0),
                total_spend_pence=veh_total[vid],
            )
            for vid in sorted(veh_total, key=lambda k: veh_total[k], reverse=True)
        ]

        monthly = [
            MonthlyTotal(month=m, total_pence=monthly_bucket[m]) for m in months
        ]

        return CostsReportOut(
            total_spend_pence=total_spend,
            annual_spend_pence=annual_spend,
            by_category=by_category,
            monthly=monthly,
            by_vehicle=by_vehicle,
        )

    # ==================================================
    # FUEL REPORT
    # ==================================================

    async def get_fuel_report(self, account_id: uuid.UUID) -> FuelReportOut:
        rows = await self._repo.fetch_fuel_rows(account_id)

        current_year = date.today().year
        total_fills = len(rows)
        total_litres = Decimal("0")
        total_spend = 0
        annual_spend = 0

        months = _last_12_months()
        monthly_bucket: dict[str, int] = {m: 0 for m in months}

        # Group fills by vehicle for per-vehicle MPG calculation.
        by_vehicle: dict[str, list[dict]] = defaultdict(list)

        for row in rows:
            cost: int = row["cost"] or 0
            row_date: date = row["date"]
            litres = Decimal(str(row["litres"])) if row["litres"] is not None else Decimal("0")
            vid = str(row["vehicle_id"])

            total_litres += litres
            total_spend += cost

            if row_date.year == current_year:
                annual_spend += cost

            label = _month_label(row_date)
            if label in monthly_bucket:
                monthly_bucket[label] += cost

            by_vehicle[vid].append(row)

        # ~~~~~~~~~ Fleet MPG: mean of per-vehicle averages ~~~~~~~~~
        vehicle_mpgs: list[float] = []
        for vehicle_fills in by_vehicle.values():
            mpg = _vehicle_mpg(vehicle_fills)
            if mpg is not None:
                vehicle_mpgs.append(mpg)

        avg_mpg = (
            round(sum(vehicle_mpgs) / len(vehicle_mpgs), 1)
            if vehicle_mpgs
            else None
        )

        monthly = [
            MonthlyTotal(month=m, total_pence=monthly_bucket[m]) for m in months
        ]

        return FuelReportOut(
            total_fills=total_fills,
            total_litres=round(float(total_litres), 1),
            total_spend_pence=total_spend,
            annual_spend_pence=annual_spend,
            avg_mpg=avg_mpg,
            monthly=monthly,
        )

    # ==================================================
    # MAINTENANCE REPORT
    # ==================================================

    async def get_maintenance_report(
        self, account_id: uuid.UUID
    ) -> MaintenanceReportOut:
        rows = await self._repo.fetch_maintenance_rows(account_id)

        current_year = date.today().year
        total_jobs = len(rows)
        total_spend = 0
        annual_spend = 0

        cat_spend: dict[str, int] = defaultdict(int)
        cat_count: dict[str, int] = defaultdict(int)

        months = _last_12_months()
        monthly_bucket: dict[str, int] = {m: 0 for m in months}

        for row in rows:
            cost: int = row["cost"] or 0
            row_date: date = row["date"]
            category: str = (
                row["category"].value
                if hasattr(row["category"], "value")
                else str(row["category"])
            )

            total_spend += cost
            cat_spend[category] += cost
            cat_count[category] += 1

            if row_date.year == current_year:
                annual_spend += cost

            label = _month_label(row_date)
            if label in monthly_bucket:
                monthly_bucket[label] += cost

        by_category = [
            MaintenanceCategoryRow(
                category=cat,
                label=_MAINT_LABELS.get(cat, cat.capitalize()),
                total_pence=cat_spend[cat],
                count=cat_count[cat],
            )
            for cat in sorted(cat_count, key=lambda k: cat_count[k], reverse=True)
        ]

        monthly = [
            MonthlyTotal(month=m, total_pence=monthly_bucket[m]) for m in months
        ]

        return MaintenanceReportOut(
            total_jobs=total_jobs,
            total_spend_pence=total_spend,
            annual_spend_pence=annual_spend,
            by_category=by_category,
            monthly=monthly,
        )


# ==================================================
# MODULE-LEVEL HELPERS
# ==================================================

# ------------------------------ 12-month window ----------------------------


def _last_12_months() -> list[str]:
    """
    Return 12 YYYY-MM labels, oldest first, ending with the current month.
    """
    today = date.today()
    months: list[str] = []
    for offset in range(11, -1, -1):
        y = today.year
        m = today.month - offset
        while m <= 0:
            m += 12
            y -= 1
        months.append(f"{y:04d}-{m:02d}")
    return months


def _month_label(d: date) -> str:
    return f"{d.year:04d}-{d.month:02d}"


# ------------------------------ Per-vehicle MPG ----------------------------


def _vehicle_mpg(fills: list[dict]) -> float | None:
    """
    Compute mean MPG for one vehicle's fill list (ordered date asc).
    Returns None when fewer than two consecutive full-tank fills with
    mileage are available.
    """
    segments: list[float] = []
    prev: dict | None = None

    for fill in fills:
        if not fill.get("full_tank"):
            # Partial fill breaks the consecutive-full-tank chain.
            prev = None
            continue
        if fill.get("mileage") is None:
            continue
        if prev is not None and prev.get("mileage") is not None:
            miles = fill["mileage"] - prev["mileage"]
            litres = Decimal(str(fill["litres"])) if fill["litres"] is not None else None
            if miles > 0 and litres and litres > 0:
                gallons = float(litres / _LITRES_PER_GALLON)
                segments.append(miles / gallons)
        prev = fill

    if not segments:
        return None
    return sum(segments) / len(segments)
