# ============================================================
# backend/app/alembic/versions/0017_damage_status_media_audit.py
# ============================================================
#
# Purpose:
#   Three additions in one migration:
#     1. damagestatus enum + status column on damage_entries
#        (urgent / in_progress / deferred / resolved). Default
#        is in_progress so all existing rows get a sensible value.
#     2. vehicle_media table — stores all-round vehicle photos
#        beyond the single cover photo (one-to-many per vehicle).
#     3. damage_photo_audit_log table — immutable audit trail for
#        every damage photo upload and delete action.
#
# Design:
#   Audit log uses bare UUID columns without FK constraints so the
#   log survives entry/vehicle/user deletion. The erasure service
#   sweeps it by account_id on GDPR wipe.
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

revision = "0017"
down_revision = "0016"
branch_labels = None
depends_on = None

# ==================================================
# UPGRADE
# ==================================================


def upgrade() -> None:
    # ------------------------------------------------------------------
    # 1. damagestatus enum + status column on damage_entries
    # ------------------------------------------------------------------
    op.execute(
        "CREATE TYPE damagestatus AS ENUM "
        "('urgent', 'in_progress', 'deferred', 'resolved')"
    )
    op.add_column(
        "damage_entries",
        sa.Column(
            "status",
            sa.Enum("urgent", "in_progress", "deferred", "resolved", name="damagestatus"),
            nullable=False,
            server_default="in_progress",
        ),
    )

    # ------------------------------------------------------------------
    # 2. vehicle_media — all-round vehicle photos
    # ------------------------------------------------------------------
    op.create_table(
        "vehicle_media",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "account_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("accounts.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "vehicle_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("vehicles.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("r2_key", sa.String(500), nullable=False),
        sa.Column("display_order", sa.Integer, nullable=False, server_default="0"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index("ix_vehicle_media_vehicle_id", "vehicle_media", ["vehicle_id"])

    # ------------------------------------------------------------------
    # 3. damage_photo_audit_log — immutable audit trail
    # ------------------------------------------------------------------
    op.create_table(
        "damage_photo_audit_log",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        # No FK constraints — log must survive deletion of the source rows.
        sa.Column("account_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("vehicle_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("entry_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("slot", sa.String(10), nullable=False),       # "before" or "after"
        sa.Column("action", sa.String(20), nullable=False),     # "uploaded" or "deleted"
        sa.Column("r2_key", sa.String(500), nullable=True),
        sa.Column("performed_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column(
            "performed_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index(
        "ix_damage_photo_audit_entry_id",
        "damage_photo_audit_log",
        ["entry_id"],
    )
    op.create_index(
        "ix_damage_photo_audit_account_id",
        "damage_photo_audit_log",
        ["account_id"],
    )


# ==================================================
# DOWNGRADE
# ==================================================


def downgrade() -> None:
    op.drop_index("ix_damage_photo_audit_account_id", table_name="damage_photo_audit_log")
    op.drop_index("ix_damage_photo_audit_entry_id", table_name="damage_photo_audit_log")
    op.drop_table("damage_photo_audit_log")

    op.drop_index("ix_vehicle_media_vehicle_id", table_name="vehicle_media")
    op.drop_table("vehicle_media")

    op.drop_column("damage_entries", "status")
    op.execute("DROP TYPE IF EXISTS damagestatus")
