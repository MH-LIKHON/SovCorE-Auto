# ============================================================
# backend/app/app/mileage/services/mileage_service.py
# ============================================================
#
# Purpose:
#   Analytics computation for the odometer module. Reads ALL
#   records that carry an odometer value (fuel fills, repairs,
#   dedicated odometer logs, etc.), ordered oldest-first, and
#   derives current odometer, annual distance, monthly average,
#   and a month-by-month history for charting.
#
# Design:
#   Any record with a non-null mileage column is treated as an
#   odometer reading at that date. Per month, the highest reading
#   recorded is used. Miles driven = delta between consecutive
#   monthly peaks. The first reading has no predecessor, so
#   miles_this_month is None for that entry.
#
#   Annual mileage is the sum of monthly deltas where both the
#   start and end readings fall within the selected year.
#
#   Monthly average uses the last 12 completed months to smooth
#   out outlier months (e.g. a vehicle that sat idle in January).
#
# Consumed by:
#   - backend/app/app/api/v1/mileage.py
# ============================================================

from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.mileage.schemas.mileage_schemas import (
    MileageAnalyticsOut,
    MileageLogSettingsOut,
    MileageLogSettingsPatchIn,
    MonthlyMileage,
)
from app.records.models.record import Record
from app.tasks.models.mileage_log_settings import MileageLogSettings

# ==================================================
# SERVICE
# ==================================================


class MileageService:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    # ==================================================
    # ANALYTICS
    # ==================================================

    async def get_analytics(
        self,
        vehicle_id: uuid.UUID,
        account_id: uuid.UUID,
        year: int | None = None,
    ) -> MileageAnalyticsOut:
        selected_year = year or date.today().year

        # ~~~~~~~~~ Fetch all records with an odometer reading, oldest first ~~~~~~~~~
        # Any record type (fuel, repair, dedicated odometer log, etc.) that
        # carries a mileage value is valid evidence of the vehicle's position
        # on the odometer at that date.
        result = await self._db.execute(
            select(Record)
            .where(
                and_(
                    Record.vehicle_id == vehicle_id,
                    Record.account_id == account_id,
                    Record.mileage.is_not(None),
                )
            )
            .order_by(Record.date.asc(), Record.created_at.asc())
        )
        rows = list(result.scalars().all())

        total_logs = len(rows)
        if total_logs == 0:
            return MileageAnalyticsOut(
                total_logs=0,
                current_mileage=None,
                annual_mileage=None,
                monthly_avg=None,
                last_logged_date=None,
                monthly_history=[],
                oldest_year=selected_year,
            )

        # ~~~~~~~~~ Build ordered (date, mileage) pairs ~~~~~~~~~
        points: list[tuple[date, int]] = [(r.date, r.mileage) for r in rows]  # type: ignore[misc]
        current_mileage = points[-1][1]
        last_logged_date = points[-1][0]
        oldest_year = points[0][0].year

        # ~~~~~~~~~ Build per-log deltas ~~~~~~~~~
        deltas: list[tuple[date, int, int | None]] = []
        for i, (d, odo) in enumerate(points):
            if i == 0:
                deltas.append((d, odo, None))
            else:
                prev_odo = points[i - 1][1]
                diff = odo - prev_odo
                deltas.append((d, odo, max(diff, 0)))

        # ~~~~~~~~~ Monthly history (group by YYYY-MM, latest reading per month) ~~~~~~~~~
        # Use the last odometer reading recorded in each month as that month's value.
        month_to_last: dict[str, tuple[date, int]] = {}
        for d, odo, _ in deltas:
            key = f"{d.year:04d}-{d.month:02d}"
            if key not in month_to_last or d > month_to_last[key][0]:
                month_to_last[key] = (d, odo)

        sorted_months = sorted(month_to_last.keys())
        monthly_history: list[MonthlyMileage] = []
        for i, month_key in enumerate(sorted_months):
            _, odo = month_to_last[month_key]
            if i == 0:
                miles = None
            else:
                prev_odo = month_to_last[sorted_months[i - 1]][1]
                miles = max(odo - prev_odo, 0)
            monthly_history.append(MonthlyMileage(month=month_key, odometer=odo, miles_this_month=miles))

        # ~~~~~~~~~ Annual mileage (selected year) ~~~~~~~~~
        annual_mileage = sum(
            m.miles_this_month
            for m in monthly_history
            if m.miles_this_month is not None and m.month.startswith(str(selected_year))
        )
        annual_mileage_out: int | None = annual_mileage if annual_mileage > 0 else None

        # ~~~~~~~~~ Monthly average (last 12 months with delta data) ~~~~~~~~~
        qualifying = [m.miles_this_month for m in monthly_history[-12:] if m.miles_this_month is not None]
        monthly_avg_out: int | None = round(sum(qualifying) / len(qualifying)) if qualifying else None

        return MileageAnalyticsOut(
            total_logs=total_logs,
            current_mileage=current_mileage,
            annual_mileage=annual_mileage_out,
            monthly_avg=monthly_avg_out,
            last_logged_date=last_logged_date,
            monthly_history=monthly_history,
            oldest_year=oldest_year,
        )

    # ==================================================
    # MILEAGE LOG SETTINGS
    # ==================================================

    async def get_settings(self, account_id: uuid.UUID) -> MileageLogSettingsOut:
        settings = await self._get_or_create_settings(account_id)
        return MileageLogSettingsOut.model_validate(settings)

    async def patch_settings(
        self, account_id: uuid.UUID, data: MileageLogSettingsPatchIn
    ) -> MileageLogSettingsOut:
        settings = await self._get_or_create_settings(account_id)
        if data.reminder_day is not None:
            if not (1 <= data.reminder_day <= 28):
                from fastapi import HTTPException, status
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="reminder_day must be between 1 and 28.",
                )
            settings.reminder_day = data.reminder_day
        if data.active is not None:
            settings.active = data.active
        await self._db.flush()
        return MileageLogSettingsOut.model_validate(settings)

    # ------------------------------ Private helpers -------------------------

    async def _get_or_create_settings(self, account_id: uuid.UUID) -> MileageLogSettings:
        result = await self._db.execute(
            select(MileageLogSettings).where(MileageLogSettings.account_id == account_id)
        )
        settings = result.scalar_one_or_none()
        if settings is None:
            settings = MileageLogSettings(account_id=account_id)
            self._db.add(settings)
            await self._db.flush()
        return settings
