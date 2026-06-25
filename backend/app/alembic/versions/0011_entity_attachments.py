# ============================================================
# backend/app/alembic/versions/0011_entity_attachments.py
# ============================================================
#
# Purpose:
#   Creates the entity_attachments table. Stores custom-labelled
#   files (receipts, invoices, photos) attached to damage entries,
#   PCNs, or warranty records.
#
# Design:
#   entity_type uses VARCHAR(50) rather than a PG enum so new
#   entity types can be added without further schema migrations.
#   entity_id has no FK constraint because a single FK cannot
#   reference multiple tables; ownership is enforced at the
#   application layer by checking the parent row's account_id.
#   Composite index on (entity_type, entity_id) for fast list
#   queries; separate index on account_id for account-scoped
#   deletes (cascade from accounts table).
#
# Consumed by:
#   - alembic upgrade head
# ============================================================

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

# ==================================================
# REVISION
# ==================================================

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None

# ==================================================
# UPGRADE
# ==================================================


def upgrade() -> None:
    op.create_table(
        "entity_attachments",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "account_id",
            UUID(as_uuid=True),
            sa.ForeignKey("accounts.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("entity_type", sa.String(50), nullable=False),
        sa.Column("entity_id", UUID(as_uuid=True), nullable=False),
        sa.Column("label", sa.String(500), nullable=False, server_default=""),
        sa.Column("r2_key", sa.String(500), nullable=False),
        sa.Column("filename", sa.String(500), nullable=False),
        sa.Column("content_type", sa.String(200), nullable=False),
        sa.Column("size_bytes", sa.Integer, nullable=False),
        sa.Column(
            "created_by",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index(
        "ix_entity_attachments_account",
        "entity_attachments",
        ["account_id"],
    )
    op.create_index(
        "ix_entity_attachments_entity",
        "entity_attachments",
        ["entity_type", "entity_id"],
    )


# ==================================================
# DOWNGRADE
# ==================================================


def downgrade() -> None:
    op.drop_index("ix_entity_attachments_entity", table_name="entity_attachments")
    op.drop_index("ix_entity_attachments_account", table_name="entity_attachments")
    op.drop_table("entity_attachments")
