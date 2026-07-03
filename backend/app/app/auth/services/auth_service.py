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
#     8. If the user has TOTP enabled AND the device is not trusted:
#           return a partial token flagging 2FA required.
#        If the user has TOTP enabled AND the device IS trusted:
#           bypass 2FA, continue to full token issue.
#        If the user has no TOTP: continue directly to full token issue.
#     9. Issue full access + refresh tokens.
#    10. Check for a concurrent session (single-session enforcement).
#        If a session exists: return session_conflict=True + conflict_token.
#        If no session: claim the session and return the full token pair.
#
#   The trusted-device check is injected via sva_td_cookie so the
#   service does not know about cookies itself — that stays in the router.
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
from app.auth.services.session_service import ConflictCheckResult, SessionService
from app.auth.services.trusted_device_service import TrustedDeviceService
from app.core.security import (
    generate_six_digit_code,
    issue_access_token,
    issue_refresh_token,
    verify_password,
)
from app.core.settings import get_settings
from app.integrations.resend_client import build_email_html, build_otp_content, send_email

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
    # None when 2FA is pending (partial token) or when session_conflict=True.
    refresh_token: str | None


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

    async def verify_code(
        self,
        email: str,
        code: str,
        sva_td_cookie: str | None = None,
    ) -> VerifyResult:
        """
        Verify the supplied code and issue tokens. Creates a user and
        personal account on first login.

        sva_td_cookie: the sva_td HTTP-only cookie value if present.
        When a user has TOTP enabled and this cookie is a valid trusted
        device token, the TOTP step is skipped.
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
            # Check whether this device is trusted (2FA bypass).
            td_service = TrustedDeviceService(self._session)
            device_trusted = await td_service.is_trusted(user.id, sva_td_cookie)

            if not device_trusted:
                # Issue a short-lived partial token that only permits the
                # 2FA verify endpoint. The full token is issued after the
                # TOTP code is confirmed.
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
                    refresh_token=None,
                )
            # Trusted device — fall through to full token issue below.
            logger.info("auth_trusted_device_bypass", user_id=str(user.id))

        # ~~~~~~~~~ Issue full token pair ~~~~~~~~~
        # Refresh is issued first so its JTI can be embedded in the access
        # token as session_jti — used by get_current_user to detect revocation.
        refresh = issue_refresh_token(user.id)

        from jose import jwt as _jwt
        refresh_jti = _jwt.get_unverified_claims(refresh).get("jti", "")

        access = issue_access_token(user.id, session_jti=refresh_jti)

        accounts = await self._accounts.get_user_accounts(user.id)
        account_id = str(accounts[0].id) if accounts else None

        expires_in = _settings.jwt_access_token_expire_minutes * 60

        # ~~~~~~~~~ Single-session enforcement ~~~~~~~~~

        svc = SessionService(self._session)
        conflict = await svc.check_and_claim(
            user_id=user.id,
            access_token=access,
            refresh_token=refresh,
            refresh_jti=refresh_jti,
            expires_in=expires_in,
            account_id=account_id,
        )

        logger.info("auth_success", user_id=str(user.id))
        return _conflict_to_verify_result(conflict, expires_in)


    # ------------------------------ Password login --------------------------

    async def login_with_password(
        self,
        email: str,
        password: str,
        sva_td_cookie: str | None = None,
    ) -> VerifyResult:
        """
        Authenticate with email + password. Mirrors the verify_code flow:
        trusted-device TOTP bypass, session conflict detection, and the
        same VerifyResult shape so the router can reuse the same handler.

        Generic 401 on failure — no difference between "no account",
        "no password set", and "wrong password" to prevent enumeration.
        """
        user = await self._codes.get_user_by_email(email)
        if user is None or not user.password_hash:
            raise InvalidPasswordError("Invalid email or password.")

        if not verify_password(password, user.password_hash):
            raise InvalidPasswordError("Invalid email or password.")

        # ~~~~~~~~~ Check for TOTP requirement (same logic as verify_code) ~~~~~~~~~
        if user.totp_enabled:
            td_service = TrustedDeviceService(self._session)
            device_trusted = await td_service.is_trusted(user.id, sva_td_cookie)

            if not device_trusted:
                partial = issue_access_token(
                    user.id, extra={"requires_2fa": True, "type": "partial"}
                )
                logger.info("auth_password_2fa_required", user_id=str(user.id))
                return VerifyResult(
                    token_pair=TokenPairOut(
                        access_token=partial,
                        expires_in=_settings.jwt_access_token_expire_minutes * 60,
                        requires_2fa=True,
                    ),
                    refresh_token=None,
                )
            logger.info("auth_password_trusted_device_bypass", user_id=str(user.id))

        # ~~~~~~~~~ Issue full token pair ~~~~~~~~~
        refresh = issue_refresh_token(user.id)

        from jose import jwt as _jwt
        refresh_jti = _jwt.get_unverified_claims(refresh).get("jti", "")

        access = issue_access_token(user.id, session_jti=refresh_jti)
        accounts = await self._accounts.get_user_accounts(user.id)
        account_id = str(accounts[0].id) if accounts else None
        expires_in = _settings.jwt_access_token_expire_minutes * 60

        svc = SessionService(self._session)
        conflict = await svc.check_and_claim(
            user_id=user.id,
            access_token=access,
            refresh_token=refresh,
            refresh_jti=refresh_jti,
            expires_in=expires_in,
            account_id=account_id,
        )

        logger.info("auth_password_success", user_id=str(user.id))
        return _conflict_to_verify_result(conflict, expires_in)


# ==================================================
# EXCEPTIONS
# ==================================================


class InvalidCodeError(Exception):
    """The supplied code is wrong, expired, or already consumed."""


class InvalidPasswordError(Exception):
    """Password is wrong, or the account has no password set."""


# ==================================================
# HELPERS
# ==================================================


def _conflict_to_verify_result(
    conflict: ConflictCheckResult, expires_in: int
) -> VerifyResult:
    """Translate a ConflictCheckResult into the VerifyResult the router expects."""
    if conflict.session_conflict:
        return VerifyResult(
            token_pair=TokenPairOut(
                session_conflict=True,
                conflict_token=conflict.conflict_token,
                expires_in=expires_in,
            ),
            refresh_token=None,
        )
    return VerifyResult(
        token_pair=TokenPairOut(
            access_token=conflict.access_token,
            expires_in=conflict.expires_in,
            account_id=conflict.account_id,
        ),
        refresh_token=conflict.refresh_token,
    )


async def _send_login_code(email: str, code: str) -> None:
    """
    Send the six-digit login code to the user via Resend.
    If the Resend API key is not configured (development environment),
    the code is logged as a warning so sign-in can still be tested.
    """
    if not _settings.resend_api_key:
        if _settings.app_env != "production":
            logger.warning("resend_not_configured_code_in_log", email=email, code=code)
        return

    send_email(
        to=email,
        subject="Your SovCorE Auto login code",
        html=build_email_html(build_otp_content(code)),
    )
