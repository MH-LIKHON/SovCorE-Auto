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
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler

from app.api.v1.router import v1_router
from app.core.logging import configure_logging
from app.core.rate_limit import RateLimitExceeded, limiter
from app.core.settings import get_settings
from app.integrations.resend_client import configure_resend
from app.middleware.request_id import RequestIDMiddleware
from app.middleware.security_headers import SecurityHeadersMiddleware
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
    settings.assert_production_secrets()  # Fails fast if placeholder secrets are in production
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

# ------------------------------ Global unhandled exception handler -----------
# Starlette's ServerErrorMiddleware returns PlainTextResponse for unhandled
# exceptions, which breaks JSON clients. This handler catches everything that
# is not an HTTPException or RequestValidationError and returns JSON so the
# frontend can always call res.json() safely.


@app.exception_handler(Exception)
async def _unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.error(
        "unhandled_exception",
        exc_type=type(exc).__name__,
        exc_msg=str(exc),
        path=request.url.path,
    )
    return JSONResponse(
        status_code=500,
        content={"detail": f"{type(exc).__name__}: {exc}"},
    )


# ------------------------------ Rate limiter --------------------------------
# Attach the limiter to app.state so slowapi can find it at request time.
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)  # type: ignore[arg-type]

# ------------------------------ Request ID ----------------------------------
# Outermost middleware — generates or propagates X-Request-ID before any
# other layer runs so the ID appears in every structlog line for the request.
app.add_middleware(RequestIDMiddleware)

# ------------------------------ Security headers ----------------------------
# Added before CORS so headers are present on CORS preflight responses too.
app.add_middleware(
    SecurityHeadersMiddleware,
    is_production=settings.app_env == "production",
)

# ------------------------------ CORS middleware ----------------------------
# The frontend origin is configured in .env. Multiple origins are supported
# via a comma-separated CORS_ORIGINS value.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
)

# ==================================================
# ROUTERS
# ==================================================

app.include_router(v1_router, prefix="/api/v1")
