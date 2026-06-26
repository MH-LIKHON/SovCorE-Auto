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
    from app.vehicles.models.vehicle import Vehicle

    settings = get_settings()
    today = date.today()

    log = logger.bind(job="dispatch_reminders", date=today.isoformat())
    log.info("reminder_dispatch_started")

    # Reminder types where mileage-based triggers are not meaningful.
    _DATE_ONLY_TYPES = {"mot", "tax", "insurance", "warranty", "breakdown_cover"}

    async with async_session_factory() as db:
        repo = ReminderRepository(db)
        reminders = await repo.list_due_today(today)

        # ~~~~~~~~~ Batch-load vehicle mileage for mileage-capable reminders ~~~~~~~~~
        mileage_vehicle_ids = list({
            r.vehicle_id for r in reminders
            if r.type not in _DATE_ONLY_TYPES and r.due_mileage is not None
        })
        mileage_map: dict = {}
        if mileage_vehicle_ids:
            veh_result = await db.execute(
                select(Vehicle.id, Vehicle.mileage).where(Vehicle.id.in_(mileage_vehicle_ids))
            )
            mileage_map = {row.id: row.mileage for row in veh_result.all()}

        sent_count = 0
        for reminder in reminders:
            days_remaining = (reminder.due_date - today).days

            # ~~~~~~~~~ Skip intervals that have already been sent ~~~~~~~~~
            pending_intervals = [
                iv for iv in sorted(reminder.intervals, reverse=True)
                if iv >= days_remaining
                and (reminder.last_sent_interval is None or iv < reminder.last_sent_interval)
            ]

            date_fired = days_remaining in reminder.intervals and days_remaining in pending_intervals

            # ~~~~~~~~~ Mileage-based trigger (dual-trigger types only) ~~~~~~~~~
            mileage_fired = False
            if (
                reminder.type not in _DATE_ONLY_TYPES
                and reminder.due_mileage is not None
                and not date_fired
            ):
                current_mileage = mileage_map.get(reminder.vehicle_id)
                if current_mileage is not None:
                    gap = reminder.due_mileage - current_mileage
                    if 0 <= gap <= reminder.miles_warning:
                        mileage_fired = True

            if date_fired or mileage_fired:
                try:
                    await _send_reminder(
                        db=db,
                        reminder=reminder,
                        days_remaining=days_remaining if date_fired else None,
                        miles_remaining=None if date_fired else (
                            reminder.due_mileage - (mileage_map.get(reminder.vehicle_id) or 0)
                        ),
                        settings=settings,
                    )
                    if date_fired:
                        await repo.mark_sent(reminder, days_remaining)
                    sent_count += 1
                except Exception:
                    log.exception("reminder_send_failed", reminder_id=str(reminder.id))

        await db.commit()
        log.info("reminder_dispatch_complete", sent=sent_count, scanned=len(reminders))


# ==================================================
# CUSTOM ALERT DISPATCH JOB
# ==================================================


