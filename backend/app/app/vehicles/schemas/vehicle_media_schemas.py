# ============================================================
# backend/app/app/vehicles/schemas/vehicle_media_schemas.py
# ============================================================
#
# Purpose:
#   Pydantic schemas for the vehicle media (all-round photos)
#   module. A vehicle can have any number of media photos.
#
# Consumed by:
#   - backend/app/app/vehicles/schemas/__init__.py
#   - backend/app/app/api/v1/media.py
# ============================================================

import uuid
from datetime import datetime

from pydantic import BaseModel

# ==================================================
# RESPONSE
# ==================================================


class VehicleMediaOut(BaseModel):
    id: uuid.UUID
    account_id: uuid.UUID
    vehicle_id: uuid.UUID
    r2_key: str
    # Signed GET URL — populated by the API endpoint, not the ORM.
    url: str | None = None
    display_order: int
    created_at: datetime

    model_config = {"from_attributes": True}


# ==================================================
# PAGE ENVELOPE
# ==================================================


class VehicleMediaPage(BaseModel):
    items: list[VehicleMediaOut]
    total: int
