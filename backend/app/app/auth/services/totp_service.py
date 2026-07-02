# ============================================================
# backend/app/app/auth/services/totp_service.py
# ============================================================
#
# Purpose:
#   Business logic for TOTP two-factor authentication setup,
#   verification, and the post-login 2FA challenge.
#
# Design:
#   setup: generate a secret, encrypt it, persist to the user
#   row. Returns the provisioning URI and the raw secret (shown
#   once so the user can save it as a backup code if needed).
#   The secret is NOT yet active; totp_enabled stays False until
#   confirm is called.
#
#   confirm: the user scans the QR code, enters their first code.
#   We verify it. On success, set totp_enabled=True.
#
#   verify_login: called during the post-login TOTP challenge.
#   The route passes the partial token (issued by verify_code
#   when requires_2fa=True); this service verifies the TOTP
#   code, runs the single-session conflict check, and — when
#   remember_device=True — creates a trusted-device token.
#
# Consumed by:
#   - backend/app/app/api/v1/auth.py (2FA endpoints)
# ============================================================

import uuid
from dataclasses import dataclass

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.accounts.repositories.account_repository import AccountRepository
from app.auth.schemas.auth_schemas import TokenPairOut, TotpSetupOut, TotpVerifyOut
from app.accounts.models.user import User
from app.auth.services.session_service import ConflictCheckResult, SessionService
from app.auth.services.trusted_device_service import TrustedDeviceService
from app.core import totp as totp_core
from app.core.security import issue_access_token, issue_refresh_token
from app.core.settings import get_settings

logger = structlog.get_logger(__name__)
_settings = get_settings()


# ==================================================
# SERVICE RESULT
# ==================================================


@dataclass
class TotpLoginResult:
    token_pair: TokenPairOut
    # refresh_token is None when session_conflict=True.
    refresh_token: str | None
    # Set when remember_device=True; the router puts this in an HTTP-only cookie.
    device_token: str | None = None


# ==================================================
# TOTP SERVICE
# ==================================================


class TotpService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session
        self._accounts = AccountRepository(session)

    # ------------------------------ Setup ----------------------------------

    async def setup(self, user_id: uuid.UUID) -> TotpSetupOut:
        """
        Generate a new TOTP secret for the user. The secret is encrypted
        and saved, but totp_enabled is not set until confirm() succeeds.
        """
        user = await self._get_user(user_id)
        secret = totp_core.generate_secret()
        user.totp_secret_enc = totp_core.encrypt_secret(secret)
        # Keep totp_enabled=False until the user confirms the first code.
        await self._session.flush()

        logger.info("totp_setup_initiated", user_id=str(user_id))
        return TotpSetupOut(
            provisioning_uri=totp_core.provisioning_uri(secret, user.email),
            secret=secret,
        )

    # ------------------------------ Confirm --------------------------------

    async def confirm(self, user_id: uuid.UUID, code: str) -> TotpVerifyOut:
        """
        Verify the first TOTP code after setup to confirm the user's
        authenticator app is correctly configured. Enables 2FA on success.
        """
        user = await self._get_user(user_id)
        if not user.totp_secret_enc:
            raise TotpError("Two-factor authentication is not set up for this account.")

        secret = totp_core.decrypt_secret(user.totp_secret_enc)
        if not totp_core.verify_code(secret, code):
            raise TotpError("The code is incorrect.")

        user.totp_enabled = True
        await self._session.flush()

        logger.info("totp_enabled", user_id=str(user_id))
        return TotpVerifyOut()

    # ------------------------------ Login challenge ------------------------

    async def verify_login(
        self,
        user_id: uuid.UUID,
        code: str,
        remember_device: bool = False,
    ) -> TotpLoginResult:
        """
        Called when requires_2fa=True was returned during code verification.
        Verifies the TOTP code, runs the single-session conflict check, and
        optionally creates a trusted-device token.
        """
        user = await self._get_user(user_id)
        if not user.totp_enabled or not user.totp_secret_enc:
            raise TotpError("Two-factor authentication is not enabled.")

        secret = totp_core.decrypt_secret(user.totp_secret_enc)
        if not totp_core.verify_code(secret, code):
            raise TotpError("The code is incorrect.")

        # ~~~~~~~~~ Issue full token pair ~~~~~~~~~
        access = issue_access_token(user_id)
        refresh = issue_refresh_token(user_id)

        accounts = await self._accounts.get_user_accounts(user_id)
        account_id = str(accounts[0].id) if accounts else None

        expires_in = _settings.jwt_access_token_expire_minutes * 60

        # ~~~~~~~~~ Single-session enforcement ~~~~~~~~~
        from jose import jwt as _jwt
        refresh_jti = _jwt.get_unverified_claims(refresh).get("jti", "")

        svc = SessionService(self._session)
        conflict: ConflictCheckResult = await svc.check_and_claim(
            user_id=user_id,
            access_token=access,
            refresh_token=refresh,
            refresh_jti=refresh_jti,
            expires_in=expires_in,
            account_id=account_id,
        )

        # ~~~~~~~~~ Trusted device (optional) ~~~~~~~~~
        device_token: str | None = None
        if remember_device and not conflict.session_conflict:
            # Only create the trusted device if the session was actually claimed.
            # If there is a conflict the login has not completed yet; the device
            # trust will be created by the resolve endpoint after "replace".
            td_svc = TrustedDeviceService(self._session)
            device_token = await td_svc.create(user_id)

        logger.info("totp_login_success", user_id=str(user_id))

        if conflict.session_conflict:
            return TotpLoginResult(
                token_pair=TokenPairOut(
                    session_conflict=True,
                    conflict_token=conflict.conflict_token,
                    expires_in=expires_in,
                ),
                refresh_token=None,
                device_token=None,
            )

        return TotpLoginResult(
            token_pair=TokenPairOut(
                access_token=conflict.access_token,
                expires_in=conflict.expires_in,
                account_id=conflict.account_id,
            ),
            refresh_token=conflict.refresh_token,
            device_token=device_token,
        )

    # ------------------------------ Disable --------------------------------

    async def disable(self, user_id: uuid.UUID, code: str) -> TotpVerifyOut:
        """
        Verify the current TOTP code, then disable 2FA for the user.
        Requiring a valid code prevents a stolen session from silently
        disabling 2FA.
        """
        user = await self._get_user(user_id)
        if not user.totp_enabled or not user.totp_secret_enc:
            raise TotpError("Two-factor authentication is not enabled.")

        secret = totp_core.decrypt_secret(user.totp_secret_enc)
        if not totp_core.verify_code(secret, code):
            raise TotpError("The code is incorrect.")

        user.totp_enabled = False
        user.totp_secret_enc = None
        await self._session.flush()

        logger.info("totp_disabled", user_id=str(user_id))
        return TotpVerifyOut()

    # ------------------------------ Helpers --------------------------------

    async def _get_user(self, user_id: uuid.UUID) -> User:
        result = await self._session.execute(
            select(User).where(User.id == user_id)
        )
        user = result.scalar_one_or_none()
        if user is None:
            raise TotpError("User not found.")
        return user


# ==================================================
# EXCEPTIONS
# ==================================================


class TotpError(Exception):
    """TOTP setup, confirm, or verify failed."""
