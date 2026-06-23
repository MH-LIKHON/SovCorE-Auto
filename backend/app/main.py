# ============================================================
# backend/app/main.py
# ============================================================
#
# Purpose:
#   FastAPI application entry point for SovCorE Auto backend.
#   Creates the app, wires the CORS middleware, mounts the
#   versioned router, and configures structured logging.
#
# Design:
#   The FastAPI instance is module-level so uvicorn can import
#   it directly with `uvicorn main:app`. Lifespan handles
#   startup and shutdown events (database pool, background
#   scheduler) as they are added in later phases.
#
# Consumed by:
#   - docker-compose.dev.yml (uvicorn main:app --reload)
#   - Production Dockerfile (uvicorn main:app --workers 4)
# ============================================================

from contextlib import asynccontextmanager
from typing import AsyncGenerator

import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import v1_router
from app.core.logging import configure_logging
from app.core.settings import get_settings
from app.integrations.resend_client import configure_resend
from app.scheduler.runner import start_scheduler, stop_scheduler

# ==================================================
# STARTUP / SHUTDOWN
# ==================================================

settings = get_settings()

configure_logging(is_development=settings.app_env != "production")

logger = structlog.get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    # ~~~~~~~~~ Startup ~~~~~~~~~
    configure_resend()
    start_scheduler()
    logger.info("sovcore_auto_starting", env=settings.app_env)
    yield
    # ~~~~~~~~~ Shutdown ~~~~~~~~~
    stop_scheduler()
    logger.info("sovcore_auto_stopping")


# ==================================================
# APPLICATION
# ==================================================

app = FastAPI(
    title="SovCorE Auto API",
    description="Self-hosted vehicle management platform. REST API v1.",
    version="0.1.0",
    docs_url="/api/docs" if settings.app_debug else None,
    redoc_url="/api/redoc" if settings.app_debug else None,
    lifespan=lifespan,
)

# ------------------------------ CORS middleware ----------------------------
# The frontend origin is configured in .env. Multiple origins are supported
# via a comma-separated CORS_ORIGINS value.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==================================================
# ROUTERS
# ==================================================

app.include_router(v1_router, prefix="/api/v1")
