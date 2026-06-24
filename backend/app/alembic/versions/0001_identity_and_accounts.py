# ============================================================
# backend/app/alembic/versions/0001_identity_and_accounts.py
# ============================================================
#
# Purpose:
#   Creates all identity and account tables introduced in
#   Phase 1: accounts, account_preferences, users, memberships,
#   auth_codes, and sso_identities.
#
# Design:
#   Enums are created before the tables that reference them so
#   the column type is defined when the table is created.
#   Foreign key constraints reference the parent table columns
#   directly; cascade deletes are set at the FK level so the
#   database enforces them even if rows are deleted outside
#   the ORM (e.g., raw SQL backfills or admin tooling).
#
# Consumed by:
#   - alembic upgrade head
# ============================================================

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

# ==================================================
# MIGRATION METADATA
# ==================================================

revision = "0001"
down_revision = None  # first migration in the chain
branch_labels = None
depends_on = None

# ==================================================
# UPGRADE
# ==================================================


def upgrade() -> None:
    # ------------------------------ Enums --------------------------------
    # Create enums first so column definitions below can reference them.

    op.execute("CREATE TYPE IF NOT EXISTS accounttype AS ENUM ('personal', 'family', 'business', 'fleet')")
    op.execute("CREATE TYPE IF NOT EXISTS distanceunit AS ENUM ('miles', 'kilometres')")
    op.execute("CREATE TYPE IF NOT EXISTS volumeunit AS ENUM ('litres', 'gallons')")
    op.execute("CREATE TYPE IF NOT EXISTS economyunit AS ENUM ('mpg', 'l_per_100km')")
    op.execute("CREATE TYPE IF NOT EXISTS role AS ENUM ('owner', 'admin', 'editor', 'viewer')")
    op.execute("CREATE TYPE IF NOT EXISTS ssoprovider AS ENUM ('microsoft', 'google', 'github', 'apple')")

    # ~~~~~~~~~ accounts ~~~~~~~~~
    op.create_table(
        "accounts",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "type",
            sa.Enum("personal", "family", "business", "fleet", name="accounttype", create_type=False),
            nullable=False,
        ),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
    )

    # ~~~~~~~~~ account_preferences ~~~~~~~~~
    op.create_table(
        "account_preferences",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "account_id",
            UUID(as_uuid=True),
            sa.ForeignKey("accounts.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column(
            "distance_unit",
            sa.Enum("miles", "kilometres", name="distanceunit", create_type=False),
            nullable=False,
            server_default="miles",
        ),
        sa.Column(
            "volume_unit",
            sa.Enum("litres", "gallons", name="volumeunit", create_type=False),
            nullable=False,
            server_default="litres",
        ),
        sa.Column(
            "economy_unit",
            sa.Enum("mpg", "l_per_100km", name="economyunit", create_type=False),
            nullable=False,
            server_default="mpg",
        ),
        sa.Column("currency", sa.String(3), nullable=False, server_default="GBP"),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
    )

    # ~~~~~~~~~ users ~~~~~~~~~
    op.create_table(
        "users",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("email", sa.String(254), nullable=False, unique=True),
        sa.Column("full_name", sa.String(200), nullable=False, server_default=""),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("is_email_verified", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("totp_secret_enc", sa.String(512), nullable=True),
        sa.Column("totp_enabled", sa.Boolean, nullable=False, server_default="false"),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    # ~~~~~~~~~ memberships ~~~~~~~~~
    op.create_table(
        "memberships",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "account_id",
            UUID(as_uuid=True),
            sa.ForeignKey("accounts.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "role",
            sa.Enum("owner", "admin", "editor", "viewer", name="role", create_type=False),
            nullable=False,
        ),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.UniqueConstraint("account_id", "user_id", name="uq_membership_account_user"),
    )
    op.create_index("ix_memberships_account_id", "memberships", ["account_id"])
    op.create_index("ix_memberships_user_id", "memberships", ["user_id"])

    # ~~~~~~~~~ auth_codes ~~~~~~~~~
    op.create_table(
        "auth_codes",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("email", sa.String(254), nullable=False),
        sa.Column("code_hash", sa.String(64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
    )
    op.create_index("ix_auth_codes_email", "auth_codes", ["email"])

    # ~~~~~~~~~ sso_identities ~~~~~~~~~
    op.create_table(
        "sso_identities",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "provider",
            sa.Enum("microsoft", "google", "github", "apple", name="ssoprovider", create_type=False),
            nullable=False,
        ),
        sa.Column("subject", sa.String(256), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.UniqueConstraint("provider", "subject", name="uq_sso_provider_subject"),
    )
    op.create_index("ix_sso_identities_user_id", "sso_identities", ["user_id"])


# ==================================================
# DOWNGRADE
# ==================================================


def downgrade() -> None:
    # ------------------------------ Tables (reverse order) -----------------
    op.drop_table("sso_identities")
    op.drop_table("auth_codes")
    op.drop_table("memberships")
    op.drop_table("users")
    op.drop_table("account_preferences")
    op.drop_table("accounts")

    # ------------------------------ Enums --------------------------------
    op.execute("DROP TYPE ssoprovider")
    op.execute("DROP TYPE role")
    op.execute("DROP TYPE economyunit")
    op.execute("DROP TYPE volumeunit")
    op.execute("DROP TYPE distanceunit")
    op.execute("DROP TYPE accounttype")
