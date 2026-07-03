# ============================================================
# backend/app/alembic/versions/0024_vehicle_v5c_fields.py
# ============================================================
#
# Purpose:
#   Adds the full set of UK V5C (Registration Certificate) fields
#   to the vehicles table that were not already covered by the
#   original basic-information columns from 0002_vehicles.
#
# Design:
#   All 32 columns are nullable — a vehicle can be created without
#   a V5C to hand, and fields are filled in incrementally. Grouped
#   to mirror the Vehicle Details accordion categories in the
#   frontend (identity, specification, performance, emissions and
#   tax, weights and towing, sound level, usage).
#
#   Upgrade:   adds 32 nullable columns to vehicles
#   Downgrade: drops all 32 columns
#
# ============================================================

import sqlalchemy as sa
from alembic import op

revision = "0024"
down_revision = "0023"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ------------------------------ Identity extensions ---------------------
    op.add_column("vehicles", sa.Column("v5c_reference_number", sa.String(20), nullable=True))
    op.add_column("vehicles", sa.Column("type_designation", sa.String(50), nullable=True))
    op.add_column("vehicles", sa.Column("version", sa.String(50), nullable=True))
    op.add_column("vehicles", sa.Column("date_first_registered", sa.Date(), nullable=True))
    op.add_column("vehicles", sa.Column("date_first_registered_uk", sa.Date(), nullable=True))

    # ------------------------------ Specification ----------------------------
    op.add_column("vehicles", sa.Column("wheelplan", sa.String(100), nullable=True))
    op.add_column("vehicles", sa.Column("suspension_type", sa.String(100), nullable=True))
    op.add_column("vehicles", sa.Column("engine_number", sa.String(50), nullable=True))
    op.add_column("vehicles", sa.Column("standing_places", sa.Integer(), nullable=True))
    op.add_column("vehicles", sa.Column("is_automated_vehicle", sa.Boolean(), nullable=True))

    # ------------------------------ Performance -------------------------------
    op.add_column("vehicles", sa.Column("max_net_power_kw", sa.Integer(), nullable=True))
    op.add_column("vehicles", sa.Column("power_to_weight_ratio", sa.Float(), nullable=True))

    # ------------------------------ Emissions and tax -------------------------
    op.add_column("vehicles", sa.Column("taxation_class", sa.String(50), nullable=True))
    op.add_column("vehicles", sa.Column("vehicle_category", sa.String(20), nullable=True))
    op.add_column("vehicles", sa.Column("type_approval_number", sa.String(50), nullable=True))
    op.add_column("vehicles", sa.Column("euro_status", sa.String(50), nullable=True))
    op.add_column("vehicles", sa.Column("real_driving_emissions", sa.String(100), nullable=True))
    op.add_column("vehicles", sa.Column("co2_emissions", sa.Integer(), nullable=True))
    op.add_column("vehicles", sa.Column("exhaust_co", sa.Float(), nullable=True))
    op.add_column("vehicles", sa.Column("exhaust_hc", sa.Float(), nullable=True))
    op.add_column("vehicles", sa.Column("exhaust_nox", sa.Float(), nullable=True))
    op.add_column("vehicles", sa.Column("exhaust_hc_nox", sa.Float(), nullable=True))
    op.add_column("vehicles", sa.Column("exhaust_particulates", sa.Float(), nullable=True))

    # ------------------------------ Weights and towing ------------------------
    op.add_column("vehicles", sa.Column("kerb_weight", sa.Integer(), nullable=True))
    op.add_column("vehicles", sa.Column("max_permissible_mass", sa.Integer(), nullable=True))
    op.add_column("vehicles", sa.Column("revenue_weight", sa.Integer(), nullable=True))
    op.add_column("vehicles", sa.Column("max_towable_mass_braked", sa.Integer(), nullable=True))
    op.add_column("vehicles", sa.Column("max_towable_mass_unbraked", sa.Integer(), nullable=True))

    # ------------------------------ Sound level -------------------------------
    op.add_column("vehicles", sa.Column("sound_level_stationary", sa.Integer(), nullable=True))
    op.add_column("vehicles", sa.Column("sound_level_engine_speed", sa.Integer(), nullable=True))
    op.add_column("vehicles", sa.Column("sound_level_drive_by", sa.Integer(), nullable=True))

    # ------------------------------ Usage extensions --------------------------
    op.add_column("vehicles", sa.Column("number_of_previous_keepers", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("vehicles", "number_of_previous_keepers")
    op.drop_column("vehicles", "sound_level_drive_by")
    op.drop_column("vehicles", "sound_level_engine_speed")
    op.drop_column("vehicles", "sound_level_stationary")
    op.drop_column("vehicles", "max_towable_mass_unbraked")
    op.drop_column("vehicles", "max_towable_mass_braked")
    op.drop_column("vehicles", "revenue_weight")
    op.drop_column("vehicles", "max_permissible_mass")
    op.drop_column("vehicles", "kerb_weight")
    op.drop_column("vehicles", "exhaust_particulates")
    op.drop_column("vehicles", "exhaust_hc_nox")
    op.drop_column("vehicles", "exhaust_nox")
    op.drop_column("vehicles", "exhaust_hc")
    op.drop_column("vehicles", "exhaust_co")
    op.drop_column("vehicles", "co2_emissions")
    op.drop_column("vehicles", "real_driving_emissions")
    op.drop_column("vehicles", "euro_status")
    op.drop_column("vehicles", "type_approval_number")
    op.drop_column("vehicles", "vehicle_category")
    op.drop_column("vehicles", "taxation_class")
    op.drop_column("vehicles", "power_to_weight_ratio")
    op.drop_column("vehicles", "max_net_power_kw")
    op.drop_column("vehicles", "is_automated_vehicle")
    op.drop_column("vehicles", "standing_places")
    op.drop_column("vehicles", "engine_number")
    op.drop_column("vehicles", "suspension_type")
    op.drop_column("vehicles", "wheelplan")
    op.drop_column("vehicles", "date_first_registered_uk")
    op.drop_column("vehicles", "date_first_registered")
    op.drop_column("vehicles", "version")
    op.drop_column("vehicles", "type_designation")
    op.drop_column("vehicles", "v5c_reference_number")
