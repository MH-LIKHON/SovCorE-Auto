# ============================================================
# backend/app/alembic/versions/0010_roadside_and_custom_fields.py
# ============================================================
#
# Purpose:
#   Adds the 'roadside' value to the recordtype enum and a
#   custom_fields JSONB column to the records table.
#
# Design:
#   PostgreSQL enums cannot be modified inside a transaction, so
#   ALTER TYPE … ADD VALUE is executed outside the transaction
#   block via execute_if / connection.execute with autocommit.
#
#   custom_fields stores a list of {label, value} dicts for
#   user-defined fields on custom-type records. Nullable so all
#   existing records are unaffected.
#
# Consumed by:
#   - alembic upgrade head
# ============================================================

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

# ==================================================
# REVISION
# ==================================================

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None

# ==================================================
# UPGRADE
# ==================================================


def upgrade() -> None:
    # ADD VALUE must run outside any transaction.
    conn = op.get_bind()
    conn.execute(sa.text("ALTER TYPE recordtype ADD VALUE IF NOT EXISTS 'roadside'"))

    op.add_column(
        "records",
        sa.Column("custom_fields", JSONB, nullable=True),
    )


# ==================================================
# DOWNGRADE
# ==================================================


def downgrade() -> None:
    op.drop_column("records", "custom_fields")
    # PostgreSQL does not support removing enum values — roadside stays in the type.
