# ============================================================
# backend/app/app/core/totp.py
# ============================================================
#
# Purpose:
#   TOTP (RFC 6238) generation, verification, and secret
#   encryption for two-factor authentication. Uses pyotp for
#   the TOTP maths and Fernet symmetric encryption to store
#   the secret encrypted in the database.
#
# Design:
#   The TOTP secret is never stored in plaintext. It is
#   encrypted with a Fernet key derived from the app secret
#   before any database write. On verify it is decrypted in
#   memory and immediately discarded.
#
#   Fernet key derivation: take the first 32 bytes of the
#   app secret (left-padded with nulls to 32 bytes if shorter),
#   then URL-safe-base64-encode them. This is deterministic so
#   no key-management infrastructure is needed in Phase 1; a
#   dedicated KMS is a Phase 8 hardening item.
#
#   valid_window=1 in TOTP.verify() allows one 30-second step
#   before and after the current window, covering clock skew
#   of up to ±30 seconds between server and device.
#
# Consumed by:
#   - backend/app/app/auth/services/totp_service.py
# ============================================================

import base64

import pyotp  # type: ignore[import]
from cryptography.fernet import Fernet

from app.core.settings import get_settings

# ==================================================
# FERNET KEY
# ==================================================

# ------------------------------ Key derivation ------------------------------
# The key must be exactly 32 bytes before base64 encoding.
# We slice the secret to 32 chars and pad short secrets with null bytes.


def _fernet() -> Fernet:
    raw = _settings.app_secret_key[:32].encode().ljust(32, b"\x00")[:32]
    key = base64.urlsafe_b64encode(raw)
    return Fernet(key)


_settings = get_settings()

# ==================================================
# SECRET MANAGEMENT
# ==================================================


def generate_secret() -> str:
    """Generate a new 20-byte (160-bit) TOTP base32 secret."""
    return pyotp.random_base32()


def encrypt_secret(secret: str) -> str:
    """Encrypt a TOTP secret for database storage. Returns a str ciphertext."""
    return _fernet().encrypt(secret.encode()).decode()


def decrypt_secret(ciphertext: str) -> str:
    """Decrypt a stored TOTP secret back to the base32 plaintext."""
    return _fernet().decrypt(ciphertext.encode()).decode()


# ==================================================
# PROVISIONING
# ==================================================


def provisioning_uri(secret: str, email: str) -> str:
    """
    Build the otpauth:// URI that authenticator apps (Google Authenticator,
    Authy, Microsoft Authenticator) scan to add the account.
    """
    totp = pyotp.TOTP(secret)
    return totp.provisioning_uri(name=email, issuer_name="SovCorE Auto")


# ==================================================
# VERIFICATION
# ==================================================


def verify_code(secret: str, code: str) -> bool:
    """
    Return True if the supplied six-digit code is valid for this secret.
    Allows one 30-second window of clock skew in each direction.
    """
    totp = pyotp.TOTP(secret)
    return totp.verify(code, valid_window=1)
