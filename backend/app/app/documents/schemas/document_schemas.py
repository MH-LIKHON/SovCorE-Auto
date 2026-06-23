# ============================================================
# backend/app/app/documents/schemas/document_schemas.py
# ============================================================
#
# Purpose:
#   Pydantic schemas for the documents API. Covers the signed
#   upload flow (sign → upload to R2 → create document row)
#   and the read path (list and detail).
#
# Design:
#   The upload flow is two-step: the frontend requests a signed
#   PUT URL from /uploads/sign, uploads the file directly to R2
#   from the browser (no server proxying), then calls
#   POST /documents with the r2_key. This keeps large files out
#   of the application server's memory and bandwidth.
#
# Consumed by:
#   - backend/app/app/documents/services/document_service.py
#   - backend/app/app/api/v1/documents.py
# ============================================================

import uuid
from datetime import date, datetime

from pydantic import BaseModel

from app.documents.models.document import DocumentType

# ==================================================
# SIGNED UPLOAD
# ==================================================

# ------------------------------ Sign Upload In ------------------------------


class SignUploadIn(BaseModel):
    filename: str
    content_type: str
    vehicle_id: uuid.UUID


# ------------------------------ Signed Upload Out ---------------------------


class SignedUploadOut(BaseModel):
    upload_url: str
    r2_key: str
    expires_in: int  # seconds


# ==================================================
# DOCUMENT
# ==================================================

# ------------------------------ Create In -----------------------------------


class DocumentCreateIn(BaseModel):
    vehicle_id: uuid.UUID
    type: DocumentType
    r2_key: str
    filename: str
    content_type: str
    size_bytes: int
    expiry_date: date | None = None


# ------------------------------ Document Out --------------------------------


class DocumentOut(BaseModel):
    id: uuid.UUID
    account_id: uuid.UUID
    vehicle_id: uuid.UUID
    type: DocumentType
    r2_key: str
    filename: str
    content_type: str
    size_bytes: int
    expiry_date: date | None
    created_by: uuid.UUID | None
    created_at: datetime

    model_config = {"from_attributes": True}
