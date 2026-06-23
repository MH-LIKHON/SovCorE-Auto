# ============================================================
# backend/app/app/backups/services/backup_service.py
# ============================================================
#
# Purpose:
#   Business logic for account backups. Orchestrates building
#   a JSON ZIP archive of all account data, uploading to R2,
#   and tracking each run in the backups table.
#
# Design:
#   The backup is a ZIP archive containing one JSON file per
#   entity type (vehicles, records, documents, tasks, reminders,
#   PCNs, damage, warranties) plus a manifest.json. JSON is used
#   rather than CSV so that types (integers, booleans, null) are
#   preserved without parsing — this makes the restore path
#   simple and exact.
#
#   The backup runs synchronously within the request because
#   account datasets are small (tens to thousands of rows). A
#   background task could be introduced if p99 latency becomes
#   a problem at larger scale.
#
#   R2 upload uses a single put_object call on the in-memory
#   bytes. No multi-part upload is needed at this scale.
#
#   Download generates a 1-hour presigned URL via boto3. The
#   URL gives the caller temporary read access to the object
#   without exposing permanent credentials.
#
# Consumed by:
#   - backend/app/app/api/v1/backups.py
#   - backend/app/app/scheduler/jobs.py (scheduled backup job)
# ============================================================

from __future__ import annotations

import io
import json
import uuid
import zipfile
from datetime import datetime, timezone

import structlog
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.backups.models.backup import Backup
from app.backups.repositories.backup_repository import BackupRepository
from app.backups.schemas.backup_schemas import (
    BackupDownloadOut,
    BackupOut,
    BackupRestoreOut,
)
from app.core.settings import get_settings
from app.documents.models.document import Document
from app.integrations.r2 import get_r2_client
from app.operational.models.damage import DamageEntry
from app.operational.models.pcn import PCN
from app.operational.models.warranty import Warranty
from app.records.models.record import Record
from app.tasks.models.reminder import Reminder
from app.tasks.models.task import Task
from app.vehicles.models.vehicle import Vehicle

logger = structlog.get_logger(__name__)

# ==================================================
# HELPERS
# ==================================================

_DOWNLOAD_URL_TTL = 3600  # 1 hour


def _serialise(value: object) -> object:
    """Convert any ORM field value to a JSON-serialisable form."""
    if value is None:
        return None
    if isinstance(value, uuid.UUID):
        return str(value)
    if isinstance(value, datetime):
        return value.isoformat()
    if hasattr(value, "value"):
        # Enum — use the string value.
        return str(value.value)
    return value


def _row_to_dict(obj: object, fields: list[str]) -> dict[str, object]:
    return {f: _serialise(getattr(obj, f, None)) for f in fields}


# ==================================================
# SERVICE
# ==================================================


