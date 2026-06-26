# ============================================================
# backend/app/alembic/versions/0014_mileage.py
# ============================================================
#
# Purpose:
#   Introduces three mileage-related database changes:
#
#   1. Adds 'odometer' to the recordtype enum so users can log
#      monthly odometer readings as a first-class record type,
#      separate from event-driven maintenance or fuel records.
#
#   2. Adds due_mileage (nullable integer) and miles_warning
#      (integer, default 500) to the reminders table, enabling
#      dual-trigger reminders that fire on a date OR when the
#      vehicle reaches a mileage threshold, whichever comes first.
#      Applies to service, tyres, brake_fluid, battery, finance,
#      and custom reminder types — not mot, tax, insurance,
#      warranty, or breakdown_cover.
#
#   3. Creates the mileage_log_settings table, one row per account,
#      storing the day-of-month on which the platform sends the
#      monthly "please log your mileage" prompt email (default 1 =
#      1st of the month). last_sent_month prevents duplicate sends
#      within the same calendar month.
#
# Design:
#   PostgreSQL enum ADD VALUE IF NOT EXISTS avoids an error if
#   an earlier partial migration partially applied. The value
#   must be added outside a transaction block (or with
#   autocommit=True / execute_if) — Alembic's op.execute handles
#   this safely via the connection.
#
#   Downgrade removes the mileage_log_settings table and the two
#   reminder columns; the enum value cannot be removed in Postgres
#   without dropping and re-creating the type, so downgrade leaves
#   'odometer' in place (harmless — no rows reference it after rollback).
#
# Consumed by:
#   - alembic upgrade head
# ============================================================

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# ==================================================
# REVISION
# ==================================================

revision = "0014"
down_revision = "0013"
branch_labels = None
depends_on = None

# ==================================================
# UPGRADE
# ==================================================


def upgrade() -> None:
    # 1. Add 'odometer' to the recordtype enum.
    #    Cannot run inside a transaction on Postgres — execute via raw DDL.
    op.execute("ALTER TYPE recordtype ADD VALUE IF NOT EXISTS 'odometer'")

    # 2. Add mileage-based trigger columns to reminders.
    op.add_column(
        "reminders",
        sa.Column("due_mileage", sa.Integer(), nullable=True),
    )
    op.add_column(
        "reminders",
        sa.Column(
            "miles_warning",
            sa.Integer(),
            nullable=False,
            server_default="500",
        ),
    )

    # 3. Create mileage_log_settings table.
    op.create_table(
        "mileage_log_settings",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "account_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("accounts.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        # Day of month (1–28) on which the log-mileage reminder email fires.
        sa.Column(
            "reminder_day",
            sa.SmallInteger(),
            nullable=False,
            server_default="1",
        ),
        sa.Column(
            "active",
            sa.Boolean(),
            nullable=False,
            server_default="true",
        ),
        # "YYYY-MM" of the last month a prompt email was sent; prevents duplicates.
        sa.Column("last_sent_month", sa.String(7), nullable=True),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.CheckConstraint("reminder_day >= 1 AND reminder_day <= 28", name="ck_mileage_reminder_day"),
    )
    op.create_index(
        "ix_mileage_log_settings_account_id",
        "mileage_log_settings",
        ["account_id"],
    )


# ==================================================
# DOWNGRADE
# ==================================================


def downgrade() -> None:
    op.drop_table("mileage_log_settings")
    op.drop_column("reminders", "miles_warning")
    op.drop_column("reminders", "due_mileage")
    # 'odometer' cannot be removed from a Postgres enum without dropping the type.
    # Leave it in place — no application code references it after downgrade.
