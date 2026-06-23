# ============================================================
# backend/app/app/scheduler/jobs.py
# ============================================================
#
# Purpose:
#   Background job functions executed by the APScheduler.
#   The reminder dispatch job runs daily at 09:00 UTC. It
#   queries all active reminders, computes the days remaining
#   until each due date, and sends a Resend email for every
#   interval that fires today and has not already been sent.
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
