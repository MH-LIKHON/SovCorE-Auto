# ============================================================
# backend/app/app/api/v1/reports.py
# ============================================================
#
# Purpose:
#   Fleet-level reporting endpoints for Phase 6. Three GET
#   endpoints aggregate data across every vehicle in the account:
#   costs, fuel, and maintenance.
#
# Design:
#   All endpoints require viewer access — no data is modified.
#   Account-level reporting (rather than per-vehicle) is the
#   defining characteristic of this module; per-vehicle analytics
#   live in the fuel and expenses modules from Phase 4.
#
# Consumed by:
#   - backend/app/app/api/v1/router.py
# ============================================================

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.accounts.models.user import User
from app.core.database import get_db
from app.core.permissions import require_viewer
from app.reports.schemas.report_schemas import (
    CostsReportOut,
    FuelReportOut,
    MaintenanceReportOut,
)
from app.reports.services.report_service import ReportService

# ==================================================
# ROUTER
# ==================================================

router = APIRouter()

# ==================================================
# REPORT ENDPOINTS
# ==================================================

# ------------------------------ Costs report --------------------------------


@router.get(
    "/accounts/{account_id}/reports/costs",
    response_model=CostsReportOut,
    summary="Fleet-wide cost report",
)
async def get_costs_report(
    account_id: uuid.UUID,
    year: int | None = Query(default=None),
    _: User = Depends(require_viewer),
    db: AsyncSession = Depends(get_db),
) -> CostsReportOut:
    return await ReportService(db).get_costs_report(account_id, year=year)


# ------------------------------ Fuel report ---------------------------------


@router.get(
    "/accounts/{account_id}/reports/fuel",
    response_model=FuelReportOut,
    summary="Fleet-wide fuel report",
)
async def get_fuel_report(
    account_id: uuid.UUID,
    year: int | None = Query(default=None),
    _: User = Depends(require_viewer),
    db: AsyncSession = Depends(get_db),
) -> FuelReportOut:
    return await ReportService(db).get_fuel_report(account_id, year=year)


# ------------------------------ Maintenance report --------------------------


@router.get(
    "/accounts/{account_id}/reports/maintenance",
    response_model=MaintenanceReportOut,
    summary="Fleet-wide maintenance report",
)
async def get_maintenance_report(
    account_id: uuid.UUID,
    year: int | None = Query(default=None),
    _: User = Depends(require_viewer),
    db: AsyncSession = Depends(get_db),
) -> MaintenanceReportOut:
    return await ReportService(db).get_maintenance_report(account_id, year=year)
