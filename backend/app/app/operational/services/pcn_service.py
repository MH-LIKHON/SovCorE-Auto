# ============================================================
# backend/app/app/operational/services/pcn_service.py
# ============================================================
#
# Purpose:
#   Business logic for the PCN module. Thin service that wraps
#   the repository with 404 guards and schema mapping.
#
# Consumed by:
#   - backend/app/app/api/v1/operational.py
# ============================================================

import uuid

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.operational.repositories.pcn_repository import PCNRepository
from app.operational.schemas.pcn_schemas import (
    PCNCreateIn,
    PCNOut,
    PCNPage,
    PCNPatchIn,
)

# ==================================================
# SERVICE
# ==================================================


class PCNService:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db
        self._repo = PCNRepository(db)

    async def list(
        self,
        vehicle_id: uuid.UUID,
        account_id: uuid.UUID,
        page: int = 1,
        page_size: int = 50,
    ) -> PCNPage:
        rows, total = await self._repo.list_by_vehicle(
            vehicle_id, account_id, page=page, page_size=page_size
        )
        return PCNPage(
            items=[PCNOut.model_validate(r) for r in rows],
            total=total,
            page=page,
            page_size=page_size,
        )

    async def create(
        self,
        account_id: uuid.UUID,
        vehicle_id: uuid.UUID,
        data: PCNCreateIn,
    ) -> PCNOut:
        pcn = await self._repo.create(account_id, vehicle_id, data)
        return PCNOut.model_validate(pcn)

    async def patch(
        self,
        pcn_id: uuid.UUID,
        account_id: uuid.UUID,
        data: PCNPatchIn,
    ) -> PCNOut:
        pcn = await self._repo.get_by_id(pcn_id, account_id)
        if pcn is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="PCN not found.")
        updated = await self._repo.patch(pcn, data)
        return PCNOut.model_validate(updated)

    async def delete(self, pcn_id: uuid.UUID, account_id: uuid.UUID) -> None:
        pcn = await self._repo.get_by_id(pcn_id, account_id)
        if pcn is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="PCN not found.")
        await self._repo.delete(pcn)
