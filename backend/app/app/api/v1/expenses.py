# ============================================================
# backend/app/app/api/v1/expenses.py
# ============================================================
#
# Purpose:
#   REST endpoint for running-cost analytics per vehicle.
#   Returns totals by expense category and a 12-month breakdown.
#
# Design:
#   A single GET endpoint is sufficient; no writes happen here.
#   The underlying data is the records table filtered to expense
#   types — this endpoint is a read-only projection.
#
# Consumed by:
#   - backend/app/app/api/v1/router.py
# ============================================================

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.accounts.models.user import User
from app.core.database import get_db
from app.core.permissions import require_viewer
from app.expenses.schemas.expense_schemas import ExpenseAnalyticsOut
from app.expenses.services.expense_service import ExpenseService

# ==================================================
# ROUTER
# ==================================================

router = APIRouter()

# ==================================================
# EXPENSES ENDPOINTS
# ==================================================


@router.get(
    "/accounts/{account_id}/vehicles/{vehicle_id}/expenses",
    response_model=ExpenseAnalyticsOut,
    summary="Running-cost analytics for a vehicle",
)
async def get_expenses(
    account_id: uuid.UUID,
    vehicle_id: uuid.UUID,
    _: User = Depends(require_viewer),
    db: AsyncSession = Depends(get_db),
) -> ExpenseAnalyticsOut:
    return await ExpenseService(db).get_analytics(vehicle_id, account_id)
