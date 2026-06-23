# ============================================================
# backend/app/app/accounts/models/__init__.py
# ============================================================
#
# Purpose:
#   Re-exports all account domain models so Alembic and other
#   importers only need one import path.
#
# Consumed by:
#   - backend/app/alembic/env.py (metadata collection)
# ============================================================

from app.accounts.models.account import Account, AccountPreferences
from app.accounts.models.user import Membership, User

__all__ = ["Account", "AccountPreferences", "User", "Membership"]
