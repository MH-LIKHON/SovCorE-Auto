# ============================================================
# backend/app/app/api/v1/timeline.py
# ============================================================
#
# Purpose:
#   REST endpoint for the timeline feed. Returns timeline_events
#   for a vehicle, ordered newest first. The timeline is a
#   read-optimised projection of the record system; it is never
#   written through this endpoint.
#
# Design:
#   The endpoint queries timeline_events directly via a thin
#   repository rather than a full service layer, because the only
#   operation is a filtered list with no business logic.
#
# Consumed by:
#   - backend/app/app/api/v1/router.py
# ============================================================

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.accounts.models.user import User
from app.core.database import get_db
from app.core.permissions import require_viewer
from app.records.models.timeline_event import TimelineEvent

# ==================================================
# SCHEMA
# ==================================================


class TimelineEventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    account_id: uuid.UUID
    vehicle_id: uuid.UUID | None
    kind: str
    summary: str
    ref_table: str | None
    ref_id: uuid.UUID | None
    occurred_at: datetime


class TimelinePage(BaseModel):
    items: list[TimelineEventOut]
    total: int
    page: int
    page_size: int


# ==================================================
# ROUTER
# ==================================================

router = APIRouter()

# ==================================================
# ENDPOINTS
# ==================================================


@router.get(
    "/accounts/{account_id}/vehicles/{vehicle_id}/timeline",
    response_model=TimelinePage,
    summary="Vehicle timeline feed",
)
async def get_vehicle_timeline(
    account_id: uuid.UUID,
    vehicle_id: uuid.UUID,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    _: User = Depends(require_viewer),
    db: AsyncSession = Depends(get_db),
) -> TimelinePage:
    # ~~~~~~~~~ Count ~~~~~~~~~
    count_stmt = (
        select(func.count())
        .select_from(TimelineEvent)
        .where(TimelineEvent.vehicle_id == vehicle_id)
        .where(TimelineEvent.account_id == account_id)
    )
    total = (await db.execute(count_stmt)).scalar_one()

    # ~~~~~~~~~ Page ~~~~~~~~~
    stmt = (
        select(TimelineEvent)
        .where(TimelineEvent.vehicle_id == vehicle_id)
        .where(TimelineEvent.account_id == account_id)
        .order_by(TimelineEvent.occurred_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    result = await db.execute(stmt)
    events = list(result.scalars().all())

    return TimelinePage(
        items=[TimelineEventOut.model_validate(e) for e in events],
        total=total,
        page=page,
        page_size=page_size,
    )
