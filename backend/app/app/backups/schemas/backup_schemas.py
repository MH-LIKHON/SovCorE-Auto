# ============================================================
# backend/app/app/backups/schemas/backup_schemas.py
# ============================================================
#
# Purpose:
#   Pydantic request and response schemas for the backups
#   domain. BackupOut is the API response shape; TriggerBackupIn
#   is the optional body for POST /backups (kind only).
#
# Consumed by:
#   - backend/app/app/api/v1/backups.py
#   - backend/app/app/backups/services/backup_service.py
# ============================================================

import uuid
from datetime import datetime

from pydantic import BaseModel

# ==================================================
# REQUEST SCHEMAS
# ==================================================


class TriggerBackupIn(BaseModel):
    # Callers may omit kind; it defaults to 'manual'.
    kind: str = "manual"


# ==================================================
# RESPONSE SCHEMAS
# ==================================================


class BackupOut(BaseModel):
    id: uuid.UUID
    account_id: uuid.UUID
    kind: str
    r2_key: str | None
    size_bytes: int | None
    status: str
    created_at: datetime
    completed_at: datetime | None

    model_config = {"from_attributes": True}


class BackupDownloadOut(BaseModel):
    """Presigned R2 URL for downloading the backup archive."""
    backup_id: uuid.UUID
    download_url: str
    # Expiry in seconds from now (R2 presigned URL TTL).
    expires_in_seconds: int


class BackupRestoreOut(BaseModel):
    """Summary of what was restored from the backup archive."""
    backup_id: uuid.UUID
    vehicles_restored: int
    records_restored: int
    documents_restored: int
    tasks_restored: int
    reminders_restored: int
    pcns_restored: int
    damage_restored: int
    warranties_restored: int