async def dispatch_custom_alerts() -> None:
    from sqlalchemy import select, update as sa_update
    from dateutil.relativedelta import relativedelta

    from app.core.database import async_session_factory
    from app.tasks.models.custom_alert import CustomAlert
    from app.vehicles.models.vehicle import Vehicle

    today = date.today()
    log = logger.bind(job="dispatch_custom_alerts", date=today.isoformat())
    log.info("custom_alert_dispatch_started")

    async with async_session_factory() as db:
        # ~~~~~~~~~ Load all active alerts ~~~~~~~~~
        result = await db.execute(
            select(CustomAlert).where(CustomAlert.active.is_(True))
        )
        alerts = list(result.scalars().all())

        if not alerts:
            log.info("custom_alert_dispatch_complete", sent=0, scanned=0)
            return

        # ~~~~~~~~~ Batch-load vehicle mileage for mileage conditions ~~~~~~~~~
        vehicle_ids = list({a.vehicle_id for a in alerts})
        veh_result = await db.execute(
            select(Vehicle.id, Vehicle.mileage).where(Vehicle.id.in_(vehicle_ids))
        )
        mileage_map: dict = {row.id: row.mileage for row in veh_result.all()}

        sent_count = 0
        for alert in alerts:
            current_mileage = mileage_map.get(alert.vehicle_id)
            fired = False
            mutated_conditions = list(alert.conditions)

            for i, cond in enumerate(mutated_conditions):
                ctype = cond.get("type")

                try:
                    if ctype == "date":
                        on_date = date.fromisoformat(cond["on"])
                        days_remaining = (on_date - today).days
                        if days_remaining in alert.email_days_before:
                            await _send_custom_alert_email(db, alert, days_remaining, None)
                            fired = True

                    elif ctype == "recurring":
                        next_due = date.fromisoformat(cond["next_due"])
                        days_remaining = (next_due - today).days
                        if days_remaining in alert.email_days_before:
                            await _send_custom_alert_email(db, alert, days_remaining, None)
                            fired = True
                        # Advance next_due once the date has passed.
                        if today >= next_due:
                            unit = cond.get("unit", "months")
                            every = int(cond.get("every", 1))
                            delta = (
                                relativedelta(months=every)
                                if unit == "months"
                                else relativedelta(years=every)
                            )
                            cond["last_fired"] = next_due.isoformat()
                            cond["next_due"] = (next_due + delta).isoformat()

                    elif ctype == "mileage" and current_mileage is not None:
                        threshold = int(cond["at"])
                        if not cond.get("fired") and (threshold - current_mileage) <= alert.miles_warning:
                            await _send_custom_alert_email(db, alert, None, threshold - current_mileage)
                            cond["fired"] = True
                            fired = True

                    elif ctype == "mileage_recurring" and current_mileage is not None:
                        next_due_mi = int(cond["next_due_mileage"])
                        gap = next_due_mi - current_mileage
                        if 0 <= gap <= alert.miles_warning:
                            await _send_custom_alert_email(db, alert, None, gap)
                            cond["last_fired_mileage"] = current_mileage
                            cond["next_due_mileage"] = next_due_mi + int(cond["every"])
                            fired = True

                except Exception:
                    log.exception("custom_alert_condition_error", alert_id=str(alert.id), condition_index=i)

                if fired and alert.condition_mode == "any":
                    break

            if fired:
                sent_count += 1
                await db.execute(
                    sa_update(CustomAlert)
                    .where(CustomAlert.id == alert.id)
                    .values(
                        conditions=mutated_conditions,
                        last_notified_at=datetime.now(timezone.utc),
                    )
                )

        await db.commit()
        log.info("custom_alert_dispatch_complete", sent=sent_count, scanned=len(alerts))


async def _send_custom_alert_email(
    db: Any,
    alert: Any,
    days_remaining: int | None,
    miles_remaining: int | None,
) -> None:
    from sqlalchemy import select

    from app.accounts.models.account import Account
    from app.accounts.models.user import User
    from app.integrations.resend_client import (
        build_custom_alert_content,
        build_email_html,
        send_notification_email,
    )
    from app.vehicles.models.vehicle import Vehicle

    # ~~~~~~~~~ Look up account owner email ~~~~~~~~~
    user_stmt = select(User).join(Account, Account.id == alert.account_id).limit(1)
    result = await db.execute(user_stmt)
    user = result.scalar_one_or_none()
    if user is None:
        return

    # ~~~~~~~~~ Look up vehicle registration ~~~~~~~~~
    veh_result = await db.execute(select(Vehicle).where(Vehicle.id == alert.vehicle_id))
    vehicle = veh_result.scalar_one_or_none()
    vehicle_reg = vehicle.registration if vehicle else None
    vehicle_label = (
        " ".join(filter(None, [vehicle.make, vehicle.model])) if vehicle else None
    )

    if days_remaining is not None:
        d = days_remaining
        subject = (
            f"SovCorE Auto — {alert.name}: "
            f"{d} day{'s' if d != 1 else ''} remaining"
        )
    else:
        gap = miles_remaining if miles_remaining is not None else 0
        subject = (
            f"SovCorE Auto — {alert.name}: "
            f"{gap:,} mile{'s' if gap != 1 else ''} remaining"
        )

    content = build_custom_alert_content(
        alert_name=alert.name,
        days_remaining=days_remaining,
        miles_remaining=miles_remaining,
        vehicle_reg=vehicle_reg,
        vehicle_label=vehicle_label,
    )
    await send_notification_email(
        to=user.email,
        subject=subject,
        html=build_email_html(content),
    )


