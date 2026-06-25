# ============================================================
# backend/app/app/entity_attachments/repositories/
#   entity_attachment_repository.py
# ============================================================
#
# Purpose:
#   Database access layer for the entity_attachments table.
#   All reads filter on account_id to enforce ownership.
#
# Consumed by:
#   - backend/app/app/api/v1/entity_attachments.py
# ============================================================

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.entity_attachments.models.entity_attachment import EntityAttachment


class EntityAttachmentRepository:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    # ==================================================
    # READS
    # ==================================================

    async def list_for_entity(
        self,
        entity_type: str,
        entity_id: uuid.UUID,
        account_id: uuid.UUID,
    ) -> list[EntityAttachment]:
        stmt = (
            select(EntityAttachment)
            .where(
                EntityAttachment.account_id == account_id,
                EntityAttachment.entity_type == entity_type,
                EntityAttachment.entity_id == entity_id,
            )
            .order_by(EntityAttachment.created_at.asc())
        )
        rows = (await self._db.execute(stmt)).scalars().all()
        return list(rows)

    async def get_by_id(
        self, attachment_id: uuid.UUID, account_id: uuid.UUID
    ) -> EntityAttachment | None:
        stmt = select(EntityAttachment).where(
            EntityAttachment.id == attachment_id,
            EntityAttachment.account_id == account_id,
        )
        return (await self._db.execute(stmt)).scalar_one_or_none()

    # ==================================================
    # WRITES
    # ==================================================

    async def create(
        self,
        account_id: uuid.UUID,
        entity_type: str,
        entity_id: uuid.UUID,
        label: str,
        r2_key: str,
        filename: str,
        content_type: str,
        size_bytes: int,
        created_by: uuid.UUID | None,
    ) -> EntityAttachment:
        row = EntityAttachment(
            account_id=account_id,
            entity_type=entity_type,
            entity_id=entity_id,
            label=label,
            r2_key=r2_key,
            filename=filename,
            content_type=content_type,
            size_bytes=size_bytes,
            created_by=created_by,
        )
        self._db.add(row)
        await self._db.flush()
        await self._db.refresh(row)
        return row

    async def delete(self, row: EntityAttachment) -> None:
        await self._db.delete(row)
        await self._db.flush()
