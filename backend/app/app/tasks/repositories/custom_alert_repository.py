# ============================================================
# backend/app/app/tasks/repositories/custom_alert_repository.py
# ============================================================
#
# Purpose:
#   Data access layer for the custom_alerts table. All queries
#   are scoped to account_id and vehicle_id for tenant isolation.
#
# Design:
#   list_active_all is used by the scheduler to load every alert
#   that should be evaluated on the daily run. It has no account
#   or vehicle filter — the scheduler processes all accounts.
#
#   upsert_service_mileage is called by the vehicle service when
#   service_due_mileage is set or cleared on a VehicleRenewal.
#   It maintains exactly one auto-linked mileage alert per vehicle
#   named "Service (mileage)".
#
#   worst_rag_for_vehicles returns the worst-case alert RAG for a
#   batch of vehicle IDs in a single query, used by the vehicle
#   list endpoint to populate the 5th card dot.
#
# Consumed by:
#   - backend/app/app/tasks/services/custom_alert_service.py
#   - backend/app/app/vehicles/services/vehicle_service.py
#   - backend/app/app/scheduler/jobs.py
# ============================================================

import uuid
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.tasks.models.custom_alert import CustomAlert
from app.tasks.schemas.custom_alert_schemas import (
    CustomAlertCreateIn,
    CustomAlertOut,
    CustomAlertPage,
    CustomAlertPatchIn,
)
from app.vehicles.schemas.vehicle_schemas import RagStatus

# ==================================================
# CUSTOM ALERT REPOSITORY
# ==================================================


