# ============================================================
# backend/app/app/accounts/schemas/account_schemas.py
# ============================================================
#
# Purpose:
#   Pydantic v2 request and response schemas for the accounts
#   API. Defines the public contract at
#   /api/v1/accounts/{account_id}/*.
#
# Design:
#   Response models flatten the ORM graph (Account + Membership
#   + User) into simple dicts that callers can consume without
#   knowing about the ORM layer. Request models are strict
#   (extra="forbid") to fail fast on typos.
#
#   Role is constrained on invite to editor/admin (caller cannot
#   directly assign owner; that goes through transfer-ownership).
#
# Consumed by:
#   - backend/app/app/accounts/services/account_service.py
#   - backend/app/app/api/v1/accounts.py
# ============================================================

import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, field_validator

from app.accounts.models.account import AccountType
from app.accounts.models.user import Role

# ==================================================
# ACCOUNT
# ==================================================


class AccountOut(BaseModel):
    """Read model for a single account."""

    id: uuid.UUID
    name: str
    type: AccountType
    created_at: datetime

    model_config = {"from_attributes": True}


class AccountPatchIn(BaseModel):
    """PATCH /accounts/{account_id} — update name or type."""

    model_config = {"extra": "forbid"}

    name: str | None = None
    type: AccountType | None = None

    @field_validator("name", mode="before")
    @classmethod
    def strip_name(cls, v: str | None) -> str | None:
        if v is not None:
            v = v.strip()
            if not v:
                raise ValueError("name must not be blank")
        return v


# ==================================================
# MEMBERS
# ==================================================


class MemberOut(BaseModel):
    """Read model for a membership row, including the member's user info."""

    id: uuid.UUID           # membership ID
    user_id: uuid.UUID
    email: str
    full_name: str
    role: Role
    created_at: datetime    # when the membership was created

    model_config = {"from_attributes": True}


# Roles that can be assigned by an admin via invite or patch.
# Owner is excluded — only transfer-ownership promotes to owner.
_ASSIGNABLE_ROLES: frozenset[Role] = frozenset(
    {Role.viewer, Role.editor, Role.admin}
)


class InviteMemberIn(BaseModel):
    """POST /accounts/{account_id}/members — invite a user by email."""

    model_config = {"extra": "forbid"}

    email: EmailStr
    role: Role

    @field_validator("email", mode="before")
    @classmethod
    def normalise_email(cls, v: str) -> str:
        return v.strip().lower()

    @field_validator("role", mode="after")
    @classmethod
    def block_owner_invite(cls, v: Role) -> Role:
        if v not in _ASSIGNABLE_ROLES:
            raise ValueError("Cannot assign role 'owner' via invite.")
        return v


class PatchMemberRoleIn(BaseModel):
    """PATCH /accounts/{account_id}/members/{member_id} — change a member's role."""

    model_config = {"extra": "forbid"}

    role: Role

    @field_validator("role", mode="after")
    @classmethod
    def block_owner_promotion(cls, v: Role) -> Role:
        if v not in _ASSIGNABLE_ROLES:
            raise ValueError("Cannot assign role 'owner' via patch. Use transfer-ownership.")
        return v


# ==================================================
# TRANSFER OWNERSHIP
# ==================================================


class TransferOwnershipIn(BaseModel):
    """POST /accounts/{account_id}/transfer-ownership."""

    model_config = {"extra": "forbid"}

    new_owner_user_id: uuid.UUID


# ==================================================
# DASHBOARD SUMMARY
# ==================================================


class DashboardSummaryOut(BaseModel):
    """
    Aggregated stats for the dashboard overview panel.
    Returned by GET /accounts/{id}/summary.
    """

    active_vehicle_count: int
    member_count: int
    open_task_count: int
    # Reminders with due_date within the next 30 days and active=True.
    due_soon_reminder_count: int
    # Custom alerts that fired in the last 30 days.
    custom_alert_count: int
    # Sum of record costs for the current calendar month, in pence.
    monthly_spend_pence: int


# ==================================================
# CURRENT USER (me)
# ==================================================


class UserMeOut(BaseModel):
    """Returned by GET /api/v1/auth/me. Describes the authenticated user."""

    id: uuid.UUID
    email: str
    full_name: str
    is_email_verified: bool
    totp_enabled: bool
    created_at: datetime

    model_config = {"from_attributes": True}