class BackupService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session
        self._repo = BackupRepository(session)

    # ==================================================
    # LIST
    # ==================================================

    async def list_backups(self, account_id: uuid.UUID) -> list[BackupOut]:
        rows = await self._repo.list_by_account(account_id)
        return [BackupOut.model_validate(r) for r in rows]

    # ==================================================
    # TRIGGER
    # ==================================================

    async def trigger_backup(self, account_id: uuid.UUID, kind: str = "manual") -> BackupOut:
        """
        Create a backup row, build the ZIP archive in memory,
        upload to R2, and mark the row complete. Returns the
        completed BackupOut.
        """
        backup = await self._repo.create(account_id=account_id, kind=kind)
        log = logger.bind(backup_id=str(backup.id), account_id=str(account_id), kind=kind)
        log.info("backup_started")

        try:
            # ~~~~~~~~~ Build the ZIP in memory ~~~~~~~~~
            zip_bytes = await self._build_zip(account_id, backup.id)

            # ~~~~~~~~~ Upload to R2 ~~~~~~~~~
            r2_key = f"backups/{account_id}/{backup.id}.zip"
            settings = get_settings()
            r2 = get_r2_client()
            r2.put_object(
                Bucket=settings.r2_bucket_name,
                Key=r2_key,
                Body=zip_bytes,
                ContentType="application/zip",
            )

            # ~~~~~~~~~ Mark the row complete ~~~~~~~~~
            backup = await self._repo.mark_complete(
                backup,
                r2_key=r2_key,
                size_bytes=len(zip_bytes),
            )
            log.info("backup_complete", size_bytes=len(zip_bytes))

        except Exception:
            await self._repo.mark_failed(backup)
            log.exception("backup_failed")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Backup failed. Check the server logs.",
            )

        return BackupOut.model_validate(backup)

    # ==================================================
    # DOWNLOAD
    # ==================================================

    async def get_download_url(
        self, account_id: uuid.UUID, backup_id: uuid.UUID
    ) -> BackupDownloadOut:
        backup = await self._repo.get_by_id(account_id, backup_id)
        if backup is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Backup not found.")
        if backup.status != "complete" or not backup.r2_key:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Backup is not yet complete.",
            )

        settings = get_settings()
        r2 = get_r2_client()
        # Presigned URL expires in 1 hour — long enough to start a download.
        url = r2.generate_presigned_url(
            "get_object",
            Params={"Bucket": settings.r2_bucket_name, "Key": backup.r2_key},
            ExpiresIn=_DOWNLOAD_URL_TTL,
        )
        return BackupDownloadOut(
            backup_id=backup.id,
            download_url=url,
            expires_in_seconds=_DOWNLOAD_URL_TTL,
        )

    # ==================================================
    # RESTORE
    # ==================================================

    async def restore_backup(
        self, account_id: uuid.UUID, backup_id: uuid.UUID
    ) -> BackupRestoreOut:
        """
        Download the backup archive from R2 and upsert each
        entity back into the database.
        Uses INSERT ... ON CONFLICT (id) DO NOTHING so that
        existing rows are not overwritten — only missing rows
        are restored.
        """
        backup = await self._repo.get_by_id(account_id, backup_id)
        if backup is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Backup not found.")
        if backup.status != "complete" or not backup.r2_key:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Backup is not complete and cannot be restored.",
            )

        settings = get_settings()
        r2 = get_r2_client()

        # ~~~~~~~~~ Download the archive ~~~~~~~~~
        response = r2.get_object(Bucket=settings.r2_bucket_name, Key=backup.r2_key)
        zip_bytes = response["Body"].read()

        counts: dict[str, int] = {}

        with zipfile.ZipFile(io.BytesIO(zip_bytes), "r") as zf:
            counts["vehicles"] = await self._restore_vehicles(account_id, zf)
            counts["records"] = await self._restore_records(account_id, zf)
            counts["documents"] = await self._restore_documents(account_id, zf)
            counts["tasks"] = await self._restore_tasks(account_id, zf)
            counts["reminders"] = await self._restore_reminders(account_id, zf)
            counts["pcns"] = await self._restore_pcns(account_id, zf)
            counts["damage"] = await self._restore_damage(account_id, zf)
            counts["warranties"] = await self._restore_warranties(account_id, zf)

        logger.info(
            "restore_complete",
            account_id=str(account_id),
            backup_id=str(backup_id),
            counts=counts,
        )

        return BackupRestoreOut(
            backup_id=backup_id,
            vehicles_restored=counts["vehicles"],
            records_restored=counts["records"],
            documents_restored=counts["documents"],
            tasks_restored=counts["tasks"],
            reminders_restored=counts["reminders"],
            pcns_restored=counts["pcns"],
            damage_restored=counts["damage"],
            warranties_restored=counts["warranties"],
        )

    # ==================================================
    # ZIP BUILDER
    # ==================================================

    async def _build_zip(self, account_id: uuid.UUID, backup_id: uuid.UUID) -> bytes:
        buf = io.BytesIO()

        vehicles = await self._fetch_vehicles(account_id)
        records = await self._fetch_records(account_id)
        documents = await self._fetch_documents(account_id)
        tasks = await self._fetch_tasks(account_id)
        reminders = await self._fetch_reminders(account_id)
        pcns = await self._fetch_pcns(account_id)
        damage = await self._fetch_damage(account_id)
        warranties = await self._fetch_warranties(account_id)

        manifest = {
            "backup_id": str(backup_id),
            "account_id": str(account_id),
            "created_at": datetime.now(timezone.utc).isoformat(),
            "counts": {
                "vehicles": len(vehicles),
                "records": len(records),
                "documents": len(documents),
                "tasks": len(tasks),
                "reminders": len(reminders),
                "pcns": len(pcns),
                "damage": len(damage),
                "warranties": len(warranties),
            },
        }

        # ------------------------------ Vehicle fields -----------------------
        v_fields = [
            "id", "account_id", "registration", "vin", "make", "model", "variant",
            "year", "engine", "fuel_type", "transmission", "body_type", "colour",
            "doors", "seats", "horsepower", "torque", "emission_class", "tyre_sizes",
            "battery_size", "wheel_sizes", "mileage", "image_key",
            "lifecycle_state", "created_at", "updated_at",
        ]
        # ------------------------------ Record fields ------------------------
        r_fields = [
            "id", "account_id", "vehicle_id", "type", "date", "mileage", "cost",
            "currency", "supplier", "garage", "notes", "reminder_date",
            "warranty_expiry", "next_due_mileage", "next_due_date",
            "created_by", "updated_by", "created_at", "updated_at",
        ]
        # ------------------------------ Document fields ----------------------
        d_fields = [
            "id", "account_id", "vehicle_id", "type", "r2_key", "filename",
            "content_type", "size_bytes", "expiry_date", "created_by", "created_at",
        ]
        # ------------------------------ Task fields --------------------------
        t_fields = [
            "id", "account_id", "vehicle_id", "title", "assignee_user_id",
            "status", "due_date", "notes", "created_by", "created_at", "updated_at",
        ]
        # ------------------------------ Reminder fields ----------------------
        rm_fields = [
            "id", "account_id", "vehicle_id", "type", "due_date", "intervals",
            "last_sent_interval", "active", "notes", "created_at",
        ]
        # ------------------------------ PCN fields --------------------------
        p_fields = [
            "id", "account_id", "vehicle_id", "reference", "authority",
            "date", "amount", "status", "notes", "created_at",
        ]
        # ------------------------------ Damage fields -----------------------
        dm_fields = [
            "id", "account_id", "vehicle_id", "kind", "description",
            "repair_cost", "before_key", "after_key", "date", "created_at",
        ]
        # ------------------------------ Warranty fields ---------------------
        w_fields = [
            "id", "account_id", "vehicle_id", "component", "supplier",
            "invoice_key", "parts_cost", "labour_cost", "expiry_date", "notes", "created_at",
        ]

        with zipfile.ZipFile(buf, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
            zf.writestr("manifest.json", json.dumps(manifest, indent=2))
            zf.writestr("vehicles.json", json.dumps([_row_to_dict(v, v_fields) for v in vehicles]))
            zf.writestr("records.json", json.dumps([_row_to_dict(r, r_fields) for r in records]))
            zf.writestr("documents.json", json.dumps([_row_to_dict(d, d_fields) for d in documents]))
            zf.writestr("tasks.json", json.dumps([_row_to_dict(t, t_fields) for t in tasks]))
            zf.writestr("reminders.json", json.dumps([_row_to_dict(rm, rm_fields) for rm in reminders]))
            zf.writestr("pcns.json", json.dumps([_row_to_dict(p, p_fields) for p in pcns]))
            zf.writestr("damage.json", json.dumps([_row_to_dict(dm, dm_fields) for dm in damage]))
            zf.writestr("warranties.json", json.dumps([_row_to_dict(w, w_fields) for w in warranties]))

        return buf.getvalue()

    # ==================================================
    # RESTORE HELPERS — one per entity type
    # ==================================================

    async def _restore_vehicles(
        self, account_id: uuid.UUID, zf: zipfile.ZipFile
    ) -> int:
        from sqlalchemy.dialects.postgresql import insert as pg_insert

        rows: list[dict] = json.loads(zf.read("vehicles.json"))
        count = 0
        for row in rows:
            # Only restore rows that belong to this account.
            if row.get("account_id") != str(account_id):
                continue
            stmt = (
                pg_insert(Vehicle)
                .values(**{k: v for k, v in row.items() if v is not None or k == "image_key"})
                .on_conflict_do_nothing(index_elements=["id"])
            )
            result = await self._session.execute(stmt)
            count += result.rowcount
        return count

    async def _restore_records(
        self, account_id: uuid.UUID, zf: zipfile.ZipFile
    ) -> int:
        from sqlalchemy.dialects.postgresql import insert as pg_insert

        rows: list[dict] = json.loads(zf.read("records.json"))
        count = 0
        for row in rows:
            if row.get("account_id") != str(account_id):
                continue
            stmt = (
                pg_insert(Record)
                .values(**{k: v for k, v in row.items() if v is not None})
                .on_conflict_do_nothing(index_elements=["id"])
            )
            result = await self._session.execute(stmt)
            count += result.rowcount
        return count

    async def _restore_documents(
        self, account_id: uuid.UUID, zf: zipfile.ZipFile
    ) -> int:
        from sqlalchemy.dialects.postgresql import insert as pg_insert

        rows: list[dict] = json.loads(zf.read("documents.json"))
        count = 0
        for row in rows:
            if row.get("account_id") != str(account_id):
                continue
            stmt = (
                pg_insert(Document)
                .values(**{k: v for k, v in row.items() if v is not None})
                .on_conflict_do_nothing(index_elements=["id"])
            )
            result = await self._session.execute(stmt)
            count += result.rowcount
        return count

    async def _restore_tasks(
        self, account_id: uuid.UUID, zf: zipfile.ZipFile
    ) -> int:
        from sqlalchemy.dialects.postgresql import insert as pg_insert

        rows: list[dict] = json.loads(zf.read("tasks.json"))
        count = 0
        for row in rows:
            if row.get("account_id") != str(account_id):
                continue
            stmt = (
                pg_insert(Task)
                .values(**{k: v for k, v in row.items() if v is not None})
                .on_conflict_do_nothing(index_elements=["id"])
            )
            result = await self._session.execute(stmt)
            count += result.rowcount
        return count

    async def _restore_reminders(
        self, account_id: uuid.UUID, zf: zipfile.ZipFile
    ) -> int:
        from sqlalchemy.dialects.postgresql import insert as pg_insert

        rows: list[dict] = json.loads(zf.read("reminders.json"))
        count = 0
        for row in rows:
            if row.get("account_id") != str(account_id):
                continue
            stmt = (
                pg_insert(Reminder)
                .values(**{k: v for k, v in row.items() if v is not None})
                .on_conflict_do_nothing(index_elements=["id"])
            )
            result = await self._session.execute(stmt)
            count += result.rowcount
        return count

    async def _restore_pcns(
        self, account_id: uuid.UUID, zf: zipfile.ZipFile
    ) -> int:
        from sqlalchemy.dialects.postgresql import insert as pg_insert

        rows: list[dict] = json.loads(zf.read("pcns.json"))
        count = 0
        for row in rows:
            if row.get("account_id") != str(account_id):
                continue
            stmt = (
                pg_insert(PCN)
                .values(**{k: v for k, v in row.items() if v is not None})
                .on_conflict_do_nothing(index_elements=["id"])
            )
            result = await self._session.execute(stmt)
            count += result.rowcount
        return count

    async def _restore_damage(
        self, account_id: uuid.UUID, zf: zipfile.ZipFile
    ) -> int:
        from sqlalchemy.dialects.postgresql import insert as pg_insert

        rows: list[dict] = json.loads(zf.read("damage.json"))
        count = 0
        for row in rows:
            if row.get("account_id") != str(account_id):
                continue
            stmt = (
                pg_insert(DamageEntry)
                .values(**{k: v for k, v in row.items() if v is not None})
                .on_conflict_do_nothing(index_elements=["id"])
            )
            result = await self._session.execute(stmt)
            count += result.rowcount
        return count

    async def _restore_warranties(
        self, account_id: uuid.UUID, zf: zipfile.ZipFile
    ) -> int:
        from sqlalchemy.dialects.postgresql import insert as pg_insert

        rows: list[dict] = json.loads(zf.read("warranties.json"))
        count = 0
        for row in rows:
            if row.get("account_id") != str(account_id):
                continue
            stmt = (
                pg_insert(Warranty)
                .values(**{k: v for k, v in row.items() if v is not None})
                .on_conflict_do_nothing(index_elements=["id"])
            )
            result = await self._session.execute(stmt)
            count += result.rowcount
        return count

    # ==================================================
    # FETCH HELPERS
    # ==================================================

    async def _fetch_vehicles(self, account_id: uuid.UUID) -> list[Vehicle]:
        res = await self._session.execute(
            select(Vehicle).where(Vehicle.account_id == account_id).order_by(Vehicle.created_at)
        )
        return list(res.scalars().all())

    async def _fetch_records(self, account_id: uuid.UUID) -> list[Record]:
        res = await self._session.execute(
            select(Record).where(Record.account_id == account_id).order_by(Record.date)
        )
        return list(res.scalars().all())

    async def _fetch_documents(self, account_id: uuid.UUID) -> list[Document]:
        res = await self._session.execute(
            select(Document).where(Document.account_id == account_id).order_by(Document.created_at)
        )
        return list(res.scalars().all())

    async def _fetch_tasks(self, account_id: uuid.UUID) -> list[Task]:
        res = await self._session.execute(
            select(Task).where(Task.account_id == account_id).order_by(Task.created_at)
        )
        return list(res.scalars().all())

    async def _fetch_reminders(self, account_id: uuid.UUID) -> list[Reminder]:
        res = await self._session.execute(
            select(Reminder)
            .where(Reminder.account_id == account_id)
            .order_by(Reminder.created_at)
        )
        return list(res.scalars().all())

    async def _fetch_pcns(self, account_id: uuid.UUID) -> list[PCN]:
        res = await self._session.execute(
            select(PCN).where(PCN.account_id == account_id).order_by(PCN.date)
        )
        return list(res.scalars().all())

    async def _fetch_damage(self, account_id: uuid.UUID) -> list[DamageEntry]:
        res = await self._session.execute(
            select(DamageEntry)
            .where(DamageEntry.account_id == account_id)
            .order_by(DamageEntry.date)
        )
        return list(res.scalars().all())

    async def _fetch_warranties(self, account_id: uuid.UUID) -> list[Warranty]:
        res = await self._session.execute(
            select(Warranty)
            .where(Warranty.account_id == account_id)
            .order_by(Warranty.created_at)
        )
        return list(res.scalars().all())
