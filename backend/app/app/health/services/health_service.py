# ============================================================
# backend/app/app/health/services/health_service.py
# ============================================================
#
# Purpose:
#   Pure-function computation of the vehicle health score.
#   Reads renewal dates and optional mileage/task/damage
#   counts, scores each input 0.0 / 0.5 / 1.0, and returns
#   an integer 0–100 (or None when no inputs are present).
#
# Design:
#   No database access in this module. All inputs are passed
#   as arguments so the function is easily testable and can be
#   called from two places: the `/health` API endpoint (which
#   runs extra DB queries for damage and task counts) and the
#   vehicle-list projection (which uses only the eagerly loaded
#   renewal row to avoid N+1 queries on the card list).
#
#   Algorithm and thresholds are documented in
#   PRIVATE/KB/VEHICLE-HEALTH-SCORE.md. Update both files
#   together when thresholds change.
#
# Consumed by:
#   - backend/app/app/api/v1/vehicle_health.py  (full endpoint)
#   - backend/app/app/vehicles/services/vehicle_service.py  (card list)
# ============================================================

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Optional

from app.health.schemas.health_schemas import HealthInputDetail, HealthScoreOut

# ==================================================
# RAG THRESHOLDS
# ==================================================

# ------------------------------ Day boundaries per indicator ----------------
# Defined in KB/VEHICLE-HEALTH-SCORE.md; reproduced here as constants.
_MOT_AMBER_DAYS = 90
_MOT_RED_DAYS = 30

_INSURANCE_AMBER_DAYS = 90
_INSURANCE_RED_DAYS = 30

_SERVICE_DATE_AMBER_DAYS = 90
_SERVICE_DATE_RED_DAYS = 30

_TAX_AMBER_DAYS = 30
_TAX_RED_DAYS = 14

_SERVICE_MILEAGE_AMBER_MILES = 5_000
_SERVICE_MILEAGE_RED_MILES = 1_000

# ------------------------------ Aggregate score RAG -----------------------
_SCORE_GREEN_THRESHOLD = 75
_SCORE_AMBER_THRESHOLD = 40

# ==================================================
# INTERNAL INPUT DATACLASS
# ==================================================


@dataclass
class _Input:
    # Encapsulates one scored input before aggregation.
    weight: int
    component_score: float  # 0.0, 0.5, or 1.0
    rag: str                # "green", "amber", or "red"
    days_remaining: Optional[int] = None
    miles_remaining: Optional[int] = None

    def to_detail(self) -> HealthInputDetail:
        return HealthInputDetail(
            score=self.component_score,
            rag=self.rag,
            days_remaining=self.days_remaining,
            miles_remaining=self.miles_remaining,
        )


# ==================================================
# SCORING HELPERS
# ==================================================

# ------------------------------ Date scoring --------------------------------


def _score_date(
    expiry: Optional[date],
    today: date,
    *,
    amber_days: int,
    red_days: int,
    weight: int,
) -> Optional[_Input]:
    # ~~~~~~~~~ Return None so the caller skips this input ~~~~~~~~~
    if expiry is None:
        return None
    remaining = (expiry - today).days
    if remaining > amber_days:
        return _Input(weight=weight, component_score=1.0, rag="green", days_remaining=remaining)
    if remaining > red_days:
        return _Input(weight=weight, component_score=0.5, rag="amber", days_remaining=remaining)
    return _Input(weight=weight, component_score=0.0, rag="red", days_remaining=remaining)


# ------------------------------ Mileage scoring ----------------------------


def _score_mileage(
    due_mileage: Optional[int],
    current_mileage: Optional[int],
    weight: int,
) -> Optional[_Input]:
    # ~~~~~~~~~ Skip when either value is absent ~~~~~~~~~
    if due_mileage is None or current_mileage is None:
        return None
    remaining = due_mileage - current_mileage
    if remaining > _SERVICE_MILEAGE_AMBER_MILES:
        return _Input(weight=weight, component_score=1.0, rag="green", miles_remaining=remaining)
    if remaining > _SERVICE_MILEAGE_RED_MILES:
        return _Input(weight=weight, component_score=0.5, rag="amber", miles_remaining=remaining)
    return _Input(weight=weight, component_score=0.0, rag="red", miles_remaining=remaining)


# ------------------------------ Task count scoring ------------------------


def _score_tasks(open_count: int, weight: int) -> _Input:
    # ~~~~~~~~~ Task count is never null; 0 open = full green ~~~~~~~~~
    if open_count == 0:
        return _Input(weight=weight, component_score=1.0, rag="green")
    if open_count <= 2:
        return _Input(weight=weight, component_score=0.5, rag="amber")
    return _Input(weight=weight, component_score=0.0, rag="red")


