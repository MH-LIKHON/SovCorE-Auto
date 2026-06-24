# ============================================================
# backend/app/alembic/versions/0003_documents.py
# ============================================================
#
# Purpose:
#   Creates the documents table introduced in Phase 2 step 2.6.
#   Documents are vehicle files stored in Cloudflare R2 and
#   indexed here (V5C, insurance, MOT, service, finance,
#   warranty, invoices, and other).
#
# Design:
#   r2_key is the canonical file reference. The file lives in R2;
#   this row carries the metadata. The DocumentType enum covers
#   the main categories; "other" handles anything outside them.
#
# Consumed by:
#   - alembic upgrade head
# ============================================================

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID, ENUM as PG_ENUM

# ==================================================
# MIGRATION METADATA
# ==================================================

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None

# ==================================================
# UPGRADE
# ==================================================


def upgrade() -> None:
    # ------------------------------ Enums --------------------------------
    bind = op.get_bind()
    PG_ENUM("v5c", "insurance", "mot", "service", "finance", "warranty", "invoice", "other", name="documenttype").create(bind, checkfirst=True)

    # ~~~~~~~~~ documents ~~~~~~~~~
    op.create_table(
        "documents",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "account_id",
            UUID(as_uuid=True),
            sa.ForeignKey("accounts.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "vehicle_id",
            UUID(as_uuid=True),
            sa.ForeignKey("vehicles.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "type",
            PG_ENUM(
                "v5c", "insurance", "mot", "service", "finance",
                "warranty", "invoice", "other",
                name="documenttype",
                create_type=False,
            ),
            nullable=False,
        ),
        sa.Column("r2_key", sa.String(500), nullable=False),
        sa.Column("filename", sa.String(500), nullable=False),
        sa.Column("content_type", sa.String(200), nullable=False),
        sa.Column("size_bytes", sa.Integer, nullable=False),
        sa.Column("expiry_date", sa.Date, nullable=True),
        sa.Column(
            "created_by",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index("ix_documents_account_id", "documents", ["account_id"])
    op.create_index("ix_documents_vehicle_id", "documents", ["vehicle_id"])


# ==================================================
# DOWNGRADE
# ==================================================


def downgrade() -> None:
    op.drop_index("ix_documents_vehicle_id", "documents")
    op.drop_index("ix_documents_account_id", "documents")
    op.drop_table("documents")
    op.execute("DROP TYPE documenttype")
