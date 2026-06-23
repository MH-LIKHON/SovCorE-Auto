# ============================================================
# backend/app/app/accounts/services/preferences_service.py
# ============================================================
#
# Purpose:
#   Business logic for reading and updating the account display
#   preferences (distance, volume, economy unit, currency).
#
# Consumed by:
#   - backend/app/app/api/v1/accounts.py
# ============================================================

import uuid

import structlog
from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.accounts.repositories.account_repository import AccountRepository
from app.accounts.schemas.preferences_schemas import PreferencesOut, PreferencesPatchIn

logger = structlog.get_logger(__name__)

# ==================================================
# PREFERENCES SERVICE
# ==================================================


class PreferencesService:
    def __init__(self, session: AsyncSession) -> None:
        self._accounts = AccountRepository(session)
        self._session = session

    async def get_preferences(self, account_id: uuid.UUID) -> PreferencesOut:
        prefs = await self._accounts.get_preferences(account_id)
        if prefs is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Preferences not found for this account.",
            )
        return PreferencesOut.model_validate(prefs)

    async def patch_preferences(
        self, account_id: uuid.UUID, patch: PreferencesPatchIn
    ) -> PreferencesOut:
        prefs = await self._accounts.get_preferences(account_id)
        if prefs is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Preferences not found for this account.",
            )

        if patch.distance_unit is not None:
            prefs.distance_unit = patch.distance_unit
        if patch.volume_unit is not None:
            prefs.volume_unit = patch.volume_unit
        if patch.economy_unit is not None:
            prefs.economy_unit = patch.economy_unit
        if patch.currency is not None:
            prefs.currency = patch.currency

        await self._session.flush()
        logger.info("preferences_updated", account_id=str(account_id))
        return PreferencesOut.model_validate(prefs)
