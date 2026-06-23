# ============================================================
# backend/app/alembic/versions/0008_backups.py
# ============================================================
#
# Purpose:
#   Creates the backups table introduced in Phase 7.
#
# Design:
#   One row per backup run. Status is VARCHAR to allow new
#   states without ALTER TYPE. r2_key is nullable until the
#   upload completes and the row is updated to complete.
#
#   kind is VARCHAR: 'manual' or 'scheduled'. A manual backup
#   is triggered by an owner or admin through the UI; a
#   scheduled backup is triggered by the APScheduler job.
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

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None

# ==================================================
# UPGRADE
# ==================================================


def upgrade() -> None:
    # ~~~~~~~~~ backups ~~~~~~~~~
    op.create_table(
        "backups",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "account_id",
            UUID(as_uuid=True),
            sa.ForeignKey("accounts.id", ondelete="CASCADE"),
            nullable=False,
        ),
        # VARCHAR — 'manual' or 'scheduled'; new kinds can be added without ALTER TYPE.
        sa.Column("kind", sa.String(20), nullable=False, server_default="manual"),
        # Nullable until the upload completes and the row is marked complete.
        sa.Column("r2_key", sa.String(500), nullable=True),
        sa.Column("size_bytes", sa.BigInteger, nullable=True),
        # VARCHAR — 'running', 'complete', 'failed'.
        sa.Column("status", sa.String(20), nullable=False, server_default="running"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_backups_account_id", "backups", ["account_id"])
    op.create_index("ix_backups_status", "backups", ["status"])


# ==================================================
# DOWNGRADE
# ==================================================


def downgrade() -> None:
    op.drop_index("ix_backups_status", "backups")
    op.drop_index("ix_backups_account_id", "backups")
    op.drop_table("backups")
