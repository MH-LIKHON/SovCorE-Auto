# ============================================================
# backend/app/app/operational/repositories/damage_photo_repository.py
# ============================================================
#
# Purpose:
#   Database access layer for the damage_photos table. Supports
#   listing photos by entry, batch-listing for multiple entries
#   (used by list_damage to avoid N+1), get by ID, create, and
#   delete.
#
# Consumed by:
#   - backend/app/app/api/v1/operational.py
# ============================================================

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.operational.models.damage_photos import DamagePhoto

# ==================================================
# REPOSITORY
# ==================================================


class DamagePhotoRepository:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    # ==================================================
    # READS
    # ==================================================

    async def list_by_entry(
        self, entry_id: uuid.UUID, account_id: uuid.UUID
    ) -> list[DamagePhoto]:
        stmt = (
            select(DamagePhoto)
            .where(
                DamagePhoto.entry_id == entry_id,
                DamagePhoto.account_id == account_id,
            )
            .order_by(DamagePhoto.slot, DamagePhoto.display_order, DamagePhoto.created_at)
        )
        return list((await self._db.execute(stmt)).scalars().all())

    async def list_by_entries(
        self, entry_ids: list[uuid.UUID], account_id: uuid.UUID
    ) -> list[DamagePhoto]:
        if not entry_ids:
            return []
        stmt = (
            select(DamagePhoto)
            .where(
                DamagePhoto.entry_id.in_(entry_ids),
                DamagePhoto.account_id == account_id,
            )
            .order_by(DamagePhoto.slot, DamagePhoto.display_order, DamagePhoto.created_at)
        )
        return list((await self._db.execute(stmt)).scalars().all())

    async def get_by_id(
        self, photo_id: uuid.UUID, account_id: uuid.UUID
    ) -> DamagePhoto | None:
        stmt = select(DamagePhoto).where(
            DamagePhoto.id == photo_id,
            DamagePhoto.account_id == account_id,
        )
        return (await self._db.execute(stmt)).scalar_one_or_none()

    async def count_by_slot(self, entry_id: uuid.UUID, slot: str) -> int:
        stmt = (
            select(func.count())
            .select_from(DamagePhoto)
            .where(DamagePhoto.entry_id == entry_id, DamagePhoto.slot == slot)
        )
        return (await self._db.execute(stmt)).scalar_one()

    # ==================================================
    # WRITES
    # ==================================================

    async def create(
        self,
        entry_id: uuid.UUID,
        account_id: uuid.UUID,
        vehicle_id: uuid.UUID,
        slot: str,
        r2_key: str,
        display_order: int = 0,
    ) -> DamagePhoto:
        photo = DamagePhoto(
            entry_id=entry_id,
            account_id=account_id,
            vehicle_id=vehicle_id,
            slot=slot,
            r2_key=r2_key,
            display_order=display_order,
        )
        self._db.add(photo)
        await self._db.flush()
        await self._db.refresh(photo)
        return photo

    async def delete(self, photo: DamagePhoto) -> None:
        await self._db.delete(photo)
        await self._db.flush()
