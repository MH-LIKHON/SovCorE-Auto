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
from app.api.v1.audit import router as audit_router
from app.api.v1.auth import router as auth_router
from app.api.v1.documents import router as documents_router
from app.api.v1.expenses import router as expenses_router
from app.api.v1.fuel import router as fuel_router
from app.api.v1.health import router as health_router
from app.api.v1.operational import router as operational_router
from app.api.v1.records import router as records_router
from app.api.v1.timeline import router as timeline_router
from app.api.v1.vehicles import router as vehicles_router

# ==================================================
# V1 ROUTER
# ==================================================

v1_router = APIRouter()

v1_router.include_router(health_router, tags=["health"])
# Phase 1 — authentication and accounts
v1_router.include_router(auth_router, prefix="/auth", tags=["auth"])
v1_router.include_router(accounts_router, tags=["accounts"])
# Phase 2 — vehicles and documents
v1_router.include_router(vehicles_router, tags=["vehicles"])
v1_router.include_router(documents_router, tags=["documents"])
# Phase 3 — records, timeline and audit
v1_router.include_router(records_router, tags=["records"])
v1_router.include_router(timeline_router, tags=["timeline"])
v1_router.include_router(audit_router, tags=["audit"])
# Phase 4 — operational modules
v1_router.include_router(fuel_router, tags=["fuel"])
v1_router.include_router(expenses_router, tags=["expenses"])
v1_router.include_router(operational_router, tags=["operational"])
