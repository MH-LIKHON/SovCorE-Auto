# ============================================================
# backend/app/app/api/v1/backups.py
# ============================================================
#
# Purpose:
#   REST endpoints for account backups. All routes are scoped
#   to a specific account via {account_id}. Trigger and restore
#   are restricted to owner and admin; listing and download
#   are open to any viewer.
#
# Design:
#   POST /backups — runs the full backup synchronously and returns
#   the completed BackupOut. On small to medium accounts this
#   completes in under a second; R2 upload is the bottleneck.
#
#   POST /backups/{backup_id}/restore — upserts all JSON rows
#   from the archive back into the database. Existing rows are
#   not overwritten (ON CONFLICT DO NOTHING).
#
# Consumed by:
#   - backend/app/app/api/v1/router.py
# ============================================================

import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.accounts.models.user import User
from app.backups.schemas.backup_schemas import (
    BackupDownloadOut,
    BackupOut,
    BackupRestoreOut,
    TriggerBackupIn,
)
from app.backups.services.backup_service import BackupService
from app.core.database import get_db
from app.core.permissions import require_admin, require_viewer

# ==================================================
# ROUTER
# ==================================================

router = APIRouter()

# ==================================================
# BACKUP ENDPOINTS
# ==================================================


@router.get(
    "/accounts/{account_id}/backups",
    response_model=list[BackupOut],
    summary="List backups for an account",
)
async def list_backups(
    account_id: uuid.UUID,
    _: User = Depends(require_viewer),
    db: AsyncSession = Depends(get_db),
) -> list[BackupOut]:
    return await BackupService(db).list_backups(account_id)


@router.post(
    "/accounts/{account_id}/backups",
    response_model=BackupOut,
    status_code=status.HTTP_201_CREATED,
    summary="Trigger a manual backup for an account",
)
async def trigger_backup(
    account_id: uuid.UUID,
    body: TriggerBackupIn = TriggerBackupIn(),
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> BackupOut:
    return await BackupService(db).trigger_backup(account_id, kind=body.kind)


@router.get(
    "/accounts/{account_id}/backups/{backup_id}/download",
    response_model=BackupDownloadOut,
    summary="Get a presigned download URL for a completed backup",
)
async def get_download_url(
    account_id: uuid.UUID,
    backup_id: uuid.UUID,
    _: User = Depends(require_viewer),
    db: AsyncSession = Depends(get_db),
) -> BackupDownloadOut:
    return await BackupService(db).get_download_url(account_id, backup_id)


@router.post(
    "/accounts/{account_id}/backups/{backup_id}/restore",
    response_model=BackupRestoreOut,
    summary="Restore data from a completed backup archive",
)
async def restore_backup(
    account_id: uuid.UUID,
    backup_id: uuid.UUID,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> BackupRestoreOut:
    return await BackupService(db).restore_backup(account_id, backup_id)
