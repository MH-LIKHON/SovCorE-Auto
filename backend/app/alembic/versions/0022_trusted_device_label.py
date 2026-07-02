# ============================================================
# backend/app/alembic/versions/0022_trusted_device_label.py
# ============================================================
#
# Purpose:
#   Adds a human-readable label to trusted_devices so the
#   settings UI can show "Chrome on Mac" rather than a bare UUID.
#
#   The label is derived from the User-Agent header at the time the
#   trusted device is created and stored in the DB. Existing rows
#   receive an empty string — they will display as "Unknown browser"
#   until replaced by a new login with remember_device=True.
#
#   Upgrade:   adds trusted_devices.label
#   Downgrade: drops the column
#
# ============================================================

import sqlalchemy as sa
from alembic import op

revision = "0022"
down_revision = "0021"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "trusted_devices",
        sa.Column(
            "label",
            sa.Text(),
            nullable=False,
            server_default="",
        ),
    )


def downgrade() -> None:
    op.drop_column("trusted_devices", "label")
