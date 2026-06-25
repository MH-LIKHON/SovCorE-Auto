# ============================================================
# backend/app/app/exports/services/pdf_service.py
# ============================================================
#
# Purpose:
#   Generates PDF reports for vehicle export. Four report types:
#   full vehicle report, service history, maintenance report, and
#   expense report. All return bytes ready to stream as HTTP response.
#
# Design:
#   Uses fpdf2 >= 2.7.4 API (XPos/YPos replacing the removed ln=
#   parameter). White background throughout for printer-friendliness.
#   Coloured card/band sections provide visual structure without
#   wasting ink on dark page fills.
#
#   Colour scheme:
#     - Page: white
#     - Section headers: light-tinted filled bands
#     - Stat boxes: light fill + 2 mm accent left bar
#     - Tables: subtle alternating rows
#     - Top accent strip: 4 mm brand bar in accent purple
#
# Consumed by:
#   - backend/app/app/api/v1/exports.py
# ============================================================

from __future__ import annotations

import uuid
from collections import defaultdict
from datetime import date, datetime
from typing import Any

from fpdf import FPDF
from fpdf.enums import RenderStyle, XPos, YPos
from sqlalchemy.ext.asyncio import AsyncSession

from app.records.models.record import MaintenanceDetail, Record, RecordType
from app.vehicles.models.vehicle import Vehicle, VehicleRenewal

# ==================================================
# COLOUR CONSTANTS  (R, G, B)
# ==================================================

_WHITE       = (255, 255, 255)
_PAGE_BG     = (255, 255, 255)
_DARK        = (20,  20,  30)
_MUTED       = (105, 105, 118)
_ACCENT      = (108, 99,  255)   # brand purple
_ACCENT_LITE = (235, 233, 255)   # very light lavender — section headers
_GREEN       = (74,  222, 128)
_GREEN_LITE  = (220, 252, 231)   # fuel section header tint
_AMBER       = (245, 158, 11)
_AMBER_LITE  = (255, 243, 200)   # maintenance section header tint
_ROW_ALT     = (250, 250, 253)   # alternate table row fill
_STAT_BG     = (246, 246, 250)   # stat box background
_TH_BG       = (235, 235, 245)   # table header fill

# ==================================================
# TYPE / CATEGORY LABELS
# ==================================================

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
    "roadside":     "Roadside assistance",
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
# PDF DOCUMENT CLASS
# ==================================================


