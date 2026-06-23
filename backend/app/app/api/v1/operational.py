# ============================================================
# backend/app/app/api/v1/operational.py
# ============================================================
#
# Purpose:
#   REST endpoints for the three operational modules introduced
#   in Phase 4: PCN (penalty charge notices), damage history,
#   and warranty cover. All routes are scoped to a vehicle within
#   an account.
#
# Design:
#   Viewer access lists and reads. Editor access creates, patches
#   and deletes. Each module's endpoints are prefixed within the
#   overall /accounts/{id}/vehicles/{id}/ scope so the URL shape
#   is consistent with records and documents.
#
#   PCNs and damage entries use the same page-envelope convention:
#   { items, total, page, page_size }.
#
# Consumed by:
#   - backend/app/app/api/v1/router.py
# ============================================================

import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.accounts.models.user import User
from app.core.database import get_db
from app.core.permissions import require_editor, require_viewer
from app.operational.schemas import (
    DamageCreateIn,
    DamageOut,
    DamagePage,
    DamagePatchIn,
    PCNCreateIn,
    PCNOut,
    PCNPage,
    PCNPatchIn,
    WarrantyCreateIn,
    WarrantyOut,
    WarrantyPage,
    WarrantyPatchIn,
)
from app.operational.services.damage_service import DamageService
from app.operational.services.pcn_service import PCNService
from app.operational.services.warranty_service import WarrantyService

# ==================================================
# ROUTER
# ==================================================

router = APIRouter()

# ==================================================
# PCN ENDPOINTS
# ==================================================

# ------------------------------ List and create -----------------------------


@router.get(
    "/accounts/{account_id}/vehicles/{vehicle_id}/pcns",
    response_model=PCNPage,
    summary="List penalty charge notices for a vehicle",
)
async def list_pcns(
    account_id: uuid.UUID,
    vehicle_id: uuid.UUID,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    _: User = Depends(require_viewer),
    db: AsyncSession = Depends(get_db),
) -> PCNPage:
    return await PCNService(db).list(vehicle_id, account_id, page=page, page_size=page_size)


@router.post(
    "/accounts/{account_id}/vehicles/{vehicle_id}/pcns",
    response_model=PCNOut,
    status_code=status.HTTP_201_CREATED,
    summary="Add a penalty charge notice",
)
async def create_pcn(
    account_id: uuid.UUID,
    vehicle_id: uuid.UUID,
    body: PCNCreateIn,
    _: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
) -> PCNOut:
    return await PCNService(db).create(account_id, vehicle_id, body)


# ------------------------------ Patch and delete ----------------------------


@router.patch(
    "/accounts/{account_id}/pcns/{pcn_id}",
    response_model=PCNOut,
    summary="Update a PCN",
)
async def patch_pcn(
    account_id: uuid.UUID,
    pcn_id: uuid.UUID,
    body: PCNPatchIn,
    _: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
) -> PCNOut:
    return await PCNService(db).patch(pcn_id, account_id, body)


@router.delete(
    "/accounts/{account_id}/pcns/{pcn_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a PCN",
)
async def delete_pcn(
    account_id: uuid.UUID,
    pcn_id: uuid.UUID,
    _: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
) -> None:
    await PCNService(db).delete(pcn_id, account_id)


# ==================================================
# DAMAGE ENDPOINTS
# ==================================================

# ------------------------------ List and create -----------------------------


@router.get(
    "/accounts/{account_id}/vehicles/{vehicle_id}/damage",
    response_model=DamagePage,
    summary="List damage entries for a vehicle",
)
async def list_damage(
    account_id: uuid.UUID,
    vehicle_id: uuid.UUID,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    _: User = Depends(require_viewer),
    db: AsyncSession = Depends(get_db),
) -> DamagePage:
    return await DamageService(db).list(vehicle_id, account_id, page=page, page_size=page_size)


@router.post(
    "/accounts/{account_id}/vehicles/{vehicle_id}/damage",
    response_model=DamageOut,
    status_code=status.HTTP_201_CREATED,
    summary="Add a damage entry",
)
async def create_damage(
    account_id: uuid.UUID,
    vehicle_id: uuid.UUID,
    body: DamageCreateIn,
    _: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
) -> DamageOut:
    return await DamageService(db).create(account_id, vehicle_id, body)


# ------------------------------ Patch and delete ----------------------------


@router.patch(
    "/accounts/{account_id}/damage/{entry_id}",
    response_model=DamageOut,
    summary="Update a damage entry",
)
async def patch_damage(
    account_id: uuid.UUID,
    entry_id: uuid.UUID,
    body: DamagePatchIn,
    _: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
) -> DamageOut:
    return await DamageService(db).patch(entry_id, account_id, body)


@router.delete(
    "/accounts/{account_id}/damage/{entry_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a damage entry",
)
async def delete_damage(
    account_id: uuid.UUID,
    entry_id: uuid.UUID,
    _: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
) -> None:
    await DamageService(db).delete(entry_id, account_id)


# ==================================================
# WARRANTY ENDPOINTS
# ==================================================

# ------------------------------ List and create -----------------------------


@router.get(
    "/accounts/{account_id}/vehicles/{vehicle_id}/warranties",
    response_model=WarrantyPage,
    summary="List warranties for a vehicle",
)
async def list_warranties(
    account_id: uuid.UUID,
    vehicle_id: uuid.UUID,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    _: User = Depends(require_viewer),
    db: AsyncSession = Depends(get_db),
) -> WarrantyPage:
    return await WarrantyService(db).list(vehicle_id, account_id, page=page, page_size=page_size)


@router.post(
    "/accounts/{account_id}/vehicles/{vehicle_id}/warranties",
    response_model=WarrantyOut,
    status_code=status.HTTP_201_CREATED,
    summary="Add a warranty",
)
async def create_warranty(
    account_id: uuid.UUID,
    vehicle_id: uuid.UUID,
    body: WarrantyCreateIn,
    _: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
) -> WarrantyOut:
    return await WarrantyService(db).create(account_id, vehicle_id, body)


# ------------------------------ Patch and delete ----------------------------


@router.patch(
    "/accounts/{account_id}/warranties/{warranty_id}",
    response_model=WarrantyOut,
    summary="Update a warranty",
)
async def patch_warranty(
    account_id: uuid.UUID,
    warranty_id: uuid.UUID,
    body: WarrantyPatchIn,
    _: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
) -> WarrantyOut:
    return await WarrantyService(db).patch(warranty_id, account_id, body)


@router.delete(
    "/accounts/{account_id}/warranties/{warranty_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a warranty",
)
async def delete_warranty(
    account_id: uuid.UUID,
    warranty_id: uuid.UUID,
    _: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
) -> None:
    await WarrantyService(db).delete(warranty_id, account_id)
