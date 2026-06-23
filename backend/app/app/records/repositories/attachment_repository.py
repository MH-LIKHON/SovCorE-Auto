# ============================================================
# backend/app/app/records/repositories/attachment_repository.py
# ============================================================
#
# Purpose:
#   Database access layer for the record_attachments table.
#   All reads join through the parent Record to verify account_id,
#   so cross-tenant access is blocked at the repository level.
#
# Design:
#   RecordAttachment has no account_id column of its own; ownership
#   is established via the FK chain: record_attachment → record →
#   account. list_by_record and get_by_id both join Record and
#   filter on record.account_id to enforce this.
#
# Consumed by:
#   - backend/app/app/api/v1/attachments.py
# ============================================================

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.records.models.record import Record, RecordAttachment
from app.records.schemas.record_schemas import AttachmentCreateIn

# ==================================================
# REPOSITORY
# ==================================================


class AttachmentRepository:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    # ==================================================
    # READS
    # ==================================================

    # ------------------------------ List by record --------------------------

    async def list_by_record(
        self, record_id: uuid.UUID, account_id: uuid.UUID
    ) -> list[RecordAttachment]:
        # Join through Record to verify account ownership before returning rows.
        stmt = (
            select(RecordAttachment)
            .join(Record, RecordAttachment.record_id == Record.id)
            .where(
                RecordAttachment.record_id == record_id,
                Record.account_id == account_id,
            )
            .order_by(RecordAttachment.created_at.asc())
        )
        return list((await self._db.execute(stmt)).scalars().all())

    # ------------------------------ Get by ID -------------------------------

    async def get_by_id(
        self, attachment_id: uuid.UUID, account_id: uuid.UUID
    ) -> RecordAttachment | None:
        stmt = (
            select(RecordAttachment)
            .join(Record, RecordAttachment.record_id == Record.id)
            .where(
                RecordAttachment.id == attachment_id,
                Record.account_id == account_id,
            )
        )
        return (await self._db.execute(stmt)).scalar_one_or_none()

    # ==================================================
    # WRITES
    # ==================================================

    # ------------------------------ Create ----------------------------------

    async def create(
        self, record_id: uuid.UUID, data: AttachmentCreateIn
    ) -> RecordAttachment:
        attachment = RecordAttachment(record_id=record_id, **data.model_dump())
        self._db.add(attachment)
        await self._db.flush()
        await self._db.refresh(attachment)
        return attachment

    # ------------------------------ Delete ----------------------------------

    async def delete(self, attachment: RecordAttachment) -> None:
        await self._db.delete(attachment)
        await self._db.flush()
