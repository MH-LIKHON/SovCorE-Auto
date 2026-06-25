# ============================================================
# backend/app/app/api/v1/entity_attachments.py
# ============================================================
#
# Purpose:
#   REST endpoints for entity attachments — custom-labelled
#   files attached to damage entries, PCNs, or warranty records.
#
# Design:
#   Single polymorphic table (entity_attachments) addressed by
#   entity_type + entity_id. Ownership is verified before every
#   write by checking the parent row belongs to the account.
#
#   Upload flow:
#     Browser → POST /entity-attachments/upload (multipart)
#     → backend reads file → puts to R2 → creates DB row.
#
#   Three endpoints:
#     POST   /accounts/{id}/entity-attachments/upload
#     GET    /accounts/{id}/entity-attachments
#     DELETE /accounts/{id}/entity-attachments/{attachment_id}
#
# Consumed by:
#   - backend/app/app/api/v1/router.py
# ============================================================

import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Response, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.accounts.models.user import User
from app.core.database import get_db
from app.core.permissions import require_editor, require_viewer
from app.core.settings import get_settings
from app.entity_attachments.repositories.entity_attachment_repository import (
    EntityAttachmentRepository,
)
from app.entity_attachments.schemas.entity_attachment_schemas import EntityAttachmentOut
from app.integrations.r2 import get_r2_client

# ==================================================
# ROUTER
# ==================================================

router = APIRouter()

# ==================================================
# CONSTANTS
# ==================================================

_ALLOWED_ENTITY_TYPES = frozenset({"damage", "pcn", "warranty"})

_ALLOWED_EXTS: dict[str, str] = {
    "jpg":  "image/jpeg",
    "jpeg": "image/jpeg",
    "png":  "image/png",
    "webp": "image/webp",
    "heic": "image/heic",
    "pdf":  "application/pdf",
}

# ==================================================
# HELPERS
# ==================================================


def _ext_from_filename(filename: str) -> str:
    parts = filename.rsplit(".", 1)
    return parts[-1].lower() if len(parts) == 2 else ""


async def _verify_entity_ownership(
    db: AsyncSession,
    account_id: uuid.UUID,
    entity_type: str,
    entity_id: uuid.UUID,
) -> None:
    """Raise 404 if the entity does not belong to this account."""
    obj = None
    if entity_type == "damage":
        from app.operational.repositories.damage_repository import DamageRepository
        obj = await DamageRepository(db).get_by_id(entity_id, account_id)
    elif entity_type == "pcn":
        from app.operational.repositories.pcn_repository import PCNRepository
        obj = await PCNRepository(db).get_by_id(entity_id, account_id)
    elif entity_type == "warranty":
        from app.operational.repositories.warranty_repository import WarrantyRepository
        obj = await WarrantyRepository(db).get_by_id(entity_id, account_id)
    if obj is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Entity not found.",
        )


# ==================================================
# UPLOAD
# ==================================================


@router.post(
    "/accounts/{account_id}/entity-attachments/upload",
    response_model=EntityAttachmentOut,
    status_code=status.HTTP_201_CREATED,
    summary="Upload an attachment for a damage entry, PCN, or warranty record",
)
async def upload_entity_attachment(
    account_id: uuid.UUID,
    file: UploadFile = File(...),
    entity_type: str = Form(...),
    entity_id: uuid.UUID = Form(...),
    label: str = Form(""),
    filename: str = Form(""),
    current_user: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
) -> EntityAttachmentOut:
    if entity_type not in _ALLOWED_ENTITY_TYPES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid entity type '{entity_type}'.",
        )
    await _verify_entity_ownership(db, account_id, entity_type, entity_id)
    raw_name = filename.strip() or file.filename or "file"
    ext = _ext_from_filename(raw_name)
    if ext not in _ALLOWED_EXTS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"File type '.{ext}' is not permitted. Allowed: pdf, jpg, png, webp, heic.",
        )
    content_type = file.content_type or _ALLOWED_EXTS.get(ext, "application/octet-stream")
    data = await file.read()
    settings = get_settings()
    r2 = get_r2_client()
    key = (
        f"{account_id}/entity-attachments/{entity_type}/{entity_id}"
        f"/{uuid.uuid4()}.{ext}"
    )
    try:
        r2.put_object(Bucket=settings.r2_bucket_name, Key=key, Body=data, ContentType=content_type)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"R2 storage upload failed: {exc}",
        ) from exc
    row = await EntityAttachmentRepository(db).create(
        account_id=account_id,
        entity_type=entity_type,
        entity_id=entity_id,
        label=label.strip() or raw_name,
        r2_key=key,
        filename=raw_name,
        content_type=content_type,
        size_bytes=len(data),
        created_by=current_user.id,
    )
    return EntityAttachmentOut.model_validate(row)


# ==================================================
# LIST
# ==================================================


@router.get(
    "/accounts/{account_id}/entity-attachments",
    response_model=list[EntityAttachmentOut],
    summary="List attachments for a specific entity",
)
async def list_entity_attachments(
    account_id: uuid.UUID,
    entity_type: str = Query(...),
    entity_id: uuid.UUID = Query(...),
    _: User = Depends(require_viewer),
    db: AsyncSession = Depends(get_db),
) -> list[EntityAttachmentOut]:
    if entity_type not in _ALLOWED_ENTITY_TYPES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid entity type '{entity_type}'.",
        )
    rows = await EntityAttachmentRepository(db).list_for_entity(
        entity_type, entity_id, account_id
    )
    return [EntityAttachmentOut.model_validate(r) for r in rows]


# ==================================================
# DOWNLOAD (authenticated stream → caller creates blob URL)
# ==================================================


@router.get(
    "/accounts/{account_id}/entity-attachments/{attachment_id}/download",
    summary="Stream an entity attachment through the backend (auth-gated)",
)
async def download_entity_attachment(
    account_id: uuid.UUID,
    attachment_id: uuid.UUID,
    _: User = Depends(require_viewer),
    db: AsyncSession = Depends(get_db),
) -> Response:
    repo = EntityAttachmentRepository(db)
    row = await repo.get_by_id(attachment_id, account_id)
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Attachment not found.",
        )
    settings = get_settings()
    r2 = get_r2_client()
    try:
        obj = r2.get_object(Bucket=settings.r2_bucket_name, Key=row.r2_key)
        data: bytes = obj["Body"].read()
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Storage fetch failed: {exc}",
        ) from exc
    safe_name = row.filename.replace('"', '\\"')
    return Response(
        content=data,
        media_type=row.content_type,
        headers={
            "Content-Disposition": f'inline; filename="{safe_name}"',
            "Cache-Control": "private, max-age=300",
        },
    )


# ==================================================
# DELETE
# ==================================================


@router.delete(
    "/accounts/{account_id}/entity-attachments/{attachment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete an entity attachment and its R2 object",
)
async def delete_entity_attachment(
    account_id: uuid.UUID,
    attachment_id: uuid.UUID,
    _: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
) -> None:
    repo = EntityAttachmentRepository(db)
    row = await repo.get_by_id(attachment_id, account_id)
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Attachment not found.",
        )
    try:
        settings = get_settings()
        r2 = get_r2_client()
        r2.delete_object(Bucket=settings.r2_bucket_name, Key=row.r2_key)
    except Exception:
        pass  # do not block row deletion on R2 errors
    await repo.delete(row)
