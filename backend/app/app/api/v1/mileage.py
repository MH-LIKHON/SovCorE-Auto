# ============================================================
# backend/app/app/api/v1/mileage.py
# ============================================================
#
# Purpose:
#   REST endpoints for the mileage module:
#     GET  /accounts/{id}/vehicles/{vid}/mileage/analytics
#     GET  /accounts/{id}/mileage-settings
#     PATCH /accounts/{id}/mileage-settings
#
# Design:
#   Analytics is read-only (viewer access). Settings require
#   editor access because they change email behaviour.
#
#   Mileage log records themselves are created via the standard
#   records endpoint (type=odometer). This module only serves
#   the aggregated analytics view and the prompt-email settings.
#
# Consumed by:
#   - backend/app/app/api/v1/router.py
# ============================================================

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.accounts.models.user import User
from app.core.database import get_db
from app.core.permissions import require_editor, require_viewer
from app.mileage.schemas.mileage_schemas import (
    MileageAnalyticsOut,
    MileageLogSettingsOut,
    MileageLogSettingsPatchIn,
)
from app.mileage.services.mileage_service import MileageService

# ==================================================
# ROUTER
# ==================================================

router = APIRouter()

# ==================================================
# MILEAGE ENDPOINTS
# ==================================================


@router.get(
    "/accounts/{account_id}/vehicles/{vehicle_id}/mileage/analytics",
    response_model=MileageAnalyticsOut,
    summary="Mileage analytics for a vehicle",
)
async def get_mileage_analytics(
    account_id: uuid.UUID,
    vehicle_id: uuid.UUID,
    year: int | None = None,
    _: User = Depends(require_viewer),
    db: AsyncSession = Depends(get_db),
) -> MileageAnalyticsOut:
    return await MileageService(db).get_analytics(vehicle_id, account_id, year=year)


@router.get(
    "/accounts/{account_id}/mileage-settings",
    response_model=MileageLogSettingsOut,
    summary="Get mileage log reminder settings for an account",
)
async def get_mileage_settings(
    account_id: uuid.UUID,
    _: User = Depends(require_viewer),
    db: AsyncSession = Depends(get_db),
) -> MileageLogSettingsOut:
    return await MileageService(db).get_settings(account_id)


@router.patch(
    "/accounts/{account_id}/mileage-settings",
    response_model=MileageLogSettingsOut,
    summary="Update mileage log reminder settings for an account",
)
async def patch_mileage_settings(
    account_id: uuid.UUID,
    body: MileageLogSettingsPatchIn,
    _: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
) -> MileageLogSettingsOut:
    svc = MileageService(db)
    result = await svc.patch_settings(account_id, body)
    await db.commit()
    return result
