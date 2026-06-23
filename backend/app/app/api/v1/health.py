# ============================================================
# backend/app/app/api/v1/health.py
# ============================================================
#
# Purpose:
#   Liveness and readiness endpoints. Liveness (/health) confirms
#   the process is up. Readiness (/readiness) confirms the process
#   is up and the database connection is open — Nginx and the
#   deployment procedure wait for readiness before routing traffic.
#
# Design:
#   The two endpoints are intentionally separate so a container
#   orchestrator can restart a crashed process (liveness) without
#   pulling it from the load-balancer rotation during a transient
#   database blip (readiness). If the database is unavailable,
#   readiness returns HTTP 503; liveness still returns 200.
#
# Consumed by:
#   - backend/app/app/api/v1/router.py
#   - docker-compose.dev.yml (healthcheck target)
#   - Production Nginx upstream health_check directive
#   - Deployment procedure (waits for /readiness before flipping traffic)
# ============================================================

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.settings import get_settings

# ==================================================
# ROUTER
# ==================================================

router = APIRouter()

# ==================================================
# SCHEMAS
# ==================================================


class HealthResponse(BaseModel):
    status: str
    env: str
    api_version: str


class ReadinessResponse(BaseModel):
    status: str
    database: str


# ==================================================
# ENDPOINTS
# ==================================================

# ------------------------------ Liveness ------------------------------------


@router.get("/health", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    """
    Liveness check. Returns 200 if the process is running.
    Does not check external dependencies — a slow database should
    not kill the liveness probe.
    """
    settings = get_settings()
    return HealthResponse(
        status="ok",
        env=settings.app_env,
        api_version="v1",
    )


# ------------------------------ Readiness -----------------------------------


@router.get("/readiness", response_model=ReadinessResponse)
async def readiness_check(db: AsyncSession = Depends(get_db)) -> ReadinessResponse:
    """
    Readiness check. Returns 200 only when the database connection
    is healthy. Nginx and the deployment procedure use this before
    routing traffic to a new container revision.
    """
    try:
        await db.execute(text("SELECT 1"))
        db_status = "ok"
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database is not reachable.",
        )

    return ReadinessResponse(status="ok", database=db_status)
