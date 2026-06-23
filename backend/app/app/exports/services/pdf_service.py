# ============================================================
# backend/app/app/exports/services/pdf_service.py
# ============================================================
#
# Purpose:
#   Generates PDF reports for vehicle export. Four report types
#   are supported: full vehicle report, service history,
#   maintenance report, and expense report. All return a bytes
#   object ready to stream as an HTTP response.
#
# Design:
#   Uses fpdf2 (pure Python, no system dependencies). The PDF
#   is built in memory and never written to disk.
#
#   Monetary values arrive as pence integers; the service
#   formats them as GBP strings before writing to the PDF.
#
#   Page header and footer are consistent across all report
#   types: SovCorE Auto branding, report title, vehicle
#   registration, and export date.
#
# Consumed by:
#   - backend/app/app/api/v1/exports.py
# ============================================================

from __future__ import annotations

import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any

from fpdf import FPDF
from sqlalchemy.ext.asyncio import AsyncSession

from app.records.models.record import FuelDetail, MaintenanceDetail, Record, RecordType
from app.vehicles.models.vehicle import Vehicle, VehicleRenewal

# ==================================================
# CONSTANTS
# ==================================================

# ------------------------------ Colours (R, G, B) ---------------------------
_WHITE = (255, 255, 255)
_DARK  = (12, 12, 18)           # --colour-bg equivalent in print
_MUTED = (120, 120, 130)
_ACCENT= (108, 99, 255)
_RED   = (239, 68, 68)
_AMBER = (245, 158, 11)
_GREEN = (74, 222, 128)

# ------------------------------ Type labels ---------------------------------
_RECORD_LABELS: dict[str, str] = {
    "maintenance":  "Maintenance",
    "repair":       "Repairs",
    "fuel":         "Fuel",
    "mot":          "MOT",
    "tax":          "Road tax",
    "insurance":    "Insurance",
    "parking":      "Parking",
    "pcn":          "Penalty notice",
    "cleaning":     "Cleaning",
    "accessories":  "Accessories",
    "warranty":     "Warranty",
    "diagnostics":  "Diagnostics",
    "damage":       "Damage",
    "custom":       "Other",
}

_MAINT_LABELS: dict[str, str] = {
    "engine":        "Engine",
    "transmission":  "Transmission",
    "brakes":        "Brakes",
    "suspension":    "Suspension",
    "steering":      "Steering",
    "wheels":        "Wheels and tyres",
    "cooling":       "Cooling",
    "electrical":    "Electrical",
    "hvac":          "HVAC",
    "exhaust":       "Exhaust",
    "miscellaneous": "Miscellaneous",
}

# ==================================================
# INTERNAL PDF CLASS
# ==================================================


