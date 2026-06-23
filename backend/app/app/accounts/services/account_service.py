# ============================================================
# backend/app/app/accounts/services/account_service.py
# ============================================================
#
# Purpose:
#   Business logic for account settings and member management.
#   Orchestrates repository calls, enforces business rules
#   (cannot demote owner, cannot invite as owner, cannot remove
#   the account's last owner), and maps ORM objects to Pydantic
#   response schemas.
#
# Design:
#   All writes use flush(); the FastAPI dependency get_db()
#   commits on exit. Errors surface as HTTPException so the
#   router needs no error-handling of its own.
#
#   Transfer-ownership is atomic within the session: the new
#   owner is promoted to Role.owner and the current owner is
#   demoted to Role.admin in a single flush, preserving the
#   invariant that every account always has exactly one owner.
#
# Consumed by:
#   - backend/app/app/api/v1/accounts.py
# ============================================================

import uuid

import structlog
from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.accounts.models.account import AccountType
from app.accounts.models.user import Role
from app.accounts.repositories.account_repository import AccountRepository
from app.accounts.repositories.user_repository import UserRepository
from app.accounts.schemas.account_schemas import (
    AccountOut,
    AccountPatchIn,
    InviteMemberIn,
    MemberOut,
    PatchMemberRoleIn,
    TransferOwnershipIn,
)

logger = structlog.get_logger(__name__)

# ==================================================
# ACCOUNT SERVICE
# ==================================================


class AccountService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session
        self._accounts = AccountRepository(session)
        self._users = UserRepository(session)

    # ------------------------------ Account ---------------------------------

    async def get_account(self, account_id: uuid.UUID) -> AccountOut:
        account = await self._accounts.get_account_by_id(account_id)
        if account is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found.")
        return AccountOut.model_validate(account)

    async def patch_account(
        self, account_id: uuid.UUID, patch: AccountPatchIn
    ) -> AccountOut:
        account = await self._accounts.get_account_by_id(account_id)
        if account is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found.")
        account = await self._accounts.update_account(
            account, name=patch.name, account_type=patch.type
        )
        logger.info("account_updated", account_id=str(account_id))
        return AccountOut.model_validate(account)

    # ------------------------------ Members ---------------------------------

    async def list_members(self, account_id: uuid.UUID) -> list[MemberOut]:
        memberships = await self._accounts.list_members(account_id)
        return [_membership_to_out(m) for m in memberships]

    async def invite_member(
        self, account_id: uuid.UUID, body: InviteMemberIn
    ) -> MemberOut:
        # Find or create the invited user.
        user = await self._users.get_by_email(body.email)
        if user is None:
            user = await self._users.create(body.email)
            logger.info("user_created_via_invite", email=body.email)

        # Check for an existing membership (idempotent guard).
        existing = await self._accounts.get_membership(account_id, user.id)
        if existing is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="That user is already a member of this account.",
            )

        membership = await self._accounts.create_membership(
            account_id=account_id, user_id=user.id, role=body.role
        )
        # Load the user relationship for the response.
        membership.user = user
        logger.info(
            "member_invited",
            account_id=str(account_id),
            user_id=str(user.id),
            role=body.role.value,
        )
        return _membership_to_out(membership)

    async def patch_member_role(
        self,
        account_id: uuid.UUID,
        member_id: uuid.UUID,
        body: PatchMemberRoleIn,
        current_user_id: uuid.UUID,
    ) -> MemberOut:
        membership = await self._accounts.get_member_by_id(account_id, member_id)
        if membership is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found.")

        if membership.role == Role.owner:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot change the role of the account owner. Use transfer-ownership.",
            )
        if membership.user_id == current_user_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="You cannot change your own role.",
            )

        membership = await self._accounts.update_member_role(membership, body.role)
        logger.info(
            "member_role_changed",
            account_id=str(account_id),
            member_id=str(member_id),
            new_role=body.role.value,
        )
        return _membership_to_out(membership)

    async def remove_member(
        self,
        account_id: uuid.UUID,
        member_id: uuid.UUID,
        current_user_id: uuid.UUID,
    ) -> None:
        membership = await self._accounts.get_member_by_id(account_id, member_id)
        if membership is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found.")

        if membership.role == Role.owner:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot remove the account owner.",
            )
        if membership.user_id == current_user_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="You cannot remove yourself. To leave the account, contact the owner.",
            )

        await self._accounts.delete_member(membership)
        logger.info(
            "member_removed", account_id=str(account_id), member_id=str(member_id)
        )

    async def transfer_ownership(
        self,
        account_id: uuid.UUID,
        body: TransferOwnershipIn,
        current_user_id: uuid.UUID,
    ) -> None:
        if body.new_owner_user_id == current_user_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="You are already the owner.",
            )

        # Load both memberships in the same session to flush atomically.
        current_owner_mem = await self._accounts.get_membership(account_id, current_user_id)
        new_owner_mem = await self._accounts.get_membership(account_id, body.new_owner_user_id)

        if new_owner_mem is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="The target user is not a member of this account.",
            )

        # Promote new owner; demote current owner to admin.
        new_owner_mem.role = Role.owner
        if current_owner_mem is not None:
            current_owner_mem.role = Role.admin
        await self._session.flush()

        logger.info(
            "ownership_transferred",
            account_id=str(account_id),
            new_owner_user_id=str(body.new_owner_user_id),
            previous_owner_user_id=str(current_user_id),
        )


# ==================================================
# HELPER
# ==================================================


def _membership_to_out(m) -> MemberOut:  # type: ignore[type-arg]
    """Flatten Membership + User into MemberOut."""
    return MemberOut(
        id=m.id,
        user_id=m.user_id,
        email=m.user.email,
        full_name=m.user.full_name,
        role=m.role,
        created_at=m.created_at,
    )
