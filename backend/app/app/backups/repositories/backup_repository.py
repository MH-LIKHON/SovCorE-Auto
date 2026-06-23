# ============================================================
# backend/app/app/backups/repositories/backup_repository.py
# ============================================================
#
# Purpose:
#   Database persistence for the backups table. All queries
#   for creating, reading, and updating backup rows live here.
#
# Design:
#   The service creates a backup row before the ZIP build starts
#   (status=running). On success it calls mark_complete(); on
#   failure it calls mark_failed(). This ensures the row always
#   reflects the terminal state even if the process is killed
#   mid-upload.
#
# Consumed by:
#   - backend/app/app/backups/services/backup_service.py
# ============================================================

import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.backups.models.backup import Backup

# ==================================================
# BACKUP REPOSITORY
# ==================================================


class BackupRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    # ------------------------------ Create ----------------------------------

    async def create(self, account_id: uuid.UUID, kind: str) -> Backup:
        backup = Backup(account_id=account_id, kind=kind, status="running")
        self._session.add(backup)
        await self._session.flush()
        return backup

    # ------------------------------ Read ------------------------------------

    async def get_by_id(self, account_id: uuid.UUID, backup_id: uuid.UUID) -> Backup | None:
        res = await self._session.execute(
            select(Backup).where(
                Backup.account_id == account_id,
                Backup.id == backup_id,
            )
        )
        return res.scalar_one_or_none()

    async def list_by_account(self, account_id: uuid.UUID, limit: int = 50) -> list[Backup]:
        res = await self._session.execute(
            select(Backup)
            .where(Backup.account_id == account_id)
            .order_by(Backup.created_at.desc())
            .limit(limit)
        )
        return list(res.scalars().all())

    # ------------------------------ Update ----------------------------------

    async def mark_complete(
        self,
        backup: Backup,
        r2_key: str,
        size_bytes: int,
    ) -> Backup:
        backup.r2_key = r2_key
        backup.size_bytes = size_bytes
        backup.status = "complete"
        backup.completed_at = datetime.now(timezone.utc)
        await self._session.flush()
        return backup

    async def mark_failed(self, backup: Backup) -> Backup:
        backup.status = "failed"
        backup.completed_at = datetime.now(timezone.utc)
        await self._session.flush()
        return backup
