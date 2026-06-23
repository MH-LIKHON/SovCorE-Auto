# ============================================================
# backend/app/app/core/logging.py
# ============================================================
#
# Purpose:
#   Structured logging configuration for SovCorE Auto. Uses
#   structlog so every log line is a JSON object in production
#   and a human-readable coloured line in development.
#
# Design:
#   `configure_logging` is called once at startup from main.py.
#   After that, any module can call `structlog.get_logger()`
#   to get a bound logger that inherits the pipeline.
#
#   In development (APP_ENV != "production"), structlog renders
#   coloured key=value output. In production it renders JSON so
#   log aggregators (Loki, Datadog) can parse structured fields.
#
# Consumed by:
#   - backend/app/main.py (called at startup)
# ============================================================

import logging
import sys

import structlog

# ==================================================
# CONFIGURE
# ==================================================


def configure_logging(is_development: bool = True) -> None:
    # ~~~~~~~~~ Shared processors ~~~~~~~~~
    # Applied to every log event regardless of renderer.
    shared_processors: list[structlog.types.Processor] = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
    ]

    if is_development:
        # Human-readable coloured output for local development.
        renderer: structlog.types.Processor = structlog.dev.ConsoleRenderer()
    else:
        # JSON lines for production log aggregators.
        renderer = structlog.processors.JSONRenderer()

    structlog.configure(
        processors=[
            *shared_processors,
            structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
        ],
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )

    formatter = structlog.stdlib.ProcessorFormatter(
        processor=renderer,
        foreign_pre_chain=shared_processors,
    )

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(formatter)

    root_logger = logging.getLogger()
    root_logger.addHandler(handler)
    root_logger.setLevel(logging.INFO)

    # Silence noisy third-party loggers in development.
    if is_development:
        logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
