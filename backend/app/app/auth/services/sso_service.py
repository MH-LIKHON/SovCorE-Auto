# ============================================================
# backend/app/app/auth/services/sso_service.py
# ============================================================
#
# Purpose:
#   Microsoft OpenID Connect SSO flow. Builds the authorization
#   URL for /sso/microsoft/start and handles the token exchange
#   and user resolution for /sso/microsoft/callback.
#
# Design:
#   The OIDC flow is code-based. The /start endpoint generates
#   a random state value (returned to the caller, who sets it
#   as an HTTP-only cookie for CSRF protection). The /callback
#   endpoint receives the authorization code and state, verifies
#   state, and calls Microsoft's token endpoint over TLS via
#   httpx. The id_token from the response is decoded (no
#   signature verification needed — the token was received
#   directly from Microsoft's HTTPS endpoint) to extract the
#   user's email, name, and OID (the stable Microsoft identity
#   subject).
#
#   User resolution:
#     1. Look up SSOIdentity by (provider=microsoft, subject=oid).
#     2. If found, load the linked user.
#     3. If not found, look up by email. If email matches an
#        existing user, link the SSO identity to that user.
#     4. If still not found, create a new user, a personal
#        account, an Owner membership, and the SSO identity.
#
#   On any error from Microsoft (bad code, network failure,
#   missing claims) an SSOError is raised; the router maps it
#   to HTTP 400 or 502.
#
# Consumed by:
#   - backend/app/app/api/v1/auth.py (SSO endpoints)
# ============================================================

import secrets
import urllib.parse
import uuid
from dataclasses import dataclass

import httpx
import structlog
from jose import jwt as jose_jwt
from sqlalchemy.ext.asyncio import AsyncSession

from app.accounts.models.account import AccountType
from app.accounts.models.user import Role
from app.accounts.repositories.account_repository import AccountRepository
from app.auth.models.sso_identity import SSOProvider
from app.auth.repositories.auth_code_repository import AuthCodeRepository
from app.auth.schemas.auth_schemas import TokenPairOut
from app.core.security import issue_access_token, issue_refresh_token
from app.core.settings import get_settings

logger = structlog.get_logger(__name__)
_settings = get_settings()

# ==================================================
# MICROSOFT OIDC CONSTANTS
# ==================================================

_AUTHORITY = "https://login.microsoftonline.com"
_SCOPES = "openid email profile"

# ==================================================
# RESULT TYPE
# ==================================================


@dataclass
class SSOResult:
    token_pair: TokenPairOut
    refresh_token: str


# ==================================================
# SERVICE
# ==================================================


