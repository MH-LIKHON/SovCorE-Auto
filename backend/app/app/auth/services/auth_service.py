# ============================================================
# backend/app/app/auth/services/auth_service.py
# ============================================================
#
# Purpose:
#   Business logic for the passwordless email auth flow.
#   Orchestrates code generation, email delivery, code
#   verification, user creation, and token issue.
#
# Design:
#   The service sits between the router (which handles HTTP
#   concerns) and the repositories (which handle database
#   access). It owns the business rules:
#
#   request_code flow:
#     1. Normalise and validate the email.
#     2. Purge old expired codes for this address.
#     3. Generate a six-digit code and hash it.
#     4. Write the hash + expiry to auth_codes.
#     5. Send the plaintext code via Resend.
#     6. Return; the plaintext code is never returned to the caller.
#
#   verify_code flow:
#     1. Hash the supplied code.
#     2. Look up a valid (unexpired, unconsumed) row in auth_codes.
#     3. If not found, raise an error (generic message — no user enumeration).
#     4. Consume the code (set consumed_at).
#     5. Find the user by email; create the user if this is their first login.
#     6. If the user is new, create a personal account and make them Owner.
#     7. Mark the user's email as verified.
#     8. If the user has TOTP enabled, return a partial token flagging 2FA required.
#     9. Otherwise issue a full access + refresh token pair and return.
#
#   User and account creation on first login follows the "implicit
#   account creation" pattern: a user who signs in with a valid
#   email code gets an account automatically. This avoids a
#   separate sign-up step and aligns with the passwordless UX.
#
# Consumed by:
#   - backend/app/app/api/v1/auth.py
# ============================================================

import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from app.accounts.models.account import AccountType
from app.accounts.models.user import Role
from app.accounts.repositories.account_repository import AccountRepository
from app.auth.repositories.auth_code_repository import AuthCodeRepository, hash_code
from app.auth.schemas.auth_schemas import RequestCodeOut, TokenPairOut
from app.core.security import (
    generate_six_digit_code,
    issue_access_token,
    issue_refresh_token,
)
from app.core.settings import get_settings
from app.integrations.resend_client import send_email

logger = structlog.get_logger(__name__)
_settings = get_settings()

# ==================================================
# SERVICE RESULT
# ==================================================

# ------------------------------ Verify Result --------------------------------
# The router writes refresh_token into an HTTP-only cookie; only the
# token_pair goes into the JSON response body. Keeping them separate
# here avoids hiding the refresh token inside a Pydantic model field.


@dataclass
class VerifyResult:
    token_pair: TokenPairOut
    refresh_token: str | None  # None when 2FA is pending (partial token issued)


# ==================================================
# AUTH SERVICE
# ==================================================


