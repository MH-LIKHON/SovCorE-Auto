# ============================================================
# backend/app/app/tasks/services/custom_alert_service.py
# ============================================================
#
# Purpose:
#   Business logic for the custom_alerts resource. Validates
#   condition shapes on create/patch and guards 404s before
#   delegating to the repository.
#
# Design:
#   Condition validation is kept intentionally lightweight:
#   each condition must have a "type" field set to a known
#   value. Further field validation (e.g. "on" is a valid ISO
#   date) is enforced by the scheduler — invalid dates simply
#   do not fire rather than blocking the user from saving.
#
# Consumed by:
#   - backend/app/app/api/v1/custom_alerts.py
# ============================================================

import uuid

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.tasks.repositories.custom_alert_repository import CustomAlertRepository
from app.tasks.schemas.custom_alert_schemas import (
    VALID_CONDITION_TYPES,
    CustomAlertCreateIn,
    CustomAlertOut,
    CustomAlertPage,
    CustomAlertPatchIn,
)

# ==================================================
# CUSTOM ALERT SERVICE
# ==================================================


class CustomAlertService:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db
        self._repo = CustomAlertRepository(db)

    # ==================================================
    # LIST
    # ==================================================

    async def list_alerts(
        self,
        vehicle_id: uuid.UUID,
        account_id: uuid.UUID,
        *,
        page: int = 1,
        page_size: int = 50,
    ) -> CustomAlertPage:
        return await self._repo.list_by_vehicle(
            vehicle_id, account_id, page=page, page_size=page_size
        )

    # ==================================================
    # CREATE
    # ==================================================

    async def create_alert(
        self,
        vehicle_id: uuid.UUID,
        account_id: uuid.UUID,
        data: CustomAlertCreateIn,
    ) -> CustomAlertOut:
        self._validate_conditions(data.conditions)
        alert = await self._repo.create(vehicle_id, account_id, data)
        return CustomAlertOut.model_validate(alert)

    # ==================================================
    # PATCH
    # ==================================================

    async def patch_alert(
        self,
        alert_id: uuid.UUID,
        account_id: uuid.UUID,
        data: CustomAlertPatchIn,
    ) -> CustomAlertOut:
        alert = await self._repo.get_by_id(alert_id, account_id)
        if alert is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Alert not found."
            )
        if data.conditions is not None:
            self._validate_conditions(data.conditions)
        updated = await self._repo.patch(alert, data)
        return CustomAlertOut.model_validate(updated)

    # ==================================================
    # DELETE
    # ==================================================

    async def delete_alert(
        self,
        alert_id: uuid.UUID,
        account_id: uuid.UUID,
    ) -> None:
        alert = await self._repo.get_by_id(alert_id, account_id)
        if alert is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Alert not found."
            )
        await self._repo.delete(alert)

    # ==================================================
    # PRIVATE HELPERS
    # ==================================================

    @staticmethod
    def _validate_conditions(conditions: list[dict]) -> None:
        for i, cond in enumerate(conditions):
            if not isinstance(cond, dict):
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"Condition {i} must be an object.",
                )
            ctype = cond.get("type")
            if ctype not in VALID_CONDITION_TYPES:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=(
                        f"Condition {i} has unknown type '{ctype}'. "
                        f"Valid types: {sorted(VALID_CONDITION_TYPES)}."
                    ),
                )
