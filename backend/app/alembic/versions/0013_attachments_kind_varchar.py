# ============================================================
# backend/app/alembic/versions/0013_attachments_kind_varchar.py
# ============================================================
#
# Purpose:
#   Changes record_attachments.kind from a PostgreSQL enum type
#   (attachmentkind) to VARCHAR(100) so users can store free-text
#   labels such as "Receipt" or "Service Invoice" rather than
#   being restricted to the four original enum values.
#
# Design:
#   The column is cast to text first, then the enum type is dropped.
#   Existing rows retain their values ("invoice", "photo",
#   "document", "other") as plain strings. No data is lost.
#
#   Downgrade casts existing values back to the re-created enum;
#   any value not in the original four is coerced to "other".
#
# Consumed by:
#   - alembic upgrade head
# ============================================================

import sqlalchemy as sa
from alembic import op

# ==================================================
# REVISION
# ==================================================

revision = "0013"
down_revision = "0012"
branch_labels = None
depends_on = None

# ==================================================
# UPGRADE
# ==================================================


def upgrade() -> None:
    # Cast column to plain text first (required to remove PG enum dependency).
    op.execute(
        "ALTER TABLE record_attachments "
        "ALTER COLUMN kind TYPE VARCHAR(100) USING kind::text"
    )
    # Remove the enum type — no longer referenced by any column.
    op.execute("DROP TYPE IF EXISTS attachmentkind")


# ==================================================
# DOWNGRADE
# ==================================================


def downgrade() -> None:
    # Re-create the original enum type.
    op.execute(
        "CREATE TYPE attachmentkind AS ENUM "
        "('invoice', 'photo', 'document', 'other')"
    )
    # Coerce any non-standard values back to 'other' before casting.
    op.execute(
        "UPDATE record_attachments "
        "SET kind = 'other' "
        "WHERE kind NOT IN ('invoice', 'photo', 'document', 'other')"
    )
    op.execute(
        "ALTER TABLE record_attachments "
        "ALTER COLUMN kind TYPE attachmentkind "
        "USING kind::attachmentkind"
    )
