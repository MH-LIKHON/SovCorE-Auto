# ============================================================
# backend/app/app/api/v1/attachments.py
# ============================================================
#
# Purpose:
#   REST endpoints for record attachments (invoices, photos,
#   documents) that are added to a record after it is created.
#   Covers the full lifecycle: presigned upload, registration,
#   list, and delete.
#
# Design:
#   Three-step upload flow:
#     1. POST .../records/{id}/attachments/sign
#          → presigned PUT URL + R2 key
#     2. Browser PUTs the file directly to R2 using the URL.
#     3. POST .../records/{id}/attachments
#          → creates the DB row using the returned key.
#
#   The sign endpoint verifies record ownership via the record's
#   account_id before issuing a URL. The confirm step writes the
#   attachment row linked to the record.
#
#   Delete removes the DB row and the R2 object. R2 deletion
#   failure is swallowed so a missing object cannot block row
#   removal.
#
#   The vehicle_id appears in the sign URL path only to scope
#   the R2 key path neatly. Ownership is verified by checking
#   the record's account_id and vehicle_id together.
#
# Consumed by:
#   - backend/app/app/api/v1/router.py
# ============================================================

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.accounts.models.user import User
from app.core.database import get_db
from app.core.permissions import require_editor, require_viewer
from app.core.settings import get_settings
from app.integrations.r2 import get_r2_client
from app.records.repositories.attachment_repository import AttachmentRepository
from app.records.schemas.record_schemas import (
    AttachmentCreateIn,
    AttachmentOut,
    AttachmentSignIn,
    AttachmentSignOut,
)

# ==================================================
# ROUTER
# ==================================================

router = APIRouter()

# ==================================================
# HELPERS
# ==================================================

_ATTACHMENT_URL_EXPIRY = 15 * 60  # 15 minutes

_ALLOWED_ATTACHMENT_EXTS: dict[str, str] = {
    "jpg":  "image/jpeg",
    "jpeg": "image/jpeg",
    "png":  "image/png",
    "webp": "image/webp",
    "pdf":  "application/pdf",
    "doc":  "application/msword",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "xls":  "application/vnd.ms-excel",
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "txt":  "text/plain",
    "csv":  "text/csv",
    "heic": "image/heic",
}


def _ext_from_filename(filename: str) -> str:
    parts = filename.rsplit(".", 1)
    return parts[-1].lower() if len(parts) == 2 else ""


async def _get_record_for_attachment(
    db: AsyncSession,
    account_id: uuid.UUID,
    vehicle_id: uuid.UUID,
    record_id: uuid.UUID,
) -> None:
    """Raise 404 if the record does not belong to this account and vehicle."""
    from app.records.repositories.record_repository import RecordRepository
    record = await RecordRepository(db).get_by_id(record_id, account_id)
    if record is None or record.vehicle_id != vehicle_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Record not found.",
        )


# ==================================================
# SIGN
# ==================================================


@router.post(
    "/accounts/{account_id}/vehicles/{vehicle_id}/records/{record_id}/attachments/sign",
    response_model=AttachmentSignOut,
    summary="Generate a presigned R2 upload URL for a record attachment",
)
async def sign_attachment(
    account_id: uuid.UUID,
    vehicle_id: uuid.UUID,
    record_id: uuid.UUID,
    body: AttachmentSignIn,
    _: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
) -> AttachmentSignOut:
    await _get_record_for_attachment(db, account_id, vehicle_id, record_id)
    ext = _ext_from_filename(body.filename)
    if ext not in _ALLOWED_ATTACHMENT_EXTS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"File type '.{ext}' is not permitted for attachments.",
        )
    settings = get_settings()
    r2 = get_r2_client()
    key = (
        f"{account_id}/vehicles/{vehicle_id}/records/{record_id}"
        f"/attachments/{uuid.uuid4()}.{ext}"
    )
    upload_url: str = r2.generate_presigned_url(
        "put_object",
        Params={
            "Bucket": settings.r2_bucket_name,
            "Key": key,
            "ContentType": body.content_type,
        },
        ExpiresIn=_ATTACHMENT_URL_EXPIRY,
    )
    return AttachmentSignOut(upload_url=upload_url, key=key)


# ==================================================
# LIST + CREATE
# ==================================================


@router.get(
    "/accounts/{account_id}/vehicles/{vehicle_id}/records/{record_id}/attachments",
    response_model=list[AttachmentOut],
    summary="List attachments for a record",
)
async def list_attachments(
    account_id: uuid.UUID,
    vehicle_id: uuid.UUID,
    record_id: uuid.UUID,
    _: User = Depends(require_viewer),
    db: AsyncSession = Depends(get_db),
) -> list[AttachmentOut]:
    await _get_record_for_attachment(db, account_id, vehicle_id, record_id)
    rows = await AttachmentRepository(db).list_by_record(record_id, account_id)
    return [AttachmentOut.model_validate(r) for r in rows]


@router.post(
    "/accounts/{account_id}/vehicles/{vehicle_id}/records/{record_id}/attachments",
    response_model=AttachmentOut,
    status_code=status.HTTP_201_CREATED,
    summary="Register an attachment after uploading it to R2",
)
async def create_attachment(
    account_id: uuid.UUID,
    vehicle_id: uuid.UUID,
    record_id: uuid.UUID,
    body: AttachmentCreateIn,
    _: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
) -> AttachmentOut:
    await _get_record_for_attachment(db, account_id, vehicle_id, record_id)
    row = await AttachmentRepository(db).create(record_id, body)
    return AttachmentOut.model_validate(row)


# ==================================================
# DELETE
# ==================================================


@router.delete(
    "/accounts/{account_id}/attachments/{attachment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete an attachment and its R2 object",
)
async def delete_attachment(
    account_id: uuid.UUID,
    attachment_id: uuid.UUID,
    _: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
) -> None:
    repo = AttachmentRepository(db)
    attachment = await repo.get_by_id(attachment_id, account_id)
    if attachment is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Attachment not found.",
        )
    try:
        settings = get_settings()
        r2 = get_r2_client()
        r2.delete_object(Bucket=settings.r2_bucket_name, Key=attachment.r2_key)
    except Exception:
        pass  # do not block row deletion on R2 errors
    await repo.delete(attachment)
