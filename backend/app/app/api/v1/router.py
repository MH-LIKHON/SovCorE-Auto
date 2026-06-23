# ============================================================
# backend/app/app/api/v1/router.py
# ============================================================
#
# Purpose:
#   Root router for the /api/v1 namespace. Domain routers are
#   registered here as phases land. The health endpoint is the
#   only route in Phase 0.
#
# Consumed by:
#   - backend/app/main.py (mounted at /api/v1)
# ============================================================

from fastapi import APIRouter

from app.api.v1.health import router as health_router

# ==================================================
# V1 ROUTER
# ==================================================

v1_router = APIRouter()

v1_router.include_router(health_router, tags=["health"])
