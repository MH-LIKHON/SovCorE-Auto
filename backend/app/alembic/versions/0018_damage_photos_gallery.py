# ============================================================
# backend/app/alembic/versions/0018_damage_photos_gallery.py
# ============================================================
#
# Purpose:
#   Replaces the single before_key / after_key columns on
#   damage_entries with a dedicated damage_photos table that
#   supports multiple photos per slot (before / after).
#
#   Upgrade:
#     1. Create damage_photos table (no FK constraints — rows
#        survive parent deletion; GDPR erasure sweeps by account_id).
#     2. Migrate any existing before_key / after_key values from
#        damage_entries into damage_photos rows.
#     3. Drop before_key and after_key from damage_entries.
#
#   Downgrade reverses the steps: re-adds the columns, restores
#   the first before/after photo per entry, then drops the table.
#
# Consumed by:
#   - alembic upgrade head
# ============================================================

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql as pg

# ==================================================
# REVISION
# ==================================================

revision = "0018"
down_revision = "0017"
branch_labels = None
depends_on = None

# ==================================================
# UPGRADE
# ==================================================


def upgrade() -> None:
    op.create_table(
        "damage_photos",
        sa.Column(
            "id",
            pg.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        # No FK constraints: rows survive deletion of parent records.
        sa.Column("entry_id",   pg.UUID(as_uuid=True), nullable=False),
        sa.Column("account_id", pg.UUID(as_uuid=True), nullable=False),
        sa.Column("vehicle_id", pg.UUID(as_uuid=True), nullable=False),
        sa.Column("slot",         sa.String(10),  nullable=False),  # "before" | "after"
        sa.Column("r2_key",       sa.Text,         nullable=False),
        sa.Column("display_order", sa.Integer,    nullable=False, server_default="0"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index("ix_damage_photos_entry_id",   "damage_photos", ["entry_id"])
    op.create_index("ix_damage_photos_account_id", "damage_photos", ["account_id"])

    # Migrate existing before_key / after_key rows.
    op.execute("""
        INSERT INTO damage_photos
              (id, entry_id, account_id, vehicle_id, slot, r2_key, display_order, created_at)
        SELECT gen_random_uuid(), id, account_id, vehicle_id, 'before', before_key, 0, now()
          FROM damage_entries
         WHERE before_key IS NOT NULL
    """)
    op.execute("""
        INSERT INTO damage_photos
              (id, entry_id, account_id, vehicle_id, slot, r2_key, display_order, created_at)
        SELECT gen_random_uuid(), id, account_id, vehicle_id, 'after', after_key, 0, now()
          FROM damage_entries
         WHERE after_key IS NOT NULL
    """)

    op.drop_column("damage_entries", "before_key")
    op.drop_column("damage_entries", "after_key")


# ==================================================
# DOWNGRADE
# ==================================================


def downgrade() -> None:
    op.add_column("damage_entries", sa.Column("before_key", sa.String(500), nullable=True))
    op.add_column("damage_entries", sa.Column("after_key",  sa.String(500), nullable=True))

    # Restore first before / after photo per entry (by display_order then created_at).
    op.execute("""
        UPDATE damage_entries de
           SET before_key = dp.r2_key
          FROM (
                SELECT DISTINCT ON (entry_id) entry_id, r2_key
                  FROM damage_photos
                 WHERE slot = 'before'
                 ORDER BY entry_id, display_order, created_at
               ) dp
         WHERE de.id = dp.entry_id
    """)
    op.execute("""
        UPDATE damage_entries de
           SET after_key = dp.r2_key
          FROM (
                SELECT DISTINCT ON (entry_id) entry_id, r2_key
                  FROM damage_photos
                 WHERE slot = 'after'
                 ORDER BY entry_id, display_order, created_at
               ) dp
         WHERE de.id = dp.entry_id
    """)

    op.drop_index("ix_damage_photos_account_id", table_name="damage_photos")
    op.drop_index("ix_damage_photos_entry_id",   table_name="damage_photos")
    op.drop_table("damage_photos")
