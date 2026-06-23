# ============================================================
# backend/app/app/search/schemas/search_schemas.py
# ============================================================
#
# Purpose:
#   Pydantic response schema for the cross-entity search API.
#   A single SearchResultsOut wraps typed result groups so the
#   frontend can render each entity type in its own section.
#
# Design:
#   Each result carries a kind (vehicle, record, document, task,
#   tag) so the frontend can route to the correct detail page
#   and render the correct icon or badge without additional
#   type inference.
#
# Consumed by:
#   - backend/app/app/search/services/search_service.py
#   - backend/app/app/api/v1/search.py
# ============================================================

from __future__ import annotations

from pydantic import BaseModel

# ==================================================
# RESULT TYPES
# ==================================================


class VehicleResult(BaseModel):
    id: str
    registration: str | None
    make: str | None
    model: str | None
    year: int | None
    lifecycle_state: str


class RecordResult(BaseModel):
    id: str
    vehicle_id: str
    vehicle_registration: str | None
    type: str
    date: str
    supplier: str | None
    garage: str | None
    notes: str | None


class DocumentResult(BaseModel):
    id: str
    vehicle_id: str
    vehicle_registration: str | None
    type: str
    filename: str


class TaskResult(BaseModel):
    id: str
    vehicle_id: str
    vehicle_registration: str | None
    title: str
    status: str
    due_date: str | None


class TagResult(BaseModel):
    record_id: str
    vehicle_id: str
    vehicle_registration: str | None
    tag: str
    record_type: str
    record_date: str


# ==================================================
# TOP-LEVEL RESPONSE
# ==================================================


class SearchResultsOut(BaseModel):
    query: str
    total: int
    vehicles: list[VehicleResult]
    records: list[RecordResult]
    documents: list[DocumentResult]
    tasks: list[TaskResult]
    tags: list[TagResult]