class _AutoPDF(FPDF):
    """
    FPDF subclass that adds a consistent page header and footer to
    every page, and provides helpers for the report sections.
    """

    def __init__(self, title: str, registration: str) -> None:
        super().__init__(orientation="P", unit="mm", format="A4")
        self._report_title = title
        self._registration = registration
        self._export_date = date.today().strftime("%-d %B %Y")
        self.set_margins(20, 20, 20)
        self.set_auto_page_break(auto=True, margin=25)

    # ------------------------------ Page header ---------------------------------

    def header(self) -> None:
        # Brand name
        self.set_font("Helvetica", "B", 11)
        self.set_text_color(*_DARK)
        self.cell(0, 6, "SovCorE Auto", ln=False)
        # Report title right-aligned
        self.set_font("Helvetica", "", 9)
        self.set_text_color(*_MUTED)
        self.cell(0, 6, self._report_title, align="R", ln=True)
        # Vehicle registration
        self.set_font("Helvetica", "B", 9)
        self.set_text_color(*_ACCENT)
        self.cell(0, 5, self._registration, ln=True)
        # Divider line
        self.set_draw_color(*_MUTED)
        self.set_line_width(0.2)
        self.line(20, self.get_y() + 1, 190, self.get_y() + 1)
        self.ln(4)

    # ------------------------------ Page footer ---------------------------------

    def footer(self) -> None:
        self.set_y(-15)
        self.set_font("Helvetica", "", 8)
        self.set_text_color(*_MUTED)
        self.cell(0, 5, f"Exported {self._export_date}", ln=False)
        self.cell(0, 5, f"Page {self.page_no()}", align="R", ln=True)

    # ------------------------------ Section title ------------------------------

    def section_title(self, text: str) -> None:
        self.set_font("Helvetica", "B", 10)
        self.set_text_color(*_DARK)
        self.ln(2)
        self.cell(0, 7, text, ln=True)
        self.set_draw_color(*_MUTED)
        self.set_line_width(0.15)
        self.line(20, self.get_y(), 190, self.get_y())
        self.ln(3)

    # ------------------------------ Key-value row ------------------------------

    def kv_row(self, label: str, value: str) -> None:
        self.set_font("Helvetica", "", 9)
        self.set_text_color(*_MUTED)
        self.cell(55, 5, label)
        self.set_text_color(*_DARK)
        self.multi_cell(0, 5, value)

    # ------------------------------ Table header row ---------------------------

    def table_header(self, cols: list[tuple[str, float]]) -> None:
        """cols is a list of (label, width_mm)."""
        self.set_font("Helvetica", "B", 8)
        self.set_fill_color(240, 240, 245)
        self.set_text_color(*_MUTED)
        for label, w in cols:
            self.cell(w, 5, label, border=0, fill=True)
        self.ln()

    # ------------------------------ Table data row ----------------------------

    def table_row(self, cells: list[tuple[str, float]], alt: bool = False) -> None:
        """cells is a list of (text, width_mm). alt=True gives a subtle bg."""
        self.set_font("Helvetica", "", 8)
        self.set_text_color(*_DARK)
        if alt:
            self.set_fill_color(248, 248, 252)
        else:
            self.set_fill_color(*_WHITE)
        for text, w in cells:
            self.cell(w, 5, text, border=0, fill=True)
        self.ln()


# ==================================================
# HELPERS
# ==================================================


def _gbp(pence: int | None) -> str:
    if not pence:
        return "—"
    return f"£{pence / 100:,.2f}"


def _fmt_date(d: date | None) -> str:
    if d is None:
        return "—"
    return d.strftime("%-d %b %Y")


def _type_str(rt: Any) -> str:
    return rt.value if hasattr(rt, "value") else str(rt)


# ==================================================
# SERVICE
# ==================================================


