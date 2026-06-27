# ============================================================
# backend/app/app/vehicles/repositories/vehicle_media_repository.py
# ============================================================
#
# Purpose:
#   Database access layer for the vehicle_media table.
#
# Consumed by:
#   - backend/app/app/api/v1/media.py
# ============================================================

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.vehicles.models.vehicle_media import VehicleMedia

# ==================================================
# REPOSITORY
# ==================================================


class VehicleMediaRepository:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    # ==================================================
    # READS
    # ==================================================

    async def list_by_vehicle(
        self,
        vehicle_id: uuid.UUID,
        account_id: uuid.UUID,
    ) -> tuple[list[VehicleMedia], int]:
        count_stmt = (
            select(func.count())
            .select_from(VehicleMedia)
            .where(
                VehicleMedia.vehicle_id == vehicle_id,
                VehicleMedia.account_id == account_id,
            )
        )
        total: int = (await self._db.execute(count_stmt)).scalar_one()

        stmt = (
            select(VehicleMedia)
            .where(
                VehicleMedia.vehicle_id == vehicle_id,
                VehicleMedia.account_id == account_id,
            )
            .order_by(VehicleMedia.display_order.asc(), VehicleMedia.created_at.asc())
        )
        rows = (await self._db.execute(stmt)).scalars().all()
        return list(rows), total

    async def get_by_id(
        self,
        media_id: uuid.UUID,
        account_id: uuid.UUID,
    ) -> VehicleMedia | None:
        stmt = select(VehicleMedia).where(
            VehicleMedia.id == media_id,
            VehicleMedia.account_id == account_id,
        )
        return (await self._db.execute(stmt)).scalar_one_or_none()

    # ==================================================
    # WRITES
    # ==================================================

    async def create(
        self,
        account_id: uuid.UUID,
        vehicle_id: uuid.UUID,
        r2_key: str,
    ) -> VehicleMedia:
        item = VehicleMedia(
            account_id=account_id,
            vehicle_id=vehicle_id,
            r2_key=r2_key,
        )
        self._db.add(item)
        await self._db.flush()
        await self._db.refresh(item)
        return item

    async def delete(self, item: VehicleMedia) -> None:
        await self._db.delete(item)
        await self._db.flush()
