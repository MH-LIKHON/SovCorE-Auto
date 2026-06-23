# ============================================================
# backend/app/app/health/__init__.py
# ============================================================
#
# Purpose:
#   Package marker for the health domain. The vehicle health
#   score is computed here from renewal dates and other inputs.
#   No tables are owned by this domain; it reads from vehicles,
#   vehicle_renewals, damage_entries, and tasks.
#
# Consumed by:
#   - backend/app/app/api/v1/vehicle_health.py
# ============================================================
