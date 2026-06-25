# ============================================================
# backend/app/app/fuel/services/fuel_service.py
# ============================================================
#
# Purpose:
#   Analytics computation for the fuel module. Reads fill rows
#   from the repository and returns a FuelAnalyticsOut summary.
#
# Design:
#   MPG algorithm:
#     - Only consecutive full-tank fills can give an accurate MPG
#       reading. A partial fill is excluded from the delta because
#       the tank was not topped up, so the distance covered per
#       litre cannot be known.
#     - For each pair of sequential full-tank fills where both
#       have a mileage reading, miles_driven = mileage[n] -
#       mileage[n-1] and litres_used = litres[n]. MPG for that
#       segment = miles / (litres / 4.54609). The average across
#       all valid segments is the vehicle's mean fuel economy.
#
#   Cost per mile:
#     - Total spend divided by total miles recorded across all
#       full-tank fill pairs. Only pairs with mileage data count.
#
#   Monthly breakdown:
#     - Aggregated from the fill list in Python for the last 12
#       calendar months (current month inclusive), ascending.
#
# Consumed by:
#   - backend/app/app/api/v1/fuel.py
# ============================================================

from __future__ import annotations

import uuid
from datetime import date, timezone
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.fuel.repositories.fuel_repository import FuelRepository
from app.fuel.schemas.fuel_schemas import (
    FuelAnalyticsOut,
    FuelFillOut,
    MonthlySpend,
)

# ==================================================
# CONSTANTS
# ==================================================

# ------------------------------ Unit conversion ----------------------------
# One Imperial gallon = 4.54609 litres (BIPM definition).
_LITRES_PER_GALLON = Decimal("4.54609")

# ==================================================
# SERVICE
# ==================================================


class FuelService:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db
        self._repo = FuelRepository(db)

    # ==================================================
    # ANALYTICS
    # ==================================================

    async def get_analytics(
        self, vehicle_id: uuid.UUID, account_id: uuid.UUID, year: int | None = None
    ) -> FuelAnalyticsOut:
        rows = await self._repo.fetch_fills(vehicle_id, account_id)
        selected_year = year or date.today().year

        # ~~~~~~~~~ Build FuelFillOut list ~~~~~~~~~
        fills: list[FuelFillOut] = [
            FuelFillOut(
                record_id=str(r["id"]),
                date=r["date"],
                mileage=r["mileage"],
                litres=r["litres"],
                price_per_litre_pence=r["price_per_litre"],
                station=r["station"],
                full_tank=r["full_tank"],
                cost_pence=r["cost"],
            )
            for r in rows
        ]

        # ~~~~~~~~~ Aggregate totals ~~~~~~~~~
        total_fills = len(fills)
        full_tank_fills = sum(1 for f in fills if f.full_tank)
        total_litres = sum((f.litres for f in fills), Decimal("0"))
        total_spend_pence = sum(f.cost_pence or 0 for f in fills)

        # ~~~~~~~~~ Annual spend (selected year) ~~~~~~~~~
        annual_spend_pence = sum(
            f.cost_pence or 0 for f in fills if f.date.year == selected_year
        )

        # ~~~~~~~~~ Oldest year with any fill (for year dropdown range) ~~~~~~~~~
        oldest_year = min((f.date.year for f in fills), default=selected_year)

        # ~~~~~~~~~ Monthly breakdown (Jan-Dec for selected year) ~~~~~~~~~
        monthly_spend = self._monthly_breakdown(fills, selected_year)

        # ~~~~~~~~~ MPG and cost per mile ~~~~~~~~~
        avg_mpg, cost_per_mile_pence = self._compute_efficiency(fills)

        return FuelAnalyticsOut(
            total_fills=total_fills,
            full_tank_fills=full_tank_fills,
            total_litres=total_litres,
            total_spend_pence=total_spend_pence,
            annual_spend_pence=annual_spend_pence,
            monthly_spend=monthly_spend,
            avg_mpg=avg_mpg,
            cost_per_mile_pence=cost_per_mile_pence,
            fills=list(reversed(fills)),  # reverse to show newest fill first on the page
            oldest_year=oldest_year,
        )

    # ==================================================
    # PRIVATE HELPERS
    # ==================================================

    # ------------------------------ Monthly breakdown -----------------------

    @staticmethod
    def _monthly_breakdown(fills: list[FuelFillOut], year: int) -> list[MonthlySpend]:
        """Return spend totals for Jan-Dec of the given year."""
        months = [f"{year:04d}-{m:02d}" for m in range(1, 13)]
        bucket: dict[str, int] = {m: 0 for m in months}
        for fill in fills:
            label = f"{fill.date.year:04d}-{fill.date.month:02d}"
            if label in bucket:
                bucket[label] += fill.cost_pence or 0
        return [MonthlySpend(month=m, total_pence=bucket[m]) for m in months]

    # ------------------------------ MPG computation -------------------------

    @staticmethod
    def _compute_efficiency(
        fills: list[FuelFillOut],
    ) -> tuple[float | None, float | None]:
        """
        Walk consecutive full-tank fills with mileage data and compute the
        mean MPG and cost per mile across all valid segments.

        Returns (avg_mpg, cost_per_mile_pence). Both are None when fewer
        than two qualifying consecutive fills are available.
        """
        mpg_segments: list[float] = []
        total_miles = 0.0
        total_pence = 0

        prev: FuelFillOut | None = None
        for fill in fills:
            if not fill.full_tank or fill.mileage is None:
                # Reset the chain: a partial fill breaks the MPG calculation.
                if not fill.full_tank:
                    prev = None
                continue
            if prev is not None and prev.mileage is not None:
                miles = fill.mileage - prev.mileage
                if miles > 0:
                    gallons = float(fill.litres / _LITRES_PER_GALLON)
                    mpg = miles / gallons
                    mpg_segments.append(mpg)
                    total_miles += miles
                    total_pence += fill.cost_pence or 0
            prev = fill

        if not mpg_segments:
            return None, None

        avg_mpg = sum(mpg_segments) / len(mpg_segments)
        cost_per_mile = total_pence / total_miles if total_miles > 0 else None
        return round(avg_mpg, 1), round(cost_per_mile, 1) if cost_per_mile else None
