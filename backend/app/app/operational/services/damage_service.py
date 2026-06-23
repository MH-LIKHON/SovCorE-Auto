# ============================================================
# backend/app/app/operational/services/damage_service.py
# ============================================================
#
# Purpose:
#   Business logic for the damage history module.
#
# Consumed by:
#   - backend/app/app/api/v1/operational.py
# ============================================================

import uuid

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.operational.repositories.damage_repository import DamageRepository
from app.operational.schemas.damage_schemas import (
    DamageCreateIn,
    DamageOut,
    DamagePage,
    DamagePatchIn,
)

# ==================================================
# SERVICE
# ==================================================


class DamageService:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db
        self._repo = DamageRepository(db)

    async def list(
        self,
        vehicle_id: uuid.UUID,
        account_id: uuid.UUID,
        page: int = 1,
        page_size: int = 50,
    ) -> DamagePage:
        rows, total = await self._repo.list_by_vehicle(
            vehicle_id, account_id, page=page, page_size=page_size
        )
        return DamagePage(
            items=[DamageOut.model_validate(r) for r in rows],
            total=total,
            page=page,
            page_size=page_size,
        )

    async def create(
        self,
        account_id: uuid.UUID,
        vehicle_id: uuid.UUID,
        data: DamageCreateIn,
    ) -> DamageOut:
        entry = await self._repo.create(account_id, vehicle_id, data)
        return DamageOut.model_validate(entry)

    async def patch(
        self,
        entry_id: uuid.UUID,
        account_id: uuid.UUID,
        data: DamagePatchIn,
    ) -> DamageOut:
        entry = await self._repo.get_by_id(entry_id, account_id)
        if entry is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Damage entry not found."
            )
        updated = await self._repo.patch(entry, data)
        return DamageOut.model_validate(updated)

    async def delete(self, entry_id: uuid.UUID, account_id: uuid.UUID) -> None:
        entry = await self._repo.get_by_id(entry_id, account_id)
        if entry is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Damage entry not found."
            )
        await self._repo.delete(entry)
