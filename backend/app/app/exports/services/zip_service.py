# ============================================================
# backend/app/app/exports/services/zip_service.py
# ============================================================
#
# Purpose:
#   Generates a full account data export as an in-memory ZIP
#   archive. Provides data portability as required by the UK
#   GDPR right to data portability (Article 20).
#
# Design:
#   All tables that carry personal or operationally significant
#   data are exported as CSV files. Document metadata is included
#   but the R2 binary objects are not fetched — they would make
#   the export impractically large; instead a note in README.txt
#   explains where the raw files can be retrieved.
#
#   The ZIP is built entirely in memory using Python's built-in
#   zipfile module. No temporary files are written to disk.
#
#   CSV files are written as UTF-8 with BOM so they open
#   correctly in Microsoft Excel without a manual import step.
#
# Consumed by:
#   - backend/app/app/api/v1/exports.py
# ============================================================

from __future__ import annotations

import csv
import io
import uuid
import zipfile
from datetime import date, datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.documents.models.document import Document
from app.operational.models.damage import DamageEntry
from app.operational.models.pcn import PCN
from app.operational.models.warranty import Warranty
from app.records.models.record import Record
from app.tasks.models.reminder import Reminder
from app.tasks.models.task import Task
from app.vehicles.models.vehicle import Vehicle

# ==================================================
# HELPERS
# ==================================================


def _str(value: object) -> str:
    """Convert any value to a clean string for CSV output."""
    if value is None:
        return ""
    if isinstance(value, bool):
        return "yes" if value else "no"
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    if hasattr(value, "value"):
        # Enum: use the string value.
        return str(value.value)
    return str(value)


def _csv_bytes(headers: list[str], rows: list[list[str]]) -> bytes:
    """
    Build a UTF-8 BOM CSV from headers and rows. The BOM ensures
    Microsoft Excel opens the file with correct encoding without
    requiring a manual import step.
    """
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(headers)
    writer.writerows(rows)
    # Prepend the BOM so Excel on Windows detects UTF-8 automatically.
    return ("﻿" + buf.getvalue()).encode("utf-8")


# ==================================================
# SERVICE
# ==================================================


