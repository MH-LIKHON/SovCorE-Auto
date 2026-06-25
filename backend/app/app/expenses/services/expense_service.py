# ============================================================
# backend/app/app/expenses/services/expense_service.py
# ============================================================
#
# Purpose:
#   Aggregates expense records into totals by category and
#   monthly breakdowns. No new DB rows are written here.
#
# Design:
#   All aggregation happens in Python after a single DB query.
#   This avoids complex SQL GROUP BY logic that would be harder
#   to maintain and unit-test. The record counts per vehicle are
#   small enough (hundreds, not millions) that Python aggregation
#   is the correct choice.
#
# Consumed by:
#   - backend/app/app/api/v1/expenses.py
# ============================================================

from __future__ import annotations

import uuid
from collections import defaultdict
from datetime import date
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.expenses.repositories.expense_repository import ExpenseRepository, TYPE_LABELS
from app.expenses.schemas.expense_schemas import (
    CategoryTotal,
    ExpenseAnalyticsOut,
    MonthlyTotal,
)

# ==================================================
# SERVICE
# ==================================================


class ExpenseService:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db
        self._repo = ExpenseRepository(db)

    # ==================================================
    # ANALYTICS
    # ==================================================

    async def get_analytics(
        self, vehicle_id: uuid.UUID, account_id: uuid.UUID, year: int | None = None
    ) -> ExpenseAnalyticsOut:
        rows = await self._repo.fetch_expenses(vehicle_id, account_id)

        selected_year = year or date.today().year
        total_spend = 0
        annual_spend = 0
        oldest_year = date.today().year

        # ~~~~~~~~~ Category totals ~~~~~~~~~
        cat_spend: dict[str, int] = defaultdict(int)
        cat_count: dict[str, int] = defaultdict(int)

        # ~~~~~~~~~ Monthly breakdown (Jan-Dec for selected year) ~~~~~~~~~
        months: list[str] = [f"{selected_year:04d}-{m:02d}" for m in range(1, 13)]
        monthly_bucket: dict[str, int] = {m: 0 for m in months}

        for row in rows:
            cost: int = row["cost"] or 0
            record_type: str = row["type"].value if hasattr(row["type"], "value") else str(row["type"])
            row_date: date = row["date"]

            if row_date.year < oldest_year:
                oldest_year = row_date.year

            total_spend += cost

            if row_date.year == selected_year:
                annual_spend += cost

            cat_spend[record_type] += cost
            cat_count[record_type] += 1

            label = f"{row_date.year:04d}-{row_date.month:02d}"
            if label in monthly_bucket:
                monthly_bucket[label] += cost

        # ~~~~~~~~~ Build by_category list, sorted by spend descending ~~~~~~~~~
        by_category = [
            CategoryTotal(
                record_type=rt,
                label=TYPE_LABELS.get(rt, rt.capitalize()),
                total_pence=cat_spend[rt],
                count=cat_count[rt],
            )
            for rt in sorted(cat_spend, key=lambda k: cat_spend[k], reverse=True)
        ]

        monthly = [
            MonthlyTotal(month=m, total_pence=monthly_bucket[m]) for m in months
        ]

        return ExpenseAnalyticsOut(
            total_spend_pence=total_spend,
            annual_spend_pence=annual_spend,
            by_category=by_category,
            monthly=monthly,
            oldest_year=oldest_year,
        )
