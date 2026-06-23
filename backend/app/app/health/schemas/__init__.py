# ============================================================
# backend/app/app/health/schemas/__init__.py
# ============================================================
#
# Purpose:
#   Package marker for health domain schemas.
#
# Consumed by:
#   - backend/app/app/api/v1/vehicle_health.py
# ============================================================

from app.health.schemas.health_schemas import HealthInputDetail, HealthScoreOut

__all__ = ["HealthInputDetail", "HealthScoreOut"]
