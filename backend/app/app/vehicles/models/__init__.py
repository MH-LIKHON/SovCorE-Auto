# ============================================================
# backend/app/app/vehicles/models/__init__.py
# ============================================================
#
# Purpose:
#   Re-exports all vehicle ORM models so Alembic and any
#   importer can reach every table with a single import of
#   this package.
#
# Consumed by:
#   - backend/app/alembic/env.py
# ============================================================

from app.vehicles.models.vehicle import (  # noqa: F401
    BodyType,
    LifecycleState,
    Vehicle,
    VehicleOwnership,
    VehiclePreviousOwner,
    VehicleRenewal,
)
from app.vehicles.models.vehicle_media import VehicleMedia  # noqa: F401
