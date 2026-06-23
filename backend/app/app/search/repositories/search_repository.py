# ============================================================
# backend/app/app/search/repositories/search_repository.py
# ============================================================
#
# Purpose:
#   ILIKE-based full-text search across five entity types:
#   vehicles, records, documents, tasks, and record tags.
#   All queries are scoped to the caller's account.
#
# Design:
#   PostgreSQL ILIKE is used for case-insensitive substring
#   matching. This is the appropriate choice for a small-to-
#   medium dataset (thousands of records per account) where
#   full-text indexing would add operational complexity without
#   a meaningful performance benefit.
#
#   Each entity type is queried independently so any one slow
#   table cannot block the others from returning. The service
#   layer merges the results into a single SearchResultsOut.
#
#   The query term is tokenised on whitespace: all tokens must
#   match somewhere in the searchable fields (AND semantics).
#   A search for "ford transit" matches a record with supplier
#   "Ford Garages" and vehicle "Transit" only if both tokens
#   appear; it does not match a record with only "ford" in
#   supplier and nothing else. This prevents large spurious
#   result sets from single-word queries on common terms.
#
#   Each query is capped at 50 results per entity type. The UI
#   presents the results in grouped sections so a cap per group
#   gives a cleaner experience than a combined total cap.
#
# Consumed by:
#   - backend/app/app/search/services/search_service.py
# ============================================================

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.documents.models.document import Document
from app.records.models.record import Record, RecordTag
from app.tasks.models.task import Task
from app.vehicles.models.vehicle import Vehicle

# ==================================================
# CONSTANTS
# ==================================================

_MAX_PER_TYPE = 50

# ==================================================
# REPOSITORY
# ==================================================


class SearchRepository:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    # ==================================================
    # VEHICLES
    # ==================================================

    async def search_vehicles(
        self, account_id: uuid.UUID, tokens: list[str]
    ) -> list[dict[str, Any]]:
        """
        Search vehicles on registration, VIN, make, model, variant.
        All tokens must match in at least one of the searchable columns.
        """
        # Build an AND-of-ORs: for each token, at least one column must match.
        conditions = []
        for token in tokens:
            pat = f"%{token}%"
            conditions.append(
                or_(
                    Vehicle.registration.ilike(pat),
                    Vehicle.vin.ilike(pat),
                    Vehicle.make.ilike(pat),
                    Vehicle.model.ilike(pat),
                    Vehicle.variant.ilike(pat),
                )
            )

        stmt = (
            select(
                Vehicle.id,
                Vehicle.registration,
                Vehicle.make,
                Vehicle.model,
                Vehicle.year,
                Vehicle.lifecycle_state,
            )
            .where(Vehicle.account_id == account_id, *conditions)
            .order_by(Vehicle.registration)
            .limit(_MAX_PER_TYPE)
        )
        result = await self._db.execute(stmt)
        return [dict(r) for r in result.mappings().all()]

    # ==================================================
    # RECORDS
    # ==================================================

    async def search_records(
        self, account_id: uuid.UUID, tokens: list[str]
    ) -> list[dict[str, Any]]:
        """
        Search records on supplier, garage, notes, joined to the vehicle
        registration for context. All tokens must match.
        """
        conditions = []
        for token in tokens:
            pat = f"%{token}%"
            conditions.append(
                or_(
                    Record.supplier.ilike(pat),
                    Record.garage.ilike(pat),
                    Record.notes.ilike(pat),
                    # Allow "ford" to surface records on a Ford vehicle.
                    Vehicle.registration.ilike(pat),
                    Vehicle.make.ilike(pat),
                    Vehicle.model.ilike(pat),
                )
            )

        stmt = (
            select(
                Record.id,
                Record.vehicle_id,
                Vehicle.registration.label("vehicle_registration"),
                Record.type,
                Record.date,
                Record.supplier,
                Record.garage,
                Record.notes,
            )
            .join(Vehicle, Vehicle.id == Record.vehicle_id)
            .where(Record.account_id == account_id, *conditions)
            .order_by(Record.date.desc())
            .limit(_MAX_PER_TYPE)
        )
        result = await self._db.execute(stmt)
        return [dict(r) for r in result.mappings().all()]

    # ==================================================
    # DOCUMENTS
    # ==================================================

    async def search_documents(
        self, account_id: uuid.UUID, tokens: list[str]
    ) -> list[dict[str, Any]]:
        """
        Search documents on filename and type. All tokens must match.
        """
        conditions = []
        for token in tokens:
            pat = f"%{token}%"
            conditions.append(
                or_(
                    Document.filename.ilike(pat),
                    Document.type.cast(str).ilike(pat),
                    Vehicle.registration.ilike(pat),
                )
            )

        stmt = (
            select(
                Document.id,
                Document.vehicle_id,
                Vehicle.registration.label("vehicle_registration"),
                Document.type,
                Document.filename,
            )
            .join(Vehicle, Vehicle.id == Document.vehicle_id)
            .where(Document.account_id == account_id, *conditions)
            .order_by(Document.created_at.desc())
            .limit(_MAX_PER_TYPE)
        )
        result = await self._db.execute(stmt)
        return [dict(r) for r in result.mappings().all()]

    # ==================================================
    # TASKS
    # ==================================================

    async def search_tasks(
        self, account_id: uuid.UUID, tokens: list[str]
    ) -> list[dict[str, Any]]:
        """
        Search tasks on title and notes. All tokens must match.
        """
        conditions = []
        for token in tokens:
            pat = f"%{token}%"
            conditions.append(
                or_(
                    Task.title.ilike(pat),
                    Task.notes.ilike(pat),
                    Vehicle.registration.ilike(pat),
                )
            )

        stmt = (
            select(
                Task.id,
                Task.vehicle_id,
                Vehicle.registration.label("vehicle_registration"),
                Task.title,
                Task.status,
                Task.due_date,
            )
            .join(Vehicle, Vehicle.id == Task.vehicle_id)
            .where(Task.account_id == account_id, *conditions)
            .order_by(Task.due_date.asc().nullslast())
            .limit(_MAX_PER_TYPE)
        )
        result = await self._db.execute(stmt)
        return [dict(r) for r in result.mappings().all()]

    # ==================================================
    # TAGS
    # ==================================================

    async def search_tags(
        self, account_id: uuid.UUID, tokens: list[str]
    ) -> list[dict[str, Any]]:
        """
        Search record tags on the tag text. All tokens must match.
        """
        conditions = []
        for token in tokens:
            conditions.append(RecordTag.tag.ilike(f"%{token}%"))

        stmt = (
            select(
                RecordTag.record_id,
                Record.vehicle_id,
                Vehicle.registration.label("vehicle_registration"),
                RecordTag.tag,
                Record.type.label("record_type"),
                Record.date.label("record_date"),
            )
            .join(Record, Record.id == RecordTag.record_id)
            .join(Vehicle, Vehicle.id == Record.vehicle_id)
            .where(Record.account_id == account_id, *conditions)
            .order_by(Record.date.desc())
            .limit(_MAX_PER_TYPE)
        )
        result = await self._db.execute(stmt)
        return [dict(r) for r in result.mappings().all()]
