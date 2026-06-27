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
#   Damage photo flow:
#     POST .../damage/{id}/photo/upload (multipart/form-data, fields: file + slot)
#     → backend deletes old R2 key if present → calls r2.put_object()
#       → writes audit log → patches before_key/after_key → returns DamageOut
#       with signed before_url/after_url.
#     Browser never connects to R2 directly (EU-jurisdiction CORS blocks that).
#     DELETE .../damage/{id}/photo/{slot} is only permitted when damage status
#     is "resolved". It removes the key and deletes the R2 object, then writes
#     an audit log row.
#
#   Signed GET URLs:
#     All DamageOut responses populate before_url / after_url with 1-hour
#     presigned GET URLs. The bucket is private.
#
# Consumed by:
#   - backend/app/app/api/v1/router.py
# ============================================================

import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.accounts.models.user import User
from app.core.database import get_db
from app.core.permissions import require_editor, require_viewer
from app.core.settings import get_settings
from app.integrations.r2 import get_r2_client, sign_r2_get
from app.operational.models.damage import DamageStatus
from app.operational.models.damage_audit import DamagePhotoAuditLog
from app.operational.repositories.damage_repository import DamageRepository
from app.operational.schemas import (
    DamageCreateIn,
    DamageOut,
    DamagePage,
    DamagePatchIn,
    DamagePhotoSignIn,
    DamagePhotoSignOut,
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
from app.vehicles.repositories.vehicle_repository import VehicleRepository

# ==================================================
# ROUTER
# ==================================================

router = APIRouter()

# ==================================================
# HELPERS
# ==================================================


def _sign_damage(out: DamageOut) -> DamageOut:
    out.before_url = sign_r2_get(out.before_key)
    out.after_url = sign_r2_get(out.after_key)
    return out


def _sign_damage_page(page: DamagePage) -> DamagePage:
    for item in page.items:
        _sign_damage(item)
    return page


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
    page_out = await DamageService(db).list(vehicle_id, account_id, page=page, page_size=page_size)
    return _sign_damage_page(page_out)


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
    return _sign_damage(await DamageService(db).create(account_id, vehicle_id, body))


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
    return _sign_damage(await DamageService(db).patch(entry_id, account_id, body))


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
# DAMAGE PHOTO ENDPOINTS
# ==================================================

_ALLOWED_DAMAGE_PHOTO_EXTS = {"jpg", "jpeg", "png", "webp"}
_DAMAGE_PHOTO_URL_EXPIRY = 15 * 60  # 15 minutes


@router.post(
    "/accounts/{account_id}/vehicles/{vehicle_id}/damage/{entry_id}/photo/sign",
    response_model=DamagePhotoSignOut,
    summary="Generate a presigned R2 upload URL for a damage photo",
)
async def sign_damage_photo(
    account_id: uuid.UUID,
    vehicle_id: uuid.UUID,
    entry_id: uuid.UUID,
    body: DamagePhotoSignIn,
    _: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
) -> DamagePhotoSignOut:
    ext = body.ext.lower().lstrip(".")
    if ext not in _ALLOWED_DAMAGE_PHOTO_EXTS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Extension '{ext}' is not allowed. Use jpg, png, or webp.",
        )
    vehicle = await VehicleRepository(db).get_by_id(vehicle_id, account_id)
    if vehicle is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vehicle not found.")
    entry = await DamageRepository(db).get_by_id(entry_id, account_id)
    if entry is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Damage entry not found.")
    settings = get_settings()
    r2 = get_r2_client()
    key = (
        f"{account_id}/vehicles/{vehicle_id}/damage/{entry_id}"
        f"/{body.slot}/{uuid.uuid4()}.{ext}"
    )
    content_type = "image/jpeg" if ext in ("jpg", "jpeg") else f"image/{ext}"
    upload_url: str = r2.generate_presigned_url(
        "put_object",
        Params={
            "Bucket": settings.r2_bucket_name,
            "Key": key,
            "ContentType": content_type,
        },
        ExpiresIn=_DAMAGE_PHOTO_URL_EXPIRY,
    )
    return DamagePhotoSignOut(upload_url=upload_url, key=key)


