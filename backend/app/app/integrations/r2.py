# ============================================================
# backend/app/app/integrations/r2.py
# ============================================================
#
# Purpose:
#   Cloudflare R2 client factory and signing helpers. R2 is
#   S3-compatible, so the standard boto3 S3 client works with
#   the R2 endpoint URL.
#
# Design:
#   `get_r2_client` returns a boto3 S3 client configured for R2.
#   The client is not cached because boto3 clients are not
#   thread-safe for sharing across coroutines; callers get a
#   new client per operation.
#
#   `sign_r2_get` generates a presigned GET URL for a private R2
#   object. URL generation is pure HMAC signing — no network call
#   to R2. Expired URLs return an XML error from R2 (not from the
#   backend), so callers should use short-enough expiries.
#
# Consumed by:
#   - app/api/v1/vehicles.py
#   - app/api/v1/operational.py
#   - app/api/v1/media.py
#   - app/vehicles/services/document_service.py (Phase 2)
#   - app/backups/services/backup_service.py (Phase 7)
# ============================================================

from __future__ import annotations

from typing import TYPE_CHECKING

import boto3

if TYPE_CHECKING:
    from mypy_boto3_s3 import S3Client

from app.core.settings import get_settings

# ==================================================
# CONSTANTS
# ==================================================

_SIGNED_GET_EXPIRY = 3600  # 1 hour

# ==================================================
# CLIENT FACTORY
# ==================================================


def get_r2_client() -> S3Client:
    settings = get_settings()
    # sovcore-auto is an EU-jurisdiction bucket; EU buckets must use the
    # jurisdiction-specific endpoint or R2 returns AccessDenied on writes.
    return boto3.client(  # type: ignore[return-value]
        "s3",
        endpoint_url=f"https://{settings.r2_account_id}.eu.r2.cloudflarestorage.com",
        aws_access_key_id=settings.r2_access_key_id,
        aws_secret_access_key=settings.r2_secret_access_key,
        region_name="auto",
    )


# ==================================================
# SIGNED GET URL
# ==================================================


def sign_r2_get(key: str | None) -> str | None:
    """Return a presigned GET URL for a private R2 object key, or None if key is None."""
    if not key:
        return None
    settings = get_settings()
    r2 = get_r2_client()
    return r2.generate_presigned_url(
        "get_object",
        Params={"Bucket": settings.r2_bucket_name, "Key": key},
        ExpiresIn=_SIGNED_GET_EXPIRY,
    )