async def _send_reminder(
    *,
    db: Any,
    reminder: Any,
    days_remaining: int | None,
    miles_remaining: int | None = None,
    settings: Any,
) -> None:
    from sqlalchemy import select

    from app.accounts.models.account import Account
    from app.accounts.models.user import User
    from app.integrations.resend_client import (
        build_email_html,
        build_reminder_content,
        build_custom_alert_content,
        send_notification_email,
    )
    from app.vehicles.models.vehicle import Vehicle

    # ~~~~~~~~~ Fetch the account owner email ~~~~~~~~~
    user_stmt = (
        select(User)
        .join(Account, Account.id == reminder.account_id)
        .limit(1)
    )
    result = await db.execute(user_stmt)
    user = result.scalar_one_or_none()
    if user is None:
        return

    # ~~~~~~~~~ Fetch vehicle registration ~~~~~~~~~
    veh_result = await db.execute(select(Vehicle).where(Vehicle.id == reminder.vehicle_id))
    vehicle = veh_result.scalar_one_or_none()
    vehicle_reg = vehicle.registration if vehicle else None
    vehicle_label = (
        " ".join(filter(None, [vehicle.make, vehicle.model])) if vehicle else None
    )

    reminder_type = reminder.type.replace("_", " ").title()

    if days_remaining is not None:
        # Date-based trigger — standard reminder email.
        due_date_str = reminder.due_date.strftime("%d %B %Y")
        d = days_remaining
        subject = (
            f"SovCorE Auto — {reminder_type} reminder: "
            f"{d} day{'s' if d != 1 else ''} remaining"
        )
        content = build_reminder_content(
            reminder_type=reminder_type,
            days_remaining=days_remaining,
            due_date_str=due_date_str,
            vehicle_reg=vehicle_reg,
            vehicle_label=vehicle_label,
        )
    else:
        # Mileage-based trigger — reuse custom-alert email style.
        gap = miles_remaining if miles_remaining is not None else 0
        subject = (
            f"SovCorE Auto — {reminder_type}: "
            f"{gap:,} mile{'s' if gap != 1 else ''} until due"
        )
        content = build_custom_alert_content(
            alert_name=f"{reminder_type} (mileage)",
            days_remaining=None,
            miles_remaining=miles_remaining,
            vehicle_reg=vehicle_reg,
            vehicle_label=vehicle_label,
        )

    await send_notification_email(
        to=user.email,
        subject=subject,
        html=build_email_html(content),
    )


# ==================================================
# MILEAGE LOG REMINDER JOB
# ==================================================


async def dispatch_mileage_log_reminders() -> None:
    """
    Sends a monthly prompt email asking fleet managers to log their mileage.
    Runs daily at 09:00 UTC and checks each account's configured reminder_day.
    The prompt fires on the configured day (default: 1st of the month) and a
    preview reminder fires the day before.
    Duplicate sends within the same calendar month are prevented by
    last_sent_month ("YYYY-MM").
    """
    from sqlalchemy import select, update as sa_update

    from app.accounts.models.account import Account
    from app.accounts.models.user import User
    from app.core.database import async_session_factory
    from app.integrations.resend_client import (
        build_email_html,
        build_mileage_log_reminder_content,
        send_notification_email,
    )
    from app.tasks.models.mileage_log_settings import MileageLogSettings

    today = date.today()
    current_month = today.strftime("%Y-%m")
    log = logger.bind(job="dispatch_mileage_log_reminders", date=today.isoformat())
    log.info("mileage_log_reminder_dispatch_started")

    async with async_session_factory() as db:
        result = await db.execute(
            select(MileageLogSettings).where(MileageLogSettings.active.is_(True))
        )
        settings_rows = list(result.scalars().all())

        sent_count = 0
        for settings in settings_rows:
            # Skip if already sent this month.
            if settings.last_sent_month == current_month:
                continue

            # Fire on the configured day OR the day before (advance notice).
            if today.day not in (settings.reminder_day, settings.reminder_day - 1):
                continue

            try:
                # Look up account owner email.
                user_result = await db.execute(
                    select(User)
                    .join(Account, Account.id == settings.account_id)
                    .limit(1)
                )
                user = user_result.scalar_one_or_none()
                if user is None:
                    continue

                is_day_before = today.day == settings.reminder_day - 1
                content = build_mileage_log_reminder_content(
                    month_label=today.strftime("%B %Y"),
                    is_preview=is_day_before,
                )
                subject = (
                    f"SovCorE Auto — Log your mileage tomorrow ({today.strftime('%B %Y')})"
                    if is_day_before
                    else f"SovCorE Auto — Log your mileage for {today.strftime('%B %Y')}"
                )
                await send_notification_email(
                    to=user.email,
                    subject=subject,
                    html=build_email_html(content),
                )

                # Only mark as sent on the actual reminder day, not the preview.
                if not is_day_before:
                    await db.execute(
                        sa_update(MileageLogSettings)
                        .where(MileageLogSettings.id == settings.id)
                        .values(last_sent_month=current_month)
                    )
                sent_count += 1
            except Exception:
                log.exception(
                    "mileage_log_reminder_send_failed",
                    account_id=str(settings.account_id),
                )

        await db.commit()
        log.info("mileage_log_reminder_dispatch_complete", sent=sent_count, scanned=len(settings_rows))
