# ============================================================
# backend/app/app/vehicles/services/vehicle_service.py
# ============================================================
#
# Purpose:
#   Business logic for the vehicles domain. Sits between the
#   API router and the repository layer. Handles RAG computation,
#   health-score placeholder, and lifecycle state transitions.
#
# Design:
#   _compute_rag reads the VehicleRenewal dates and returns a
#   RenewalRag with per-indicator status. The thresholds (30 and
#   90 days) are defined here as constants so they can be moved
#   to the KB and made configurable in Phase 5 without touching
#   the API.
#
#   health_score returns 0 (unknown) until Phase 5 defines the
#   algorithm in KB/VEHICLE-HEALTH-SCORE.md. The field is
#   included in VehicleCardOut now so the frontend card component
#   does not need schema changes when Phase 5 lands.
#
#   Lifecycle transitions preserve all history. A vehicle moves
#   to sold/scrapped/archived without losing records, documents
#   or timeline entries. Hard deletion is reserved for the GDPR
#   erasure path.
#
# Consumed by:
#   - backend/app/app/api/v1/vehicles.py
# ============================================================

import uuid
from datetime import date, datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.health.services.health_service import score_for_card
from app.tasks.repositories.custom_alert_repository import CustomAlertRepository
from app.tasks.repositories.reminder_repository import ReminderRepository
from app.tasks.repositories.task_repository import DEFAULT_TASK_TITLES, TaskRepository
from app.vehicles.models.vehicle import Vehicle, VehicleRenewal
from app.vehicles.repositories.vehicle_repository import VehicleRepository
from app.vehicles.schemas.vehicle_schemas import (
    RagStatus,
    RenewalRag,
    VehicleCardOut,
    VehicleCreateIn,
    VehicleLifecycleIn,
    VehicleOut,
    VehicleOwnershipOut,
    VehicleOwnershipPatchIn,
    VehiclePatchIn,
    VehicleRenewalOut,
    VehicleRenewalPutIn,
)

# ==================================================
# RAG THRESHOLDS
# ==================================================

# ------------------------------ Day boundaries for indicator colours --------
# Red: overdue or within 30 days.
# Amber: 31 to 90 days away.
# Green: more than 90 days away.
# These thresholds align with the card indicator colours defined in
# BLUEPRINT/03-data-model.md and will move to KB/VEHICLE-HEALTH-SCORE.md
# when Phase 5 formalises the algorithm.

_RED_DAYS = 30
_AMBER_DAYS = 90


# ==================================================
# SERVICE
# ==================================================


