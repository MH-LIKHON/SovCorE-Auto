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
# Consumed by:
#   - backend/app/app/api/v1/auth.py (router)
# ============================================================

import re

from pydantic import BaseModel, EmailStr, Field, field_validator

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

    @field_validator("totp_code", mode="before")
    @classmethod
    def validate_totp_code(cls, v: str) -> str:
        v = v.strip()
        if not re.fullmatch(r"\d{6}", v):
            raise ValueError("TOTP code must be exactly six digits.")
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


# ------------------------------ Token Pair ----------------------------------


class TokenPairOut(BaseModel):
    """
    Returned after successful code verification or SSO callback.
    The refresh token is set as an HTTP-only cookie by the route handler;
    only the access token appears in this JSON body.
    """

    access_token: str
    token_type: str = "bearer"
    expires_in: int  # Seconds until the access token expires.
    requires_2fa: bool = False  # True means a TOTP challenge is needed next.
    account_id: str | None = None  # Set once a default account is resolved.


# ------------------------------ TOTP Setup ----------------------------------


class TotpSetupOut(BaseModel):
    """Returned when the user requests a TOTP setup QR / secret."""

    provisioning_uri: str  # The otpauth:// URI to scan with an authenticator app.
    secret: str  # The raw base32 secret, shown once so the user can save it.


# ------------------------------ 2FA Verified --------------------------------


class TotpVerifyOut(BaseModel):
    """Returned after a successful TOTP challenge during login."""

    ok: bool = True
