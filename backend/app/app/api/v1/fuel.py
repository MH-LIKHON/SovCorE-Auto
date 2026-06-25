# ============================================================
# backend/app/app/api/v1/fuel.py
# ============================================================
#
# Purpose:
#   REST endpoints for the fuel analytics module. A single GET
#   endpoint returns computed analytics over existing fuel records
#   for a vehicle; no write operations are needed (fuel records
#   are created through the standard records endpoint).
#
# Design:
#   Viewer access is sufficient — no cost modification occurs here.
#   The response shape is FuelAnalyticsOut (fills list + aggregates),
#   defined in fuel/schemas/fuel_schemas.py.
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
from app.fuel.schemas.fuel_schemas import FuelAnalyticsOut
from app.fuel.services.fuel_service import FuelService

# ==================================================
# ROUTER
# ==================================================

router = APIRouter()

# ==================================================
# FUEL ENDPOINTS
# ==================================================


@router.get(
    "/accounts/{account_id}/vehicles/{vehicle_id}/fuel/analytics",
    response_model=FuelAnalyticsOut,
    summary="Fuel analytics for a vehicle",
)
async def get_fuel_analytics(
    account_id: uuid.UUID,
    vehicle_id: uuid.UUID,
    year: int | None = Query(default=None),
    _: User = Depends(require_viewer),
    db: AsyncSession = Depends(get_db),
) -> FuelAnalyticsOut:
    return await FuelService(db).get_analytics(vehicle_id, account_id, year=year)
