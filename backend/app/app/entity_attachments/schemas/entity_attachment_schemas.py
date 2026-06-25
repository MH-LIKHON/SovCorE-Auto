# ============================================================
# backend/app/app/entity_attachments/schemas/
#   entity_attachment_schemas.py
# ============================================================
#
# Purpose:
#   Pydantic output schema for entity attachments returned by
#   the API. No input schema needed — the upload endpoint
#   accepts Form fields directly.
#
# Consumed by:
#   - backend/app/app/api/v1/entity_attachments.py
# ============================================================

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class EntityAttachmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    entity_type: str
    entity_id: uuid.UUID
    label: str
    filename: str
    content_type: str
    size_bytes: int
    created_at: datetime
