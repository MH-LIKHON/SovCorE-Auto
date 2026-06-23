# ============================================================
# backend/app/alembic/versions/0006_operational_modules.py
# ============================================================
#
# Purpose:
#   Creates the three operational module tables introduced in
#   Phase 4: pcns, damage_entries, and warranties.
#
# Design:
#   All three tables are created in one migration because they
#   are introduced together in Phase 4 and have no dependency
#   on each other. Rolling back the whole phase is a single
#   alembic downgrade step.
#
#   Money columns (amount, repair_cost, labour_cost, parts_cost)
#   are INTEGER, storing pence, consistent with the rest of the
#   platform's money convention.
#
#   PCNStatus and DamageKind are stored as VARCHAR rather than
#   PostgreSQL native enum types. VARCHAR survives adding new
#   values without a migration; native enums require ALTER TYPE.
#
# Consumed by:
#   - alembic upgrade head
# ============================================================

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

# ==================================================
# MIGRATION METADATA
# ==================================================

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None

# ==================================================
# UPGRADE
# ==================================================


def upgrade() -> None:
    # ~~~~~~~~~ pcns ~~~~~~~~~
    op.create_table(
        "pcns",
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
        sa.Column("reference", sa.String(100), nullable=True),
        sa.Column("authority", sa.String(300), nullable=True),
        sa.Column("date", sa.Date, nullable=False),
        sa.Column("amount", sa.Integer, nullable=False),
        # VARCHAR so new statuses can be added without ALTER TYPE.
        sa.Column("status", sa.String(20), nullable=False, server_default="open"),
        sa.Column("notes", sa.Text, nullable=True),
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
    op.create_index("ix_pcns_account_id", "pcns", ["account_id"])
    op.create_index("ix_pcns_vehicle_id", "pcns", ["vehicle_id"])

    # ~~~~~~~~~ damage_entries ~~~~~~~~~
    op.create_table(
        "damage_entries",
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
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("date", sa.Date, nullable=False),
        sa.Column("repair_cost", sa.Integer, nullable=True),
        sa.Column("before_key", sa.String(500), nullable=True),
        sa.Column("after_key", sa.String(500), nullable=True),
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
    op.create_index("ix_damage_entries_account_id", "damage_entries", ["account_id"])
    op.create_index("ix_damage_entries_vehicle_id", "damage_entries", ["vehicle_id"])

    # ~~~~~~~~~ warranties ~~~~~~~~~
    op.create_table(
        "warranties",
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
        sa.Column("component", sa.String(300), nullable=False),
        sa.Column("supplier", sa.String(300), nullable=True),
        sa.Column("expiry_date", sa.Date, nullable=True),
        sa.Column("labour_cost", sa.Integer, nullable=True),
        sa.Column("parts_cost", sa.Integer, nullable=True),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("invoice_key", sa.String(500), nullable=True),
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
    op.create_index("ix_warranties_account_id", "warranties", ["account_id"])
    op.create_index("ix_warranties_vehicle_id", "warranties", ["vehicle_id"])


# ==================================================
# DOWNGRADE
# ==================================================


def downgrade() -> None:
    op.drop_index("ix_warranties_vehicle_id", "warranties")
    op.drop_index("ix_warranties_account_id", "warranties")
    op.drop_table("warranties")

    op.drop_index("ix_damage_entries_vehicle_id", "damage_entries")
    op.drop_index("ix_damage_entries_account_id", "damage_entries")
    op.drop_table("damage_entries")

    op.drop_index("ix_pcns_vehicle_id", "pcns")
    op.drop_index("ix_pcns_account_id", "pcns")
    op.drop_table("pcns")
