# ============================================================
# backend/app/app/api/v1/accounts.py
# ============================================================
#
# Purpose:
#   REST endpoints for account settings and member management.
#   All routes are scoped to a specific account via
#   {account_id} in the path. Role-based access is enforced
#   by require_* dependencies from core.permissions.
#
# Design:
#   The router prefix /accounts/{account_id} is set by the
#   v1 router include. Every route inherits the account_id
#   path parameter, which require_role uses for membership
#   lookup without callers needing to pass it explicitly.
#
# Consumed by:
#   - backend/app/app/api/v1/router.py
# ============================================================

import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.accounts.models.user import User
from app.accounts.schemas.account_schemas import (
    AccountOut,
    AccountPatchIn,
    DashboardSummaryOut,
    InviteMemberIn,
    MemberOut,
    PatchMemberRoleIn,
    TransferOwnershipIn,
)
from app.accounts.schemas.preferences_schemas import PreferencesOut, PreferencesPatchIn
from app.accounts.services.account_service import AccountService
from app.accounts.services.preferences_service import PreferencesService
from app.core.database import get_db
from app.core.permissions import require_admin, require_editor, require_owner, require_viewer

# ==================================================
# ROUTER
# ==================================================

router = APIRouter()

# ==================================================
# ACCOUNT ENDPOINTS
# ==================================================


@router.get(
    "/accounts/{account_id}",
    response_model=AccountOut,
    summary="Get account details",
)
async def get_account(
    account_id: uuid.UUID,
    _: User = Depends(require_viewer),
    db: AsyncSession = Depends(get_db),
) -> AccountOut:
    return await AccountService(db).get_account(account_id)


@router.patch(
    "/accounts/{account_id}",
    response_model=AccountOut,
    summary="Update account name or type",
)
async def patch_account(
    account_id: uuid.UUID,
    body: AccountPatchIn,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> AccountOut:
    return await AccountService(db).patch_account(account_id, body)


# ==================================================
# MEMBER ENDPOINTS
# ==================================================


@router.get(
    "/accounts/{account_id}/members",
    response_model=list[MemberOut],
    summary="List members of an account",
)
async def list_members(
    account_id: uuid.UUID,
    _: User = Depends(require_viewer),
    db: AsyncSession = Depends(get_db),
) -> list[MemberOut]:
    return await AccountService(db).list_members(account_id)


@router.post(
    "/accounts/{account_id}/members",
    response_model=MemberOut,
    status_code=status.HTTP_201_CREATED,
    summary="Invite a user to the account",
)
async def invite_member(
    account_id: uuid.UUID,
    body: InviteMemberIn,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> MemberOut:
    return await AccountService(db).invite_member(account_id, body)


@router.patch(
    "/accounts/{account_id}/members/{member_id}",
    response_model=MemberOut,
    summary="Change a member's role",
)
async def patch_member_role(
    account_id: uuid.UUID,
    member_id: uuid.UUID,
    body: PatchMemberRoleIn,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> MemberOut:
    return await AccountService(db).patch_member_role(
        account_id, member_id, body, current_user.id
    )


@router.delete(
    "/accounts/{account_id}/members/{member_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Remove a member from an account",
)
async def remove_member(
    account_id: uuid.UUID,
    member_id: uuid.UUID,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> None:
    await AccountService(db).remove_member(account_id, member_id, current_user.id)


# ==================================================
# TRANSFER OWNERSHIP
# ==================================================


@router.post(
    "/accounts/{account_id}/transfer-ownership",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Transfer account ownership to an existing member",
)
async def transfer_ownership(
    account_id: uuid.UUID,
    body: TransferOwnershipIn,
    current_user: User = Depends(require_owner),
    db: AsyncSession = Depends(get_db),
) -> None:
    await AccountService(db).transfer_ownership(account_id, body, current_user.id)


# ==================================================
# PREFERENCES
# ==================================================


@router.get(
    "/accounts/{account_id}/preferences",
    response_model=PreferencesOut,
    summary="Get display preferences for an account",
)
async def get_preferences(
    account_id: uuid.UUID,
    _: User = Depends(require_viewer),
    db: AsyncSession = Depends(get_db),
) -> PreferencesOut:
    return await PreferencesService(db).get_preferences(account_id)


@router.patch(
    "/accounts/{account_id}/preferences",
    response_model=PreferencesOut,
    summary="Update display preferences for an account",
)
async def patch_preferences(
    account_id: uuid.UUID,
    body: PreferencesPatchIn,
    _: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
) -> PreferencesOut:
    return await PreferencesService(db).patch_preferences(account_id, body)


# ==================================================
# DASHBOARD SUMMARY
# ==================================================


@router.get(
    "/accounts/{account_id}/summary",
    response_model=DashboardSummaryOut,
    summary="Aggregated dashboard stats for an account",
)
async def get_dashboard_summary(
    account_id: uuid.UUID,
    _: User = Depends(require_viewer),
    db: AsyncSession = Depends(get_db),
) -> DashboardSummaryOut:
    return await AccountService(db).get_dashboard_summary(account_id)
