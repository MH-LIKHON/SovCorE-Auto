# ============================================================
# backend/app/app/api/v1/vehicles.py
# ============================================================
#
# Purpose:
#   REST endpoints for the vehicles domain. All routes are
#   scoped to a specific account via {account_id} in the path.
#   Role-based access is enforced by require_* dependencies from
#   core.permissions.
#
# Design:
#   The list endpoint returns card payloads only (VehicleCardOut)
#   so the grid view is fast. The detail endpoint returns the
#   full VehicleOut. Renewals and ownership have their own
#   sub-resources under /vehicles/{vehicle_id}/.
#
#   Lifecycle state transitions use a dedicated POST endpoint
#   rather than the generic PATCH so the intent is unambiguous
#   in the audit log.
#
# Consumed by:
#   - backend/app/app/api/v1/router.py
# ============================================================

import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.accounts.models.user import User
from app.core.database import get_db
from app.core.permissions import require_admin, require_editor, require_viewer
from app.vehicles.schemas.vehicle_schemas import (
    VehicleCardOut,
    VehicleCreateIn,
    VehicleLifecycleIn,
    VehicleOut,
    VehicleOwnershipOut,
    VehicleOwnershipPatchIn,
    VehiclePatchIn,
    VehicleRenewalOut,
    VehicleRenewalPutIn,
)
from app.vehicles.services.vehicle_service import VehicleService

# ==================================================
# ROUTER
# ==================================================

router = APIRouter()

# ==================================================
# VEHICLE ENDPOINTS
# ==================================================


@router.get(
    "/accounts/{account_id}/vehicles",
    response_model=list[VehicleCardOut],
    summary="List vehicles for an account",
)
async def list_vehicles(
    account_id: uuid.UUID,
    include_inactive: bool = Query(False, description="Include sold, scrapped and archived vehicles"),
    _: User = Depends(require_viewer),
    db: AsyncSession = Depends(get_db),
) -> list[VehicleCardOut]:
    return await VehicleService(db).list_vehicles(
        account_id, include_inactive=include_inactive
    )


@router.post(
    "/accounts/{account_id}/vehicles",
    response_model=VehicleOut,
    status_code=status.HTTP_201_CREATED,
    summary="Add a vehicle to an account",
)
async def create_vehicle(
    account_id: uuid.UUID,
    body: VehicleCreateIn,
    _: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
) -> VehicleOut:
    return await VehicleService(db).create_vehicle(account_id, body)


@router.get(
    "/accounts/{account_id}/vehicles/{vehicle_id}",
    response_model=VehicleOut,
    summary="Get vehicle detail",
)
async def get_vehicle(
    account_id: uuid.UUID,
    vehicle_id: uuid.UUID,
    _: User = Depends(require_viewer),
    db: AsyncSession = Depends(get_db),
) -> VehicleOut:
    return await VehicleService(db).get_vehicle(vehicle_id, account_id)


@router.patch(
    "/accounts/{account_id}/vehicles/{vehicle_id}",
    response_model=VehicleOut,
    summary="Update basic information for a vehicle",
)
async def patch_vehicle(
    account_id: uuid.UUID,
    vehicle_id: uuid.UUID,
    body: VehiclePatchIn,
    _: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
) -> VehicleOut:
    return await VehicleService(db).patch_vehicle(vehicle_id, account_id, body)


@router.delete(
    "/accounts/{account_id}/vehicles/{vehicle_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a vehicle and all its history",
)
async def delete_vehicle(
    account_id: uuid.UUID,
    vehicle_id: uuid.UUID,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> None:
    await VehicleService(db).delete_vehicle(vehicle_id, account_id)


# ==================================================
# LIFECYCLE
# ==================================================


@router.post(
    "/accounts/{account_id}/vehicles/{vehicle_id}/lifecycle",
    response_model=VehicleOut,
    summary="Set the lifecycle state of a vehicle",
)
async def set_lifecycle(
    account_id: uuid.UUID,
    vehicle_id: uuid.UUID,
    body: VehicleLifecycleIn,
    _: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
) -> VehicleOut:
    return await VehicleService(db).set_lifecycle(vehicle_id, account_id, body)


# ==================================================
# RENEWALS
# ==================================================


@router.get(
    "/accounts/{account_id}/vehicles/{vehicle_id}/renewals",
    response_model=VehicleRenewalOut,
    summary="Get the canonical renewal dates for a vehicle",
)
async def get_renewals(
    account_id: uuid.UUID,
    vehicle_id: uuid.UUID,
    _: User = Depends(require_viewer),
    db: AsyncSession = Depends(get_db),
) -> VehicleRenewalOut:
    return await VehicleService(db).get_renewals(vehicle_id, account_id)


@router.put(
    "/accounts/{account_id}/vehicles/{vehicle_id}/renewals",
    response_model=VehicleRenewalOut,
    summary="Replace the renewal dates for a vehicle",
)
async def put_renewals(
    account_id: uuid.UUID,
    vehicle_id: uuid.UUID,
    body: VehicleRenewalPutIn,
    _: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
) -> VehicleRenewalOut:
    return await VehicleService(db).put_renewals(vehicle_id, account_id, body)


# ==================================================
# OWNERSHIP
# ==================================================


@router.get(
    "/accounts/{account_id}/vehicles/{vehicle_id}/ownership",
    response_model=VehicleOwnershipOut,
    summary="Get ownership and finance information for a vehicle",
)
async def get_ownership(
    account_id: uuid.UUID,
    vehicle_id: uuid.UUID,
    _: User = Depends(require_viewer),
    db: AsyncSession = Depends(get_db),
) -> VehicleOwnershipOut:
    return await VehicleService(db).get_ownership(vehicle_id, account_id)


@router.patch(
    "/accounts/{account_id}/vehicles/{vehicle_id}/ownership",
    response_model=VehicleOwnershipOut,
    summary="Update ownership and finance information for a vehicle",
)
async def patch_ownership(
    account_id: uuid.UUID,
    vehicle_id: uuid.UUID,
    body: VehicleOwnershipPatchIn,
    _: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
) -> VehicleOwnershipOut:
    return await VehicleService(db).patch_ownership(vehicle_id, account_id, body)
