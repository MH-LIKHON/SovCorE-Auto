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

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.accounts.models.user import User
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.core.permissions import require_editor, require_viewer
from app.documents.schemas.document_schemas import (
    DocumentCreateIn,
    DocumentOut,
    SignedUploadOut,
    SignUploadIn,
)
from app.documents.services.document_service import DocumentService

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
    return DocumentService(db).sign_upload(account_id, body)


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