class VehicleService:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db
        self._repo = VehicleRepository(db)
        self._reminder_repo = ReminderRepository(db)
        self._alert_repo = CustomAlertRepository(db)
        self._task_repo = TaskRepository(db)

    # ==================================================
    # VEHICLE CRUD
    # ==================================================

    # ------------------------------ Create ----------------------------------

    async def create_vehicle(
        self, account_id: uuid.UUID, data: VehicleCreateIn
    ) -> VehicleOut:
        vehicle = await self._repo.create(account_id, data)
        await self._create_default_tasks(vehicle.id, account_id)
        return VehicleOut.model_validate(vehicle)

    # ------------------------------ List ------------------------------------

    async def list_vehicles(
        self, account_id: uuid.UUID, *, include_inactive: bool = False
    ) -> list[VehicleCardOut]:
        vehicles = await self._repo.list_by_account(
            account_id, include_inactive=include_inactive
        )
        vehicle_ids = [v.id for v in vehicles]
        alert_rag = await self._alert_repo.worst_rag_for_vehicles(vehicle_ids)
        return [self._to_card(v, alert_rag.get(v.id, RagStatus.unknown)) for v in vehicles]

    # ------------------------------ Get ------------------------------------

    async def get_vehicle(
        self, vehicle_id: uuid.UUID, account_id: uuid.UUID
    ) -> VehicleOut:
        vehicle = await self._repo.get_by_id(vehicle_id, account_id)
        if vehicle is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Vehicle not found."
            )
        return VehicleOut.model_validate(vehicle)

    # ------------------------------ Patch ----------------------------------

    async def patch_vehicle(
        self,
        vehicle_id: uuid.UUID,
        account_id: uuid.UUID,
        data: VehiclePatchIn,
    ) -> VehicleOut:
        vehicle = await self._repo.get_by_id(vehicle_id, account_id)
        if vehicle is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Vehicle not found."
            )
        updated = await self._repo.patch(vehicle, data)
        return VehicleOut.model_validate(updated)

    # ------------------------------ Delete ---------------------------------

    async def delete_vehicle(
        self, vehicle_id: uuid.UUID, account_id: uuid.UUID
    ) -> None:
        vehicle = await self._repo.get_by_id(vehicle_id, account_id)
        if vehicle is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Vehicle not found."
            )
        await self._repo.delete(vehicle)

    # ==================================================
    # LIFECYCLE
    # ==================================================

    async def set_lifecycle(
        self,
        vehicle_id: uuid.UUID,
        account_id: uuid.UUID,
        data: VehicleLifecycleIn,
    ) -> VehicleOut:
        vehicle = await self._repo.get_by_id(vehicle_id, account_id)
        if vehicle is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Vehicle not found."
            )
        # VehiclePatchIn does not expose lifecycle_state intentionally; the
        # generic PATCH endpoint cannot transition lifecycle. Only this
        # dedicated endpoint changes lifecycle so the state change is explicit.
        vehicle.lifecycle_state = data.state
        vehicle.updated_at = datetime.now(timezone.utc)
        self._db.add(vehicle)
        await self._db.flush()
        return VehicleOut.model_validate(vehicle)

    # ==================================================
    # RENEWALS
    # ==================================================

    # ------------------------------ Get renewals ----------------------------

    async def get_renewals(
        self, vehicle_id: uuid.UUID, account_id: uuid.UUID
    ) -> VehicleRenewalOut:
        renewal = await self._repo.get_renewal(vehicle_id, account_id)
        if renewal is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Renewal record not found.",
            )
        return VehicleRenewalOut.model_validate(renewal)

    # ------------------------------ Put renewals ----------------------------

    async def put_renewals(
        self,
        vehicle_id: uuid.UUID,
        account_id: uuid.UUID,
        data: VehicleRenewalPutIn,
    ) -> VehicleRenewalOut:
        renewal = await self._repo.get_renewal(vehicle_id, account_id)
        if renewal is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Renewal record not found.",
            )
        updated = await self._repo.put_renewal(renewal, data)
        await self._sync_renewal_reminders(vehicle_id, account_id, data)
        return VehicleRenewalOut.model_validate(updated)

    # ==================================================
    # DEFAULT TASK SEED
    # ==================================================

    async def _create_default_tasks(
        self, vehicle_id: uuid.UUID, account_id: uuid.UUID
    ) -> None:
        # ~~~~~~~~~ Seed five mandatory setup tasks for every new vehicle ~~~~~~~~~
        # These guide the user through the initial setup. They are marked
        # is_system_default=True so the delete endpoint rejects removal.
        # Users can edit titles, add due dates, or mark completed.
        for title in DEFAULT_TASK_TITLES:
            await self._task_repo.create_system_default(vehicle_id, account_id, title)

    # ==================================================
    # RENEWAL AUTO-LINK
    # ==================================================

    async def _sync_renewal_reminders(
        self,
        vehicle_id: uuid.UUID,
        account_id: uuid.UUID,
        data: VehicleRenewalPutIn,
    ) -> None:
        # ~~~~~~~~~ Upsert date-based reminders for the four renewal fields ~~~~~~~~~
        mapping = {
            "mot": data.mot_expiry,
            "tax": data.tax_due_date,
            "insurance": data.insurance_expiry,
            "service": data.service_due_date,
        }
        for reminder_type, due_date in mapping.items():
            await self._reminder_repo.upsert_by_type(
                vehicle_id, account_id, reminder_type, due_date
            )
        # ~~~~~~~~~ Upsert mileage-based custom alert for service_due_mileage ~~~~~~~~~
        await self._alert_repo.upsert_service_mileage(
            vehicle_id, account_id, data.service_due_mileage
        )

    # ==================================================
    # OWNERSHIP
    # ==================================================

    # ------------------------------ Get ownership ---------------------------

    async def get_ownership(
        self, vehicle_id: uuid.UUID, account_id: uuid.UUID
    ) -> VehicleOwnershipOut:
        ownership = await self._repo.get_ownership(vehicle_id, account_id)
        if ownership is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Ownership record not found.",
            )
        return VehicleOwnershipOut.model_validate(ownership)

    # ------------------------------ Patch ownership -------------------------

    async def patch_ownership(
        self,
        vehicle_id: uuid.UUID,
        account_id: uuid.UUID,
        data: VehicleOwnershipPatchIn,
    ) -> VehicleOwnershipOut:
        ownership = await self._repo.get_ownership(vehicle_id, account_id)
        if ownership is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Ownership record not found.",
            )
        updated = await self._repo.patch_ownership(ownership, data)
        return VehicleOwnershipOut.model_validate(updated)

    # ==================================================
    # PRIVATE HELPERS
    # ==================================================

    # ------------------------------ Card projection -------------------------

    def _to_card(
        self,
        vehicle: Vehicle,
        custom_alert_status: RagStatus = RagStatus.unknown,
    ) -> VehicleCardOut:
        return VehicleCardOut(
            id=vehicle.id,
            registration=vehicle.registration,
            make=vehicle.make,
            model=vehicle.model,
            variant=vehicle.variant,
            year=vehicle.year,
            mileage=vehicle.mileage,
            body_type=vehicle.body_type,
            lifecycle_state=vehicle.lifecycle_state,
            image_key=vehicle.image_key,
            renewals=self._compute_rag(vehicle.renewal),
            health_score=self._compute_card_health(vehicle),
            custom_alert_status=custom_alert_status,
        )

    # ------------------------------ Card health score -----------------------

    @staticmethod
    def _compute_card_health(vehicle: Vehicle) -> int:
        renewal = vehicle.renewal
        return score_for_card(
            mot_expiry=renewal.mot_expiry if renewal else None,
            insurance_expiry=renewal.insurance_expiry if renewal else None,
            service_due_date=renewal.service_due_date if renewal else None,
            tax_due_date=renewal.tax_due_date if renewal else None,
            service_due_mileage=renewal.service_due_mileage if renewal else None,
            current_mileage=vehicle.mileage,
        )

    # ------------------------------ RAG computation -------------------------

    def _compute_rag(self, renewal: VehicleRenewal | None) -> RenewalRag:
        if renewal is None:
            return RenewalRag()
        today = date.today()
        return RenewalRag(
            mot=self._date_rag(renewal.mot_expiry, today),
            tax=self._date_rag(renewal.tax_due_date, today),
            insurance=self._date_rag(renewal.insurance_expiry, today),
            service=self._date_rag(renewal.service_due_date, today),
        )

    @staticmethod
    def _date_rag(expiry: date | None, today: date) -> RagStatus:
        if expiry is None:
            return RagStatus.unknown
        days_remaining = (expiry - today).days
        if days_remaining <= _RED_DAYS:
            return RagStatus.red
        if days_remaining <= _AMBER_DAYS:
            return RagStatus.amber
        return RagStatus.green
