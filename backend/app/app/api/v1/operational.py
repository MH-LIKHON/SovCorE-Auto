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
#   Damage photo flow (multi-photo gallery per slot):
#     POST .../damage/{id}/photo/upload (multipart: file + slot)
#     → backend calls r2.put_object() → creates a damage_photos row
#       → writes audit log → returns DamageOut with signed
#       before_photos / after_photos lists.
#     Browser never connects to R2 directly (EU-jurisdiction CORS
#     blocks that); proxy upload pattern throughout.
#     DELETE .../damage/{entry_id}/photos/{photo_id} is only permitted
#     when damage status is "resolved". It deletes the R2 object and
#     the damage_photos row, then writes an audit log row.
#
#   Signed GET URLs:
#     All DamageOut responses populate before_photos[].url and
#     after_photos[].url with 1-hour presigned GET URLs. The R2
#     bucket is private.
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
from app.operational.repositories.damage_photo_repository import DamagePhotoRepository
from app.operational.repositories.damage_repository import DamageRepository
from app.operational.schemas import (
    DamageCreateIn,
    DamageOut,
    DamagePage,
    DamagePatchIn,
    DamagePhotoOut,
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


def _make_photo_out(photo) -> DamagePhotoOut:
    return DamagePhotoOut(
        id=photo.id,
        r2_key=photo.r2_key,
        display_order=photo.display_order,
        url=sign_r2_get(photo.r2_key),
    )


async def _enrich_damage(out: DamageOut, db: AsyncSession) -> DamageOut:
    """Load damage photos for one entry and sign their GET URLs."""
    photo_repo = DamagePhotoRepository(db)
    photos = await photo_repo.list_by_entry(out.id, out.account_id)
    out.before_photos = [_make_photo_out(p) for p in photos if p.slot == "before"]
    out.after_photos  = [_make_photo_out(p) for p in photos if p.slot == "after"]
    return out


async def _enrich_damage_page(page: DamagePage, db: AsyncSession) -> DamagePage:
    """Batch-load photos for all entries in a page to avoid N+1 queries."""
    if not page.items:
        return page
    photo_repo = DamagePhotoRepository(db)
    entry_ids = [item.id for item in page.items]
    all_photos = await photo_repo.list_by_entries(entry_ids, page.items[0].account_id)

    photos_by_entry: dict[uuid.UUID, list] = {}
    for p in all_photos:
        photos_by_entry.setdefault(p.entry_id, []).append(p)

    for item in page.items:
        photos = photos_by_entry.get(item.id, [])
        item.before_photos = [_make_photo_out(p) for p in photos if p.slot == "before"]
        item.after_photos  = [_make_photo_out(p) for p in photos if p.slot == "after"]
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
    return await _enrich_damage_page(page_out, db)


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
    out = await DamageService(db).create(account_id, vehicle_id, body)
    return await _enrich_damage(out, db)


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
    out = await DamageService(db).patch(entry_id, account_id, body)
    return await _enrich_damage(out, db)


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
    entry = await DamageRepository(db).get_by_id(entry_id, account_id)
    if entry is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Damage entry not found.")

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

    # Create damage_photos row (appended, not replacing).
    photo_repo = DamagePhotoRepository(db)
    order = await photo_repo.count_by_slot(entry_id, slot)
    await photo_repo.create(
        entry_id=entry_id,
        account_id=account_id,
        vehicle_id=vehicle_id,
        slot=slot,
        r2_key=key,
        display_order=order,
    )

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

    out = DamageOut.model_validate(entry)
    return await _enrich_damage(out, db)


@router.delete(
    "/accounts/{account_id}/damage/{entry_id}/photos/{photo_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete one damage photo (only permitted when damage status is resolved)",
)
async def delete_damage_photo(
    account_id: uuid.UUID,
    entry_id: uuid.UUID,
    photo_id: uuid.UUID,
    current_user: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
) -> None:
    repo = DamageRepository(db)
    entry = await repo.get_by_id(entry_id, account_id)
    if entry is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Damage entry not found.")

    # Photos on active entries are evidence — deletion blocked until resolved.
    if entry.status != DamageStatus.resolved:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Damage photos can only be deleted when the damage status is 'Resolved'.",
        )

    photo_repo = DamagePhotoRepository(db)
    photo = await photo_repo.get_by_id(photo_id, account_id)
    if photo is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Photo not found.")

    # Delete from R2 (non-blocking on R2 error).
    try:
        settings = get_settings()
        r2 = get_r2_client()
        r2.delete_object(Bucket=settings.r2_bucket_name, Key=photo.r2_key)
    except Exception:
        pass

    # Write audit log before deleting the row.
    db.add(
        DamagePhotoAuditLog(
            account_id=account_id,
            vehicle_id=entry.vehicle_id,
            entry_id=entry_id,
            slot=photo.slot,
            action="deleted",
            r2_key=photo.r2_key,
            performed_by=current_user.id,
        )
    )
    await db.flush()

    await photo_repo.delete(photo)


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
