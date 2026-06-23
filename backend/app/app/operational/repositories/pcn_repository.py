# ============================================================
# backend/app/app/operational/repositories/pcn_repository.py
# ============================================================
#
# Purpose:
#   Database access layer for the pcns table. Enforces account
#   scope on every read and write.
#
# Design:
#   list_by_vehicle returns a (rows, total) tuple compatible with
#   the platform page-envelope convention. Ordering is newest
#   first by date so the most recent PCN appears at the top.
#
# Consumed by:
#   - backend/app/app/operational/services/pcn_service.py
# ============================================================

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.operational.models.pcn import PCN
from app.operational.schemas.pcn_schemas import PCNCreateIn, PCNPatchIn

# ==================================================
# REPOSITORY
# ==================================================


class PCNRepository:
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
    ) -> tuple[list[PCN], int]:
        # ~~~~~~~~~ Count ~~~~~~~~~
        count_stmt = (
            select(func.count())
            .select_from(PCN)
            .where(PCN.vehicle_id == vehicle_id, PCN.account_id == account_id)
        )
        total: int = (await self._db.execute(count_stmt)).scalar_one()

        # ~~~~~~~~~ Rows ~~~~~~~~~
        stmt = (
            select(PCN)
            .where(PCN.vehicle_id == vehicle_id, PCN.account_id == account_id)
            .order_by(PCN.date.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        rows = (await self._db.execute(stmt)).scalars().all()
        return list(rows), total

    async def get_by_id(
        self, pcn_id: uuid.UUID, account_id: uuid.UUID
    ) -> PCN | None:
        stmt = select(PCN).where(PCN.id == pcn_id, PCN.account_id == account_id)
        return (await self._db.execute(stmt)).scalar_one_or_none()

    # ==================================================
    # WRITES
    # ==================================================

    async def create(
        self,
        account_id: uuid.UUID,
        vehicle_id: uuid.UUID,
        data: PCNCreateIn,
    ) -> PCN:
        pcn = PCN(
            account_id=account_id,
            vehicle_id=vehicle_id,
            **data.model_dump(),
        )
        self._db.add(pcn)
        await self._db.flush()
        await self._db.refresh(pcn)
        return pcn

    async def patch(self, pcn: PCN, data: PCNPatchIn) -> PCN:
        for field, value in data.model_dump(exclude_none=True).items():
            setattr(pcn, field, value)
        await self._db.flush()
        await self._db.refresh(pcn)
        return pcn

    async def delete(self, pcn: PCN) -> None:
        await self._db.delete(pcn)
        await self._db.flush()