class _AutoPDF(FPDF):
    """
    FPDF subclass providing branded header/footer and styled
    building-blocks (section bands, stat cards, tables).

    Uses fpdf2 >= 2.7.4 XPos/YPos API throughout — the legacy
    ln= cell() parameter was removed in 2.8.x and must not be used.
    """

    def __init__(self, title: str, registration: str) -> None:
        super().__init__(orientation="P", unit="mm", format="A4")
        self._report_title  = title
        self._registration  = registration
        # Cross-platform date format (no %-d Linux-only specifier)
        now = datetime.now()
        self._export_date = f"{now.day} {now.strftime('%B %Y')} · {now.strftime('%H:%M')}"
        self.set_margins(18, 26, 18)
        self.set_auto_page_break(auto=True, margin=25)

    # ------------------------------------------------------------------
    # Page header
    # ------------------------------------------------------------------

    def header(self) -> None:
        # 4 mm accent strip at top of every page
        self.set_fill_color(*_ACCENT)
        self.rect(0, 0, 210, 4, style="F")
        self.set_y(8)

        # Brand name (left) + report title (right) on same baseline
        self.set_font("Helvetica", "B", 11)
        self.set_text_color(*_DARK)
        self.cell(90, 6, "SovCorE | AUTO", new_x=XPos.RIGHT, new_y=YPos.TOP)
        self.set_font("Helvetica", "", 8)
        self.set_text_color(*_MUTED)
        self.cell(84, 6, self._report_title, align="R",
                  new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.ln(3)

    # ------------------------------------------------------------------
    # Page footer
    # ------------------------------------------------------------------

    def footer(self) -> None:
        self.set_y(-14)
        self.set_draw_color(*_MUTED)
        self.set_line_width(0.2)
        self.line(18, self.get_y(), 192, self.get_y())
        self.ln(1)
        self.set_font("Helvetica", "", 8)
        self.set_text_color(*_MUTED)
        self.cell(87, 5, f"Exported {self._export_date}",
                  new_x=XPos.RIGHT, new_y=YPos.TOP)
        self.cell(87, 5, f"Page {self.page_no()}  ·  SovCorE | AUTO", align="R",
                  new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    # ------------------------------------------------------------------
    # UK number plate
    # ------------------------------------------------------------------

    def uk_plate(self, registration: str) -> None:
        """
        Draw a compact UK-style rear number plate centered on the page.
        Yellow fill, rounded corners, black text — no GB stripe.
        """
        plate_w = 50.0
        plate_h = 10.0
        r       = 2.0
        x = (self.w - plate_w) / 2.0
        y = self.get_y()

        # Yellow fill with rounded corners
        self.set_fill_color(255, 196, 12)
        self.set_draw_color(20, 20, 20)
        self.set_line_width(0.5)
        self._draw_rounded_rect(x, y, plate_w, plate_h, RenderStyle.DF, True, r)

        # Registration text centred on the plate
        self.set_font("Helvetica", "B", 11)
        self.set_text_color(20, 20, 20)
        self.set_xy(x, y + (plate_h - 5) / 2.0)
        self.cell(plate_w, 5, registration.upper(), align="C",
                  new_x=XPos.LMARGIN, new_y=YPos.NEXT)

        # Reset draw state
        self.set_line_width(0.2)
        self.set_draw_color(*_MUTED)
        self.set_text_color(*_DARK)
        self.ln(4)

    # ------------------------------------------------------------------
    # Section band
    # ------------------------------------------------------------------

    def section_band(self, text: str, rgb: tuple[int, int, int] = _ACCENT_LITE) -> None:
        """Coloured filled band with section title — printer-friendly tint."""
        self.ln(3)
        self.set_fill_color(*rgb)
        self.set_text_color(*_DARK)
        self.set_font("Helvetica", "B", 9)
        self.cell(0, 7, f"  {text.upper()}", fill=True,
                  new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.ln(2)

    # ------------------------------------------------------------------
    # Key-value row
    # ------------------------------------------------------------------

    def kv_row(self, label: str, value: str) -> None:
        self.set_font("Helvetica", "", 9)
        self.set_text_color(*_MUTED)
        self.cell(55, 5, label, new_x=XPos.RIGHT, new_y=YPos.TOP)
        self.set_text_color(*_DARK)
        self.multi_cell(0, 5, value, new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    # ------------------------------------------------------------------
    # Stat card row
    # ------------------------------------------------------------------

    def stat_row(self, stats: list[tuple[str, str]],
                 accent: tuple[int, int, int] = _ACCENT) -> None:
        """
        Render a horizontal row of stat cards.
        Each card has a 2 mm left accent bar, light background,
        bold value, and small uppercase label.
        stats: list of (label, value) tuples — up to 5 per row.
        """
        n = len(stats)
        usable = 174.0   # 210 - 18 left - 18 right
        w = (usable / n) - 2  # 2 mm gap between cards

        self.ln(1)
        y0 = self.get_y()

        for i, (label, value) in enumerate(stats):
            x = 18 + i * (w + 2)

            # Card background
            self.set_fill_color(*_STAT_BG)
            self.rect(x, y0, w, 17, style="F")

            # Left accent bar (2 mm)
            self.set_fill_color(*accent)
            self.rect(x, y0, 2, 17, style="F")

            # Value text
            self.set_xy(x + 4, y0 + 2)
            self.set_font("Helvetica", "B", 12)
            self.set_text_color(*_DARK)
            # Clip long values
            display_val = value if len(value) <= 12 else value[:11] + "..."
            self.cell(w - 5, 7, display_val,
                      new_x=XPos.LMARGIN, new_y=YPos.NEXT)

            # Label text
            self.set_xy(x + 4, y0 + 10)
            self.set_font("Helvetica", "", 7)
            self.set_text_color(*_MUTED)
            self.cell(w - 5, 5, label.upper()[:22],
                      new_x=XPos.LMARGIN, new_y=YPos.NEXT)

        self.set_y(y0 + 19)
        self.ln(2)

    # ------------------------------------------------------------------
    # Table helpers
    # ------------------------------------------------------------------

    def table_header(self, cols: list[tuple[str, float]]) -> None:
        """cols: list of (label, width_mm)."""
        self.set_font("Helvetica", "B", 8)
        self.set_fill_color(*_TH_BG)
        self.set_text_color(*_MUTED)
        for i, (label, w) in enumerate(cols):
            last = i == len(cols) - 1
            self.cell(
                w, 5, f" {label}", fill=True,
                new_x=(XPos.LMARGIN if last else XPos.RIGHT),
                new_y=(YPos.NEXT   if last else YPos.TOP),
            )

    def table_row(self, cells: list[tuple[str, float]], alt: bool = False) -> None:
        """cells: list of (text, width_mm). alt gives a subtle bg."""
        self.set_font("Helvetica", "", 8)
        self.set_text_color(*_DARK)
        self.set_fill_color(*(_ROW_ALT if alt else _WHITE))
        for i, (text, w) in enumerate(cells):
            last = i == len(cells) - 1
            self.cell(
                w, 5, f" {text}", fill=True,
                new_x=(XPos.LMARGIN if last else XPos.RIGHT),
                new_y=(YPos.NEXT   if last else YPos.TOP),
            )

    def total_line(self, text: str) -> None:
        self.ln(2)
        self.set_font("Helvetica", "B", 9)
        self.set_text_color(*_DARK)
        self.cell(0, 5, text, new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    # ------------------------------------------------------------------
    # Shared vehicle header: plate + details + renewal dates
    # Called at the top of every per-vehicle report page.
    # ------------------------------------------------------------------

    def render_vehicle_header(self, vehicle: Any, renewals: Any) -> None:
        """Plate, vehicle details block, and renewal dates — identical across all report types."""
        reg = vehicle.registration or "Unknown"

        self.uk_plate(reg)

        self.section_band("Vehicle details", _ACCENT_LITE)
        self.kv_row("Registration", reg)
        self.kv_row("Make / model", f"{vehicle.make or ''} {vehicle.model or ''}".strip() or "-")
        self.kv_row("Year", str(vehicle.year) if vehicle.year else "-")
        self.kv_row("VIN", vehicle.vin or "-")
        self.kv_row("Colour", vehicle.colour or "-")
        self.kv_row("Fuel type", (vehicle.fuel_type or "-").capitalize())
        self.kv_row("Transmission", (vehicle.transmission or "-").capitalize())
        self.kv_row("Body type", (vehicle.body_type.value if vehicle.body_type else "-").capitalize())
        self.kv_row("Engine", vehicle.engine or "-")
        self.kv_row("Mileage", f"{vehicle.mileage:,} mi" if vehicle.mileage else "-")
        self.kv_row("Status", (vehicle.lifecycle_state.value if vehicle.lifecycle_state else "-").capitalize())
        self.ln(2)

        self.section_band("Renewal dates", _AMBER_LITE)
        if renewals:
            self.kv_row("MOT expiry",         _fmt_date(renewals.mot_expiry))
            self.kv_row("Tax due",             _fmt_date(renewals.tax_due_date))
            self.kv_row("Insurance expiry",    _fmt_date(renewals.insurance_expiry))
            self.kv_row("Service due date",    _fmt_date(renewals.service_due_date))
            self.kv_row(
                "Service due mileage",
                f"{renewals.service_due_mileage:,} mi" if renewals.service_due_mileage else "-",
            )
        else:
            self.kv_row("", "No renewal data recorded.")
        self.ln(2)

    # ------------------------------------------------------------------
    # Per-vehicle content block (shared by vehicle_report + fleet_report)
    # ------------------------------------------------------------------

    def render_vehicle_section(
        self,
        vehicle: Any,
        records: list,
        renewals: Any,
    ) -> None:
        """Full vehicle report page: header + spend overview + by category + recent records."""
        self.render_vehicle_header(vehicle, renewals)

        # Spend overview
        type_count: dict[str, int] = defaultdict(int)
        type_spend: dict[str, int] = defaultdict(int)
        total_spend = 0
        for rec in records:
            rt = _type_str(rec.type)
            type_count[rt] += 1
            type_spend[rt] += rec.cost or 0
            total_spend += rec.cost or 0

        self.section_band("Spend overview", _ACCENT_LITE)
        self.stat_row([
            ("Total records", str(len(records))),
            ("Total spend",   _gbp(total_spend)),
        ])

        # By category
        if type_count:
            self.section_band("By category", _ACCENT_LITE)
            self.table_header([("Category", 85), ("Records", 30), ("Total spend", 55)])
            for i, rt in enumerate(sorted(type_count, key=lambda k: type_spend[k], reverse=True)):
                label = _RECORD_LABELS.get(rt, rt.capitalize())
                self.table_row(
                    [(label, 85), (str(type_count[rt]), 30), (_gbp(type_spend[rt]), 55)],
                    alt=i % 2 == 1,
                )
            self.total_line(f"Total: {len(records)} records    {_gbp(total_spend)}")
        self.ln(2)

        # Recent records
        self.section_band("Recent records (last 20)", _GREEN_LITE)
        if records:
            self.table_header([("Date", 28), ("Type", 45), ("Supplier / garage", 62), ("Cost", 35)])
            for i, rec in enumerate(records[:20]):
                supplier = (rec.supplier or rec.garage or "-")[:38]
                self.table_row(
                    [
                        (_fmt_date(rec.date), 28),
                        (_RECORD_LABELS.get(_type_str(rec.type), _type_str(rec.type)), 45),
                        (supplier, 62),
                        (_gbp(rec.cost), 35),
                    ],
                    alt=i % 2 == 1,
                )
            if len(records) > 20:
                self.ln(2)
                self.set_font("Helvetica", "", 8)
                self.set_text_color(*_MUTED)
                self.cell(
                    0, 5, f"... and {len(records) - 20} older records not shown.",
                    new_x=XPos.LMARGIN, new_y=YPos.NEXT,
                )
        else:
            self.set_font("Helvetica", "", 9)
            self.set_text_color(*_MUTED)
            self.cell(0, 5, "No records.", new_x=XPos.LMARGIN, new_y=YPos.NEXT)


# ==================================================
# HELPERS
# ==================================================


def _gbp(pence: int | None) -> str:
    if not pence:
        return "-"
    return f"£{pence / 100:,.2f}"


def _fmt_date(d: date | None) -> str:
    if d is None:
        return "-"
    return f"{d.day} {d.strftime('%b %Y')}"


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

        r_res = await self._db.execute(
            select(VehicleRenewal).where(VehicleRenewal.vehicle_id == vehicle_id)
        )
        renewals: VehicleRenewal | None = r_res.scalar_one_or_none()

        rec_res = await self._db.execute(
            select(Record)
            .where(Record.vehicle_id == vehicle_id, Record.account_id == account_id)
            .order_by(Record.date.desc())
        )
        records = rec_res.scalars().all()

        reg = vehicle.registration or "Unknown"
        pdf = _AutoPDF("Vehicle Report", reg)
        pdf.add_page()
        pdf.render_vehicle_section(vehicle, list(records), renewals)
        return bytes(pdf.output())

    # ==================================================
    # SERVICE HISTORY
    # ==================================================

    async def service_history(
        self, vehicle_id: uuid.UUID, account_id: uuid.UUID
    ) -> bytes:
        from sqlalchemy import select

        v_res = await self._db.execute(
            select(Vehicle).where(
                Vehicle.id == vehicle_id, Vehicle.account_id == account_id
            )
        )
        vehicle: Vehicle | None = v_res.scalar_one_or_none()
        if vehicle is None:
            raise ValueError("Vehicle not found.")

        r_res = await self._db.execute(
            select(VehicleRenewal).where(VehicleRenewal.vehicle_id == vehicle_id)
        )
        renewals = r_res.scalar_one_or_none()

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
        total = sum((rec.cost or 0) for rec, _ in rows)

        pdf = _AutoPDF("Service History", reg)
        pdf.add_page()
        pdf.render_vehicle_header(vehicle, renewals)

        pdf.section_band("Service history overview", _GREEN_LITE)
        pdf.stat_row(
            [("Jobs recorded", str(len(rows))), ("Total spend", _gbp(total))],
            accent=_GREEN,
        )
        pdf.ln(2)

        pdf.section_band("All maintenance and repair records", _GREEN_LITE)
        if rows:
            pdf.table_header([
                ("Date", 26), ("Category", 40), ("Item", 56), ("Mileage", 24), ("Cost", 24)
            ])
            for i, (rec, detail) in enumerate(rows):
                cat_val = detail.category.value if hasattr(detail.category, "value") else str(detail.category)
                cat = _MAINT_LABELS.get(cat_val, "-")
                item    = (detail.item or "-")[:34]
                mileage = f"{rec.mileage:,}" if rec.mileage else "-"
                pdf.table_row(
                    [(_fmt_date(rec.date), 26), (cat, 40), (item, 56), (mileage, 24), (_gbp(rec.cost), 24)],
                    alt=i % 2 == 1,
                )
            pdf.total_line(f"Total: {len(rows)} jobs    {_gbp(total)}")
        else:
            pdf.set_font("Helvetica", "", 9)
            pdf.set_text_color(*_MUTED)
            pdf.cell(0, 5, "No maintenance or repair records.",
                     new_x=XPos.LMARGIN, new_y=YPos.NEXT)

        return bytes(pdf.output())

    # ==================================================
    # MAINTENANCE REPORT
    # ==================================================

    async def maintenance_report(
        self, vehicle_id: uuid.UUID, account_id: uuid.UUID
    ) -> bytes:
        from sqlalchemy import select

        v_res = await self._db.execute(
            select(Vehicle).where(
                Vehicle.id == vehicle_id, Vehicle.account_id == account_id
            )
        )
        vehicle: Vehicle | None = v_res.scalar_one_or_none()
        if vehicle is None:
            raise ValueError("Vehicle not found.")

        r_res = await self._db.execute(
            select(VehicleRenewal).where(VehicleRenewal.vehicle_id == vehicle_id)
        )
        renewals = r_res.scalar_one_or_none()

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
        total_jobs  = sum(cat_count.values())
        total_spend = sum(cat_spend.values())

        pdf = _AutoPDF("Maintenance Report", reg)
        pdf.add_page()
        pdf.render_vehicle_header(vehicle, renewals)

        pdf.section_band("Maintenance overview", _AMBER_LITE)
        pdf.stat_row(
            [("Total jobs", str(total_jobs)), ("Total spend", _gbp(total_spend))],
            accent=_AMBER,
        )
        pdf.ln(2)

        pdf.section_band("By category", _AMBER_LITE)
        if cat_count:
            pdf.table_header([("Category", 90), ("Jobs", 30), ("Total spend", 50)])
            for i, cat in enumerate(sorted(cat_count, key=lambda k: cat_spend[k], reverse=True)):
                label = _MAINT_LABELS.get(cat, cat.capitalize())
                pdf.table_row(
                    [(label, 90), (str(cat_count[cat]), 30), (_gbp(cat_spend[cat]), 50)],
                    alt=i % 2 == 1,
                )
            pdf.total_line(f"Total: {total_jobs} jobs    {_gbp(total_spend)}")
        else:
            pdf.set_font("Helvetica", "", 9)
            pdf.set_text_color(*_MUTED)
            pdf.cell(0, 5, "No maintenance or repair records.",
                     new_x=XPos.LMARGIN, new_y=YPos.NEXT)

        return bytes(pdf.output())

    # ==================================================
    # EXPENSE REPORT
    # ==================================================

    async def expense_report(
        self, vehicle_id: uuid.UUID, account_id: uuid.UUID
    ) -> bytes:
        from sqlalchemy import select

        v_res = await self._db.execute(
            select(Vehicle).where(
                Vehicle.id == vehicle_id, Vehicle.account_id == account_id
            )
        )
        vehicle: Vehicle | None = v_res.scalar_one_or_none()
        if vehicle is None:
            raise ValueError("Vehicle not found.")

        r_res = await self._db.execute(
            select(VehicleRenewal).where(VehicleRenewal.vehicle_id == vehicle_id)
        )
        renewals = r_res.scalar_one_or_none()

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
        total = sum(type_spend.values())

        pdf = _AutoPDF("Expense Report", reg)
        pdf.add_page()
        pdf.render_vehicle_header(vehicle, renewals)

        pdf.section_band("Expense overview", _ACCENT_LITE)
        pdf.stat_row([
            ("Total records", str(len(records))),
            ("Total spend",   _gbp(total)),
        ])
        pdf.ln(2)

        pdf.section_band("By category", _ACCENT_LITE)
        if type_count:
            pdf.table_header([("Category", 90), ("Records", 30), ("Total spend", 50)])
            for i, rt in enumerate(sorted(type_count, key=lambda k: type_spend[k], reverse=True)):
                label = _RECORD_LABELS.get(rt, rt.capitalize())
                pdf.table_row(
                    [(label, 90), (str(type_count[rt]), 30), (_gbp(type_spend[rt]), 50)],
                    alt=i % 2 == 1,
                )
            pdf.total_line(f"Total spend: {_gbp(total)}")
        else:
            pdf.set_font("Helvetica", "", 9)
            pdf.set_text_color(*_MUTED)
            pdf.cell(0, 5, "No expense records.",
                     new_x=XPos.LMARGIN, new_y=YPos.NEXT)

        return bytes(pdf.output())

    # ==================================================
    # FLEET REPORT  (all vehicles merged into one PDF)
    # ==================================================

    async def fleet_report(self, account_id: uuid.UUID) -> bytes:
        from sqlalchemy import select

        v_res = await self._db.execute(
            select(Vehicle)
            .where(Vehicle.account_id == account_id)
            .order_by(Vehicle.registration)
        )
        vehicles = list(v_res.scalars().all())
        if not vehicles:
            raise ValueError("No vehicles found for this account.")

        renew_res = await self._db.execute(
            select(VehicleRenewal).where(
                VehicleRenewal.vehicle_id.in_([v.id for v in vehicles])
            )
        )
        renewals_by_vid = {r.vehicle_id: r for r in renew_res.scalars().all()}

        rec_res = await self._db.execute(
            select(Record)
            .where(Record.account_id == account_id)
            .order_by(Record.date.desc())
        )
        all_records = list(rec_res.scalars().all())
        records_by_vid: dict = defaultdict(list)
        for r in all_records:
            records_by_vid[r.vehicle_id].append(r)

        total_spend = sum(r.cost or 0 for r in all_records)

        # Annual spend (current calendar year)
        this_year = datetime.now().year
        annual_spend = sum(
            r.cost or 0 for r in all_records
            if r.date and r.date.year == this_year
        )

        # Fleet-wide category breakdown
        fleet_cat_count: dict[str, int] = defaultdict(int)
        fleet_cat_spend: dict[str, int] = defaultdict(int)
        for r in all_records:
            rt = _type_str(r.type)
            fleet_cat_count[rt] += 1
            fleet_cat_spend[rt] += r.cost or 0

        # Per-vehicle annual spend
        annual_by_vid: dict = {}
        for vid, recs in records_by_vid.items():
            annual_by_vid[vid] = sum(
                r.cost or 0 for r in recs
                if r.date and r.date.year == this_year
            )

        avg_spend = total_spend // len(vehicles) if vehicles else 0

        pdf = _AutoPDF("Fleet Report", "")
        pdf.add_page()

        # ---- Fleet overview stat cards ----
        pdf.section_band("Fleet overview", _ACCENT_LITE)
        pdf.stat_row([
            ("Vehicles",        str(len(vehicles))),
            ("Total records",   str(len(all_records))),
            ("Total spend",     _gbp(total_spend)),
            ("This year",       _gbp(annual_spend)),
            ("Avg per vehicle", _gbp(avg_spend)),
        ])
        pdf.ln(2)

        # ---- Fleet spend by category ----
        if fleet_cat_count:
            pdf.section_band("Fleet spend by category", _ACCENT_LITE)
            pdf.table_header([("Category", 80), ("Records", 28), ("Total spend", 44), ("% of spend", 22)])
            for i, rt in enumerate(sorted(fleet_cat_count, key=lambda k: fleet_cat_spend[k], reverse=True)):
                label = _RECORD_LABELS.get(rt, rt.capitalize())
                pct   = f"{fleet_cat_spend[rt] / total_spend * 100:.1f}%" if total_spend else "-"
                pdf.table_row(
                    [
                        (label, 80),
                        (str(fleet_cat_count[rt]), 28),
                        (_gbp(fleet_cat_spend[rt]), 44),
                        (pct, 22),
                    ],
                    alt=i % 2 == 1,
                )
            pdf.total_line(f"Total: {len(all_records)} records    {_gbp(total_spend)}")
            pdf.ln(2)

        # ---- Per-vehicle spend table (with annual column) ----
        pdf.section_band("Spend by vehicle", _ACCENT_LITE)
        pdf.table_header([
            ("Registration", 32), ("Make / model", 58), ("Records", 22), ("This year", 32), ("Total spend", 30)
        ])
        for i, v in enumerate(vehicles):
            v_records = records_by_vid[v.id]
            v_spend   = sum(r.cost or 0 for r in v_records)
            v_annual  = annual_by_vid.get(v.id, 0)
            mm = f"{v.make or ''} {v.model or ''}".strip() or "-"
            pdf.table_row(
                [
                    (v.registration or "-", 32),
                    (mm[:34], 58),
                    (str(len(v_records)), 22),
                    (_gbp(v_annual), 32),
                    (_gbp(v_spend), 30),
                ],
                alt=i % 2 == 1,
            )
        pdf.total_line(f"Total fleet spend: {_gbp(total_spend)}")

        # ---- Per-vehicle full sections ----
        for v in vehicles:
            pdf.add_page()
            pdf.render_vehicle_section(
                v,
                records_by_vid[v.id],
                renewals_by_vid.get(v.id),
            )

        return bytes(pdf.output())
