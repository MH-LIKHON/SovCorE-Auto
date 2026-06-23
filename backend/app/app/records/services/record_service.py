# ============================================================
# backend/app/app/records/services/record_service.py
# ============================================================
#
# Purpose:
#   Business logic for the records domain. Sits between the API
#   router and the repository. Validates type-detail combinations,
#   enforces tenant scope, and writes a timeline event for every
#   record created or deleted.
#
# Design:
#   _DETAIL_TYPES maps which RecordType values require or allow
#   a detail block. Sending a maintenance detail with a fuel record
#   is silently ignored; the repository only stores what it receives.
#   The service strips the mismatched block before passing to the
#   repository so the database stays clean.
#
#   Timeline events are written in the same transaction as the
#   record so there is no window where a record exists without a
#   matching timeline entry.
#
#   Attachment R2 keys are not validated here; the frontend is
#   responsible for completing the presigned upload before posting
#   the record. A future maintenance job can sweep orphaned R2
#   objects.
#
# Consumed by:
#   - backend/app/app/api/v1/records.py
# ============================================================

import uuid
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.records.models.record import RecordType
from app.records.models.timeline_event import TimelineEvent
from app.records.repositories.record_repository import RecordRepository
from app.records.schemas.record_schemas import (
    RecordCreateIn,
    RecordListOut,
    RecordOut,
    RecordPage,
    RecordPatchIn,
)

# ==================================================
# TYPE-DETAIL MAPPING
# ==================================================

# ------------------------------ Types that accept a maintenance block -------
_MAINTENANCE_TYPES = {RecordType.maintenance, RecordType.repair}

# ------------------------------ Types that accept a fuel block --------------
_FUEL_TYPES = {RecordType.fuel}

# ==================================================
# SERVICE
# ==================================================


class RecordService:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db
        self._repo = RecordRepository(db)

    # ==================================================
    # RECORD CRUD
    # ==================================================

    # ------------------------------ Create ----------------------------------

    async def create_record(
        self,
        account_id: uuid.UUID,
        vehicle_id: uuid.UUID,
        created_by: uuid.UUID,
        data: RecordCreateIn,
    ) -> RecordOut:
        # ~~~~~~~~~ Strip mismatched detail blocks ~~~~~~~~~
        # Silently drop a maintenance block on a non-maintenance type and
        # vice versa, rather than raising an error, to keep the API lenient.
        clean = data.model_copy(deep=True)
        if clean.maintenance is not None and clean.type not in _MAINTENANCE_TYPES:
            clean = clean.model_copy(update={"maintenance": None})
        if clean.fuel is not None and clean.type not in _FUEL_TYPES:
            clean = clean.model_copy(update={"fuel": None})

        record = await self._repo.create(account_id, vehicle_id, created_by, clean)

        # ~~~~~~~~~ Write timeline event ~~~~~~~~~
        await self._write_timeline_event(
            account_id=account_id,
            vehicle_id=vehicle_id,
            kind=f"record.{record.type.value}",
            summary=self._record_summary(record.type, record.supplier, record.garage, record.cost),
            ref_id=record.id,
        )

        return self._to_out(record)

    # ------------------------------ List ------------------------------------

    async def list_records(
        self,
        vehicle_id: uuid.UUID,
        account_id: uuid.UUID,
        *,
        record_type: RecordType | None = None,
        page: int = 1,
        page_size: int = 50,
    ) -> RecordPage:
        rows, total = await self._repo.list_by_vehicle(
            vehicle_id, account_id,
            record_type=record_type,
            page=page,
            page_size=page_size,
        )
        return RecordPage(
            items=[RecordListOut.model_validate(r) for r in rows],
            total=total,
            page=page,
            page_size=page_size,
        )

    # ------------------------------ Get -------------------------------------

    async def get_record(
        self, record_id: uuid.UUID, account_id: uuid.UUID
    ) -> RecordOut:
        record = await self._repo.get_by_id(record_id, account_id)
        if record is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Record not found."
            )
        return self._to_out(record)

    # ------------------------------ Patch -----------------------------------

    async def patch_record(
        self,
        record_id: uuid.UUID,
        account_id: uuid.UUID,
        updated_by: uuid.UUID,
        data: RecordPatchIn,
    ) -> RecordOut:
        record = await self._repo.get_by_id(record_id, account_id)
        if record is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Record not found."
            )
        record.updated_by = updated_by
        updated = await self._repo.patch(record, data)
        return self._to_out(updated)

    # ------------------------------ Delete ----------------------------------

    async def delete_record(
        self,
        record_id: uuid.UUID,
        account_id: uuid.UUID,
        vehicle_id: uuid.UUID,
    ) -> None:
        record = await self._repo.get_by_id(record_id, account_id)
        if record is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Record not found."
            )
        record_type = record.type
        await self._repo.delete(record)

        # ~~~~~~~~~ Timeline event for deletion ~~~~~~~~~
        await self._write_timeline_event(
            account_id=account_id,
            vehicle_id=vehicle_id,
            kind=f"record.deleted",
            summary=f"{record_type.value.capitalize()} record removed",
            ref_id=record_id,
        )

    # ==================================================
    # PRIVATE HELPERS
    # ==================================================

    # ------------------------------ Timeline write --------------------------

    async def _write_timeline_event(
        self,
        *,
        account_id: uuid.UUID,
        vehicle_id: uuid.UUID,
        kind: str,
        summary: str,
        ref_id: uuid.UUID,
    ) -> None:
        event = TimelineEvent(
            account_id=account_id,
            vehicle_id=vehicle_id,
            kind=kind,
            summary=summary,
            ref_table="records",
            ref_id=ref_id,
            occurred_at=datetime.now(timezone.utc),
        )
        self._db.add(event)
        await self._db.flush()

    # ------------------------------ Summary text ----------------------------

    @staticmethod
    def _record_summary(
        record_type: RecordType,
        supplier: str | None,
        garage: str | None,
        cost: int | None,
    ) -> str:
        label = record_type.value.capitalize()
        location = garage or supplier
        if location and cost is not None:
            return f"{label} at {location} — £{cost / 100:.2f}"
        if location:
            return f"{label} at {location}"
        if cost is not None:
            return f"{label} — £{cost / 100:.2f}"
        return label

    # ------------------------------ Output projection -----------------------

    @staticmethod
    def _to_out(record: object) -> RecordOut:
        # model_validate with from_attributes=True reads ORM attributes directly.
        # RecordOut field validators and aliases handle the tag flattening and
        # the maintenance_detail / fuel_detail → maintenance / fuel rename.
        return RecordOut.model_validate(record)
