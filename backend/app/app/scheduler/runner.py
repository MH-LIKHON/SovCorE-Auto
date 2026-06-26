# ============================================================
# backend/app/app/scheduler/runner.py
# ============================================================
#
# Purpose:
#   APScheduler configuration and lifecycle helpers. The
#   scheduler is started during the FastAPI lifespan startup
#   and stopped on shutdown, ensuring no jobs fire after
#   the process signals graceful termination.
#
# Design:
#   AsyncIOScheduler is used because the FastAPI app runs on
#   an asyncio event loop. All job functions are async and
#   must be decorated with asyncio-aware wrappers.
#
#   The daily reminder job fires at 09:00 UTC. This is
#   hardcoded here; it can be moved to settings if the
#   deployment needs a configurable schedule.
#
#   The scheduler is created as a module-level singleton so
#   the lifespan can start and stop it without passing state
#   through request context.
#
# Consumed by:
#   - backend/app/main.py (lifespan)
# ============================================================

import asyncio

import structlog
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from app.scheduler.jobs import (
    dispatch_custom_alerts,
    dispatch_mileage_log_reminders,
    dispatch_reminders,
    run_scheduled_backups,
)

logger = structlog.get_logger(__name__)

# ==================================================
# SCHEDULER INSTANCE
# ==================================================

# Module-level singleton — started and stopped by the lifespan context.
_scheduler = AsyncIOScheduler()

# ==================================================
# LIFECYCLE HELPERS
# ==================================================


def start_scheduler() -> None:
    # ~~~~~~~~~ Register the daily reminder dispatch job ~~~~~~~~~
    _scheduler.add_job(
        dispatch_reminders,
        trigger=CronTrigger(hour=9, minute=0, timezone="UTC"),
        id="dispatch_reminders",
        replace_existing=True,
        misfire_grace_time=3600,  # allow up to one hour late fire on startup
    )
    # ~~~~~~~~~ Register the daily custom alert dispatch job ~~~~~~~~~
    _scheduler.add_job(
        dispatch_custom_alerts,
        trigger=CronTrigger(hour=9, minute=0, timezone="UTC"),
        id="dispatch_custom_alerts",
        replace_existing=True,
        misfire_grace_time=3600,
    )
    # ~~~~~~~~~ Register the daily mileage log prompt job ~~~~~~~~~
    _scheduler.add_job(
        dispatch_mileage_log_reminders,
        trigger=CronTrigger(hour=9, minute=0, timezone="UTC"),
        id="dispatch_mileage_log_reminders",
        replace_existing=True,
        misfire_grace_time=3600,
    )
    # ~~~~~~~~~ Register the nightly scheduled backup job ~~~~~~~~~
    # Fires at 02:00 UTC, outside peak hours, for all accounts.
    _scheduler.add_job(
        run_scheduled_backups,
        trigger=CronTrigger(hour=2, minute=0, timezone="UTC"),
        id="run_scheduled_backups",
        replace_existing=True,
        misfire_grace_time=3600,
    )
    _scheduler.start()
    logger.info("scheduler_started", jobs=[j.id for j in _scheduler.get_jobs()])


def stop_scheduler() -> None:
    if _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("scheduler_stopped")
