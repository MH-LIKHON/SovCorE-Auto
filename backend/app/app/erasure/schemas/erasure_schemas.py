# ============================================================
# backend/app/app/erasure/schemas/erasure_schemas.py
# ============================================================
#
# Purpose:
#   Pydantic request and response schemas for the erasure
#   domain. Models the two-step flow: request then confirm.
#
# Consumed by:
#   - backend/app/app/api/v1/erasure.py
#   - backend/app/app/erasure/services/erasure_service.py
# ============================================================

import uuid
from datetime import datetime

from pydantic import BaseModel

# ==================================================
# RESPONSE SCHEMAS
# ==================================================


class ErasureRequestOut(BaseModel):
    """Read model for an erasure request row."""

    id: uuid.UUID
    account_id: uuid.UUID | None
    requested_by: uuid.UUID | None
    requested_at: datetime
    confirmed_at: datetime | None
    status: str
    completed_at: datetime | None

    model_config = {"from_attributes": True}


class ErasureConfirmIn(BaseModel):
    """
    POST /erasure/confirm body. Requires the caller to type
    "DELETE MY ACCOUNT" to confirm they understand the action
    is irreversible.
    """

    confirmation: str


class ErasureCompleteOut(BaseModel):
    """Summary of what was deleted on a confirmed erasure."""

    erasure_request_id: uuid.UUID
    # Number of R2 objects purged.
    r2_objects_purged: int
    message: str
