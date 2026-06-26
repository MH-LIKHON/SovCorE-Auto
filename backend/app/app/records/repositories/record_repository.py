# ============================================================
# backend/app/app/records/repositories/record_repository.py
# ============================================================
#
# Purpose:
#   Database access layer for the records domain. All queries are
#   filtered by account_id so cross-tenant data access is blocked
#   at the repository level, not only at the service layer.
#
# Design:
#   create() accepts the full RecordCreateIn payload and creates
#   the base record row plus any applicable detail rows (maintenance,
#   fuel, or diagnostic) and attachment rows in a single flush. The
#   caller (record_service) commits the transaction.
#
#   list_by_vehicle returns lightweight rows only (no relations
#   loaded) because the list view does not need attachments or tags.
#
#   get_by_id eagerly loads all relations so the detail view has
#   everything in one query.
#
#   patch() uses model_dump(exclude_unset=True) so only the fields
#   the caller explicitly set are written.
#
#   Diagnostic fault codes use a replace strategy on patch: if the
#   diagnostic block is present in the payload, all existing fault
#   codes for the record are deleted and reinserted from the payload.
#   This keeps the patch semantics simple for the caller.
#
#   list_fault_codes_by_vehicle returns all DiagnosticFaultCode rows
#   across all diagnostics records on a vehicle in a single query.
#   The analytics page uses this to show fault codes without N+1 calls.
#
# Consumed by:
#   - backend/app/app/records/services/record_service.py
# ============================================================

import uuid
from datetime import datetime, timezone

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.records.models.record import (
    DiagnosticDetail,
    DiagnosticFaultCode,
    FuelDetail,
    MaintenanceDetail,
    Record,
    RecordAttachment,
    RecordTag,
    RecordType,
)
from app.records.schemas.record_schemas import (
    AttachmentCreateIn,
    DiagnosticDetailIn,
    DiagnosticFaultCodePatchIn,
    FuelDetailIn,
    MaintenanceDetailIn,
    RecordCreateIn,
    RecordPatchIn,
)

# ==================================================
# RECORD REPOSITORY
# ==================================================


