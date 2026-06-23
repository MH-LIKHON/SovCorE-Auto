# ============================================================
# backend/app/app/api/v1/vehicle_health.py
# ============================================================
#
# Purpose:
#   Endpoint returning the computed vehicle health score and its
#   per-input breakdown. Introduced in Phase 5 step 5.1.
#
# Design:
#   The score is never stored; it is computed on every request
#   from `vehicle_renewals`, `vehicles.mileage`, and (from
#   Phase 5.4 onward) the open task count. The endpoint is
#   separate from the vehicle CRUD router so the computation
#   stays isolated from the generic PATCH/DELETE paths.
#
#   Damage count and task count queries are intentionally simple
#   scalar queries rather than joined projections because this
#   endpoint is called one vehicle at a time.
#
# Consumed by:
#   - backend/app/app/api/v1/router.py
# ============================================================

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.health.schemas.health_schemas import HealthScoreOut
from app.health.services.health_service import compute_health_score
from app.vehicles.repositories.vehicle_repository import VehicleRepository

# ==================================================
# ROUTER
# ==================================================

router = APIRouter()

# ==================================================
# ENDPOINTS
# ==================================================

# ------------------------------ GET /accounts/{id}/vehicles/{id}/health -----


@router.get(
    "/accounts/{account_id}/vehicles/{vehicle_id}/health",
    response_model=HealthScoreOut,
)
async def get_vehicle_health(
    account_id: uuid.UUID,
    vehicle_id: uuid.UUID,
    _user: object = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> HealthScoreOut:
    # ~~~~~~~~~ Load vehicle and renewals ~~~~~~~~~
    vehicle_repo = VehicleRepository(db)
    vehicle = await vehicle_repo.get_by_id(vehicle_id, account_id)
    if vehicle is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vehicle not found.")
    renewal = await vehicle_repo.get_renewal(vehicle_id, account_id)

    # ~~~~~~~~~ Count open tasks for this vehicle ~~~~~~~~~
    # Imported here to avoid a circular import before the tasks table exists;
    # the import is safe because the tasks module is created in step 5.2.
    open_task_count = 0
    try:
        from app.tasks.models.task import Task, TaskStatus  # noqa: PLC0415
        stmt = select(func.count()).where(
            Task.vehicle_id == vehicle_id,
            Task.account_id == account_id,
            Task.status == TaskStatus.open,
        )
        result = await db.execute(stmt)
        open_task_count = result.scalar_one_or_none() or 0
    except Exception:
        # ~~~~~~~~~ Graceful degradation: tasks table absent until migration 0007 ~~~~~~~~~
        open_task_count = 0

    # ~~~~~~~~~ Compute and return the score ~~~~~~~~~
    return compute_health_score(
        mot_expiry=renewal.mot_expiry if renewal else None,
        insurance_expiry=renewal.insurance_expiry if renewal else None,
        service_due_date=renewal.service_due_date if renewal else None,
        tax_due_date=renewal.tax_due_date if renewal else None,
        service_due_mileage=renewal.service_due_mileage if renewal else None,
        current_mileage=vehicle.mileage,
        open_task_count=open_task_count,
    )
