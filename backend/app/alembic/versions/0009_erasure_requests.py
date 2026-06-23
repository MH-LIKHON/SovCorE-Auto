# ============================================================
# backend/app/alembic/versions/0009_erasure_requests.py
# ============================================================
#
# Purpose:
#   Creates the erasure_requests table introduced in Phase 7
#   for the UK GDPR right to erasure (Article 17, UK GDPR).
#
# Design:
#   Two-step model: a user requests erasure; the owner confirms.
#   Status lifecycle: requested → confirmed → completed | cancelled.
#
#   On completion the worker deletes every row for the account
#   from every domain table and purges R2 objects. A final audit
#   row is written to a system account (all-zeros UUID) so the
#   deletion event is recorded without retaining personal data.
#
#   Status is VARCHAR so new states can be added without ALTER TYPE.
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

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None

# ==================================================
# UPGRADE
# ==================================================


def upgrade() -> None:
    # ~~~~~~~~~ erasure_requests ~~~~~~~~~
    op.create_table(
        "erasure_requests",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "account_id",
            UUID(as_uuid=True),
            # No CASCADE — this row must survive the account deletion to record the event.
            sa.ForeignKey("accounts.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "requested_by",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "requested_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("confirmed_at", sa.DateTime(timezone=True), nullable=True),
        # VARCHAR — 'requested', 'confirmed', 'completed', 'cancelled'.
        sa.Column("status", sa.String(20), nullable=False, server_default="requested"),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_erasure_requests_account_id", "erasure_requests", ["account_id"])
    op.create_index("ix_erasure_requests_status", "erasure_requests", ["status"])


# ==================================================
# DOWNGRADE
# ==================================================


def downgrade() -> None:
    op.drop_index("ix_erasure_requests_status", "erasure_requests")
    op.drop_index("ix_erasure_requests_account_id", "erasure_requests")
    op.drop_table("erasure_requests")
