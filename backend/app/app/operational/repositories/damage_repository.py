# ============================================================
# backend/app/app/operational/repositories/damage_repository.py
# ============================================================
#
# Purpose:
#   Database access layer for the damage_entries table.
#
# Consumed by:
#   - backend/app/app/operational/services/damage_service.py
# ============================================================

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.operational.models.damage import DamageEntry
from app.operational.schemas.damage_schemas import DamageCreateIn, DamagePatchIn

# ==================================================
# REPOSITORY
# ==================================================


class DamageRepository:
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
    ) -> tuple[list[DamageEntry], int]:
        count_stmt = (
            select(func.count())
            .select_from(DamageEntry)
            .where(
                DamageEntry.vehicle_id == vehicle_id,
                DamageEntry.account_id == account_id,
            )
        )
        total: int = (await self._db.execute(count_stmt)).scalar_one()

        stmt = (
            select(DamageEntry)
            .where(
                DamageEntry.vehicle_id == vehicle_id,
                DamageEntry.account_id == account_id,
            )
            .order_by(DamageEntry.date.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        rows = (await self._db.execute(stmt)).scalars().all()
        return list(rows), total

    async def get_by_id(
        self, entry_id: uuid.UUID, account_id: uuid.UUID
    ) -> DamageEntry | None:
        stmt = select(DamageEntry).where(
            DamageEntry.id == entry_id,
            DamageEntry.account_id == account_id,
        )
        return (await self._db.execute(stmt)).scalar_one_or_none()

    # ==================================================
    # WRITES
    # ==================================================

    async def create(
        self,
        account_id: uuid.UUID,
        vehicle_id: uuid.UUID,
        data: DamageCreateIn,
    ) -> DamageEntry:
        entry = DamageEntry(
            account_id=account_id,
            vehicle_id=vehicle_id,
            **data.model_dump(),
        )
        self._db.add(entry)
        await self._db.flush()
        await self._db.refresh(entry)
        return entry

    async def patch(self, entry: DamageEntry, data: DamagePatchIn) -> DamageEntry:
        for field, value in data.model_dump(exclude_none=True).items():
            setattr(entry, field, value)
        await self._db.flush()
        await self._db.refresh(entry)
        return entry

    async def delete(self, entry: DamageEntry) -> None:
        await self._db.delete(entry)
        await self._db.flush()
