# ============================================================
# backend/app/app/expenses/schemas/__init__.py
# ============================================================
#
# Purpose:
#   Re-exports expense schema types.
#
# Consumed by:
#   - backend/app/app/api/v1/expenses.py
# ============================================================

from app.expenses.schemas.expense_schemas import ExpenseAnalyticsOut

__all__ = ["ExpenseAnalyticsOut"]
