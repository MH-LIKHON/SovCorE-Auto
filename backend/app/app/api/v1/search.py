# ============================================================
# backend/app/app/api/v1/search.py
# ============================================================
#
# Purpose:
#   Cross-entity search endpoint for Phase 6. A single GET
#   endpoint accepts a query string and returns typed result
#   groups (vehicles, records, documents, tasks, tags).
#
# Design:
#   Viewer access is sufficient — no data is modified.
#   The query parameter is `q`; an empty or blank query returns
#   an empty result set without hitting the database.
#
# Consumed by:
#   - backend/app/app/api/v1/router.py
# ============================================================

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.accounts.models.user import User
from app.core.database import get_db
from app.core.permissions import require_viewer
from app.search.schemas.search_schemas import SearchResultsOut
from app.search.services.search_service import SearchService

# ==================================================
# ROUTER
# ==================================================

router = APIRouter()

# ==================================================
# SEARCH ENDPOINT
# ==================================================


@router.get(
    "/accounts/{account_id}/search",
    response_model=SearchResultsOut,
    summary="Cross-entity search",
)
async def search(
    account_id: uuid.UUID,
    q: str = Query("", max_length=200),
    _: User = Depends(require_viewer),
    db: AsyncSession = Depends(get_db),
) -> SearchResultsOut:
    return await SearchService(db).search(account_id, q)