# ==================================================
# AGGREGATE RAG
# ==================================================


def _aggregate_rag(score: int) -> str:
    if score >= _SCORE_GREEN_THRESHOLD:
        return "green"
    if score >= _SCORE_AMBER_THRESHOLD:
        return "amber"
    return "red"


# ==================================================
# PUBLIC INTERFACE
# ==================================================

# ------------------------------ Full computation (for /health endpoint) -----


def compute_health_score(
    *,
    mot_expiry: Optional[date],
    insurance_expiry: Optional[date],
    service_due_date: Optional[date],
    tax_due_date: Optional[date],
    service_due_mileage: Optional[int],
    current_mileage: Optional[int],
    open_task_count: int = 0,
) -> HealthScoreOut:
    today = date.today()

    # ~~~~~~~~~ Score each input independently ~~~~~~~~~
    mot_result = _score_date(
        mot_expiry, today,
        amber_days=_MOT_AMBER_DAYS, red_days=_MOT_RED_DAYS, weight=30
    )
    insurance_result = _score_date(
        insurance_expiry, today,
        amber_days=_INSURANCE_AMBER_DAYS, red_days=_INSURANCE_RED_DAYS, weight=25
    )
    service_date_result = _score_date(
        service_due_date, today,
        amber_days=_SERVICE_DATE_AMBER_DAYS, red_days=_SERVICE_DATE_RED_DAYS, weight=20
    )
    tax_result = _score_date(
        tax_due_date, today,
        amber_days=_TAX_AMBER_DAYS, red_days=_TAX_RED_DAYS, weight=15
    )
    mileage_result = _score_mileage(service_due_mileage, current_mileage, weight=5)
    task_result = _score_tasks(open_task_count, weight=5)

    # ~~~~~~~~~ Collect active (non-null) inputs ~~~~~~~~~
    # Mileage and tasks together contribute 10 points. If mileage is null,
    # the task score carries the full 10-point slot.
    mileage_weight = 5 if mileage_result is not None else 0
    task_weight_bonus = 5 if mileage_result is None else 0
    if task_weight_bonus:
        task_result = _Input(
            weight=task_result.weight + task_weight_bonus,
            component_score=task_result.component_score,
            rag=task_result.rag,
        )

    named_inputs: list[tuple[str, Optional[_Input]]] = [
        ("mot", mot_result),
        ("insurance", insurance_result),
        ("service_date", service_date_result),
        ("tax", tax_result),
        ("service_mileage", mileage_result),
        ("tasks", task_result),
    ]

    active = [(name, inp) for name, inp in named_inputs if inp is not None]
    if not active:
        return HealthScoreOut(score=None, rag=None)

    numerator = sum(inp.component_score * inp.weight for _, inp in active)
    denominator = sum(inp.weight for _, inp in active)
    aggregate = round((numerator / denominator) * 100)
    rag = _aggregate_rag(aggregate)

    # ~~~~~~~~~ Build per-input detail (mileage and tasks not exposed separately in tasks yet) ~~~~~~~~~
    result_map = {name: inp for name, inp in active}

    return HealthScoreOut(
        score=aggregate,
        rag=rag,
        mot=result_map["mot"].to_detail() if "mot" in result_map else None,
        insurance=result_map["insurance"].to_detail() if "insurance" in result_map else None,
        service_date=result_map["service_date"].to_detail() if "service_date" in result_map else None,
        tax=result_map["tax"].to_detail() if "tax" in result_map else None,
        service_mileage=result_map["service_mileage"].to_detail() if "service_mileage" in result_map else None,
    )


# ------------------------------ Card-only shortcut -------------------------


def score_for_card(
    *,
    mot_expiry: Optional[date],
    insurance_expiry: Optional[date],
    service_due_date: Optional[date],
    tax_due_date: Optional[date],
    service_due_mileage: Optional[int],
    current_mileage: Optional[int],
) -> int:
    # Computes the health score for the vehicle card list without extra
    # DB queries. Uses only the renewal data that is already eagerly loaded.
    # The task count defaults to 0 here; the full /health endpoint
    # runs the separate task-count query for the accurate breakdown.
    result = compute_health_score(
        mot_expiry=mot_expiry,
        insurance_expiry=insurance_expiry,
        service_due_date=service_due_date,
        tax_due_date=tax_due_date,
        service_due_mileage=service_due_mileage,
        current_mileage=current_mileage,
        open_task_count=0,
    )
    return result.score if result.score is not None else 0
