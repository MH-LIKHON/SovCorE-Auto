# ============================================================
# backend/app/app/api/v1/records.py
# ============================================================
#
# Purpose:
#   REST endpoints for the records domain. Routes are scoped to
#   a vehicle within an account. Role-based access is enforced
#   by require_* dependencies from core.permissions.
#
# Design:
#   List and detail reads require viewer access. Create and patch
#   require editor access. Delete requires editor access (soft
#   deletions are not used for records; history is preserved
#   through the timeline_events table).
#
#   The list endpoint accepts optional ?type= and ?page= filters.
#   The response envelope (RecordPage) is consistent with the
#   page envelope convention from BLUEPRINT/04-routes-and-api.md.
#
# Consumed by:
#   - backend/app/app/api/v1/router.py
# ============================================================

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.accounts.models.user import User
from app.core.database import get_db
from app.core.permissions import require_editor, require_viewer
from app.records.models.record import RecordType
from app.records.schemas.record_schemas import (
    RecordCreateIn,
    RecordOut,
    RecordPage,
    RecordPatchIn,
)
from app.records.services.record_service import RecordService
from app.vehicles.repositories.vehicle_repository import VehicleRepository

# ==================================================
# ROUTER
# ==================================================

router = APIRouter()

# ==================================================
# RECORD ENDPOINTS
# ==================================================


@router.get(
    "/accounts/{account_id}/vehicles/{vehicle_id}/records",
    response_model=RecordPage,
    summary="List records for a vehicle",
)
async def list_records(
    account_id: uuid.UUID,
    vehicle_id: uuid.UUID,
    type: RecordType | None = Query(None, description="Filter by record type"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    _: User = Depends(require_viewer),
    db: AsyncSession = Depends(get_db),
) -> RecordPage:
    return await RecordService(db).list_records(
        vehicle_id, account_id,
        record_type=type,
        page=page,
        page_size=page_size,
    )


@router.post(
    "/accounts/{account_id}/vehicles/{vehicle_id}/records",
    response_model=RecordOut,
    status_code=status.HTTP_201_CREATED,
    summary="Add a record to a vehicle",
)
async def create_record(
    account_id: uuid.UUID,
    vehicle_id: uuid.UUID,
    body: RecordCreateIn,
    current_user: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
) -> RecordOut:
    return await RecordService(db).create_record(
        account_id, vehicle_id, current_user.id, body
    )


@router.get(
    "/accounts/{account_id}/records/{record_id}",
    response_model=RecordOut,
    summary="Fetch a record by ID",
)
async def get_record(
    account_id: uuid.UUID,
    record_id: uuid.UUID,
    _: User = Depends(require_viewer),
    db: AsyncSession = Depends(get_db),
) -> RecordOut:
    return await RecordService(db).get_record(record_id, account_id)


@router.patch(
    "/accounts/{account_id}/records/{record_id}",
    response_model=RecordOut,
    summary="Update a record",
)
async def patch_record(
    account_id: uuid.UUID,
    record_id: uuid.UUID,
    body: RecordPatchIn,
    current_user: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
) -> RecordOut:
    return await RecordService(db).patch_record(
        record_id, account_id, current_user.id, body
    )


@router.delete(
    "/accounts/{account_id}/records/{record_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a record",
)
async def delete_record(
    account_id: uuid.UUID,
    record_id: uuid.UUID,
    vehicle_id: uuid.UUID = Query(..., description="Vehicle ID for the timeline entry"),
    _: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
) -> None:
    # Verify the vehicle belongs to the account before writing a timeline entry.
    # 404 is intentional — do not reveal that the vehicle exists in another account.
    vehicle = await VehicleRepository(db).get_by_id(vehicle_id, account_id)
    if vehicle is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Vehicle not found.",
        )
    await RecordService(db).delete_record(record_id, account_id, vehicle_id)
