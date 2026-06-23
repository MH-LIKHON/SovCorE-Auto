# ============================================================
# backend/app/app/api/v1/health.py
# ============================================================
#
# Purpose:
#   Health check endpoint. Returns HTTP 200 with a JSON body
#   confirming the service is up, the environment, and the API
#   version. Used by Docker healthchecks and uptime monitors.
#
# Consumed by:
#   - backend/app/app/api/v1/router.py
#   - docker-compose.dev.yml (healthcheck target)
# ============================================================

from fastapi import APIRouter
from pydantic import BaseModel

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


# ==================================================
# ENDPOINT
# ==================================================


@router.get("/health", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    settings = get_settings()
    return HealthResponse(
        status="ok",
        env=settings.app_env,
        api_version="v1",
    )
