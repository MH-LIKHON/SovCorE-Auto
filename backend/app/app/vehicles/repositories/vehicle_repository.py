# ============================================================
# backend/app/app/vehicles/repositories/vehicle_repository.py
# ============================================================
#
# Purpose:
#   Database access layer for the vehicles domain. All queries
#   are filtered by account_id so cross-tenant data access is
#   not possible at the repository level.
#
# Design:
#   Every write operation that creates a Vehicle also creates a
#   companion VehicleRenewal and VehicleOwnership row in the
#   same transaction. This ensures the card list can always
#   join to renewals without a null-check.
#
#   list_by_account excludes sold, scrapped and archived vehicles
#   by default (include_inactive=False). The vehicle profile and
#   a future "archive" view pass include_inactive=True.
#
# Consumed by:
#   - backend/app/app/vehicles/services/vehicle_service.py
# ============================================================

import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.vehicles.models.vehicle import (
    LifecycleState,
    Vehicle,
    VehicleOwnership,
    VehicleRenewal,
)
from app.vehicles.schemas.vehicle_schemas import (
    VehicleCreateIn,
    VehicleOwnershipPatchIn,
    VehiclePatchIn,
    VehicleRenewalPutIn,
)

# ==================================================
# VEHICLE REPOSITORY
# ==================================================


class VehicleRepository:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    # ==================================================
    # VEHICLE CRUD
    # ==================================================

    # ------------------------------ Create ----------------------------------

    async def create(self, account_id: uuid.UUID, data: VehicleCreateIn) -> Vehicle:
        vehicle = Vehicle(
            account_id=account_id,
            registration=data.registration,
            vin=data.vin,
            make=data.make,
            model=data.model,
            variant=data.variant,
            year=data.year,
            engine=data.engine,
            fuel_type=data.fuel_type,
            transmission=data.transmission,
            body_type=data.body_type,
            colour=data.colour,
            doors=data.doors,
            seats=data.seats,
            horsepower=data.horsepower,
            torque=data.torque,
            emission_class=data.emission_class,
            tyre_sizes=data.tyre_sizes,
            battery_size=data.battery_size,
            wheel_sizes=data.wheel_sizes,
            mileage=data.mileage,
            lifecycle_state=LifecycleState.active,
        )
        self._db.add(vehicle)
        await self._db.flush()  # populate vehicle.id before creating child rows

        # ~~~~~~~~~ Companion renewal and ownership rows ~~~~~~~~~
        # Created eagerly so every card list query finds a renewal row;
        # no nullable join needed.
        self._db.add(VehicleRenewal(vehicle_id=vehicle.id))
        self._db.add(VehicleOwnership(vehicle_id=vehicle.id))
        await self._db.flush()

        return await self._get_with_relations(vehicle.id)  # type: ignore[return-value]

    # ------------------------------ Get by ID -------------------------------

    async def get_by_id(
        self, vehicle_id: uuid.UUID, account_id: uuid.UUID
    ) -> Vehicle | None:
        return await self._get_with_relations(vehicle_id, account_id)

    # ------------------------------ List ------------------------------------

    async def list_by_account(
        self, account_id: uuid.UUID, *, include_inactive: bool = False
    ) -> list[Vehicle]:
        stmt = (
            select(Vehicle)
            .where(Vehicle.account_id == account_id)
            .options(selectinload(Vehicle.renewal))
        )
        if not include_inactive:
            stmt = stmt.where(Vehicle.lifecycle_state == LifecycleState.active)
        result = await self._db.execute(stmt)
        return list(result.scalars().all())

    # ------------------------------ Patch -----------------------------------

    async def patch(self, vehicle: Vehicle, data: VehiclePatchIn) -> Vehicle:
        update = data.model_dump(exclude_unset=True)
        for field, value in update.items():
            setattr(vehicle, field, value)
        vehicle.updated_at = datetime.now(timezone.utc)
        self._db.add(vehicle)
        await self._db.flush()
        return vehicle

    # ------------------------------ Delete ----------------------------------

    async def delete(self, vehicle: Vehicle) -> None:
        await self._db.delete(vehicle)
        await self._db.flush()

    # ==================================================
    # RENEWAL CRUD
    # ==================================================

    # ------------------------------ Get renewal -----------------------------

    async def get_renewal(
        self, vehicle_id: uuid.UUID, account_id: uuid.UUID
    ) -> VehicleRenewal | None:
        stmt = (
            select(VehicleRenewal)
            .join(Vehicle, VehicleRenewal.vehicle_id == Vehicle.id)
            .where(VehicleRenewal.vehicle_id == vehicle_id)
            .where(Vehicle.account_id == account_id)
        )
        result = await self._db.execute(stmt)
        return result.scalar_one_or_none()

    # ------------------------------ Put renewal -----------------------------

    async def put_renewal(
        self, renewal: VehicleRenewal, data: VehicleRenewalPutIn
    ) -> VehicleRenewal:
        renewal.mot_expiry = data.mot_expiry
        renewal.tax_due_date = data.tax_due_date
        renewal.insurance_expiry = data.insurance_expiry
        renewal.service_due_date = data.service_due_date
        renewal.service_due_mileage = data.service_due_mileage
        renewal.updated_at = datetime.now(timezone.utc)
        self._db.add(renewal)
        await self._db.flush()
        return renewal

    # ==================================================
    # OWNERSHIP CRUD
    # ==================================================

    # ------------------------------ Get ownership ---------------------------

    async def get_ownership(
        self, vehicle_id: uuid.UUID, account_id: uuid.UUID
    ) -> VehicleOwnership | None:
        stmt = (
            select(VehicleOwnership)
            .join(Vehicle, VehicleOwnership.vehicle_id == Vehicle.id)
            .where(VehicleOwnership.vehicle_id == vehicle_id)
            .where(Vehicle.account_id == account_id)
        )
        result = await self._db.execute(stmt)
        return result.scalar_one_or_none()

    # ------------------------------ Patch ownership -------------------------

    async def patch_ownership(
        self, ownership: VehicleOwnership, data: VehicleOwnershipPatchIn
    ) -> VehicleOwnership:
        update = data.model_dump(exclude_unset=True)
        for field, value in update.items():
            setattr(ownership, field, value)
        self._db.add(ownership)
        await self._db.flush()
        return ownership

    # ==================================================
    # PRIVATE HELPERS
    # ==================================================

    async def _get_with_relations(
        self, vehicle_id: uuid.UUID, account_id: uuid.UUID | None = None
    ) -> Vehicle | None:
        stmt = (
            select(Vehicle)
            .where(Vehicle.id == vehicle_id)
            .options(
                selectinload(Vehicle.renewal),
                selectinload(Vehicle.ownership),
                selectinload(Vehicle.previous_owners),
            )
        )
        if account_id is not None:
            stmt = stmt.where(Vehicle.account_id == account_id)
        result = await self._db.execute(stmt)
        return result.scalar_one_or_none()
