# ============================================================
# backend/app/app/operational/repositories/warranty_repository.py
# ============================================================
#
# Purpose:
#   Database access layer for the warranties table.
#
# Consumed by:
#   - backend/app/app/operational/services/warranty_service.py
# ============================================================

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.operational.models.warranty import Warranty
from app.operational.schemas.warranty_schemas import WarrantyCreateIn, WarrantyPatchIn

# ==================================================
# REPOSITORY
# ==================================================


class WarrantyRepository:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    # ==================================================
    # READS
    # ==================================================

    async def list_by_vehicle(
        self,
        vehicle_id: uuid.UUID,
        account_id: uuid.UUID,
        page: int = 1,
        page_size: int = 50,
    ) -> tuple[list[Warranty], int]:
        count_stmt = (
            select(func.count())
            .select_from(Warranty)
            .where(
                Warranty.vehicle_id == vehicle_id,
                Warranty.account_id == account_id,
            )
        )
        total: int = (await self._db.execute(count_stmt)).scalar_one()

        stmt = (
            select(Warranty)
            .where(
                Warranty.vehicle_id == vehicle_id,
                Warranty.account_id == account_id,
            )
            # Soonest-to-expire first so the user sees the most urgent warranty.
            .order_by(Warranty.expiry_date.asc().nulls_last())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        rows = (await self._db.execute(stmt)).scalars().all()
        return list(rows), total

    async def get_by_id(
        self, warranty_id: uuid.UUID, account_id: uuid.UUID
    ) -> Warranty | None:
        stmt = select(Warranty).where(
            Warranty.id == warranty_id,
            Warranty.account_id == account_id,
        )
        return (await self._db.execute(stmt)).scalar_one_or_none()

    # ==================================================
    # WRITES
    # ==================================================

    async def create(
        self,
        account_id: uuid.UUID,
        vehicle_id: uuid.UUID,
        data: WarrantyCreateIn,
    ) -> Warranty:
        warranty = Warranty(
            account_id=account_id,
            vehicle_id=vehicle_id,
            **data.model_dump(),
        )
        self._db.add(warranty)
        await self._db.flush()
        await self._db.refresh(warranty)
        return warranty

    async def patch(self, warranty: Warranty, data: WarrantyPatchIn) -> Warranty:
        for field, value in data.model_dump(exclude_none=True).items():
            setattr(warranty, field, value)
        await self._db.flush()
        await self._db.refresh(warranty)
        return warranty

    async def delete(self, warranty: Warranty) -> None:
        await self._db.delete(warranty)
        await self._db.flush()
