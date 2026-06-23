# ============================================================
# backend/app/app/scheduler/jobs.py
# ============================================================
#
# Purpose:
#   Background job functions executed by the APScheduler.
#
#   dispatch_reminders — runs daily at 09:00 UTC. Queries all
#   active reminders, computes days remaining, and sends a
#   Resend email for each interval that fires today.
#
#   run_scheduled_backups — runs nightly at 02:00 UTC. Iterates
#   all account IDs and triggers a 'scheduled' backup for each.
#   Errors on individual accounts are caught and logged without
#   stopping the run for subsequent accounts.
#
# Design:
#   The job creates its own database session via the async
#   engine rather than using the FastAPI dependency injector,
#   which is not available outside of request scope.
#
#   last_sent_interval prevents duplicate notifications: once
#   an interval (e.g. 30 days) has been sent, it is recorded
#   and skipped on subsequent daily runs. This holds until the
#   due_date is updated, at which point the PATCH endpoint
#   resets last_sent_interval to None.
#
#   Resend is called per-account-per-reminder. The email
#   recipient is looked up from the accounts table. If Resend
#   is not configured (development), the job logs the send
#   action instead of raising.
#
# Consumed by:
#   - backend/app/app/scheduler/runner.py (scheduled daily)
# ============================================================

from __future__ import annotations

import structlog
from datetime import date, datetime, timezone
from typing import Any

logger = structlog.get_logger(__name__)

# ==================================================
# SCHEDULED BACKUP JOB
# ==================================================


async def run_scheduled_backups() -> None:
    """
    Nightly backup job that runs at 02:00 UTC for every account.
    Each account backup is independent — a failure on one account
    is logged and skipped without blocking the rest.
    """
    from sqlalchemy import select

    from app.accounts.models.account import Account
    from app.backups.services.backup_service import BackupService
    from app.core.database import async_session_factory

    log = logger.bind(job="run_scheduled_backups")
    log.info("scheduled_backups_started")

    async with async_session_factory() as db:
        result = await db.execute(select(Account.id))
        account_ids = list(result.scalars().all())

    success_count = 0
    for account_id in account_ids:
        try:
            async with async_session_factory() as db:
                svc = BackupService(db)
                await svc.trigger_backup(account_id=account_id, kind="scheduled")
                await db.commit()
            success_count += 1
        except Exception:
            log.exception("scheduled_backup_failed_for_account", account_id=str(account_id))

    log.info(
        "scheduled_backups_complete",
        total=len(account_ids),
        succeeded=success_count,
    )

# ==================================================
# REMINDER DISPATCH JOB
# ==================================================


async def dispatch_reminders() -> None:
    # ~~~~~~~~~ Import here to keep scheduler module lean at import time ~~~~~~~~~
    from sqlalchemy import select

    from app.accounts.models.account import Account
    from app.accounts.models.user import User
    from app.core.database import async_session_factory
    from app.core.settings import get_settings
    from app.integrations.resend_client import send_reminder_email
    from app.tasks.models.reminder import Reminder
    from app.tasks.repositories.reminder_repository import ReminderRepository

    settings = get_settings()
    today = date.today()

    log = logger.bind(job="dispatch_reminders", date=today.isoformat())
    log.info("reminder_dispatch_started")

    async with async_session_factory() as db:
        repo = ReminderRepository(db)
        reminders = await repo.list_due_today(today)

        sent_count = 0
        for reminder in reminders:
            days_remaining = (reminder.due_date - today).days

            # ~~~~~~~~~ Skip intervals that have already been sent ~~~~~~~~~
            pending_intervals = [
                iv for iv in sorted(reminder.intervals, reverse=True)
                if iv >= days_remaining
                and (reminder.last_sent_interval is None or iv < reminder.last_sent_interval)
            ]

            if days_remaining not in reminder.intervals:
                continue

            if days_remaining in pending_intervals:
                # ~~~~~~~~~ Look up the account email for notification ~~~~~~~~~
                try:
                    await _send_reminder(
                        db=db,
                        reminder=reminder,
                        days_remaining=days_remaining,
                        settings=settings,
                    )
                    await repo.mark_sent(reminder, days_remaining)
                    sent_count += 1
                except Exception:
                    log.exception("reminder_send_failed", reminder_id=str(reminder.id))

        await db.commit()
        log.info("reminder_dispatch_complete", sent=sent_count, scanned=len(reminders))


async def _send_reminder(
    *,
    db: Any,
    reminder: Any,
    days_remaining: int,
    settings: Any,
) -> None:
    # ~~~~~~~~~ Import lazily to avoid circular imports at module load ~~~~~~~~~
    from sqlalchemy import select

    from app.accounts.models.account import Account
    from app.accounts.models.user import User
    from app.tasks.models.reminder import Reminder
    from app.integrations.resend_client import send_reminder_email

    # ~~~~~~~~~ Fetch the account owner email ~~~~~~~~~
    user_stmt = (
        select(User)
        .join(
            Account,  # type: ignore[arg-type]
            Account.id == reminder.account_id,  # type: ignore[union-attr]
        )
        .limit(1)
    )
    result = await db.execute(user_stmt)
    user = result.scalar_one_or_none()
    if user is None:
        return

    reminder_type = reminder.type.replace("_", " ").title()
    subject = f"SovCorE Auto — {reminder_type} reminder: {days_remaining} day{'s' if days_remaining != 1 else ''} remaining"
    body = (
        f"Your {reminder_type.lower()} is due in {days_remaining} day{'s' if days_remaining != 1 else ''}.\n\n"
        f"Due date: {reminder.due_date.strftime('%d %B %Y')}\n\n"
        f"Log in to SovCorE Auto to manage this reminder."
    )

    await send_reminder_email(to=user.email, subject=subject, body=body)