class AuthService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session
        self._codes = AuthCodeRepository(session)
        self._accounts = AccountRepository(session)

    # ------------------------------ Request Code ----------------------------

    async def request_code(self, email: str) -> RequestCodeOut:
        """
        Issue a six-digit code, write the hash to auth_codes, and
        send the plaintext via Resend. Returns a generic acknowledgment.
        """
        # ~~~~~~~~~ Purge old codes ~~~~~~~~~
        await self._codes.purge_expired_codes(email)

        # ~~~~~~~~~ Generate and hash the code ~~~~~~~~~
        plaintext = generate_six_digit_code()
        code_hash = hash_code(plaintext)
        expires_at = datetime.now(timezone.utc) + timedelta(minutes=10)

        await self._codes.create_code(email=email, code_hash=code_hash, expires_at=expires_at)

        # ~~~~~~~~~ Send the code via Resend ~~~~~~~~~
        await _send_login_code(email=email, code=plaintext)

        logger.info("auth_code_sent", email=email)
        return RequestCodeOut()

    # ------------------------------ Verify Code -----------------------------

    async def verify_code(self, email: str, code: str) -> VerifyResult:
        """
        Verify the supplied code and issue tokens. Creates a user and
        personal account on first login.
        """
        # ~~~~~~~~~ Hash and look up the code ~~~~~~~~~
        code_hash = hash_code(code)
        auth_code = await self._codes.get_valid_code(email=email, code_hash=code_hash)

        if not auth_code:
            # Generic error — do not reveal whether the address is registered.
            raise InvalidCodeError("The code is incorrect or has expired.")

        # ~~~~~~~~~ Consume the code ~~~~~~~~~
        await self._codes.consume_code(auth_code)

        # ~~~~~~~~~ Find or create the user ~~~~~~~~~
        user = await self._codes.get_user_by_email(email)
        if user is None:
            user = await self._codes.create_user(email=email)
            # First login: create a personal account and make the user Owner.
            account = await self._accounts.create_account(
                name=email, account_type=AccountType.personal
            )
            await self._accounts.create_membership(
                account_id=account.id, user_id=user.id, role=Role.owner
            )
            logger.info("user_created", user_id=str(user.id))

        # ~~~~~~~~~ Mark email as verified ~~~~~~~~~
        user.is_email_verified = True
        await self._session.flush()

        # ~~~~~~~~~ Check for TOTP requirement ~~~~~~~~~
        if user.totp_enabled:
            # Issue a short-lived partial token that only permits the
            # 2FA verify endpoint. The full token is issued after the
            # TOTP code is confirmed in Step 1.4.
            partial = issue_access_token(
                user.id, extra={"requires_2fa": True, "type": "partial"}
            )
            logger.info("auth_2fa_required", user_id=str(user.id))
            return VerifyResult(
                token_pair=TokenPairOut(
                    access_token=partial,
                    expires_in=_settings.jwt_access_token_expire_minutes * 60,
                    requires_2fa=True,
                ),
                refresh_token=None,  # No refresh token until 2FA is cleared.
            )

        # ~~~~~~~~~ Issue full token pair ~~~~~~~~~
        access = issue_access_token(user.id)
        refresh = issue_refresh_token(user.id)

        logger.info("auth_success", user_id=str(user.id))

        # Load the user's first account for the response.
        accounts = await self._accounts.get_user_accounts(user.id)
        account_id = str(accounts[0].id) if accounts else None

        return VerifyResult(
            token_pair=TokenPairOut(
                access_token=access,
                expires_in=_settings.jwt_access_token_expire_minutes * 60,
                requires_2fa=False,
                account_id=account_id,
            ),
            refresh_token=refresh,
        )


# ==================================================
# EXCEPTIONS
# ==================================================


class InvalidCodeError(Exception):
    """The supplied code is wrong, expired, or already consumed."""


# ==================================================
# EMAIL HELPER
# ==================================================


async def _send_login_code(email: str, code: str) -> None:
    """
    Send the six-digit login code to the user via Resend.
    If the Resend API key is not configured (development environment),
    the code is logged as a warning so sign-in can still be tested.
    """
    if not _settings.resend_api_key:
        # Only log the plaintext code in non-production environments.
        # An absent resend_api_key in production is caught at startup by
        # assert_production_secrets, so this branch should never fire there.
        if _settings.app_env != "production":
            logger.warning("resend_not_configured_code_in_log", email=email, code=code)
        return

    body_html = f"""
    <div style="font-family:sans-serif;background:#08080f;color:#f0f0f8;padding:40px;border-radius:12px;">
      <p style="font-size:15px;margin:0 0 16px;">Your SovCorE Auto login code is:</p>
      <p style="font-family:monospace;font-size:36px;font-weight:bold;
                letter-spacing:10px;color:#6c63ff;margin:0 0 24px;">{code}</p>
      <p style="font-size:13px;color:#8888aa;margin:0;">
        It expires in ten minutes. Do not share it with anyone.
      </p>
    </div>
    """

    send_email(
        to=email,
        subject=f"{code} is your SovCorE Auto login code",
        html=body_html,
    )