class RecordRepository:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    # ==================================================
    # RECORD CRUD
    # ==================================================

    # ------------------------------ Create ----------------------------------

    async def create(
        self,
        account_id: uuid.UUID,
        vehicle_id: uuid.UUID,
        created_by: uuid.UUID,
        data: RecordCreateIn,
    ) -> Record:
        record = Record(
            account_id=account_id,
            vehicle_id=vehicle_id,
            type=data.type,
            date=data.date,
            mileage=data.mileage,
            cost=data.cost,
            currency=data.currency,
            supplier=data.supplier,
            garage=data.garage,
            notes=data.notes,
            reminder_date=data.reminder_date,
            warranty_expiry=data.warranty_expiry,
            next_due_mileage=data.next_due_mileage,
            next_due_date=data.next_due_date,
            custom_fields=data.custom_fields,
            created_by=created_by,
            updated_by=created_by,
        )
        self._db.add(record)
        await self._db.flush()  # populate record.id before child rows

        # ~~~~~~~~~ Type-specific detail rows ~~~~~~~~~
        # Create the detail row only when the payload includes it and the
        # record type is compatible. The service validates type/detail match
        # before calling create(); the repository trusts that check.
        if data.maintenance is not None:
            await self._create_maintenance_detail(record.id, data.maintenance)

        if data.fuel is not None:
            await self._create_fuel_detail(record.id, data.fuel)

        if data.diagnostic is not None:
            await self._create_diagnostic_detail(record.id, data.diagnostic)
            await self._create_diagnostic_fault_codes(record.id, data.diagnostic.fault_codes)

        # ~~~~~~~~~ Attachments ~~~~~~~~~
        for att in data.attachments:
            await self._create_attachment(record.id, att)

        # ~~~~~~~~~ Tags ~~~~~~~~~
        for tag in data.tags:
            self._db.add(RecordTag(record_id=record.id, tag=tag.strip().lower()))

        await self._db.flush()
        return await self._get_with_relations(record.id)  # type: ignore[return-value]

    # ------------------------------ List ------------------------------------

    async def list_by_vehicle(
        self,
        vehicle_id: uuid.UUID,
        account_id: uuid.UUID,
        *,
        record_type: RecordType | None = None,
        page: int = 1,
        page_size: int = 50,
    ) -> tuple[list[Record], int]:
        base = (
            select(Record)
            .where(Record.vehicle_id == vehicle_id)
            .where(Record.account_id == account_id)
        )
        if record_type is not None:
            base = base.where(Record.type == record_type)

        count_stmt = select(func.count()).select_from(base.subquery())
        count_result = await self._db.execute(count_stmt)
        total = count_result.scalar_one()

        stmt = (
            base.order_by(Record.date.desc(), Record.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        result = await self._db.execute(stmt)
        records = list(result.scalars().all())

        # One extra query to count attachments per record; avoids loading full
        # attachment rows into the session for the lightweight list view.
        if records:
            record_ids = [r.id for r in records]
            cnt_stmt = (
                select(
                    RecordAttachment.record_id,
                    func.count(RecordAttachment.id).label("cnt"),
                )
                .where(RecordAttachment.record_id.in_(record_ids))
                .group_by(RecordAttachment.record_id)
            )
            cnt_result = await self._db.execute(cnt_stmt)
            counts: dict[uuid.UUID, int] = {
                row.record_id: row.cnt for row in cnt_result.all()
            }
            for r in records:
                r.attachment_count = counts.get(r.id, 0)  # type: ignore[attr-defined]

        return records, total

    # ------------------------------ Get by ID -------------------------------

    async def get_by_id(
        self, record_id: uuid.UUID, account_id: uuid.UUID
    ) -> Record | None:
        return await self._get_with_relations(record_id, account_id)

    # ------------------------------ Patch -----------------------------------

    async def patch(self, record: Record, data: RecordPatchIn) -> Record:
        # ~~~~~~~~~ Base fields ~~~~~~~~~
        update = data.model_dump(
            exclude_unset=True, exclude={"maintenance", "fuel", "diagnostic"}
        )
        for field, value in update.items():
            setattr(record, field, value)
        record.updated_at = datetime.now(timezone.utc)
        self._db.add(record)
        await self._db.flush()

        # ~~~~~~~~~ Maintenance detail (upsert) ~~~~~~~~~
        if data.maintenance is not None:
            if record.maintenance_detail is not None:
                md = record.maintenance_detail
                md.category = data.maintenance.category
                md.item = data.maintenance.item
                md.part_number = data.maintenance.part_number
                md.labour_cost = data.maintenance.labour_cost
                md.parts_cost = data.maintenance.parts_cost
                self._db.add(md)
            else:
                await self._create_maintenance_detail(record.id, data.maintenance)
            await self._db.flush()

        # ~~~~~~~~~ Fuel detail (upsert) ~~~~~~~~~
        if data.fuel is not None:
            if record.fuel_detail is not None:
                fd = record.fuel_detail
                fd.litres = data.fuel.litres
                fd.price_per_litre = data.fuel.price_per_litre
                fd.station = data.fuel.station
                fd.full_tank = data.fuel.full_tank
                self._db.add(fd)
            else:
                await self._create_fuel_detail(record.id, data.fuel)
            await self._db.flush()

        # ~~~~~~~~~ Diagnostic detail (upsert) and fault codes (replace) ~~~~~~~~~
        if data.diagnostic is not None:
            if record.diagnostic_detail is not None:
                dd = record.diagnostic_detail
                dd.inspection_type = data.diagnostic.inspection_type
                dd.findings = data.diagnostic.findings
                dd.labour_cost = data.diagnostic.labour_cost
                dd.parts_cost = data.diagnostic.parts_cost
                self._db.add(dd)
            else:
                await self._create_diagnostic_detail(record.id, data.diagnostic)
            # Replace all fault codes: delete existing then reinsert.
            await self._db.execute(
                delete(DiagnosticFaultCode).where(DiagnosticFaultCode.record_id == record.id)
            )
            await self._create_diagnostic_fault_codes(record.id, data.diagnostic.fault_codes)
            await self._db.flush()

        return await self._get_with_relations(record.id)  # type: ignore[return-value]

    # ------------------------------ List fault codes by vehicle -------------

    async def list_fault_codes_by_vehicle(
        self, vehicle_id: uuid.UUID, account_id: uuid.UUID
    ) -> list[DiagnosticFaultCode]:
        # Single JOIN query: only returns fault codes for records belonging
        # to this vehicle and account. No pagination — diagnostics are
        # infrequent and the analytics page needs all codes to compute counts.
        stmt = (
            select(DiagnosticFaultCode)
            .join(Record, Record.id == DiagnosticFaultCode.record_id)
            .where(Record.vehicle_id == vehicle_id)
            .where(Record.account_id == account_id)
            .order_by(DiagnosticFaultCode.sort_order, DiagnosticFaultCode.created_at)
        )
        result = await self._db.execute(stmt)
        return list(result.scalars().all())

    # ------------------------------ Patch single fault code -----------------

    async def get_fault_code_by_id(
        self, fault_code_id: uuid.UUID, account_id: uuid.UUID
    ) -> DiagnosticFaultCode | None:
        stmt = (
            select(DiagnosticFaultCode)
            .join(Record, Record.id == DiagnosticFaultCode.record_id)
            .where(DiagnosticFaultCode.id == fault_code_id)
            .where(Record.account_id == account_id)
        )
        result = await self._db.execute(stmt)
        return result.scalar_one_or_none()

    async def patch_fault_code(
        self, fault_code: DiagnosticFaultCode, data: DiagnosticFaultCodePatchIn
    ) -> DiagnosticFaultCode:
        if data.severity is not None:
            fault_code.severity = data.severity
        if data.resolved_at is not None:
            fault_code.resolved_at = data.resolved_at
        if data.notes is not None:
            fault_code.notes = data.notes
        self._db.add(fault_code)
        await self._db.flush()
        return fault_code

    # ------------------------------ Delete ----------------------------------

    async def delete(self, record: Record) -> None:
        await self._db.delete(record)
        await self._db.flush()

    # ==================================================
    # PRIVATE HELPERS
    # ==================================================

    async def _get_with_relations(
        self, record_id: uuid.UUID, account_id: uuid.UUID | None = None
    ) -> Record | None:
        stmt = (
            select(Record)
            .where(Record.id == record_id)
            .options(
                selectinload(Record.attachments),
                selectinload(Record.tags),
                selectinload(Record.maintenance_detail),
                selectinload(Record.fuel_detail),
                selectinload(Record.diagnostic_detail),
                selectinload(Record.diagnostic_fault_codes),
            )
        )
        if account_id is not None:
            stmt = stmt.where(Record.account_id == account_id)
        result = await self._db.execute(stmt)
        return result.scalar_one_or_none()

    async def _create_maintenance_detail(
        self, record_id: uuid.UUID, data: MaintenanceDetailIn
    ) -> None:
        self._db.add(
            MaintenanceDetail(
                record_id=record_id,
                category=data.category,
                item=data.item,
                part_number=data.part_number,
                labour_cost=data.labour_cost,
                parts_cost=data.parts_cost,
            )
        )

    async def _create_fuel_detail(
        self, record_id: uuid.UUID, data: FuelDetailIn
    ) -> None:
        self._db.add(
            FuelDetail(
                record_id=record_id,
                litres=data.litres,
                price_per_litre=data.price_per_litre,
                station=data.station,
                full_tank=data.full_tank,
            )
        )

    async def _create_attachment(
        self, record_id: uuid.UUID, data: AttachmentCreateIn
    ) -> None:
        self._db.add(
            RecordAttachment(
                record_id=record_id,
                kind=data.kind,
                r2_key=data.r2_key,
                filename=data.filename,
                content_type=data.content_type,
                size_bytes=data.size_bytes,
            )
        )

    async def _create_diagnostic_detail(
        self, record_id: uuid.UUID, data: DiagnosticDetailIn
    ) -> None:
        self._db.add(
            DiagnosticDetail(
                record_id=record_id,
                inspection_type=data.inspection_type,
                findings=data.findings,
                labour_cost=data.labour_cost,
                parts_cost=data.parts_cost,
            )
        )

    async def _create_diagnostic_fault_codes(
        self, record_id: uuid.UUID, codes: list
    ) -> None:
        for fc in codes:
            self._db.add(
                DiagnosticFaultCode(
                    record_id=record_id,
                    code=fc.code,
                    description=fc.description,
                    notes=fc.notes,
                    severity=fc.severity,
                    trigger_date=fc.trigger_date,
                    trigger_mileage=fc.trigger_mileage,
                    resolved_at=fc.resolved_at,
                    sort_order=fc.sort_order,
                )
            )
