# ============================================================
# backend/app/app/core/permissions.py
# ============================================================
#
# Purpose:
#   Role-based access control. Provides FastAPI dependency
#   factories that enforce the caller's role within an account
#   before a route handler runs.
#
# Design:
#   Roles are scoped to an account (from the Membership table).
#   The hierarchy is Owner > Admin > Editor > Viewer; each level
#   implicitly includes all levels below it.
#
#   require_role(min_role) returns a FastAPI dependency that:
#     1. Resolves the current user (via get_current_user).
#     2. Reads the account_id from the request path parameter or
#        a query parameter (the parameter name is "account_id").
#     3. Looks up the membership for (user_id, account_id).
#     4. Compares the caller's role against the minimum required.
#     5. Raises HTTP 403 if the role is insufficient.
#
#   For routes that do not carry an account_id (e.g., the auth
#   endpoints), no RBAC check is needed — use get_current_user
#   directly from dependencies.py.
#
# Consumed by:
#   - Every protected app route via `Depends(require_role(Role.editor))`
# ============================================================

import uuid
from typing import Callable

from fastapi import Depends, HTTPException, Path, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.accounts.models.user import Membership, Role, User
from app.core.database import get_db
from app.core.dependencies import get_current_user

# ==================================================
# ROLE HIERARCHY
# ==================================================

# ------------------------------ Rank map ------------------------------------
# Lower number = lower privilege. An Owner (rank 3) satisfies a Viewer (rank 0)
# requirement because 3 >= 0.

_ROLE_RANK: dict[Role, int] = {
    Role.viewer: 0,
    Role.editor: 1,
    Role.admin: 2,
    Role.owner: 3,
}

# ==================================================
# DEPENDENCY FACTORY
# ==================================================


def require_role(min_role: Role) -> Callable:
    """
    Return a FastAPI dependency that enforces a minimum role for the
    calling user within the account identified by the route's
    `account_id` path parameter.

    Usage::

        @router.get("/accounts/{account_id}/vehicles")
        async def list_vehicles(
            _: User = Depends(require_role(Role.viewer)),
        ) -> ...:
            ...
    """

    async def _check(
        account_id: uuid.UUID = Path(...),
        current_user: User = Depends(get_current_user),
        db: AsyncSession = Depends(get_db),
    ) -> User:
        result = await db.execute(
            select(Membership)
            .where(Membership.account_id == account_id)
            .where(Membership.user_id == current_user.id)
        )
        membership = result.scalar_one_or_none()

        if membership is None:
            # Treat missing membership as 404 so callers cannot enumerate accounts.
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Account not found.",
            )

        if _ROLE_RANK[membership.role] < _ROLE_RANK[min_role]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    f"This action requires {min_role.value} access or higher. "
                    f"Your role is {membership.role.value}."
                ),
            )

        return current_user

    return _check


# ==================================================
# CONVENIENCE SHORTHANDS
# ==================================================

# ------------------------------ Ready-made dependencies ---------------------
# Import these directly instead of calling require_role each time.

require_viewer = require_role(Role.viewer)
require_editor = require_role(Role.editor)
require_admin = require_role(Role.admin)
require_owner = require_role(Role.owner)
