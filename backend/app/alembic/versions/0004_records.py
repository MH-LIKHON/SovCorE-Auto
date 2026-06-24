# ============================================================
# backend/app/alembic/versions/0004_records.py
# ============================================================
#
# Purpose:
#   Creates the record-system tables introduced in Phase 3:
#   records, record_attachments, record_tags, maintenance_details,
#   fuel_details, and timeline_events.
#
# Design:
#   Three new enums (recordtype, attachmentkind, maintenancecategory)
#   are created before the tables that reference them.
#
#   maintenance_details and fuel_details are one-to-one with records
#   via unique constraints on record_id. This blocks duplicate detail
#   rows at the database level.
#
#   Money columns (cost, labour_cost, parts_cost, price_per_litre)
#   store pence as integers. Fuel volume (litres) uses Numeric(10, 3)
#   for exact decimal storage.
#
#   timeline_events is append-only. kind is a free-text column so
#   new event types do not require a schema migration.
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

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None

# ==================================================
# UPGRADE
# ==================================================


def upgrade() -> None:
    # ------------------------------ Enums --------------------------------
    bind = op.get_bind()
    PG_ENUM(
        "maintenance", "repair", "fuel", "mot", "tax", "insurance",
        "parking", "pcn", "cleaning", "accessories", "warranty",
        "diagnostics", "damage", "custom",
        name="recordtype",
    ).create(bind, checkfirst=True)
    PG_ENUM("invoice", "photo", "document", "other", name="attachmentkind").create(bind, checkfirst=True)
    PG_ENUM(
        "engine", "transmission", "brakes", "suspension", "steering",
        "wheels", "cooling", "electrical", "hvac", "exhaust", "miscellaneous",
        name="maintenancecategory",
    ).create(bind, checkfirst=True)

    # ~~~~~~~~~ records ~~~~~~~~~
    op.create_table(
        "records",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "account_id",
            UUID(as_uuid=True),
            sa.ForeignKey("accounts.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "vehicle_id",
            UUID(as_uuid=True),
            sa.ForeignKey("vehicles.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "type",
            PG_ENUM(
                "maintenance", "repair", "fuel", "mot", "tax", "insurance",
                "parking", "pcn", "cleaning", "accessories", "warranty",
                "diagnostics", "damage", "custom",
                name="recordtype",
                create_type=False,
            ),
            nullable=False,
        ),
        sa.Column("date", sa.Date, nullable=False),
        sa.Column("mileage", sa.Integer, nullable=True),
        sa.Column("cost", sa.Integer, nullable=True),  # pence
        sa.Column("currency", sa.String(3), nullable=False, server_default="GBP"),
        sa.Column("supplier", sa.String(300), nullable=True),
        sa.Column("garage", sa.String(300), nullable=True),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("reminder_date", sa.Date, nullable=True),
        sa.Column("warranty_expiry", sa.Date, nullable=True),
        sa.Column("next_due_mileage", sa.Integer, nullable=True),
        sa.Column("next_due_date", sa.Date, nullable=True),
        sa.Column(
            "created_by",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "updated_by",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
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
    op.create_index("ix_records_account_id", "records", ["account_id"])
    op.create_index("ix_records_vehicle_id", "records", ["vehicle_id"])
    op.create_index("ix_records_type", "records", ["type"])
    op.create_index("ix_records_date", "records", ["date"])

    # ~~~~~~~~~ record_attachments ~~~~~~~~~
    op.create_table(
        "record_attachments",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "record_id",
            UUID(as_uuid=True),
            sa.ForeignKey("records.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "kind",
            PG_ENUM("invoice", "photo", "document", "other", name="attachmentkind", create_type=False),
            nullable=False,
        ),
        sa.Column("r2_key", sa.String(500), nullable=False),
        sa.Column("filename", sa.String(500), nullable=False),
        sa.Column("content_type", sa.String(200), nullable=False),
        sa.Column("size_bytes", sa.Integer, nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index("ix_record_attachments_record_id", "record_attachments", ["record_id"])

    # ~~~~~~~~~ record_tags ~~~~~~~~~
    op.create_table(
        "record_tags",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "record_id",
            UUID(as_uuid=True),
            sa.ForeignKey("records.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("tag", sa.String(100), nullable=False),
    )
    op.create_index("ix_record_tags_record_id", "record_tags", ["record_id"])

    # ~~~~~~~~~ maintenance_details ~~~~~~~~~
    op.create_table(
        "maintenance_details",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "record_id",
            UUID(as_uuid=True),
            sa.ForeignKey("records.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column(
            "category",
            PG_ENUM(
                "engine", "transmission", "brakes", "suspension", "steering",
                "wheels", "cooling", "electrical", "hvac", "exhaust",
                "miscellaneous",
                name="maintenancecategory",
                create_type=False,
            ),
            nullable=False,
        ),
        sa.Column("item", sa.String(300), nullable=True),
        sa.Column("part_number", sa.String(100), nullable=True),
        sa.Column("labour_cost", sa.Integer, nullable=True),  # pence
        sa.Column("parts_cost", sa.Integer, nullable=True),   # pence
    )

    # ~~~~~~~~~ fuel_details ~~~~~~~~~
    op.create_table(
        "fuel_details",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "record_id",
            UUID(as_uuid=True),
            sa.ForeignKey("records.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column("litres", sa.Numeric(10, 3), nullable=False),
        sa.Column("price_per_litre", sa.Integer, nullable=False),  # pence
        sa.Column("station", sa.String(300), nullable=True),
        sa.Column("full_tank", sa.Boolean, nullable=False, server_default="true"),
    )

    # ~~~~~~~~~ timeline_events ~~~~~~~~~
    op.create_table(
        "timeline_events",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "account_id",
            UUID(as_uuid=True),
            sa.ForeignKey("accounts.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "vehicle_id",
            UUID(as_uuid=True),
            sa.ForeignKey("vehicles.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column("kind", sa.String(100), nullable=False),
        sa.Column("summary", sa.Text, nullable=False),
        sa.Column("ref_table", sa.String(100), nullable=True),
        sa.Column("ref_id", UUID(as_uuid=True), nullable=True),
        sa.Column(
            "occurred_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index("ix_timeline_events_account_id", "timeline_events", ["account_id"])
    op.create_index("ix_timeline_events_vehicle_id", "timeline_events", ["vehicle_id"])
    op.create_index("ix_timeline_events_occurred_at", "timeline_events", ["occurred_at"])


# ==================================================
# DOWNGRADE
# ==================================================


def downgrade() -> None:
    # ------------------------------ Tables (reverse order) ------------------
    op.drop_index("ix_timeline_events_occurred_at", "timeline_events")
    op.drop_index("ix_timeline_events_vehicle_id", "timeline_events")
    op.drop_index("ix_timeline_events_account_id", "timeline_events")
    op.drop_table("timeline_events")
    op.drop_table("fuel_details")
    op.drop_table("maintenance_details")
    op.drop_index("ix_record_tags_record_id", "record_tags")
    op.drop_table("record_tags")
    op.drop_index("ix_record_attachments_record_id", "record_attachments")
    op.drop_table("record_attachments")
    op.drop_index("ix_records_date", "records")
    op.drop_index("ix_records_type", "records")
    op.drop_index("ix_records_vehicle_id", "records")
    op.drop_index("ix_records_account_id", "records")
    op.drop_table("records")

    # ------------------------------ Enums --------------------------------
    op.execute("DROP TYPE maintenancecategory")
    op.execute("DROP TYPE attachmentkind")
    op.execute("DROP TYPE recordtype")
