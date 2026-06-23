# ============================================================
# backend/app/app/fuel/repositories/fuel_repository.py
# ============================================================
#
# Purpose:
#   Database queries for fuel analytics. Joins the records table
#   to fuel_details, filters by vehicle and account, and returns
#   the raw rows that the service layer aggregates.
#
# Design:
#   The repository returns plain dicts rather than ORM models so
#   the service can iterate cheaply without triggering lazy loads.
#   All rows are ordered by date ascending so the MPG delta
#   calculation in the service can proceed in a single pass.
#
#   Fuel records without a matching fuel_details row are excluded
#   via INNER JOIN; that state should not exist after Phase 3 but
#   the guard keeps the analytics clean.
#
# Consumed by:
#   - backend/app/app/fuel/services/fuel_service.py
# ============================================================

import uuid
from typing import Any

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.records.models.record import FuelDetail, Record, RecordType

# ==================================================
# REPOSITORY
# ==================================================


class FuelRepository:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    # ==================================================
    # FETCH FILLS
    # ==================================================

    async def fetch_fills(
        self, vehicle_id: uuid.UUID, account_id: uuid.UUID
    ) -> list[dict[str, Any]]:
        """
        Return all fuel records for a vehicle, joined to fuel_details,
        ordered by date ascending.
        """
        # ~~~~~~~~~ Build joined query ~~~~~~~~~
        stmt = (
            select(
                Record.id,
                Record.date,
                Record.mileage,
                Record.cost,
                FuelDetail.litres,
                FuelDetail.price_per_litre,
                FuelDetail.station,
                FuelDetail.full_tank,
            )
            .join(FuelDetail, FuelDetail.record_id == Record.id)
            .where(
                Record.vehicle_id == vehicle_id,
                Record.account_id == account_id,
                Record.type == RecordType.fuel,
            )
            .order_by(Record.date.asc())
        )
        result = await self._db.execute(stmt)
        rows = result.mappings().all()
        return [dict(r) for r in rows]
