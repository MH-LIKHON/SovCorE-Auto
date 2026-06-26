# ============================================================
# backend/app/alembic/versions/0016_diagnostic_detail.py
# ============================================================
#
# Purpose:
#   Introduces the diagnostic_details and diagnostic_fault_codes
#   tables, plus two new enum types: inspectiontype and
#   faultcodeseverity.
#
# Design:
#   diagnostic_details is one-to-one with records (unique record_id
#   FK). diagnostic_fault_codes is one-to-many (no unique constraint
#   on record_id). Both cascade DELETE when the parent record is
#   removed.
#
#   Money columns (labour_cost, parts_cost) follow the existing
#   convention: stored in pence as integers.
#
#   The faultcodeseverity enum has four values: advisory (watch,
#   no action), amber (action needed soon), red (urgent), and
#   resolved (fault addressed).
#
# Consumed by:
#   - alembic upgrade head
# ============================================================

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# ==================================================
# REVISION
# ==================================================

revision = "0016"
down_revision = "0015"
branch_labels = None
depends_on = None

# ==================================================
# UPGRADE
# ==================================================


def upgrade() -> None:
    # diagnostic_details — SQLAlchemy creates the inspectiontype enum as part of this
    op.create_table(
        "diagnostic_details",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "record_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("records.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column(
            "inspection_type",
            sa.Enum("self", "garage", name="inspectiontype"),
            nullable=False,
        ),
        sa.Column("findings", sa.Text, nullable=True),
        sa.Column("labour_cost", sa.Integer, nullable=True),
        sa.Column("parts_cost", sa.Integer, nullable=True),
    )

    # diagnostic_fault_codes — SQLAlchemy creates the faultcodeseverity enum as part of this
    op.create_table(
        "diagnostic_fault_codes",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "record_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("records.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("code", sa.String(50), nullable=True),
        sa.Column("description", sa.Text, nullable=False),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column(
            "severity",
            sa.Enum("advisory", "amber", "red", "resolved", name="faultcodeseverity"),
            nullable=False,
            server_default="advisory",
        ),
        sa.Column("trigger_date", sa.Date, nullable=True),
        sa.Column("trigger_mileage", sa.Integer, nullable=True),
        sa.Column("resolved_at", sa.Date, nullable=True),
        sa.Column("sort_order", sa.Integer, nullable=False, server_default="0"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index(
        "ix_diagnostic_fault_codes_record_id",
        "diagnostic_fault_codes",
        ["record_id"],
    )


# ==================================================
# DOWNGRADE
# ==================================================


def downgrade() -> None:
    op.drop_index(
        "ix_diagnostic_fault_codes_record_id",
        table_name="diagnostic_fault_codes",
    )
    op.drop_table("diagnostic_fault_codes")
    op.drop_table("diagnostic_details")
    op.execute("DROP TYPE IF EXISTS faultcodeseverity")
    op.execute("DROP TYPE IF EXISTS inspectiontype")
