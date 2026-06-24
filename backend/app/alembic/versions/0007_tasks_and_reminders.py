# ============================================================
# backend/app/alembic/versions/0007_tasks_and_reminders.py
# ============================================================
#
# Purpose:
#   Creates the tasks and reminders tables introduced in Phase 5.
#
# Design:
#   Both tables share this single migration because they are
#   introduced together and have no dependency on each other.
#   Rolling back Phase 5 is a single alembic downgrade step.
#
#   Task status and reminder type are stored as VARCHAR rather
#   than PostgreSQL native enum types. VARCHAR survives adding
#   new values without ALTER TYPE; application-side enums
#   validate the values.
#
#   The reminders.intervals column is a PostgreSQL INTEGER ARRAY.
#   Each element is a number of days before due_date at which a
#   notification is sent (e.g. [90, 60, 30, 14, 7, 1]).
#
# Consumed by:
#   - alembic upgrade head
# ============================================================

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import ARRAY, UUID

# ==================================================
# MIGRATION METADATA
# ==================================================

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None

# ==================================================
# UPGRADE
# ==================================================


def upgrade() -> None:
    # ~~~~~~~~~ tasks ~~~~~~~~~
    op.create_table(
        "tasks",
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
            "created_by",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "assignee_user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("title", sa.String(300), nullable=False),
        # VARCHAR so new status values can be added without ALTER TYPE.
        sa.Column("status", sa.String(20), nullable=False, server_default="open"),
        sa.Column("due_date", sa.Date, nullable=True),
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
    op.create_index("ix_tasks_account_id", "tasks", ["account_id"])
    op.create_index("ix_tasks_vehicle_id", "tasks", ["vehicle_id"])
    op.create_index("ix_tasks_status", "tasks", ["status"])

    # ~~~~~~~~~ reminders ~~~~~~~~~
    op.create_table(
        "reminders",
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
        # VARCHAR so new reminder types can be added without ALTER TYPE.
        sa.Column("type", sa.String(30), nullable=False),
        sa.Column("due_date", sa.Date, nullable=False),
        # Array of day intervals before due_date at which notifications fire.
        sa.Column(
            "intervals",
            ARRAY(sa.Integer),
            nullable=False,
            server_default=sa.text("ARRAY[90,60,30,14,7,1]"),
        ),
        # Tracks the last interval that was sent to avoid duplicate emails.
        sa.Column("last_sent_interval", sa.Integer, nullable=True),
        sa.Column("active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index("ix_reminders_account_id", "reminders", ["account_id"])
    op.create_index("ix_reminders_vehicle_id", "reminders", ["vehicle_id"])
    op.create_index("ix_reminders_active", "reminders", ["active"])


# ==================================================
# DOWNGRADE
# ==================================================


def downgrade() -> None:
    op.drop_index("ix_reminders_active", "reminders")
    op.drop_index("ix_reminders_vehicle_id", "reminders")
    op.drop_index("ix_reminders_account_id", "reminders")
    op.drop_table("reminders")

    op.drop_index("ix_tasks_status", "tasks")
    op.drop_index("ix_tasks_vehicle_id", "tasks")
    op.drop_index("ix_tasks_account_id", "tasks")
    op.drop_table("tasks")
