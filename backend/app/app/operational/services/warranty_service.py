# ============================================================
# backend/app/app/operational/services/warranty_service.py
# ============================================================
#
# Purpose:
#   Business logic for the warranty module.
#
# Consumed by:
#   - backend/app/app/api/v1/operational.py
# ============================================================

import uuid

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.operational.repositories.warranty_repository import WarrantyRepository
from app.operational.schemas.warranty_schemas import (
    WarrantyCreateIn,
    WarrantyOut,
    WarrantyPage,
    WarrantyPatchIn,
)

# ==================================================
# SERVICE
# ==================================================


class WarrantyService:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db
        self._repo = WarrantyRepository(db)

    async def list(
        self,
        vehicle_id: uuid.UUID,
        account_id: uuid.UUID,
        page: int = 1,
        page_size: int = 50,
    ) -> WarrantyPage:
        rows, total = await self._repo.list_by_vehicle(
            vehicle_id, account_id, page=page, page_size=page_size
        )
        return WarrantyPage(
            items=[WarrantyOut.model_validate(r) for r in rows],
            total=total,
            page=page,
            page_size=page_size,
        )

    async def create(
        self,
        account_id: uuid.UUID,
        vehicle_id: uuid.UUID,
        data: WarrantyCreateIn,
    ) -> WarrantyOut:
        warranty = await self._repo.create(account_id, vehicle_id, data)
        return WarrantyOut.model_validate(warranty)

    async def patch(
        self,
        warranty_id: uuid.UUID,
        account_id: uuid.UUID,
        data: WarrantyPatchIn,
    ) -> WarrantyOut:
        warranty = await self._repo.get_by_id(warranty_id, account_id)
        if warranty is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Warranty not found."
            )
        updated = await self._repo.patch(warranty, data)
        return WarrantyOut.model_validate(updated)

    async def delete(self, warranty_id: uuid.UUID, account_id: uuid.UUID) -> None:
        warranty = await self._repo.get_by_id(warranty_id, account_id)
        if warranty is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Warranty not found."
            )
        await self._repo.delete(warranty)
