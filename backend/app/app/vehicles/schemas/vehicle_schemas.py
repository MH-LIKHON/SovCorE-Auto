# ============================================================
# backend/app/app/vehicles/schemas/vehicle_schemas.py
# ============================================================
#
# Purpose:
#   Pydantic schemas for the vehicles API. Separates the wire
#   format from the ORM models so the API contract can evolve
#   without touching the database layer.
#
# Design:
#   VehicleCreateIn / VehiclePatchIn cover the basic information
#   fields. All fields are optional on creation so the user can
#   add details incrementally.
#
#   VehicleCardOut is the lightweight payload for the grid view.
#   It carries the computed RenewalRag (red/amber/green per
#   indicator) and a placeholder health_score (0 until Phase 5
#   defines the algorithm).
#
#   RagStatus thresholds: red = within 30 days or overdue,
#   amber = 31–90 days, green = more than 90 days, unknown =
#   no date set. These match the card indicator colours.
#
# Consumed by:
#   - backend/app/app/vehicles/services/vehicle_service.py
#   - backend/app/app/api/v1/vehicles.py
# ============================================================

import uuid
from datetime import date, datetime
from enum import Enum

from pydantic import BaseModel

from app.vehicles.models.vehicle import BodyType, LifecycleState

# ==================================================
# ENUMS
# ==================================================

# ------------------------------ RAG Status ---------------------------------


class RagStatus(str, Enum):
    green = "green"
    amber = "amber"
    red = "red"
    unknown = "unknown"


# ==================================================
# RENEWAL RAG
# ==================================================


class RenewalRag(BaseModel):
    mot: RagStatus = RagStatus.unknown
    tax: RagStatus = RagStatus.unknown
    insurance: RagStatus = RagStatus.unknown
    service: RagStatus = RagStatus.unknown


# ==================================================
# VEHICLE CREATE / PATCH
# ==================================================

# ------------------------------ Create In -----------------------------------


class VehicleCreateIn(BaseModel):
    registration: str | None = None
    vin: str | None = None
    make: str | None = None
    model: str | None = None
    variant: str | None = None
    year: int | None = None
    engine: str | None = None
    fuel_type: str | None = None
    transmission: str | None = None
    body_type: BodyType | None = None
    colour: str | None = None
    doors: int | None = None
    seats: int | None = None
    horsepower: int | None = None
    torque: int | None = None
    emission_class: str | None = None
    tyre_sizes: str | None = None
    battery_size: str | None = None
    wheel_sizes: str | None = None
    mileage: int | None = None


# ------------------------------ Patch In ------------------------------------


class VehiclePatchIn(BaseModel):
    registration: str | None = None
    vin: str | None = None
    make: str | None = None
    model: str | None = None
    variant: str | None = None
    year: int | None = None
    engine: str | None = None
    fuel_type: str | None = None
    transmission: str | None = None
    body_type: BodyType | None = None
    colour: str | None = None
    doors: int | None = None
    seats: int | None = None
    horsepower: int | None = None
    torque: int | None = None
    emission_class: str | None = None
    tyre_sizes: str | None = None
    battery_size: str | None = None
    wheel_sizes: str | None = None
    mileage: int | None = None
    image_key: str | None = None


# ==================================================
# VEHICLE OUT
# ==================================================

# ------------------------------ Card Out ------------------------------------
# Lightweight payload for the vehicle grid. Does not include every field so
# the list endpoint stays fast and the response stays small.


class VehicleCardOut(BaseModel):
    id: uuid.UUID
    registration: str | None
    make: str | None
    model: str | None
    variant: str | None
    year: int | None
    mileage: int | None
    body_type: BodyType | None
    lifecycle_state: LifecycleState
    image_key: str | None
    renewals: RenewalRag
    # Placeholder until Phase 5 defines the health-score algorithm.
    health_score: int
    # Worst-case RAG across all active custom alerts for this vehicle.
    custom_alert_status: RagStatus = RagStatus.unknown

    model_config = {"from_attributes": True}


# ------------------------------ Full Out ------------------------------------


class VehicleOut(BaseModel):
    id: uuid.UUID
    account_id: uuid.UUID
    registration: str | None
    vin: str | None
    make: str | None
    model: str | None
    variant: str | None
    year: int | None
    engine: str | None
    fuel_type: str | None
    transmission: str | None
    body_type: BodyType | None
    colour: str | None
    doors: int | None
    seats: int | None
    horsepower: int | None
    torque: int | None
    emission_class: str | None
    tyre_sizes: str | None
    battery_size: str | None
    wheel_sizes: str | None
    mileage: int | None
    image_key: str | None
    lifecycle_state: LifecycleState
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ==================================================
# RENEWAL SCHEMAS
# ==================================================

# ------------------------------ Renewal Out ---------------------------------


class VehicleRenewalOut(BaseModel):
    id: uuid.UUID
    vehicle_id: uuid.UUID
    mot_expiry: date | None
    tax_due_date: date | None
    insurance_expiry: date | None
    service_due_date: date | None
    service_due_mileage: int | None
    updated_at: datetime

    model_config = {"from_attributes": True}


# ------------------------------ Renewal Put In ------------------------------


class VehicleRenewalPutIn(BaseModel):
    mot_expiry: date | None = None
    tax_due_date: date | None = None
    insurance_expiry: date | None = None
    service_due_date: date | None = None
    service_due_mileage: int | None = None


# ==================================================
# OWNERSHIP SCHEMAS
# ==================================================

# ------------------------------ Ownership Out -------------------------------


class VehicleOwnershipOut(BaseModel):
    id: uuid.UUID
    vehicle_id: uuid.UUID
    current_owner: str | None
    registered_keeper: str | None
    purchase_date: date | None
    purchase_price: int | None
    seller: str | None
    dealer: str | None
    finance_company: str | None
    finance_status: str | None
    notes: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


# ------------------------------ Ownership Patch In --------------------------


class VehicleOwnershipPatchIn(BaseModel):
    current_owner: str | None = None
    registered_keeper: str | None = None
    purchase_date: date | None = None
    purchase_price: int | None = None
    seller: str | None = None
    dealer: str | None = None
    finance_company: str | None = None
    finance_status: str | None = None
    notes: str | None = None


# ==================================================
# LIFECYCLE
# ==================================================

# ------------------------------ Lifecycle In --------------------------------


class VehicleLifecycleIn(BaseModel):
    state: LifecycleState


# ==================================================
# COVER PHOTO SIGN
# ==================================================

# ------------------------------ Sign In -------------------------------------


class VehiclePhotoSignIn(BaseModel):
    # File extension without a dot. Accepted values: jpg, jpeg, png, webp.
    ext: str


# ------------------------------ Sign Out ------------------------------------


class VehiclePhotoSignOut(BaseModel):
    upload_url: str
    key: str
