# ============================================================
# backend/app/app/fuel/services/__init__.py
# ============================================================
#
# Purpose:
#   Re-exports the fuel service.
#
# Consumed by:
#   - backend/app/app/api/v1/fuel.py
# ============================================================

from app.fuel.services.fuel_service import FuelService

__all__ = ["FuelService"]
