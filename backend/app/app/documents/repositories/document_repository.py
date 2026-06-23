# ============================================================
# backend/app/app/documents/repositories/document_repository.py
# ============================================================
#
# Purpose:
#   Database access layer for the documents domain. All queries
#   filter by account_id so cross-tenant access is prevented at
#   the repository level.
#
# Consumed by:
#   - backend/app/app/documents/services/document_service.py
# ============================================================

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.documents.models.document import Document
from app.documents.schemas.document_schemas import DocumentCreateIn

# ==================================================
# DOCUMENT REPOSITORY
# ==================================================


class DocumentRepository:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    # ------------------------------ Create ----------------------------------

    async def create(
        self,
        account_id: uuid.UUID,
        created_by: uuid.UUID,
        data: DocumentCreateIn,
    ) -> Document:
        doc = Document(
            account_id=account_id,
            vehicle_id=data.vehicle_id,
            type=data.type,
            r2_key=data.r2_key,
            filename=data.filename,
            content_type=data.content_type,
            size_bytes=data.size_bytes,
            expiry_date=data.expiry_date,
            created_by=created_by,
        )
        self._db.add(doc)
        await self._db.flush()
        return doc

    # ------------------------------ List by vehicle -------------------------

    async def list_by_vehicle(
        self, vehicle_id: uuid.UUID, account_id: uuid.UUID
    ) -> list[Document]:
        stmt = (
            select(Document)
            .where(Document.vehicle_id == vehicle_id)
            .where(Document.account_id == account_id)
            .order_by(Document.created_at.desc())
        )
        result = await self._db.execute(stmt)
        return list(result.scalars().all())

    # ------------------------------ Get by ID -------------------------------

    async def get_by_id(
        self, document_id: uuid.UUID, account_id: uuid.UUID
    ) -> Document | None:
        stmt = (
            select(Document)
            .where(Document.id == document_id)
            .where(Document.account_id == account_id)
        )
        result = await self._db.execute(stmt)
        return result.scalar_one_or_none()

    # ------------------------------ Delete ----------------------------------

    async def delete(self, document: Document) -> None:
        await self._db.delete(document)
        await self._db.flush()