class MicrosoftSSOService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session
        self._auth_repo = AuthCodeRepository(session)
        self._account_repo = AccountRepository(session)

    # ------------------------------ Authorization URL --------------------------

    @staticmethod
    def build_auth_url(state: str) -> str:
        """
        Build the Microsoft authorization URL. The caller redirects the
        browser to this URL to begin the OIDC flow.
        """
        tenant = _settings.ms_tenant_id or "common"
        base = f"{_AUTHORITY}/{tenant}/oauth2/v2.0/authorize"
        params = {
            "client_id": _settings.ms_client_id,
            "response_type": "code",
            "redirect_uri": _settings.ms_redirect_uri,
            "response_mode": "query",
            "scope": _SCOPES,
            "state": state,
        }
        return f"{base}?{urllib.parse.urlencode(params)}"

    # ------------------------------ Token exchange ----------------------------

    async def exchange_code(self, code: str) -> dict:
        """
        POST the authorization code to Microsoft's token endpoint.
        Returns the decoded id_token claims.
        Raises SSOError on any network or response failure.
        """
        tenant = _settings.ms_tenant_id or "common"
        token_url = f"{_AUTHORITY}/{tenant}/oauth2/v2.0/token"

        payload = {
            "client_id": _settings.ms_client_id,
            "client_secret": _settings.ms_client_secret,
            "code": code,
            "redirect_uri": _settings.ms_redirect_uri,
            "grant_type": "authorization_code",
        }

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(token_url, data=payload)
        except httpx.RequestError as exc:
            raise SSOError("Could not reach Microsoft — please try again.") from exc

        if resp.status_code != 200:
            logger.warning(
                "ms_token_exchange_failed",
                status=resp.status_code,
                body=resp.text[:200],
            )
            raise SSOError("Microsoft returned an error. Please try signing in again.")

        try:
            data = resp.json()
        except Exception as exc:
            raise SSOError("Microsoft response was not valid JSON.") from exc

        id_token = data.get("id_token")
        if not id_token:
            raise SSOError("No identity token in Microsoft response.")

        # Decode without signature verification — token came directly from
        # Microsoft's HTTPS endpoint so we trust it implicitly.
        try:
            claims = jose_jwt.get_unverified_claims(id_token)
        except Exception as exc:
            raise SSOError("Could not decode Microsoft identity token.") from exc
        return claims

    # ------------------------------ Login resolution --------------------------

    async def login(self, code: str) -> SSOResult:
        """
        Exchange the authorization code for an id_token, resolve or create
        the user, and issue a full token pair.
        """
        claims = await self.exchange_code(code)

        oid = claims.get("oid") or claims.get("sub")
        if not oid:
            raise SSOError("Microsoft identity response is missing a subject claim.")

        # preferred_username is more reliably an email than the email claim.
        email = (
            claims.get("email")
            or claims.get("preferred_username", "")
        ).lower().strip()
        if not email or "@" not in email:
            raise SSOError(
                "Microsoft did not return an email address. "
                "Ensure the Microsoft account has a verified email."
            )

        full_name: str = claims.get("name", "")

        # ~~~~~~~~~ Resolve user ~~~~~~~~~
        sso_identity = await self._auth_repo.get_sso_identity(
            SSOProvider.microsoft, oid
        )

        if sso_identity is not None:
            # Known SSO identity — load the linked user.
            from sqlalchemy import select
            from app.accounts.models.user import User

            result = await self._session.execute(
                select(User).where(User.id == sso_identity.user_id)
            )
            user = result.scalar_one_or_none()
            if user is None or not user.is_active:
                raise SSOError("This account is deactivated.")
        else:
            # No SSO identity yet — look up by email.
            user = await self._auth_repo.get_user_by_email(email)

            if user is None:
                # First login — create user, account, membership.
                user = await self._auth_repo.create_user(email, full_name)
                account = await self._account_repo.create_account(
                    name=full_name or email.split("@")[0],
                    account_type=AccountType.personal,
                )
                await self._account_repo.create_membership(
                    account_id=account.id,
                    user_id=user.id,
                    role=Role.owner,
                )
                logger.info("sso_user_created", user_id=str(user.id), provider="microsoft")
            else:
                logger.info("sso_identity_linked", user_id=str(user.id), provider="microsoft")

            # Create the SSO identity link (for new and existing-email users).
            await self._auth_repo.create_sso_identity(
                user_id=user.id,
                provider=SSOProvider.microsoft,
                subject=oid,
            )

        access = issue_access_token(user.id)
        refresh = issue_refresh_token(user.id)

        accounts = await self._account_repo.get_user_accounts(user.id)
        account_id = str(accounts[0].id) if accounts else None

        logger.info("sso_login_success", user_id=str(user.id), provider="microsoft")

        return SSOResult(
            token_pair=TokenPairOut(
                access_token=access,
                expires_in=_settings.jwt_access_token_expire_minutes * 60,
                account_id=account_id,
            ),
            refresh_token=refresh,
        )


# ==================================================
# STATE HELPERS
# ==================================================


def generate_state() -> str:
    """Generate a 32-byte URL-safe random state value for CSRF protection."""
    return secrets.token_urlsafe(32)


# ==================================================
# EXCEPTIONS
# ==================================================


class SSOError(Exception):
    """Raised when the SSO flow cannot be completed."""


class SSOStateMismatchError(Exception):
    """Raised when the state parameter does not match the cookie."""
