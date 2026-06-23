# ============================================================
# backend/app/alembic/versions/0005_audit_log.py
# ============================================================
#
# Purpose:
#   Creates the audit_log table introduced in Phase 3 step 3.5.
#   The audit log records every create, update and delete on
#   tracked tables and is the compliance-grade change record
#   for each account.
#
# Design:
#   old_value and new_value use JSONB so the full row state is
#   captured at the time of the change without a schema migration
#   when tracked tables gain columns.
#
#   action is a short free-text string ("create", "update",
#   "delete") rather than an enum so the column is self-describing
#   without requiring a PostgreSQL type lookup.
#
#   The table is append-only. No update or delete is exposed
#   in the repository; that guarantee is enforced by convention.
#
# Consumed by:
#   - alembic upgrade head
# ============================================================

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

# ==================================================
# MIGRATION METADATA
# ==================================================

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None

# ==================================================
# UPGRADE
# ==================================================


def upgrade() -> None:
    # ~~~~~~~~~ audit_log ~~~~~~~~~
    op.create_table(
        "audit_log",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "account_id",
            UUID(as_uuid=True),
            sa.ForeignKey("accounts.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "actor_user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("action", sa.String(10), nullable=False),
        sa.Column("table_name", sa.String(100), nullable=False),
        sa.Column("row_id", UUID(as_uuid=True), nullable=False),
        sa.Column("old_value", JSONB, nullable=True),
        sa.Column("new_value", JSONB, nullable=True),
        sa.Column("ip_address", sa.String(45), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index("ix_audit_log_account_id", "audit_log", ["account_id"])
    op.create_index("ix_audit_log_table_name", "audit_log", ["table_name"])
    op.create_index("ix_audit_log_created_at", "audit_log", ["created_at"])


# ==================================================
# DOWNGRADE
# ==================================================


def downgrade() -> None:
    op.drop_index("ix_audit_log_created_at", "audit_log")
    op.drop_index("ix_audit_log_table_name", "audit_log")
    op.drop_index("ix_audit_log_account_id", "audit_log")
    op.drop_table("audit_log")
