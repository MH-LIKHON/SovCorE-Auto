# ============================================================
# backend/app/alembic/versions/0020_records_label.py
# ============================================================
#
# Purpose:
#   Adds a nullable `label` column to the records table so
#   that custom record types can carry a user-defined name
#   (e.g. "Dash cam fitting" for type == "custom").
#
#   Upgrade:   adds  records.label VARCHAR(200)
#   Downgrade: drops records.label
#
# ============================================================

from alembic import op
import sqlalchemy as sa

revision = "0020"
down_revision = "0019"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "records",
        sa.Column("label", sa.String(200), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("records", "label")
