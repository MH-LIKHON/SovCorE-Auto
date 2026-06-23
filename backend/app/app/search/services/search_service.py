# ============================================================
# backend/app/app/search/services/search_service.py
# ============================================================
#
# Purpose:
#   Executes a cross-entity search and assembles the typed
#   result groups into a SearchResultsOut.
#
# Design:
#   The query string is tokenised on whitespace before being
#   passed to the repository. Single-character tokens are
#   discarded — they are too common to be useful and produce
#   excessive result sets.
#
#   The five entity searches run sequentially (not concurrently)
#   to avoid holding multiple database connections open on a
#   connection-pooled async engine. Each query is fast enough
#   (ILIKE with a limit of 50) that sequential execution adds
#   no perceptible latency.
#
#   If the query string is empty or contains only whitespace
#   after tokenising, an empty result set is returned without
#   hitting the database.
#
# Consumed by:
#   - backend/app/app/api/v1/search.py
# ============================================================

from __future__ import annotations

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.search.repositories.search_repository import SearchRepository
from app.search.schemas.search_schemas import (
    DocumentResult,
    RecordResult,
    SearchResultsOut,
    TagResult,
    TaskResult,
    VehicleResult,
)

# ==================================================
# SERVICE
# ==================================================


class SearchService:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db
        self._repo = SearchRepository(db)

    # ==================================================
    # SEARCH
    # ==================================================

    async def search(
        self, account_id: uuid.UUID, query: str
    ) -> SearchResultsOut:
        # ~~~~~~~~~ Tokenise and filter trivial tokens ~~~~~~~~~
        tokens = [t for t in query.strip().split() if len(t) > 1]

        if not tokens:
            return SearchResultsOut(
                query=query,
                total=0,
                vehicles=[],
                records=[],
                documents=[],
                tasks=[],
                tags=[],
            )

        # ~~~~~~~~~ Five sequential searches ~~~~~~~~~
        raw_vehicles   = await self._repo.search_vehicles(account_id, tokens)
        raw_records    = await self._repo.search_records(account_id, tokens)
        raw_documents  = await self._repo.search_documents(account_id, tokens)
        raw_tasks      = await self._repo.search_tasks(account_id, tokens)
        raw_tags       = await self._repo.search_tags(account_id, tokens)

        # ~~~~~~~~~ Map to typed result schemas ~~~~~~~~~
        vehicles = [
            VehicleResult(
                id=str(r["id"]),
                registration=r["registration"],
                make=r["make"],
                model=r["model"],
                year=r["year"],
                lifecycle_state=_str(r["lifecycle_state"]),
            )
            for r in raw_vehicles
        ]

        records = [
            RecordResult(
                id=str(r["id"]),
                vehicle_id=str(r["vehicle_id"]),
                vehicle_registration=r["vehicle_registration"],
                type=_str(r["type"]),
                date=str(r["date"]),
                supplier=r["supplier"],
                garage=r["garage"],
                notes=r["notes"],
            )
            for r in raw_records
        ]

        documents = [
            DocumentResult(
                id=str(r["id"]),
                vehicle_id=str(r["vehicle_id"]),
                vehicle_registration=r["vehicle_registration"],
                type=_str(r["type"]),
                filename=r["filename"],
            )
            for r in raw_documents
        ]

        tasks = [
            TaskResult(
                id=str(r["id"]),
                vehicle_id=str(r["vehicle_id"]),
                vehicle_registration=r["vehicle_registration"],
                title=r["title"],
                status=_str(r["status"]),
                due_date=str(r["due_date"]) if r["due_date"] else None,
            )
            for r in raw_tasks
        ]

        tags = [
            TagResult(
                record_id=str(r["record_id"]),
                vehicle_id=str(r["vehicle_id"]),
                vehicle_registration=r["vehicle_registration"],
                tag=r["tag"],
                record_type=_str(r["record_type"]),
                record_date=str(r["record_date"]),
            )
            for r in raw_tags
        ]

        total = len(vehicles) + len(records) + len(documents) + len(tasks) + len(tags)

        return SearchResultsOut(
            query=query,
            total=total,
            vehicles=vehicles,
            records=records,
            documents=documents,
            tasks=tasks,
            tags=tags,
        )


# ==================================================
# HELPERS
# ==================================================


def _str(value: object) -> str:
    if value is None:
        return ""
    if hasattr(value, "value"):
        return str(value.value)
    return str(value)