class CustomAlertRepository:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    # ==================================================
    # LIST
    # ==================================================

    async def list_by_vehicle(
        self,
        vehicle_id: uuid.UUID,
        account_id: uuid.UUID,
        *,
        page: int = 1,
        page_size: int = 50,
    ) -> CustomAlertPage:
        predicates = [
            CustomAlert.vehicle_id == vehicle_id,
            CustomAlert.account_id == account_id,
        ]

        count_result = await self._db.execute(
            select(func.count()).where(*predicates)
        )
        total = count_result.scalar_one()

        offset = (page - 1) * page_size
        result = await self._db.execute(
            select(CustomAlert)
            .where(*predicates)
            .order_by(CustomAlert.created_at.asc())
            .offset(offset)
            .limit(page_size)
        )
        items = list(result.scalars().all())

        return CustomAlertPage(
            items=[CustomAlertOut.model_validate(a) for a in items],
            total=total,
            page=page,
            page_size=page_size,
        )

    # ==================================================
    # GET
    # ==================================================

    async def get_by_id(
        self, alert_id: uuid.UUID, account_id: uuid.UUID
    ) -> CustomAlert | None:
        result = await self._db.execute(
            select(CustomAlert).where(
                CustomAlert.id == alert_id,
                CustomAlert.account_id == account_id,
            )
        )
        return result.scalar_one_or_none()

    # ==================================================
    # CREATE
    # ==================================================

    async def create(
        self,
        vehicle_id: uuid.UUID,
        account_id: uuid.UUID,
        data: CustomAlertCreateIn,
    ) -> CustomAlert:
        alert = CustomAlert(
            vehicle_id=vehicle_id,
            account_id=account_id,
            name=data.name,
            conditions=list(data.conditions),
            condition_mode=data.condition_mode,
            email_days_before=list(data.email_days_before),
            miles_warning=data.miles_warning,
            active=True,
            notes=data.notes,
        )
        self._db.add(alert)
        await self._db.flush()
        return alert

    # ==================================================
    # PATCH
    # ==================================================

    async def patch(self, alert: CustomAlert, data: CustomAlertPatchIn) -> CustomAlert:
        if data.name is not None:
            alert.name = data.name
        if data.conditions is not None:
            alert.conditions = list(data.conditions)
        if data.condition_mode is not None:
            alert.condition_mode = data.condition_mode
        if data.email_days_before is not None:
            alert.email_days_before = list(data.email_days_before)
        if data.miles_warning is not None:
            alert.miles_warning = data.miles_warning
        if data.active is not None:
            alert.active = data.active
        if data.notes is not None:
            alert.notes = data.notes
        alert.updated_at = datetime.now(timezone.utc)
        self._db.add(alert)
        await self._db.flush()
        return alert

    # ==================================================
    # DELETE
    # ==================================================

    async def delete(self, alert: CustomAlert) -> None:
        await self._db.delete(alert)
        await self._db.flush()

    # ==================================================
    # SCHEDULER QUERY
    # ==================================================

    async def list_active_all(self) -> list[CustomAlert]:
        result = await self._db.execute(
            select(CustomAlert).where(CustomAlert.active.is_(True))
        )
        return list(result.scalars().all())

    # ==================================================
    # AUTO-LINK: SERVICE MILEAGE
    # ==================================================

    async def upsert_service_mileage(
        self,
        vehicle_id: uuid.UUID,
        account_id: uuid.UUID,
        mileage: int | None,
    ) -> None:
        # ~~~~~~~~~ Find the auto-linked service mileage alert ~~~~~~~~~
        # Identified by the reserved name "Service (mileage)" set by the
        # vehicle service. LIMIT 1 guards against any accidental duplicates.
        result = await self._db.execute(
            select(CustomAlert)
            .where(
                CustomAlert.vehicle_id == vehicle_id,
                CustomAlert.account_id == account_id,
                CustomAlert.name == "Service (mileage)",
            )
            .limit(1)
        )
        existing: CustomAlert | None = result.scalar_one_or_none()

        if mileage is None:
            if existing is not None:
                existing.active = False
                existing.updated_at = datetime.now(timezone.utc)
                self._db.add(existing)
                await self._db.flush()
            return

        condition = {"type": "mileage", "at": mileage, "fired": False}

        if existing is not None:
            # Update the mileage threshold and reset fired state.
            existing.conditions = [condition]
            existing.active = True
            existing.updated_at = datetime.now(timezone.utc)
            self._db.add(existing)
        else:
            alert = CustomAlert(
                vehicle_id=vehicle_id,
                account_id=account_id,
                name="Service (mileage)",
                conditions=[condition],
                condition_mode="any",
                email_days_before=[],
                miles_warning=500,
                active=True,
            )
            self._db.add(alert)

        await self._db.flush()

    # ==================================================
    # VEHICLE CARD RAG BATCH QUERY
    # ==================================================

    async def worst_rag_for_vehicles(
        self, vehicle_ids: list[uuid.UUID]
    ) -> dict[uuid.UUID, RagStatus]:
        """
        Returns the worst-case custom alert RAG for each vehicle in a
        single query. Used by the vehicle list endpoint.

        Mapping:
          fired within 7 days  → red
          fired within 30 days → amber
          has alerts, none fired recently → green
          no alerts → unknown (omitted from result; caller defaults to unknown)
        """
        if not vehicle_ids:
            return {}

        now = datetime.now(timezone.utc)
        red_cutoff = now - timedelta(days=7)
        amber_cutoff = now - timedelta(days=30)

        result = await self._db.execute(
            select(
                CustomAlert.vehicle_id,
                func.max(CustomAlert.last_notified_at).label("latest_fired"),
            )
            .where(
                CustomAlert.vehicle_id.in_(vehicle_ids),
                CustomAlert.active.is_(True),
            )
            .group_by(CustomAlert.vehicle_id)
        )
        rows = result.all()

        out: dict[uuid.UUID, RagStatus] = {}
        for row in rows:
            vid = row.vehicle_id
            latest = row.latest_fired
            if latest is None:
                out[vid] = RagStatus.green
            elif latest >= red_cutoff:
                out[vid] = RagStatus.red
            elif latest >= amber_cutoff:
                out[vid] = RagStatus.amber
            else:
                out[vid] = RagStatus.green

        return out
