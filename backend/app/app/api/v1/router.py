# ============================================================
# backend/app/app/api/v1/router.py
# ============================================================
#
# Purpose:
#   Root router for the /api/v1 namespace. Domain routers are
#   registered here as phases land. Health is Phase 0; auth and
#   accounts are Phase 1.
#
# Consumed by:
#   - backend/app/main.py (mounted at /api/v1)
# ============================================================

from fastapi import APIRouter

from app.api.v1.accounts import router as accounts_router
from app.api.v1.auth import router as auth_router
from app.api.v1.health import router as health_router

# ==================================================
# V1 ROUTER
# ==================================================

v1_router = APIRouter()

v1_router.include_router(health_router, tags=["health"])
# Phase 1 — authentication and accounts
v1_router.include_router(auth_router, prefix="/auth", tags=["auth"])
v1_router.include_router(accounts_router, tags=["accounts"])
