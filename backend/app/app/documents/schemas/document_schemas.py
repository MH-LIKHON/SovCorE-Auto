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
from typing import Annotated

from pydantic import BaseModel, Field, field_validator

from app.documents.models.document import DocumentType

# ==================================================
# CONSTANTS
# ==================================================

# Only these MIME types may be uploaded. Executable and HTML types are
# excluded to prevent serving active content from the R2 bucket.
_ALLOWED_MIME_TYPES: frozenset[str] = frozenset({
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
})

# 50 MB hard cap enforced on both the schema and the presigned URL
# Conditions block. The schema rejects obviously wrong values before
# a presigned URL is even generated.
MAX_UPLOAD_BYTES: int = 50 * 1024 * 1024  # 50 MB

# ==================================================
# SIGNED UPLOAD
# ==================================================

# ------------------------------ Sign Upload In ------------------------------


class SignUploadIn(BaseModel):
    filename: str
    content_type: str
    vehicle_id: uuid.UUID

    @field_validator("content_type")
    @classmethod
    def content_type_must_be_allowed(cls, v: str) -> str:
        if v not in _ALLOWED_MIME_TYPES:
            raise ValueError(
                f"Unsupported content type '{v}'. "
                f"Allowed: {', '.join(sorted(_ALLOWED_MIME_TYPES))}."
            )
        return v


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
    size_bytes: int = Field(..., gt=0, le=MAX_UPLOAD_BYTES)
    expiry_date: date | None = None

    @field_validator("content_type")
    @classmethod
    def content_type_must_be_allowed(cls, v: str) -> str:
        if v not in _ALLOWED_MIME_TYPES:
            raise ValueError(
                f"Unsupported content type '{v}'. "
                f"Allowed: {', '.join(sorted(_ALLOWED_MIME_TYPES))}."
            )
        return v


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
