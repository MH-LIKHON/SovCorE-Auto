# ============================================================
# backend/app/app/auth/schemas/auth_schemas.py
# ============================================================
#
# Purpose:
#   Pydantic request and response schemas for the auth API.
#   These define the public contract at /api/v1/auth/*.
#
# Design:
#   Request models are strict: extra fields are rejected.
#   Response models never expose internal secrets (code hashes,
#   TOTP secrets, session IDs). Email is normalised to lowercase
#   by a field validator so the service does not need to repeat
#   that step.
#
#   session_conflict in TokenPairOut signals to the frontend that
#   a second concurrent session was detected. When True the
#   access_token and account_id fields are empty; only
#   conflict_token is populated. The frontend shows the conflict
#   modal and calls /auth/session/resolve to choose an action.
#
# Consumed by:
#   - backend/app/app/api/v1/auth.py (router)
# ============================================================

import re
import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

# ==================================================
# REQUEST SCHEMAS
# ==================================================

# ------------------------------ Request Code --------------------------------


class RequestCodeIn(BaseModel):
    """POST /api/v1/auth/request-code — asks for a six-digit login code."""

    model_config = {"extra": "forbid"}

    email: EmailStr

    @field_validator("email", mode="before")
    @classmethod
    def normalise_email(cls, v: str) -> str:
        return v.strip().lower()


# ------------------------------ Verify Code ---------------------------------


class VerifyCodeIn(BaseModel):
    """POST /api/v1/auth/verify-code — submits the code and receives tokens."""

    model_config = {"extra": "forbid"}

    email: EmailStr
    code: str = Field(min_length=6, max_length=6)

    @field_validator("email", mode="before")
    @classmethod
    def normalise_email(cls, v: str) -> str:
        return v.strip().lower()

    @field_validator("code", mode="before")
    @classmethod
    def validate_code(cls, v: str) -> str:
        v = v.strip()
        # Must be exactly six decimal digits — no letters, spaces or punctuation.
        if not re.fullmatch(r"\d{6}", v):
            raise ValueError("Code must be exactly six digits.")
        return v


# ------------------------------ TOTP Challenge ------------------------------


class TotpChallengeIn(BaseModel):
    """POST /api/v1/auth/2fa/verify — submits a TOTP code during login."""

    model_config = {"extra": "forbid"}

    totp_code: str = Field(min_length=6, max_length=6)
    # When True the backend issues a trusted-device token and sets the sva_td
    # cookie so future logins on this browser skip the TOTP step for 15 days.
    remember_device: bool = False

    @field_validator("totp_code", mode="before")
    @classmethod
    def validate_totp_code(cls, v: str) -> str:
        v = v.strip()
        if not re.fullmatch(r"\d{6}", v):
            raise ValueError("TOTP code must be exactly six digits.")
        return v


# ------------------------------ Session resolve -----------------------------


class SessionResolveIn(BaseModel):
    """
    POST /api/v1/auth/session/resolve — choose what to do with a session conflict.

    action="replace" revokes the existing session and issues a full token pair
    to the incoming login. action="cancel" discards the pending login; the
    existing session is left intact.
    """

    model_config = {"extra": "forbid"}

    conflict_token: str
    action: Literal["replace", "cancel"]


# ------------------------------ Preferences --------------------------------


class PreferencesIn(BaseModel):
    """PATCH /api/v1/auth/me/preferences — update per-user session settings."""

    model_config = {"extra": "forbid"}

    idle_timeout_minutes: int = Field(ge=5, le=30)

    @field_validator("idle_timeout_minutes", mode="before")
    @classmethod
    def validate_idle_timeout(cls, v: int) -> int:
        if v % 5 != 0:
            raise ValueError("idle_timeout_minutes must be a multiple of 5.")
        return v


# ==================================================
# RESPONSE SCHEMAS
# ==================================================

# ------------------------------ Code Requested ------------------------------


class RequestCodeOut(BaseModel):
    """Response after a code is issued. The code itself is never returned."""

    ok: bool = True
    message: str = (
        "A six-digit code has been sent to that address. It expires in ten minutes."
    )
    # True when the registered user has a password set. The frontend uses this
    # to route directly to the password stage. False for unknown addresses so
    # account existence is not revealed via this field alone.
    has_password: bool = False


# ------------------------------ Token Pair ----------------------------------


class TokenPairOut(BaseModel):
    """
    Returned after successful code verification or SSO callback.
    The refresh token is set as an HTTP-only cookie by the route handler;
    only the access token appears in this JSON body.

    When session_conflict is True the caller detected a second concurrent
    session. In that case access_token is empty and conflict_token must be
    passed to /auth/session/resolve to proceed. account_id is also empty
    until the conflict is resolved.
    """

    access_token: str = ""
    token_type: str = "bearer"
    expires_in: int = 0
    requires_2fa: bool = False
    account_id: str | None = None
    # Session-conflict fields — only populated when a second session is detected.
    session_conflict: bool = False
    conflict_token: str | None = None


# ------------------------------ Session resolve response --------------------


class SessionResolveOut(BaseModel):
    """
    Returned by /auth/session/resolve.

    On action="replace": populated with a full token pair.
    On action="cancel": ok=True, everything else is empty.
    """

    ok: bool = True
    access_token: str = ""
    expires_in: int = 0
    account_id: str | None = None


# ------------------------------ TOTP Setup ----------------------------------


class TotpSetupOut(BaseModel):
    """Returned when the user requests a TOTP setup QR / secret."""

    provisioning_uri: str  # The otpauth:// URI to scan with an authenticator app.
    secret: str  # The raw base32 secret, shown once so the user can save it.


# ------------------------------ 2FA Verified --------------------------------


class TotpVerifyOut(BaseModel):
    """Returned after a successful TOTP challenge during login."""

    ok: bool = True


# ------------------------------ Trusted Device Out --------------------------


class TrustedDeviceOut(BaseModel):
    """Returned by GET /auth/trusted-devices — one saved trusted browser."""

    id: uuid.UUID
    label: str
    created_at: datetime
    expires_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ------------------------------ Password --------------------------------


class SetPasswordIn(BaseModel):
    """POST /auth/password/set — set an initial password for the account."""

    model_config = {"extra": "forbid"}

    password: str = Field(min_length=12, max_length=128)


class ChangePasswordIn(BaseModel):
    """POST /auth/password/change — replace an existing password."""

    model_config = {"extra": "forbid"}

    current_password: str
    new_password: str = Field(min_length=12, max_length=128)


class RemovePasswordIn(BaseModel):
    """POST /auth/password/remove — confirm and delete the password."""

    model_config = {"extra": "forbid"}

    current_password: str


class PasswordLoginIn(BaseModel):
    """POST /auth/password/login — sign in with email and password."""

    model_config = {"extra": "forbid"}

    email: EmailStr
    password: str

    @field_validator("email", mode="before")
    @classmethod
    def normalise_email(cls, v: str) -> str:
        return v.strip().lower()
