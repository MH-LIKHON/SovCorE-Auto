# ============================================================
# backend/app/app/api/v1/media.py
# ============================================================
#
# Purpose:
#   REST endpoints for the vehicle media gallery. A vehicle can
#   have any number of all-round photos stored here, distinct from
#   the single cover photo on the vehicle record itself.
#
# Design:
#   Upload uses the backend proxy pattern (browser → POST multipart
#   → FastAPI → r2.put_object()) to avoid EU-jurisdiction CORS
#   failures on direct browser-to-R2 PUT requests.
#
#   DELETE is a simple confirm — no CAPS verification — because
#   gallery photos are cosmetic, not evidential.
#
#   All GET responses include a signed 1-hour URL (url field) so
#   images can be displayed from the private R2 bucket without
#   exposing a public URL.
#
# Consumed by:
#   - backend/app/app/api/v1/router.py
# ============================================================

import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.accounts.models.user import User
from app.core.database import get_db
from app.core.permissions import require_editor, require_viewer
from app.core.settings import get_settings
from app.integrations.r2 import get_r2_client, sign_r2_get
from app.vehicles.repositories.vehicle_media_repository import VehicleMediaRepository
from app.vehicles.repositories.vehicle_repository import VehicleRepository
from app.vehicles.schemas.vehicle_media_schemas import VehicleMediaOut, VehicleMediaPage

# ==================================================
# ROUTER
# ==================================================

router = APIRouter()

# ==================================================
# CONSTANTS
# ==================================================

_ALLOWED_MEDIA_EXTS = {"jpg", "jpeg", "png", "webp"}

# ==================================================
# HELPERS
# ==================================================


def _sign_media(out: VehicleMediaOut) -> VehicleMediaOut:
    out.url = sign_r2_get(out.r2_key)
    return out


# ==================================================
# MEDIA ENDPOINTS
# ==================================================


@router.get(
    "/accounts/{account_id}/vehicles/{vehicle_id}/media",
    response_model=VehicleMediaPage,
    summary="List all-round vehicle media photos",
)
async def list_media(
    account_id: uuid.UUID,
    vehicle_id: uuid.UUID,
    _: User = Depends(require_viewer),
    db: AsyncSession = Depends(get_db),
) -> VehicleMediaPage:
    repo = VehicleMediaRepository(db)
    items, total = await repo.list_by_vehicle(vehicle_id, account_id)
    out_items = [_sign_media(VehicleMediaOut.model_validate(item)) for item in items]
    return VehicleMediaPage(items=out_items, total=total)


@router.post(
    "/accounts/{account_id}/vehicles/{vehicle_id}/media/upload",
    response_model=VehicleMediaOut,
    status_code=status.HTTP_201_CREATED,
    summary="Upload a vehicle media photo via the backend to R2 (avoids browser CORS)",
)
async def upload_media(
    account_id: uuid.UUID,
    vehicle_id: uuid.UUID,
    file: UploadFile = File(...),
    _: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
) -> VehicleMediaOut:
    ext = (file.filename or "file").rsplit(".", 1)[-1].lower()
    if ext not in _ALLOWED_MEDIA_EXTS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Extension '{ext}' is not allowed. Use jpg, png, or webp.",
        )
    vehicle = await VehicleRepository(db).get_by_id(vehicle_id, account_id)
    if vehicle is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vehicle not found.")

    content_type = file.content_type or f"image/{ext}"
    settings = get_settings()
    r2 = get_r2_client()
    key = f"{account_id}/vehicles/{vehicle_id}/media/{uuid.uuid4()}.{ext}"
    data = await file.read()
    try:
        r2.put_object(Bucket=settings.r2_bucket_name, Key=key, Body=data, ContentType=content_type)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"R2 storage upload failed: {exc}",
        ) from exc

    item = await VehicleMediaRepository(db).create(account_id, vehicle_id, key)
    return _sign_media(VehicleMediaOut.model_validate(item))


@router.delete(
    "/accounts/{account_id}/vehicles/{vehicle_id}/media/{media_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a vehicle media photo from R2 and remove the record",
)
async def delete_media(
    account_id: uuid.UUID,
    vehicle_id: uuid.UUID,
    media_id: uuid.UUID,
    _: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
) -> None:
    repo = VehicleMediaRepository(db)
    item = await repo.get_by_id(media_id, account_id)
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Media item not found.")
    try:
        settings = get_settings()
        r2 = get_r2_client()
        r2.delete_object(Bucket=settings.r2_bucket_name, Key=item.r2_key)
    except Exception:
        pass
    await repo.delete(item)
