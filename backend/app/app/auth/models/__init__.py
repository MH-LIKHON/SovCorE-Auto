# ============================================================
# backend/app/app/auth/models/__init__.py
# ============================================================
#
# Purpose:
#   Re-exports all auth domain models so Alembic and other
#   importers only need one import path.
#
# Consumed by:
#   - backend/app/alembic/env.py (metadata collection)
# ============================================================

from app.auth.models.auth_code import AuthCode
from app.auth.models.sso_identity import SSOIdentity

__all__ = ["AuthCode", "SSOIdentity"]
