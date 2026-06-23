# ============================================================
# backend/app/app/operational/schemas/__init__.py
# ============================================================
#
# Purpose:
#   Re-exports all operational Pydantic schemas.
#
# Consumed by:
#   - backend/app/app/api/v1/operational.py
# ============================================================

from app.operational.schemas.pcn_schemas import PCNCreateIn, PCNOut, PCNPatchIn, PCNPage
from app.operational.schemas.damage_schemas import (
    DamageCreateIn,
    DamageOut,
    DamagePatchIn,
    DamagePage,
    DamagePhotoSignIn,
    DamagePhotoSignOut,
)
from app.operational.schemas.warranty_schemas import (
    WarrantyCreateIn,
    WarrantyOut,
    WarrantyPatchIn,
    WarrantyPage,
)

__all__ = [
    "PCNCreateIn",
    "PCNOut",
    "PCNPatchIn",
    "PCNPage",
    "DamageCreateIn",
    "DamageOut",
    "DamagePatchIn",
    "DamagePage",
    "DamagePhotoSignIn",
    "DamagePhotoSignOut",
    "WarrantyCreateIn",
    "WarrantyOut",
    "WarrantyPatchIn",
    "WarrantyPage",
]
