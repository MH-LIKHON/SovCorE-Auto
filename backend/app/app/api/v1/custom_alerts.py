# ============================================================
# backend/app/app/api/v1/custom_alerts.py
# ============================================================
#
# Purpose:
#   HTTP endpoints for the custom_alerts resource. Provides
#   CRUD for user-defined flexible alerts attached to vehicles.
#
# Design:
#   Follows the same pattern as tasks.py: list/create are
#   scoped to account + vehicle; patch/delete use a top-level
#   alert_id with account_id derived from the authenticated user.
#
# Consumed by:
#   - backend/app/app/api/v1/router.py
# ============================================================

import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.tasks.schemas.custom_alert_schemas import (
    CustomAlertCreateIn,
    CustomAlertOut,
    CustomAlertPage,
    CustomAlertPatchIn,
)
from app.tasks.services.custom_alert_service import CustomAlertService

# ==================================================
# ROUTER
# ==================================================

router = APIRouter()

# ==================================================
# LIST / CREATE
# ==================================================


@router.get(
    "/accounts/{account_id}/vehicles/{vehicle_id}/alerts",
    response_model=CustomAlertPage,
)
async def list_alerts(
    account_id: uuid.UUID,
    vehicle_id: uuid.UUID,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    _user: object = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CustomAlertPage:
    return await CustomAlertService(db).list_alerts(
        vehicle_id, account_id, page=page, page_size=page_size
    )


@router.post(
    "/accounts/{account_id}/vehicles/{vehicle_id}/alerts",
    response_model=CustomAlertOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_alert(
    account_id: uuid.UUID,
    vehicle_id: uuid.UUID,
    body: CustomAlertCreateIn,
    _user: object = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CustomAlertOut:
    return await CustomAlertService(db).create_alert(vehicle_id, account_id, body)


# ==================================================
# PATCH / DELETE
# ==================================================


@router.patch("/alerts/{alert_id}", response_model=CustomAlertOut)
async def patch_alert(
    alert_id: uuid.UUID,
    body: CustomAlertPatchIn,
    current_user: object = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CustomAlertOut:
    account_id = getattr(current_user, "account_id", None)
    return await CustomAlertService(db).patch_alert(alert_id, account_id, body)


@router.delete("/alerts/{alert_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_alert(
    alert_id: uuid.UUID,
    current_user: object = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    account_id = getattr(current_user, "account_id", None)
    await CustomAlertService(db).delete_alert(alert_id, account_id)
