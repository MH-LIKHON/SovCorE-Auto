# ============================================================
# backend/app/alembic/versions/0002_vehicles.py
# ============================================================
#
# Purpose:
#   Creates the four vehicle tables introduced in Phase 2:
#   vehicles, vehicle_renewals, vehicle_ownership, and
#   vehicle_previous_owners.
#
# Design:
#   Two new enums (bodytype, lifecyclestate) are created before
#   the tables that reference them. vehicle_renewals and
#   vehicle_ownership are one-to-one with vehicles; they use
#   unique constraints on vehicle_id rather than letting the ORM
#   enforce it at the application layer alone.
#
#   Money columns (purchase_price) store values in pence as
#   integers so floating-point rounding cannot corrupt monetary
#   data.
#
# Consumed by:
#   - alembic upgrade head
# ============================================================

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID, ENUM as PG_ENUM

# ==================================================
# MIGRATION METADATA
# ==================================================

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None

# ==================================================
# UPGRADE
# ==================================================


def upgrade() -> None:
    # ------------------------------ Enums --------------------------------
    bind = op.get_bind()
    PG_ENUM("hatchback", "saloon", "estate", "suv", "convertible", "van", "mpv", name="bodytype").create(bind, checkfirst=True)
    PG_ENUM("active", "sold", "scrapped", "archived", name="lifecyclestate").create(bind, checkfirst=True)

    # ~~~~~~~~~ vehicles ~~~~~~~~~
    op.create_table(
        "vehicles",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "account_id",
            UUID(as_uuid=True),
            sa.ForeignKey("accounts.id", ondelete="CASCADE"),
            nullable=False,
        ),
        # Basic information
        sa.Column("registration", sa.String(20), nullable=True),
        sa.Column("vin", sa.String(17), nullable=True),
        sa.Column("make", sa.String(100), nullable=True),
        sa.Column("model", sa.String(100), nullable=True),
        sa.Column("variant", sa.String(100), nullable=True),
        sa.Column("year", sa.Integer, nullable=True),
        sa.Column("engine", sa.String(50), nullable=True),
        sa.Column("fuel_type", sa.String(50), nullable=True),
        sa.Column("transmission", sa.String(50), nullable=True),
        sa.Column(
            "body_type",
            PG_ENUM(
                "hatchback", "saloon", "estate", "suv", "convertible", "van", "mpv",
                name="bodytype",
                create_type=False,
            ),
            nullable=True,
        ),
        sa.Column("colour", sa.String(50), nullable=True),
        sa.Column("doors", sa.Integer, nullable=True),
        sa.Column("seats", sa.Integer, nullable=True),
        sa.Column("horsepower", sa.Integer, nullable=True),
        sa.Column("torque", sa.Integer, nullable=True),
        sa.Column("emission_class", sa.String(50), nullable=True),
        sa.Column("tyre_sizes", sa.String(200), nullable=True),
        sa.Column("battery_size", sa.String(50), nullable=True),
        sa.Column("wheel_sizes", sa.String(200), nullable=True),
        sa.Column("mileage", sa.Integer, nullable=True),
        sa.Column("image_key", sa.String(500), nullable=True),
        # Lifecycle state — default is active so a new vehicle is always visible
        sa.Column(
            "lifecycle_state",
            PG_ENUM("active", "sold", "scrapped", "archived", name="lifecyclestate", create_type=False),
            nullable=False,
            server_default="active",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index("ix_vehicles_account_id", "vehicles", ["account_id"])
    op.create_index("ix_vehicles_registration", "vehicles", ["registration"])

    # ~~~~~~~~~ vehicle_renewals ~~~~~~~~~
    op.create_table(
        "vehicle_renewals",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "vehicle_id",
            UUID(as_uuid=True),
            sa.ForeignKey("vehicles.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column("mot_expiry", sa.Date, nullable=True),
        sa.Column("tax_due_date", sa.Date, nullable=True),
        sa.Column("insurance_expiry", sa.Date, nullable=True),
        sa.Column("service_due_date", sa.Date, nullable=True),
        sa.Column("service_due_mileage", sa.Integer, nullable=True),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )

    # ~~~~~~~~~ vehicle_ownership ~~~~~~~~~
    op.create_table(
        "vehicle_ownership",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "vehicle_id",
            UUID(as_uuid=True),
            sa.ForeignKey("vehicles.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column("current_owner", sa.String(200), nullable=True),
        sa.Column("registered_keeper", sa.String(200), nullable=True),
        sa.Column("purchase_date", sa.Date, nullable=True),
        sa.Column("purchase_price", sa.Integer, nullable=True),  # pence
        sa.Column("seller", sa.String(200), nullable=True),
        sa.Column("dealer", sa.String(200), nullable=True),
        sa.Column("finance_company", sa.String(200), nullable=True),
        sa.Column("finance_status", sa.String(50), nullable=True),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )

    # ~~~~~~~~~ vehicle_previous_owners ~~~~~~~~~
    op.create_table(
        "vehicle_previous_owners",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "vehicle_id",
            UUID(as_uuid=True),
            sa.ForeignKey("vehicles.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(200), nullable=True),
        sa.Column("from_date", sa.Date, nullable=True),
        sa.Column("to_date", sa.Date, nullable=True),
        sa.Column("notes", sa.Text, nullable=True),
    )
    op.create_index(
        "ix_vehicle_previous_owners_vehicle_id",
        "vehicle_previous_owners",
        ["vehicle_id"],
    )


# ==================================================
# DOWNGRADE
# ==================================================


def downgrade() -> None:
    # ------------------------------ Tables (reverse order) ------------------
    op.drop_index("ix_vehicle_previous_owners_vehicle_id", "vehicle_previous_owners")
    op.drop_table("vehicle_previous_owners")
    op.drop_table("vehicle_ownership")
    op.drop_table("vehicle_renewals")
    op.drop_index("ix_vehicles_registration", "vehicles")
    op.drop_index("ix_vehicles_account_id", "vehicles")
    op.drop_table("vehicles")

    # ------------------------------ Enums --------------------------------
    op.execute("DROP TYPE lifecyclestate")
    op.execute("DROP TYPE bodytype")
