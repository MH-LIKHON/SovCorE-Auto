# ============================================================
# backend/app/app/fuel/repositories/__init__.py
# ============================================================
#
# Purpose:
#   Re-exports the fuel repository.
#
# Consumed by:
#   - backend/app/app/fuel/services/fuel_service.py
# ============================================================

from app.fuel.repositories.fuel_repository import FuelRepository

__all__ = ["FuelRepository"]
