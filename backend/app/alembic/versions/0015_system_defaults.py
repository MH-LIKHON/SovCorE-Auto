# ============================================================
# backend/app/alembic/versions/0015_system_defaults.py
# ============================================================
#
# Purpose:
#   Adds is_system_default to tasks and custom_alerts.
#   System defaults are auto-created by the platform when a
#   vehicle is added or when certain records are logged. They
#   cannot be deleted via the API (service layer enforces this)
#   but can be edited or paused.
#
# Design:
#   Boolean NOT NULL DEFAULT FALSE. Existing rows inherit FALSE
#   so no data migration is needed. The column is read-only from
#   the API surface — it is only set by backend code, never by
#   user-facing create/patch schemas.
#
# Consumed by:
#   - alembic upgrade head
# ============================================================

import sqlalchemy as sa
from alembic import op

# ==================================================
# REVISION
# ==================================================

revision = "0015"
down_revision = "0014"
branch_labels = None
depends_on = None

# ==================================================
# UPGRADE
# ==================================================


def upgrade() -> None:
    op.add_column(
        "tasks",
        sa.Column(
            "is_system_default",
            sa.Boolean(),
            nullable=False,
            server_default="false",
        ),
    )
    op.add_column(
        "custom_alerts",
        sa.Column(
            "is_system_default",
            sa.Boolean(),
            nullable=False,
            server_default="false",
        ),
    )


# ==================================================
# DOWNGRADE
# ==================================================


def downgrade() -> None:
    op.drop_column("custom_alerts", "is_system_default")
    op.drop_column("tasks", "is_system_default")