@router.post(
    "/accounts/{account_id}/vehicles/{vehicle_id}/damage/{entry_id}/photo/upload",
    response_model=DamageOut,
    summary="Upload a damage photo via the backend to R2 (avoids browser CORS)",
)
async def upload_damage_photo(
    account_id: uuid.UUID,
    vehicle_id: uuid.UUID,
    entry_id: uuid.UUID,
    file: UploadFile = File(...),
    slot: str = Form(...),
    current_user: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
) -> DamageOut:
    if slot not in ("before", "after"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Slot must be 'before' or 'after'.",
        )
    ext = (file.filename or "file").rsplit(".", 1)[-1].lower()
    if ext not in _ALLOWED_DAMAGE_PHOTO_EXTS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Extension '{ext}' is not allowed. Use jpg, png, or webp.",
        )
    vehicle = await VehicleRepository(db).get_by_id(vehicle_id, account_id)
    if vehicle is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vehicle not found.")
    repo = DamageRepository(db)
    entry = await repo.get_by_id(entry_id, account_id)
    if entry is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Damage entry not found.")

    # Capture old key before upload for orphan cleanup.
    old_key: str | None = entry.before_key if slot == "before" else entry.after_key

    content_type = file.content_type or f"image/{ext}"
    settings = get_settings()
    r2 = get_r2_client()
    key = f"{account_id}/vehicles/{vehicle_id}/damage/{entry_id}/{slot}/{uuid.uuid4()}.{ext}"
    data = await file.read()
    try:
        r2.put_object(Bucket=settings.r2_bucket_name, Key=key, Body=data, ContentType=content_type)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"R2 storage upload failed: {exc}",
        ) from exc

    # Delete the old photo from R2 after a successful upload.
    if old_key:
        try:
            r2.delete_object(Bucket=settings.r2_bucket_name, Key=old_key)
        except Exception:
            pass

    patch_data = DamagePatchIn(before_key=key) if slot == "before" else DamagePatchIn(after_key=key)
    updated = await repo.patch(entry, patch_data)

    # Write audit log.
    db.add(
        DamagePhotoAuditLog(
            account_id=account_id,
            vehicle_id=vehicle_id,
            entry_id=entry_id,
            slot=slot,
            action="uploaded",
            r2_key=key,
            performed_by=current_user.id,
        )
    )
    await db.flush()

    out = DamageOut.model_validate(updated)
    return _sign_damage(out)


@router.delete(
    "/accounts/{account_id}/damage/{entry_id}/photo/{slot}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a damage photo (only permitted when damage status is resolved)",
)
async def delete_damage_photo(
    account_id: uuid.UUID,
    entry_id: uuid.UUID,
    slot: str,
    current_user: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
) -> None:
    if slot not in ("before", "after"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Slot must be 'before' or 'after'.",
        )
    repo = DamageRepository(db)
    entry = await repo.get_by_id(entry_id, account_id)
    if entry is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Damage entry not found.")

    # Photos on active entries are evidence — deletion is blocked until resolved.
    if entry.status != DamageStatus.resolved:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Damage photos can only be deleted when the damage status is 'Resolved'.",
        )

    r2_key: str | None = entry.before_key if slot == "before" else entry.after_key
    if r2_key:
        try:
            settings = get_settings()
            r2 = get_r2_client()
            r2.delete_object(Bucket=settings.r2_bucket_name, Key=r2_key)
        except Exception:
            pass  # do not block row update on R2 errors

    # Null the key directly on the ORM object; exclude_none patch cannot clear to None.
    if slot == "before":
        entry.before_key = None
    else:
        entry.after_key = None
    await db.flush()

    # Write audit log.
    db.add(
        DamagePhotoAuditLog(
            account_id=account_id,
            vehicle_id=entry.vehicle_id,
            entry_id=entry_id,
            slot=slot,
            action="deleted",
            r2_key=r2_key,
            performed_by=current_user.id,
        )
    )
    await db.flush()


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
