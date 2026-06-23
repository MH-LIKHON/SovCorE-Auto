# ============================================================
# backend/app/app/accounts/schemas/preferences_schemas.py
# ============================================================
#
# Purpose:
#   Pydantic v2 request and response schemas for the account
#   preferences API at /api/v1/accounts/{account_id}/preferences.
#
# Design:
#   All fields are optional on the PATCH schema — callers can
#   update any subset without repeating unchanged values.
#
# Consumed by:
#   - backend/app/app/accounts/services/preferences_service.py
#   - backend/app/app/api/v1/accounts.py
# ============================================================

from pydantic import BaseModel, field_validator

from app.accounts.models.account import DistanceUnit, EconomyUnit, VolumeUnit

# ==================================================
# RESPONSE
# ==================================================


class PreferencesOut(BaseModel):
    """Read model for account display preferences."""

    distance_unit: DistanceUnit
    volume_unit: VolumeUnit
    economy_unit: EconomyUnit
    currency: str

    model_config = {"from_attributes": True}


# ==================================================
# REQUEST
# ==================================================


class PreferencesPatchIn(BaseModel):
    """PATCH /accounts/{account_id}/preferences — update any subset."""

    model_config = {"extra": "forbid"}

    distance_unit: DistanceUnit | None = None
    volume_unit: VolumeUnit | None = None
    economy_unit: EconomyUnit | None = None
    currency: str | None = None

    @field_validator("currency", mode="before")
    @classmethod
    def normalise_currency(cls, v: str | None) -> str | None:
        if v is not None:
            v = v.strip().upper()
            if len(v) != 3 or not v.isalpha():
                raise ValueError("currency must be a three-letter ISO 4217 code (e.g. GBP).")
        return v