class ZipService:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    # ==================================================
    # ACCOUNT EXPORT
    # ==================================================

    async def account_export(self, account_id: uuid.UUID) -> bytes:
        """
        Build a full account export ZIP in memory and return the bytes.
        """
        buf = io.BytesIO()

        with zipfile.ZipFile(buf, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:

            # ~~~~~~~~~ README ~~~~~~~~~
            zf.writestr("README.txt", self._readme())

            # ~~~~~~~~~ Vehicles ~~~~~~~~~
            vehicles = await self._fetch_vehicles(account_id)
            zf.writestr("vehicles.csv", _csv_bytes(
                ["id", "registration", "vin", "make", "model", "year",
                 "engine", "fuel_type", "transmission", "body_type", "colour",
                 "mileage", "lifecycle_state", "created_at"],
                [
                    [
                        _str(v.id), _str(v.registration), _str(v.vin),
                        _str(v.make), _str(v.model), _str(v.year),
                        _str(v.engine), _str(v.fuel_type), _str(v.transmission),
                        _str(v.body_type), _str(v.colour), _str(v.mileage),
                        _str(v.lifecycle_state), _str(v.created_at),
                    ]
                    for v in vehicles
                ],
            ))

            # ~~~~~~~~~ Records ~~~~~~~~~
            records = await self._fetch_records(account_id)
            zf.writestr("records.csv", _csv_bytes(
                ["id", "vehicle_id", "type", "date", "mileage", "cost_pence",
                 "currency", "supplier", "garage", "notes", "created_at"],
                [
                    [
                        _str(r.id), _str(r.vehicle_id), _str(r.type),
                        _str(r.date), _str(r.mileage), _str(r.cost),
                        _str(r.currency), _str(r.supplier), _str(r.garage),
                        _str(r.notes), _str(r.created_at),
                    ]
                    for r in records
                ],
            ))

            # ~~~~~~~~~ Documents ~~~~~~~~~
            documents = await self._fetch_documents(account_id)
            zf.writestr("documents.csv", _csv_bytes(
                ["id", "vehicle_id", "type", "filename", "size_bytes",
                 "expiry_date", "created_at"],
                [
                    [
                        _str(d.id), _str(d.vehicle_id), _str(d.type),
                        _str(d.filename), _str(d.size_bytes),
                        _str(d.expiry_date), _str(d.created_at),
                    ]
                    for d in documents
                ],
            ))

            # ~~~~~~~~~ Tasks ~~~~~~~~~
            tasks = await self._fetch_tasks(account_id)
            zf.writestr("tasks.csv", _csv_bytes(
                ["id", "vehicle_id", "title", "status", "due_date", "notes", "created_at"],
                [
                    [
                        _str(t.id), _str(t.vehicle_id), _str(t.title),
                        _str(t.status), _str(t.due_date), _str(t.notes), _str(t.created_at),
                    ]
                    for t in tasks
                ],
            ))

            # ~~~~~~~~~ Reminders ~~~~~~~~~
            reminders = await self._fetch_reminders(account_id)
            zf.writestr("reminders.csv", _csv_bytes(
                ["id", "vehicle_id", "type", "due_date", "active", "intervals", "created_at"],
                [
                    [
                        _str(rm.id), _str(rm.vehicle_id), _str(rm.type),
                        _str(rm.due_date), _str(rm.active),
                        ";".join(str(i) for i in (rm.intervals or [])),
                        _str(rm.created_at),
                    ]
                    for rm in reminders
                ],
            ))

            # ~~~~~~~~~ PCNs ~~~~~~~~~
            pcns = await self._fetch_pcns(account_id)
            zf.writestr("pcns.csv", _csv_bytes(
                ["id", "vehicle_id", "reference", "authority", "date",
                 "amount_pence", "status", "notes", "created_at"],
                [
                    [
                        _str(p.id), _str(p.vehicle_id), _str(p.reference),
                        _str(p.authority), _str(p.date), _str(p.amount),
                        _str(p.status), _str(p.notes), _str(p.created_at),
                    ]
                    for p in pcns
                ],
            ))

            # ~~~~~~~~~ Damage entries ~~~~~~~~~
            damage = await self._fetch_damage(account_id)
            zf.writestr("damage.csv", _csv_bytes(
                ["id", "vehicle_id", "kind", "description", "repair_cost_pence",
                 "date", "created_at"],
                [
                    [
                        _str(d.id), _str(d.vehicle_id), _str(d.kind),
                        _str(d.description), _str(d.repair_cost),
                        _str(d.date), _str(d.created_at),
                    ]
                    for d in damage
                ],
            ))

            # ~~~~~~~~~ Warranties ~~~~~~~~~
            warranties = await self._fetch_warranties(account_id)
            zf.writestr("warranties.csv", _csv_bytes(
                ["id", "vehicle_id", "component", "supplier", "expiry_date",
                 "notes", "created_at"],
                [
                    [
                        _str(w.id), _str(w.vehicle_id), _str(w.component),
                        _str(w.supplier), _str(w.expiry_date),
                        _str(w.notes), _str(w.created_at),
                    ]
                    for w in warranties
                ],
            ))

        return buf.getvalue()

    # ==================================================
    # README
    # ==================================================

    @staticmethod
    def _readme() -> str:
        today = datetime.now(timezone.utc).strftime("%-d %B %Y at %H:%M UTC")
        return (
            f"SovCorE Auto — Account data export\n"
            f"Exported {today}\n\n"
            "This archive contains a full export of your SovCorE Auto account data\n"
            "in CSV format. Each file can be opened in a spreadsheet application.\n\n"
            "Files included:\n"
            "  vehicles.csv    — all vehicles and their basic information\n"
            "  records.csv     — all records (maintenance, fuel, MOT, tax, etc.)\n"
            "  documents.csv   — document metadata (V5C, insurance, etc.)\n"
            "  tasks.csv       — vehicle tasks\n"
            "  reminders.csv   — scheduled reminders\n"
            "  pcns.csv        — penalty charge notices\n"
            "  damage.csv      — damage history entries\n"
            "  warranties.csv  — warranty records\n\n"
            "Note: document binary files stored in object storage are not included\n"
            "in this export. They can be downloaded individually from the\n"
            "SovCorE Auto documents section for each vehicle.\n\n"
            "Monetary amounts are stored in pence (GBP minor units).\n"
            "To convert to pounds, divide by 100.\n"
        )

    # ==================================================
    # FETCH HELPERS
    # ==================================================

    async def _fetch_vehicles(self, account_id: uuid.UUID) -> list[Vehicle]:
        res = await self._db.execute(
            select(Vehicle)
            .where(Vehicle.account_id == account_id)
            .order_by(Vehicle.registration)
        )
        return list(res.scalars().all())

    async def _fetch_records(self, account_id: uuid.UUID) -> list[Record]:
        res = await self._db.execute(
            select(Record)
            .where(Record.account_id == account_id)
            .order_by(Record.date.asc())
        )
        return list(res.scalars().all())

    async def _fetch_documents(self, account_id: uuid.UUID) -> list[Document]:
        res = await self._db.execute(
            select(Document)
            .where(Document.account_id == account_id)
            .order_by(Document.created_at.asc())
        )
        return list(res.scalars().all())

    async def _fetch_tasks(self, account_id: uuid.UUID) -> list[Task]:
        res = await self._db.execute(
            select(Task)
            .where(Task.account_id == account_id)
            .order_by(Task.created_at.asc())
        )
        return list(res.scalars().all())

    async def _fetch_reminders(self, account_id: uuid.UUID) -> list[Reminder]:
        res = await self._db.execute(
            select(Reminder)
            .where(Reminder.account_id == account_id)
            .order_by(Reminder.created_at.asc())
        )
        return list(res.scalars().all())

    async def _fetch_pcns(self, account_id: uuid.UUID) -> list[PCN]:
        res = await self._db.execute(
            select(PCN)
            .where(PCN.account_id == account_id)
            .order_by(PCN.date.asc())
        )
        return list(res.scalars().all())

    async def _fetch_damage(self, account_id: uuid.UUID) -> list[DamageEntry]:
        res = await self._db.execute(
            select(DamageEntry)
            .where(DamageEntry.account_id == account_id)
            .order_by(DamageEntry.date.asc())
        )
        return list(res.scalars().all())

    async def _fetch_warranties(self, account_id: uuid.UUID) -> list[Warranty]:
        res = await self._db.execute(
            select(Warranty)
            .where(Warranty.account_id == account_id)
            .order_by(Warranty.created_at.asc())
        )
        return list(res.scalars().all())