class PDFService:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    # ==================================================
    # VEHICLE REPORT
    # ==================================================

    async def vehicle_report(
        self, vehicle_id: uuid.UUID, account_id: uuid.UUID
    ) -> bytes:
        """
        Full vehicle report: vehicle info, renewal dates, record
        summary by type, 20 most recent records.
        """
        from sqlalchemy import select

        # ~~~~~~~~~ Load vehicle ~~~~~~~~~
        v_res = await self._db.execute(
            select(Vehicle).where(
                Vehicle.id == vehicle_id,
                Vehicle.account_id == account_id,
            )
        )
        vehicle: Vehicle | None = v_res.scalar_one_or_none()
        if vehicle is None:
            raise ValueError("Vehicle not found.")

        # ~~~~~~~~~ Load renewals ~~~~~~~~~
        r_res = await self._db.execute(
            select(VehicleRenewal).where(
                VehicleRenewal.vehicle_id == vehicle_id
            )
        )
        renewals: VehicleRenewal | None = r_res.scalar_one_or_none()

        # ~~~~~~~~~ Load all records ~~~~~~~~~
        rec_res = await self._db.execute(
            select(Record)
            .where(
                Record.vehicle_id == vehicle_id,
                Record.account_id == account_id,
            )
            .order_by(Record.date.desc())
        )
        records = rec_res.scalars().all()

        # ~~~~~~~~~ Build PDF ~~~~~~~~~
        reg = vehicle.registration or "Unknown"
        pdf = _AutoPDF("Vehicle Report", reg)
        pdf.add_page()

        # ---- Vehicle info section ----
        pdf.section_title("Vehicle")
        pdf.kv_row("Registration", reg)
        pdf.kv_row("Make and model", f"{vehicle.make or ''} {vehicle.model or ''}".strip() or "—")
        pdf.kv_row("Year", str(vehicle.year) if vehicle.year else "—")
        pdf.kv_row("VIN", vehicle.vin or "—")
        pdf.kv_row("Colour", vehicle.colour or "—")
        pdf.kv_row("Fuel type", (vehicle.fuel_type or "—").capitalize())
        pdf.kv_row("Transmission", (vehicle.transmission or "—").capitalize())
        pdf.kv_row("Body type", (vehicle.body_type.value if vehicle.body_type else "—").capitalize())
        pdf.kv_row("Engine", vehicle.engine or "—")
        pdf.kv_row("Mileage", f"{vehicle.mileage:,} mi" if vehicle.mileage else "—")
        pdf.kv_row("Lifecycle", (vehicle.lifecycle_state.value if vehicle.lifecycle_state else "—").capitalize())
        pdf.ln(2)

        # ---- Renewal dates section ----
        pdf.section_title("Renewal dates")
        if renewals:
            pdf.kv_row("MOT expiry", _fmt_date(renewals.mot_expiry))
            pdf.kv_row("Tax due", _fmt_date(renewals.tax_due_date))
            pdf.kv_row("Insurance expiry", _fmt_date(renewals.insurance_expiry))
            pdf.kv_row("Service due date", _fmt_date(renewals.service_due_date))
            pdf.kv_row(
                "Service due mileage",
                f"{renewals.service_due_mileage:,} mi" if renewals.service_due_mileage else "—",
            )
        else:
            pdf.kv_row("", "No renewal data recorded.")
        pdf.ln(2)

        # ---- Record summary section ----
        pdf.section_title("Record summary")
        from collections import defaultdict
        type_count: dict[str, int] = defaultdict(int)
        type_spend: dict[str, int] = defaultdict(int)
        total_spend = 0

        for rec in records:
            rt = _type_str(rec.type)
            type_count[rt] += 1
            type_spend[rt] += rec.cost or 0
            total_spend += rec.cost or 0

        if type_count:
            cols = [("Category", 75), ("Count", 25), ("Total spend", 50)]
            pdf.table_header(cols)
            for i, rt in enumerate(sorted(type_count, key=lambda k: type_count[k], reverse=True)):
                label = _RECORD_LABELS.get(rt, rt.capitalize())
                pdf.table_row(
                    [(label, 75), (str(type_count[rt]), 25), (_gbp(type_spend[rt]), 50)],
                    alt=i % 2 == 1,
                )
            pdf.ln(2)
            pdf.set_font("Helvetica", "B", 9)
            pdf.set_text_color(*_DARK)
            pdf.cell(0, 5, f"Total spend: {_gbp(total_spend)}", ln=True)
        else:
            pdf.set_font("Helvetica", "", 9)
            pdf.set_text_color(*_MUTED)
            pdf.cell(0, 5, "No records.", ln=True)
        pdf.ln(2)

        # ---- Recent records section (latest 20) ----
        pdf.section_title("Recent records")
        if records:
            cols = [("Date", 28), ("Type", 45), ("Supplier / garage", 62), ("Cost", 35)]
            pdf.table_header(cols)
            for i, rec in enumerate(records[:20]):
                supplier = (rec.supplier or rec.garage or "—")[:40]
                pdf.table_row(
                    [
                        (_fmt_date(rec.date), 28),
                        (_RECORD_LABELS.get(_type_str(rec.type), _type_str(rec.type)), 45),
                        (supplier, 62),
                        (_gbp(rec.cost), 35),
                    ],
                    alt=i % 2 == 1,
                )
            if len(records) > 20:
                pdf.set_font("Helvetica", "", 8)
                pdf.set_text_color(*_MUTED)
                pdf.ln(2)
                pdf.cell(0, 5, f"… and {len(records) - 20} older records not shown.", ln=True)
        else:
            pdf.set_font("Helvetica", "", 9)
            pdf.set_text_color(*_MUTED)
            pdf.cell(0, 5, "No records.", ln=True)

        return bytes(pdf.output())

    # ==================================================
    # SERVICE HISTORY
    # ==================================================

    async def service_history(
        self, vehicle_id: uuid.UUID, account_id: uuid.UUID
    ) -> bytes:
        """
        Service history: every maintenance and repair record in date
        order, with category, supplier, and cost columns.
        """
        from sqlalchemy import select

        v_res = await self._db.execute(
            select(Vehicle).where(
                Vehicle.id == vehicle_id,
                Vehicle.account_id == account_id,
            )
        )
        vehicle: Vehicle | None = v_res.scalar_one_or_none()
        if vehicle is None:
            raise ValueError("Vehicle not found.")

        rec_res = await self._db.execute(
            select(Record, MaintenanceDetail)
            .join(MaintenanceDetail, MaintenanceDetail.record_id == Record.id)
            .where(
                Record.vehicle_id == vehicle_id,
                Record.account_id == account_id,
                Record.type.in_([RecordType.maintenance, RecordType.repair]),
            )
            .order_by(Record.date.asc())
        )
        rows = rec_res.all()

        reg = vehicle.registration or "Unknown"
        pdf = _AutoPDF("Service History", reg)
        pdf.add_page()

        pdf.section_title("Service history")
        pdf.kv_row("Vehicle", f"{reg} — {vehicle.make or ''} {vehicle.model or ''}".strip())
        pdf.ln(3)

        if rows:
            cols = [("Date", 28), ("Category", 42), ("Item", 55), ("Mileage", 25), ("Cost", 20)]
            pdf.table_header(cols)
            for i, (rec, detail) in enumerate(rows):
                cat = _MAINT_LABELS.get(
                    detail.category.value if hasattr(detail.category, "value") else str(detail.category),
                    "—",
                )
                item = (detail.item or "—")[:35]
                mileage = f"{rec.mileage:,}" if rec.mileage else "—"
                cost = _gbp(rec.cost)
                pdf.table_row(
                    [
                        (_fmt_date(rec.date), 28),
                        (cat, 42),
                        (item, 55),
                        (mileage, 25),
                        (cost, 20),
                    ],
                    alt=i % 2 == 1,
                )

            total = sum((rec.cost or 0) for rec, _ in rows)
            pdf.ln(2)
            pdf.set_font("Helvetica", "B", 9)
            pdf.set_text_color(*_DARK)
            pdf.cell(0, 5, f"Total jobs: {len(rows)}    Total spend: {_gbp(total)}", ln=True)
        else:
            pdf.set_font("Helvetica", "", 9)
            pdf.set_text_color(*_MUTED)
            pdf.cell(0, 5, "No maintenance or repair records.", ln=True)

        return bytes(pdf.output())

    # ==================================================
    # MAINTENANCE REPORT
    # ==================================================

    async def maintenance_report(
        self, vehicle_id: uuid.UUID, account_id: uuid.UUID
    ) -> bytes:
        """
        Maintenance report: totals by category with job count and spend.
        """
        from collections import defaultdict
        from sqlalchemy import select

        v_res = await self._db.execute(
            select(Vehicle).where(
                Vehicle.id == vehicle_id,
                Vehicle.account_id == account_id,
            )
        )
        vehicle: Vehicle | None = v_res.scalar_one_or_none()
        if vehicle is None:
            raise ValueError("Vehicle not found.")

        rec_res = await self._db.execute(
            select(Record, MaintenanceDetail)
            .join(MaintenanceDetail, MaintenanceDetail.record_id == Record.id)
            .where(
                Record.vehicle_id == vehicle_id,
                Record.account_id == account_id,
                Record.type.in_([RecordType.maintenance, RecordType.repair]),
            )
            .order_by(Record.date.asc())
        )
        rows = rec_res.all()

        cat_count: dict[str, int] = defaultdict(int)
        cat_spend: dict[str, int] = defaultdict(int)
        for rec, detail in rows:
            cat = detail.category.value if hasattr(detail.category, "value") else str(detail.category)
            cat_count[cat] += 1
            cat_spend[cat] += rec.cost or 0

        reg = vehicle.registration or "Unknown"
        pdf = _AutoPDF("Maintenance Report", reg)
        pdf.add_page()

        pdf.section_title("Maintenance summary")
        pdf.kv_row("Vehicle", f"{reg} — {vehicle.make or ''} {vehicle.model or ''}".strip())
        pdf.ln(3)

        if cat_count:
            cols = [("Category", 80), ("Jobs", 30), ("Total spend", 60)]
            pdf.table_header(cols)
            for i, cat in enumerate(sorted(cat_count, key=lambda k: cat_count[k], reverse=True)):
                label = _MAINT_LABELS.get(cat, cat.capitalize())
                pdf.table_row(
                    [(label, 80), (str(cat_count[cat]), 30), (_gbp(cat_spend[cat]), 60)],
                    alt=i % 2 == 1,
                )
            total_jobs = sum(cat_count.values())
            total_spend = sum(cat_spend.values())
            pdf.ln(2)
            pdf.set_font("Helvetica", "B", 9)
            pdf.set_text_color(*_DARK)
            pdf.cell(0, 5, f"Total: {total_jobs} jobs    {_gbp(total_spend)}", ln=True)
        else:
            pdf.set_font("Helvetica", "", 9)
            pdf.set_text_color(*_MUTED)
            pdf.cell(0, 5, "No maintenance or repair records.", ln=True)

        return bytes(pdf.output())

    # ==================================================
    # EXPENSE REPORT
    # ==================================================

    async def expense_report(
        self, vehicle_id: uuid.UUID, account_id: uuid.UUID
    ) -> bytes:
        """
        Expense report: totals by cost category with record count and spend.
        Excludes fuel (separate fuel report in Phase 6.3 ZIP export).
        """
        from collections import defaultdict
        from sqlalchemy import select

        v_res = await self._db.execute(
            select(Vehicle).where(
                Vehicle.id == vehicle_id,
                Vehicle.account_id == account_id,
            )
        )
        vehicle: Vehicle | None = v_res.scalar_one_or_none()
        if vehicle is None:
            raise ValueError("Vehicle not found.")

        rec_res = await self._db.execute(
            select(Record)
            .where(
                Record.vehicle_id == vehicle_id,
                Record.account_id == account_id,
                Record.type.notin_([RecordType.fuel]),
            )
            .order_by(Record.date.asc())
        )
        records = rec_res.scalars().all()

        type_count: dict[str, int] = defaultdict(int)
        type_spend: dict[str, int] = defaultdict(int)
        for rec in records:
            rt = _type_str(rec.type)
            type_count[rt] += 1
            type_spend[rt] += rec.cost or 0

        reg = vehicle.registration or "Unknown"
        pdf = _AutoPDF("Expense Report", reg)
        pdf.add_page()

        pdf.section_title("Expense summary")
        pdf.kv_row("Vehicle", f"{reg} — {vehicle.make or ''} {vehicle.model or ''}".strip())
        pdf.ln(3)

        if type_count:
            cols = [("Category", 80), ("Records", 30), ("Total spend", 60)]
            pdf.table_header(cols)
            for i, rt in enumerate(sorted(type_count, key=lambda k: type_spend[k], reverse=True)):
                label = _RECORD_LABELS.get(rt, rt.capitalize())
                pdf.table_row(
                    [(label, 80), (str(type_count[rt]), 30), (_gbp(type_spend[rt]), 60)],
                    alt=i % 2 == 1,
                )
            total = sum(type_spend.values())
            pdf.ln(2)
            pdf.set_font("Helvetica", "B", 9)
            pdf.set_text_color(*_DARK)
            pdf.cell(0, 5, f"Total spend: {_gbp(total)}", ln=True)
        else:
            pdf.set_font("Helvetica", "", 9)
            pdf.set_text_color(*_MUTED)
            pdf.cell(0, 5, "No expense records.", ln=True)

        return bytes(pdf.output())
