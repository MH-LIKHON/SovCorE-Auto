# ============================================================
# backend/app/app/vehicles/schemas/__init__.py
# ============================================================
#
# Purpose:
#   Re-exports all vehicle Pydantic schemas so importers can
#   pull everything from a single path.
#
# Consumed by:
#   - backend/app/app/api/v1/vehicles.py
# ============================================================

from app.vehicles.schemas.vehicle_schemas import (  # noqa: F401
    RagStatus,
    RenewalRag,
    VehicleCardOut,
    VehicleCreateIn,
    VehicleLifecycleIn,
    VehicleOut,
    VehicleOwnershipOut,
    VehicleOwnershipPatchIn,
    VehiclePatchIn,
    VehicleRenewalOut,
    VehicleRenewalPutIn,
)
from app.vehicles.schemas.vehicle_media_schemas import (  # noqa: F401
    VehicleMediaOut,
    VehicleMediaPage,
)
