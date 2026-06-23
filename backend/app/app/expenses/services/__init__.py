# ============================================================
# backend/app/app/expenses/services/__init__.py
# ============================================================
#
# Purpose:
#   Re-exports the expense service.
#
# Consumed by:
#   - backend/app/app/api/v1/expenses.py
# ============================================================

from app.expenses.services.expense_service import ExpenseService

__all__ = ["ExpenseService"]
