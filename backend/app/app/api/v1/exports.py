# ============================================================
# backend/app/app/api/v1/exports.py
# ============================================================
#
# Purpose:
#   Export endpoints for Phase 6. Generates PDF and ZIP
#   downloads for vehicle data.
#
# Design:
#   PDF endpoints accept a `report_type` query parameter:
#     - vehicle (default)  — full vehicle report
#     - service_history    — maintenance and repair records in date order
#     - maintenance        — totals by maintenance category
#     - expenses           — totals by expense category
#
#   The response is a streaming file download using FastAPI's
#   Response with an `application/pdf` content type and a
#   Content-Disposition: attachment header. No file is written
#   to disk; the PDF bytes are generated in memory.
#
#   The ZIP account export endpoint (step 6.3) is added in a
#   separate module and mounted alongside this one.
#
# Consumed by:
#   - backend/app/app/api/v1/router.py
# ============================================================

import uuid
from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.accounts.models.user import User
from app.core.database import get_db
from app.core.permissions import require_viewer
from app.exports.services.pdf_service import PDFService
from app.exports.services.zip_service import ZipService

# ==================================================
# ROUTER
# ==================================================

router = APIRouter()

# ==================================================
# PDF EXPORT ENDPOINTS
# ==================================================

_PDF_REPORT_TYPE = Literal["vehicle", "service_history", "maintenance", "expenses"]

_FILENAMES: dict[str, str] = {
    "vehicle":          "vehicle-report",
    "service_history":  "service-history",
    "maintenance":      "maintenance-report",
    "expenses":         "expense-report",
}


@router.post(
    "/accounts/{account_id}/exports/vehicle/{vehicle_id}",
    summary="Export a vehicle PDF report",
    response_class=Response,
)
async def export_vehicle_pdf(
    account_id: uuid.UUID,
    vehicle_id: uuid.UUID,
    report_type: _PDF_REPORT_TYPE = Query("vehicle", alias="type"),
    _: User = Depends(require_viewer),
    db: AsyncSession = Depends(get_db),
) -> Response:
    # ~~~~~~~~~ Generate the requested PDF in memory ~~~~~~~~~
    svc = PDFService(db)

    if report_type == "service_history":
        pdf_bytes = await svc.service_history(vehicle_id, account_id)
    elif report_type == "maintenance":
        pdf_bytes = await svc.maintenance_report(vehicle_id, account_id)
    elif report_type == "expenses":
        pdf_bytes = await svc.expense_report(vehicle_id, account_id)
    else:
        pdf_bytes = await svc.vehicle_report(vehicle_id, account_id)

    slug = _FILENAMES.get(report_type, "report")
    filename = f"sovcoreAuto-{slug}-{date.today().isoformat()}.pdf"

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ==================================================
# ZIP ACCOUNT EXPORT
# ==================================================


@router.post(
    "/accounts/{account_id}/exports/account",
    summary="Full account data export as ZIP",
    response_class=Response,
)
async def export_account_zip(
    account_id: uuid.UUID,
    _: User = Depends(require_viewer),
    db: AsyncSession = Depends(get_db),
) -> Response:
    # ~~~~~~~~~ Build the full account export archive in memory ~~~~~~~~~
    zip_bytes = await ZipService(db).account_export(account_id)
    filename = f"sovcoreAuto-export-{date.today().isoformat()}.zip"

    return Response(
        content=zip_bytes,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
