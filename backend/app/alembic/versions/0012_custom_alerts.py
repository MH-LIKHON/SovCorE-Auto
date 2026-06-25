# ============================================================
# backend/app/alembic/versions/0012_custom_alerts.py
# ============================================================
#
# Purpose:
#   Creates the custom_alerts table. A custom alert is a
#   user-defined notification for any vehicle-specific item
#   (cambelt, diesel valve, etc.) with flexible trigger
#   conditions: a specific date, a recurring date interval,
#   a mileage threshold, or a recurring mileage interval.
#
# Design:
#   conditions is a JSONB array. Each element is a condition
#   object discriminated by a "type" field:
#     {"type": "date",              "on": "2026-12-01"}
#     {"type": "recurring",         "unit": "months", "every": 6,
#      "start": "2025-06-01", "next_due": "2026-06-01", "last_fired": null}
#     {"type": "mileage",           "at": 60000, "fired": false}
#     {"type": "mileage_recurring", "every": 5000,
#      "start_mileage": 40000, "next_due_mileage": 45000,
#      "last_fired_mileage": null}
#
#   email_days_before is an INTEGER ARRAY applied to date/recurring
#   conditions (mirrors the intervals field on reminders).
#
#   miles_warning is the threshold in miles below which a mileage
#   condition is considered "due soon" and an email is sent.
#
#   GIN index on conditions enables future JSONB path queries.
#
# Consumed by:
#   - alembic upgrade head
# ============================================================

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID

# ==================================================
# REVISION
# ==================================================

revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None

# ==================================================
# UPGRADE
# ==================================================


def upgrade() -> None:
    op.create_table(
        "custom_alerts",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
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
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column(
            "conditions",
            JSONB,
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column(
            "condition_mode",
            sa.String(10),
            nullable=False,
            server_default="any",
        ),
        sa.Column(
            "email_days_before",
            ARRAY(sa.Integer),
            nullable=False,
            server_default=sa.text("ARRAY[]::integer[]"),
        ),
        sa.Column(
            "miles_warning",
            sa.Integer,
            nullable=False,
            server_default="500",
        ),
        sa.Column(
            "active",
            sa.Boolean,
            nullable=False,
            server_default="true",
        ),
        sa.Column(
            "last_notified_at",
            sa.TIMESTAMP(timezone=True),
            nullable=True,
        ),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index(
        "ix_custom_alerts_account_id",
        "custom_alerts",
        ["account_id"],
    )
    op.create_index(
        "ix_custom_alerts_vehicle_id",
        "custom_alerts",
        ["vehicle_id"],
    )
    op.create_index(
        "ix_custom_alerts_active",
        "custom_alerts",
        ["active"],
    )
    op.execute(
        "CREATE INDEX ix_custom_alerts_conditions_gin "
        "ON custom_alerts USING gin(conditions)"
    )


# ==================================================
# DOWNGRADE
# ==================================================


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_custom_alerts_conditions_gin")
    op.drop_index("ix_custom_alerts_active", table_name="custom_alerts")
    op.drop_index("ix_custom_alerts_vehicle_id", table_name="custom_alerts")
    op.drop_index("ix_custom_alerts_account_id", table_name="custom_alerts")
    op.drop_table("custom_alerts")
