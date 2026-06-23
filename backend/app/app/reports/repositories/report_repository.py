# ============================================================
# backend/app/app/reports/repositories/report_repository.py
# ============================================================
#
# Purpose:
#   Database queries for the reports domain. All queries are
#   scoped to an account (the tenant boundary) and cross every
#   vehicle in that account. Returns raw dicts so the service
#   layer can aggregate in Python without lazy-loading ORM objects.
#
# Design:
#   Three fetch methods map to the three report types: costs,
#   fuel, and maintenance. Each returns the minimum set of columns
#   needed for aggregation — no SELECT * that would pull unused data.
#
#   Fuel and maintenance rows are fetched with a JOIN to their
#   respective detail tables (fuel_details, maintenance_details).
#   Rows with no detail (i.e. the detail table has no matching row)
#   are excluded; the LEFT OUTER JOIN + WHERE IS NOT NULL pattern
#   is used so an incomplete record never silently contributes zero.
#
# Consumed by:
#   - backend/app/app/reports/services/report_service.py
# ============================================================

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.records.models.record import (
    FuelDetail,
    MaintenanceDetail,
    Record,
    RecordType,
)
from app.vehicles.models.vehicle import Vehicle

# ==================================================
# CONSTANTS
# ==================================================

# ------------------------------ Types excluded from the costs report --------
# Fuel has its own report. PCN and damage use separate tables (not records).
_COST_EXCLUDE = {RecordType.fuel}

# ==================================================
# REPOSITORY
# ==================================================


class ReportRepository:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    # ==================================================
    # COSTS — all expense records across all vehicles
    # ==================================================

    async def fetch_cost_rows(
        self, account_id: uuid.UUID
    ) -> list[dict[str, Any]]:
        """
        Return all non-fuel records for an account with vehicle info.
        Columns: vehicle_id, registration, make, model, year, date, type, cost.
        """
        stmt = (
            select(
                Record.vehicle_id,
                Vehicle.registration,
                Vehicle.make,
                Vehicle.model,
                Vehicle.year,
                Record.date,
                Record.type,
                Record.cost,
            )
            .join(Vehicle, Vehicle.id == Record.vehicle_id)
            .where(
                Record.account_id == account_id,
                Record.type.notin_(_COST_EXCLUDE),
            )
            .order_by(Record.date.asc())
        )
        result = await self._db.execute(stmt)
        return [dict(r) for r in result.mappings().all()]

    # ==================================================
    # FUEL — all fuel records with fill detail across all vehicles
    # ==================================================

    async def fetch_fuel_rows(
        self, account_id: uuid.UUID
    ) -> list[dict[str, Any]]:
        """
        Return all fuel fills (joined to fuel_details) for an account.
        Columns: vehicle_id, date, mileage, litres, price_per_litre, full_tank, cost.
        Rows where fuel_detail is absent are excluded via the WHERE clause.
        """
        stmt = (
            select(
                Record.vehicle_id,
                Record.date,
                Record.mileage,
                Record.cost,
                FuelDetail.litres,
                FuelDetail.price_per_litre,
                FuelDetail.full_tank,
            )
            .join(
                FuelDetail,
                FuelDetail.record_id == Record.id,
            )
            .where(
                Record.account_id == account_id,
                Record.type == RecordType.fuel,
            )
            .order_by(Record.vehicle_id, Record.date.asc())
        )
        result = await self._db.execute(stmt)
        return [dict(r) for r in result.mappings().all()]

    # ==================================================
    # MAINTENANCE — all maintenance/repair records with category
    # ==================================================

    async def fetch_maintenance_rows(
        self, account_id: uuid.UUID
    ) -> list[dict[str, Any]]:
        """
        Return all maintenance and repair records (joined to maintenance_details).
        Columns: date, type, cost, category.
        Rows without a detail row are excluded.
        """
        stmt = (
            select(
                Record.date,
                Record.type,
                Record.cost,
                MaintenanceDetail.category,
                MaintenanceDetail.labour_cost,
                MaintenanceDetail.parts_cost,
            )
            .join(
                MaintenanceDetail,
                MaintenanceDetail.record_id == Record.id,
            )
            .where(
                Record.account_id == account_id,
                Record.type.in_([RecordType.maintenance, RecordType.repair]),
            )
            .order_by(Record.date.asc())
        )
        result = await self._db.execute(stmt)
        return [dict(r) for r in result.mappings().all()]

    # ==================================================
    # VEHICLES — all active vehicles for the account
    # ==================================================

    async def fetch_vehicles(
        self, account_id: uuid.UUID
    ) -> list[dict[str, Any]]:
        """
        Return all vehicles for an account (active and archived alike,
        so the report covers the full history). Columns: id, registration,
        make, model, year.
        """
        stmt = (
            select(
                Vehicle.id,
                Vehicle.registration,
                Vehicle.make,
                Vehicle.model,
                Vehicle.year,
            )
            .where(Vehicle.account_id == account_id)
            .order_by(Vehicle.registration)
        )
        result = await self._db.execute(stmt)
        return [dict(r) for r in result.mappings().all()]
