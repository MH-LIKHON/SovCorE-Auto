# ============================================================
# backend/app/app/api/v1/documents.py
# ============================================================
#
# Purpose:
#   REST endpoints for vehicle documents. Covers the presigned
#   upload flow and the document list and delete operations.
#
# Design:
#   Upload flow:
#     1. POST /accounts/{id}/uploads/sign → returns a presigned
#        R2 URL and the r2_key.
#     2. The browser PUTs the file directly to R2 using the URL.
#     3. POST /accounts/{id}/vehicles/{vid}/documents → creates
#        the database row with the r2_key.
#
#   The sign endpoint is under /uploads/sign (not /documents)
#   so it can be reused for vehicle image uploads later.
#
# Consumed by:
#   - backend/app/app/api/v1/router.py
# ============================================================

import uuid
from datetime import date

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.accounts.models.user import User
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.core.permissions import require_editor, require_viewer
from app.core.settings import get_settings
from app.documents.models.document import Document, DocumentType
from app.documents.schemas.document_schemas import (
    DocumentCreateIn,
    DocumentOut,
    SignedUploadOut,
    SignUploadIn,
)
from app.documents.services.document_service import DocumentService
from app.integrations.r2 import get_r2_client

# ==================================================
# ROUTER
# ==================================================

router = APIRouter()

# ==================================================
# UPLOAD SIGN
# ==================================================


@router.post(
    "/accounts/{account_id}/uploads/sign",
    response_model=SignedUploadOut,
    summary="Generate a presigned R2 upload URL",
)
async def sign_upload(
    account_id: uuid.UUID,
    body: SignUploadIn,
    _: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
) -> SignedUploadOut:
    return await DocumentService(db).sign_upload(account_id, body)


# ==================================================
# PROXY UPLOAD (browser → backend → R2)
# ==================================================

_ALLOWED_DOC_MIME_TYPES: dict[str, str] = {
    "pdf":  "application/pdf",
    "jpg":  "image/jpeg",
    "jpeg": "image/jpeg",
    "png":  "image/png",
    "webp": "image/webp",
    "heic": "image/heic",
}


def _ext_from_name(filename: str) -> str:
    parts = filename.rsplit(".", 1)
    return parts[-1].lower() if len(parts) == 2 else ""


@router.post(
    "/accounts/{account_id}/vehicles/{vehicle_id}/documents/upload",
    response_model=DocumentOut,
    status_code=status.HTTP_201_CREATED,
    summary="Upload a vehicle document via the backend to R2 (avoids browser CORS)",
)
async def upload_document(
    account_id: uuid.UUID,
    vehicle_id: uuid.UUID,
    file: UploadFile = File(...),
    doc_type: str = Form(...),
    filename: str = Form(""),
    expiry_date: str = Form(""),
    current_user: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
) -> DocumentOut:
    raw_name = filename.strip() or file.filename or "file"
    ext = _ext_from_name(raw_name)
    if ext not in _ALLOWED_DOC_MIME_TYPES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"File type '.{ext}' is not permitted. Allowed: pdf, jpg, png, webp.",
        )
    try:
        doc_type_enum = DocumentType(doc_type)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid document type '{doc_type}'.",
        )
    content_type = file.content_type or _ALLOWED_DOC_MIME_TYPES[ext]
    data = await file.read()
    settings = get_settings()
    r2 = get_r2_client()
    ts = int(__import__("time").time())
    key = f"{account_id}/vehicles/{vehicle_id}/docs/{ts}/{raw_name.replace(' ', '_')}"
    try:
        r2.put_object(Bucket=settings.r2_bucket_name, Key=key, Body=data, ContentType=content_type)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"R2 storage upload failed: {exc}",
        ) from exc
    expiry: date | None = None
    if expiry_date.strip():
        try:
            expiry = date.fromisoformat(expiry_date.strip())
        except ValueError:
            pass
    body = DocumentCreateIn(
        vehicle_id=vehicle_id,
        type=doc_type_enum,
        r2_key=key,
        filename=raw_name,
        content_type=content_type,
        size_bytes=len(data),
        expiry_date=expiry,
    )
    return await DocumentService(db).create_document(account_id, current_user.id, body)


# ==================================================
# DOCUMENTS
# ==================================================


@router.get(
    "/accounts/{account_id}/vehicles/{vehicle_id}/documents",
    response_model=list[DocumentOut],
    summary="List documents for a vehicle",
)
async def list_documents(
    account_id: uuid.UUID,
    vehicle_id: uuid.UUID,
    _: User = Depends(require_viewer),
    db: AsyncSession = Depends(get_db),
) -> list[DocumentOut]:
    return await DocumentService(db).list_documents(vehicle_id, account_id)


@router.post(
    "/accounts/{account_id}/vehicles/{vehicle_id}/documents",
    response_model=DocumentOut,
    status_code=status.HTTP_201_CREATED,
    summary="Register a document after uploading it to R2",
)
async def create_document(
    account_id: uuid.UUID,
    vehicle_id: uuid.UUID,
    body: DocumentCreateIn,
    current_user: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
) -> DocumentOut:
    return await DocumentService(db).create_document(
        account_id, current_user.id, body
    )


@router.delete(
    "/accounts/{account_id}/documents/{document_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a document and its R2 object",
)
async def delete_document(
    account_id: uuid.UUID,
    document_id: uuid.UUID,
    _: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
) -> None:
    await DocumentService(db).delete_document(document_id, account_id)


# ==================================================
# DOWNLOAD (authenticated stream → caller creates blob URL)
# ==================================================


@router.get(
    "/accounts/{account_id}/documents/{document_id}/download",
    summary="Stream a vehicle document through the backend (auth-gated)",
)
async def download_document(
    account_id: uuid.UUID,
    document_id: uuid.UUID,
    _: User = Depends(require_viewer),
    db: AsyncSession = Depends(get_db),
) -> Response:
    stmt = select(Document).where(
        Document.id == document_id, Document.account_id == account_id
    )
    doc = (await db.execute(stmt)).scalar_one_or_none()
    if doc is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found.",
        )
    settings = get_settings()
    r2 = get_r2_client()
    try:
        obj = r2.get_object(Bucket=settings.r2_bucket_name, Key=doc.r2_key)
        data: bytes = obj["Body"].read()
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Storage fetch failed: {exc}",
        ) from exc
    safe_name = doc.filename.replace('"', '\\"')
    return Response(
        content=data,
        media_type=doc.content_type,
        headers={
            "Content-Disposition": f'inline; filename="{safe_name}"',
            "Cache-Control": "private, max-age=300",
        },
    )
