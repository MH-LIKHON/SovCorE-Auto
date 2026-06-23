# ============================================================
# backend/app/app/expenses/repositories/expense_repository.py
# ============================================================
#
# Purpose:
#   Queries the records table for expense-type rows and returns
#   raw dicts for the service layer to aggregate.
#
# Design:
#   Expense types are a subset of RecordType: insurance, tax, mot,
#   parking, cleaning, accessories, repair, and custom. Fuel,
#   maintenance, and diagnostics are handled by their own modules.
#   PCN and damage are operational modules with their own tables,
#   not tracked here.
#
# Consumed by:
#   - backend/app/app/expenses/services/expense_service.py
# ============================================================

import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.records.models.record import Record, RecordType

# ==================================================
# CONSTANTS
# ==================================================

# ------------------------------ Expense record types -----------------------
# These are the running-cost categories that appear on the expenses page.
# Fuel has its own module; PCN and damage have separate operational tables.
EXPENSE_TYPES = [
    RecordType.insurance,
    RecordType.tax,
    RecordType.mot,
    RecordType.parking,
    RecordType.cleaning,
    RecordType.accessories,
    RecordType.repair,
    RecordType.warranty,
    RecordType.custom,
]

# Human-readable labels for each type.
TYPE_LABELS: dict[str, str] = {
    "insurance":   "Insurance",
    "tax":         "Road tax",
    "mot":         "MOT",
    "parking":     "Parking",
    "cleaning":    "Cleaning",
    "accessories": "Accessories",
    "repair":      "Repairs",
    "warranty":    "Warranty",
    "custom":      "Other",
}

# ==================================================
# REPOSITORY
# ==================================================


class ExpenseRepository:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    # ==================================================
    # FETCH EXPENSE ROWS
    # ==================================================

    async def fetch_expenses(
        self, vehicle_id: uuid.UUID, account_id: uuid.UUID
    ) -> list[dict[str, Any]]:
        """
        Return all expense records for a vehicle, ordered by date ascending.
        Only fields needed for aggregation are selected.
        """
        stmt = (
            select(Record.id, Record.date, Record.type, Record.cost)
            .where(
                Record.vehicle_id == vehicle_id,
                Record.account_id == account_id,
                Record.type.in_(EXPENSE_TYPES),
            )
            .order_by(Record.date.asc())
        )
        result = await self._db.execute(stmt)
        rows = result.mappings().all()
        return [dict(r) for r in rows]
