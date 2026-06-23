# ============================================================
# backend/app/app/erasure/services/erasure_service.py
# ============================================================
#
# Purpose:
#   Business logic for UK GDPR right-to-erasure requests.
#   Orchestrates the two-step flow: request → confirm → purge.
#
# Design:
#   Two steps protect against accidental erasure:
#   1. POST /erasure creates the erasure_request row (status=requested).
#   2. POST /erasure/confirm verifies the typed confirmation phrase
#      "DELETE MY ACCOUNT", flips the row to confirmed, then
#      immediately runs the purge worker.
#
#   Purge sequence:
#   a) List all R2 object keys for the account (documents and backups).
#   b) Delete them from R2 using batch delete.
#   c) Delete every domain row for the account from the database
#      using raw DELETE statements rather than ORM cascades, because
#      cascades depend on the account row still existing. Order matters:
#      children are deleted before parents to avoid FK violations.
#   d) Write a final audit_log row to the system account
#      (UUID 00000000-0000-0000-0000-000000000000) so the deletion
#      event is recorded without retaining personal data.
#   e) Delete the account row itself (cascade removes memberships,
#      preferences, and the R2-cleaned documents/backups rows).
#
#   The erasure_request row is NOT cascade-deleted with the account.
#   Its account_id FK uses SET NULL so the row survives as a record
#   of the deletion. This is the audit trail for GDPR compliance.
#
# Consumed by:
#   - backend/app/app/api/v1/erasure.py
# ============================================================

from __future__ import annotations

import uuid
from datetime import datetime, timezone

import structlog
from fastapi import HTTPException, status
from sqlalchemy import delete, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.erasure.repositories.erasure_repository import ErasureRepository
from app.erasure.schemas.erasure_schemas import (
    ErasureCompleteOut,
    ErasureRequestOut,
)

logger = structlog.get_logger(__name__)

# The typed confirmation phrase the caller must submit to confirm erasure.
_CONFIRMATION_PHRASE = "DELETE MY ACCOUNT"

# System account ID — a well-known all-zeros UUID used for system audit entries.
_SYSTEM_ACCOUNT_ID = uuid.UUID("00000000-0000-0000-0000-000000000000")

# ==================================================
# SERVICE
# ==================================================


