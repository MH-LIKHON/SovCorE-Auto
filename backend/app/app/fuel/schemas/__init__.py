# ============================================================
# backend/app/app/fuel/schemas/__init__.py
# ============================================================
#
# Purpose:
#   Re-exports fuel schema types.
#
# Consumed by:
#   - backend/app/app/api/v1/fuel.py
# ============================================================

from app.fuel.schemas.fuel_schemas import FuelAnalyticsOut, FuelFillOut

__all__ = ["FuelAnalyticsOut", "FuelFillOut"]
