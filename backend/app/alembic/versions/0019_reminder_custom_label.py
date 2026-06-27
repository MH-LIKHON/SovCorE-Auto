# ============================================================
# backend/app/alembic/versions/0019_reminder_custom_label.py
# ============================================================
#
# Purpose:
#   Adds a nullable `label` column to the reminders table so
#   that custom reminder types can carry a user-defined name.
#
#   Upgrade:   adds  reminders.label VARCHAR(100)
#   Downgrade: drops reminders.label
#
# ============================================================

from alembic import op
import sqlalchemy as sa

revision = "0019"
down_revision = "0018"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "reminders",
        sa.Column("label", sa.String(100), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("reminders", "label")
