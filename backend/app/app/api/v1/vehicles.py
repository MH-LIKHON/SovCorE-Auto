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
#   Cover photo flow:
#     POST /accounts/{id}/vehicles/{vid}/photo/upload (multipart/form-data)
#     → backend calls r2.put_object() → deletes old key if present
#       → patches image_key → returns VehicleOut with signed cover_url.
#     DELETE /accounts/{id}/vehicles/{vid}/photo removes the image.
#     Browser never connects to R2 directly (EU-jurisdiction CORS blocks that).
#
#   Signed GET URLs:
#     All endpoints that return VehicleOut or VehicleCardOut populate
#     cover_url with a 1-hour presigned GET URL. The bucket is private;
#     cover_url is the only way to display images.
#
# Consumed by:
#   - backend/app/app/api/v1/router.py
# ============================================================

import uuid

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.accounts.models.user import User
from app.core.database import get_db
from app.core.permissions import require_admin, require_editor, require_viewer
from app.core.settings import get_settings
from app.integrations.r2 import get_r2_client, sign_r2_get
from app.vehicles.repositories.vehicle_repository import VehicleRepository
from app.vehicles.schemas.vehicle_schemas import (
    VehicleCardOut,
    VehicleCreateIn,
    VehicleLifecycleIn,
    VehicleOut,
    VehicleOwnershipOut,
    VehicleOwnershipPatchIn,
    VehiclePatchIn,
    VehiclePhotoSignIn,
    VehiclePhotoSignOut,
    VehicleRenewalOut,
    VehicleRenewalPutIn,
)
from app.vehicles.services.vehicle_service import VehicleService

# ==================================================
# ROUTER
# ==================================================

router = APIRouter()

# ==================================================
# HELPERS
# ==================================================


def _sign_vehicle(out: VehicleOut) -> VehicleOut:
    out.cover_url = sign_r2_get(out.image_key)
    return out


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
    cards = await VehicleService(db).list_vehicles(
        account_id, include_inactive=include_inactive
    )
    for card in cards:
        card.cover_url = sign_r2_get(card.image_key)
    return cards


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
    return _sign_vehicle(await VehicleService(db).create_vehicle(account_id, body))


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
    return _sign_vehicle(await VehicleService(db).get_vehicle(vehicle_id, account_id))


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
    return _sign_vehicle(
        await VehicleService(db).patch_vehicle(vehicle_id, account_id, body)
    )


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
    return _sign_vehicle(
        await VehicleService(db).set_lifecycle(vehicle_id, account_id, body)
    )


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


# ==================================================
# COVER PHOTO
# ==================================================

_ALLOWED_PHOTO_EXTS = {"jpg", "jpeg", "png", "webp"}
_PHOTO_URL_EXPIRY = 15 * 60  # 15 minutes


@router.post(
    "/accounts/{account_id}/vehicles/{vehicle_id}/photo/sign",
    response_model=VehiclePhotoSignOut,
    summary="Generate a presigned R2 upload URL for the vehicle cover photo",
)
async def sign_cover_photo(
    account_id: uuid.UUID,
    vehicle_id: uuid.UUID,
    body: VehiclePhotoSignIn,
    _: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
) -> VehiclePhotoSignOut:
    ext = body.ext.lower().lstrip(".")
    if ext not in _ALLOWED_PHOTO_EXTS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Extension '{ext}' is not allowed. Use jpg, png, or webp.",
        )
    vehicle = await VehicleRepository(db).get_by_id(vehicle_id, account_id)
    if vehicle is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vehicle not found.")
    settings = get_settings()
    r2 = get_r2_client()
    key = f"{account_id}/vehicles/{vehicle_id}/cover/{uuid.uuid4()}.{ext}"
    content_type = "image/jpeg" if ext in ("jpg", "jpeg") else f"image/{ext}"
    upload_url: str = r2.generate_presigned_url(
        "put_object",
        Params={
            "Bucket": settings.r2_bucket_name,
            "Key": key,
            "ContentType": content_type,
        },
        ExpiresIn=_PHOTO_URL_EXPIRY,
    )
    return VehiclePhotoSignOut(upload_url=upload_url, key=key)


@router.post(
    "/accounts/{account_id}/vehicles/{vehicle_id}/photo/upload",
    response_model=VehicleOut,
    summary="Upload the vehicle cover photo via the backend to R2 (avoids browser CORS)",
)
async def upload_cover_photo(
    account_id: uuid.UUID,
    vehicle_id: uuid.UUID,
    file: UploadFile = File(...),
    _: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
) -> VehicleOut:
    ext = (file.filename or "file").rsplit(".", 1)[-1].lower()
    if ext not in _ALLOWED_PHOTO_EXTS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Extension '{ext}' is not allowed. Use jpg, png, or webp.",
        )
    content_type = file.content_type or f"image/{ext}"
    settings = get_settings()
    r2 = get_r2_client()

    # Fetch vehicle to capture old key for orphan cleanup after upload.
    vehicle = await VehicleRepository(db).get_by_id(vehicle_id, account_id)
    if vehicle is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vehicle not found.")
    old_key = vehicle.image_key

    key = f"{account_id}/vehicles/{vehicle_id}/cover/{uuid.uuid4()}.{ext}"
    data = await file.read()
    try:
        r2.put_object(Bucket=settings.r2_bucket_name, Key=key, Body=data, ContentType=content_type)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"R2 storage upload failed: {exc}",
        ) from exc

    # Delete the previous cover photo from R2 after a successful upload.
    if old_key:
        try:
            r2.delete_object(Bucket=settings.r2_bucket_name, Key=old_key)
        except Exception:
            pass

    out = await VehicleService(db).patch_vehicle(
        vehicle_id, account_id, VehiclePatchIn(image_key=key)
    )
    out.cover_url = sign_r2_get(key)
    return out


@router.delete(
    "/accounts/{account_id}/vehicles/{vehicle_id}/photo",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete the vehicle cover photo from R2 and clear the image_key",
)
async def delete_cover_photo(
    account_id: uuid.UUID,
    vehicle_id: uuid.UUID,
    _: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
) -> None:
    repo = VehicleRepository(db)
    vehicle = await repo.get_by_id(vehicle_id, account_id)
    if vehicle is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vehicle not found.")
    if vehicle.image_key:
        try:
            settings = get_settings()
            r2 = get_r2_client()
            r2.delete_object(Bucket=settings.r2_bucket_name, Key=vehicle.image_key)
        except Exception:
            pass
    vehicle.image_key = None
    await db.flush()
