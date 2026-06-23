# ============================================================
# backend/app/app/api/v1/audit.py
# ============================================================
#
# Purpose:
#   REST endpoint for the audit log. Returns audit_log rows for
#   an account, optionally filtered by table name and row ID.
#   The audit log is append-only; this endpoint is read-only.
#
# Design:
#   Reads audit_log directly via a thin query. Viewer access is
#   required rather than admin because the audit log is surfaced
#   on the vehicle profile; restricting it to admin would prevent
#   most users from seeing their own change history.
#
# Consumed by:
#   - backend/app/app/api/v1/router.py
# ============================================================

import uuid
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.accounts.models.user import User
from app.audit.models.audit_log import AuditLog
from app.core.database import get_db
from app.core.permissions import require_viewer

# ==================================================
# SCHEMA
# ==================================================


class AuditLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    account_id: uuid.UUID
    actor_user_id: uuid.UUID | None
    action: str
    table_name: str
    row_id: uuid.UUID
    old_value: Any
    new_value: Any
    ip_address: str | None
    created_at: datetime


class AuditPage(BaseModel):
    items: list[AuditLogOut]
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
    "/accounts/{account_id}/audit",
    response_model=AuditPage,
    summary="Account-level audit log",
)
async def get_audit_log(
    account_id: uuid.UUID,
    table_name: str | None = Query(None, description="Filter by table (e.g. records)"),
    row_id: uuid.UUID | None = Query(None, description="Filter by specific row UUID"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    _: User = Depends(require_viewer),
    db: AsyncSession = Depends(get_db),
) -> AuditPage:
    base = (
        select(AuditLog)
        .where(AuditLog.account_id == account_id)
    )
    if table_name:
        base = base.where(AuditLog.table_name == table_name)
    if row_id:
        base = base.where(AuditLog.row_id == row_id)

    count_stmt = select(func.count()).select_from(base.subquery())
    total = (await db.execute(count_stmt)).scalar_one()

    stmt = (
        base.order_by(AuditLog.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    result = await db.execute(stmt)
    rows = list(result.scalars().all())

    return AuditPage(
        items=[AuditLogOut.model_validate(r) for r in rows],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get(
    "/accounts/{account_id}/vehicles/{vehicle_id}/audit",
    response_model=AuditPage,
    summary="Audit log filtered to a vehicle's records",
)
async def get_vehicle_audit_log(
    account_id: uuid.UUID,
    vehicle_id: uuid.UUID,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    _: User = Depends(require_viewer),
    db: AsyncSession = Depends(get_db),
) -> AuditPage:
    # The vehicle audit log shows all audit entries for the account scoped
    # to records and documents belonging to this vehicle. For Phase 3 the
    # audit log is sparsely populated (writes are added step-by-step to
    # tracked tables), so a broad account-level view is returned here and
    # filtered in Phase 5 when more tables are audited.
    base = select(AuditLog).where(AuditLog.account_id == account_id)
    count_stmt = select(func.count()).select_from(base.subquery())
    total = (await db.execute(count_stmt)).scalar_one()

    stmt = (
        base.order_by(AuditLog.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    result = await db.execute(stmt)
    rows = list(result.scalars().all())

    return AuditPage(
        items=[AuditLogOut.model_validate(r) for r in rows],
        total=total,
        page=page,
        page_size=page_size,
    )