class ErasureService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session
        self._repo = ErasureRepository(session)

    # ==================================================
    # REQUEST
    # ==================================================

    async def request_erasure(
        self, account_id: uuid.UUID, requesting_user_id: uuid.UUID
    ) -> ErasureRequestOut:
        """
        Step 1: creates the erasure request row. Refuses if an active
        request already exists so the user cannot stack requests.
        """
        existing = await self._repo.get_active_for_account(account_id)
        if existing is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="An erasure request is already pending for this account.",
            )

        req = await self._repo.create(
            account_id=account_id, requested_by=requesting_user_id
        )
        logger.info(
            "erasure_requested",
            account_id=str(account_id),
            requested_by=str(requesting_user_id),
            erasure_request_id=str(req.id),
        )
        return ErasureRequestOut.model_validate(req)

    # ==================================================
    # CONFIRM AND PURGE
    # ==================================================

    async def confirm_erasure(
        self,
        account_id: uuid.UUID,
        confirmation: str,
    ) -> ErasureCompleteOut:
        """
        Step 2: validates the confirmation phrase, marks the request
        confirmed, then immediately runs the full account purge.
        """
        # ~~~~~~~~~ Validate the typed phrase ~~~~~~~~~
        if confirmation.strip() != _CONFIRMATION_PHRASE:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Type exactly '{_CONFIRMATION_PHRASE}' to confirm erasure.",
            )

        req = await self._repo.get_active_for_account(account_id)
        if req is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No pending erasure request found for this account.",
            )

        # ~~~~~~~~~ Mark confirmed ~~~~~~~~~
        req = await self._repo.mark_confirmed(req)
        erasure_id = req.id

        log = logger.bind(account_id=str(account_id), erasure_request_id=str(erasure_id))
        log.info("erasure_confirmed")

        # ~~~~~~~~~ Purge R2 objects ~~~~~~~~~
        r2_count = await self._purge_r2(account_id)

        # ~~~~~~~~~ Purge database rows (children first) ~~~~~~~~~
        await self._purge_database(account_id)

        # ~~~~~~~~~ Write final system audit entry ~~~~~~~~~
        await self._write_system_audit(account_id, erasure_id)

        # ~~~~~~~~~ Mark erasure request completed (account_id now null) ~~~~~~~~~
        await self._repo.mark_completed(req)

        log.info("erasure_complete", r2_objects_purged=r2_count)

        return ErasureCompleteOut(
            erasure_request_id=erasure_id,
            r2_objects_purged=r2_count,
            message=(
                "Account and all associated data have been permanently deleted. "
                "This action cannot be undone."
            ),
        )

    # ==================================================
    # PURGE HELPERS
    # ==================================================

    async def _purge_r2(self, account_id: uuid.UUID) -> int:
        """
        Lists and deletes all R2 objects keyed under the account prefix.
        Documents are at 'documents/{account_id}/...' and backups are at
        'backups/{account_id}/...'. Both prefixes are scanned and deleted.
        """
        from app.core.settings import get_settings
        from app.integrations.r2 import get_r2_client

        settings = get_settings()
        r2 = get_r2_client()
        bucket = settings.r2_bucket_name
        total_deleted = 0

        for prefix in [f"documents/{account_id}/", f"backups/{account_id}/"]:
            paginator = r2.get_paginator("list_objects_v2")
            pages = paginator.paginate(Bucket=bucket, Prefix=prefix)

            for page in pages:
                objects = page.get("Contents", [])
                if not objects:
                    continue
                # Boto3 batch delete — up to 1,000 objects per call.
                r2.delete_objects(
                    Bucket=bucket,
                    Delete={"Objects": [{"Key": obj["Key"]} for obj in objects], "Quiet": True},
                )
                total_deleted += len(objects)

        return total_deleted

    async def _purge_database(self, account_id: uuid.UUID) -> None:
        """
        Deletes all domain rows for the account. Children are deleted
        before parents to respect FK constraints. The account row itself
        is deleted last; cascade will clean up memberships and preferences.
        """
        # Import models here to avoid circular imports at module load time.
        from app.audit.models.audit_log import AuditLog
        from app.backups.models.backup import Backup
        from app.documents.models.document import Document
        from app.operational.models.damage import DamageEntry
        from app.operational.models.pcn import PCN
        from app.operational.models.warranty import Warranty
        from app.records.models.record import Record
        from app.records.models.timeline_event import TimelineEvent
        from app.tasks.models.reminder import Reminder
        from app.tasks.models.task import Task
        from app.vehicles.models.vehicle import Vehicle
        from app.accounts.models.account import Account

        tables_ordered = [
            AuditLog, Backup, TimelineEvent, Record,
            Document, Task, Reminder, DamageEntry, PCN, Warranty,
            Vehicle,
        ]
        for model in tables_ordered:
            await self._session.execute(
                delete(model).where(model.account_id == account_id)  # type: ignore[attr-defined]
            )

        # Delete the account row itself. ON DELETE CASCADE handles
        # memberships, preferences, and any remaining FK references.
        await self._session.execute(
            delete(Account).where(Account.id == account_id)
        )

        await self._session.flush()

    async def _write_system_audit(
        self, account_id: uuid.UUID, erasure_id: uuid.UUID
    ) -> None:
        """
        Writes a final audit entry to the system account (all-zeros UUID)
        so the erasure event is permanently recorded without retaining the
        personal data that was deleted.
        """
        from app.audit.models.audit_log import AuditLog

        entry = AuditLog(
            account_id=_SYSTEM_ACCOUNT_ID,
            actor_user_id=None,
            action="delete",
            table_name="accounts",
            row_id=str(account_id),
            old_value={"erasure_request_id": str(erasure_id)},
            new_value=None,
        )
        self._session.add(entry)
        await self._session.flush()
