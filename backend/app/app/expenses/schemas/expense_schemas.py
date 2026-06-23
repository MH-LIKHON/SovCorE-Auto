# ============================================================
# backend/app/app/expenses/schemas/expense_schemas.py
# ============================================================
#
# Purpose:
#   Pydantic response schemas for the running-cost (expenses)
#   analytics endpoint. All monetary values are in pence.
#
# Design:
#   CategoryTotal carries the spend for one record type so the
#   frontend can render a category breakdown without summing.
#
#   MonthlyTotal carries the month label and the combined spend
#   for all expense categories in that month.
#
# Consumed by:
#   - backend/app/app/expenses/services/expense_service.py
#   - backend/app/app/api/v1/expenses.py
# ============================================================

from __future__ import annotations

from pydantic import BaseModel

# ==================================================
# SUB-TYPES
# ==================================================


class CategoryTotal(BaseModel):
    record_type: str
    label: str
    total_pence: int
    count: int


class MonthlyTotal(BaseModel):
    month: str       # YYYY-MM
    total_pence: int


# ==================================================
# ANALYTICS RESPONSE
# ==================================================


class ExpenseAnalyticsOut(BaseModel):
    total_spend_pence: int
    annual_spend_pence: int        # current calendar year
    by_category: list[CategoryTotal]
    monthly: list[MonthlyTotal]    # last 12 months, ascending
