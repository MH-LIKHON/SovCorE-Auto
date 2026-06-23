# ============================================================
# backend/app/app/expenses/repositories/__init__.py
# ============================================================
#
# Purpose:
#   Re-exports the expense repository.
#
# Consumed by:
#   - backend/app/app/expenses/services/expense_service.py
# ============================================================

from app.expenses.repositories.expense_repository import ExpenseRepository

__all__ = ["ExpenseRepository"]
