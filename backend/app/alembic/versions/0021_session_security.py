# ============================================================
# backend/app/alembic/versions/0021_session_security.py
# ============================================================
#
# Purpose:
#   Three additions that enable GDPR idle-logout, single-session
#   enforcement, and trusted-device 2FA bypass:
#
#   1. users.idle_timeout_minutes — per-user idle session timeout
#      preference. Default 15 minutes, user-adjustable in profile.
#
#   2. user_sessions — one row per user; tracks the active refresh
#      token JTI so a second login can detect the collision and
#      trigger the session-conflict resolution flow.
#
#   3. trusted_devices — stores SHA-256 hashes of device tokens
#      that the user has approved to skip the TOTP challenge.
#      Rows expire after 15 days; the hash is never stored in
#      plaintext (token travels in an HTTP-only cookie only).
#
#   Upgrade:   adds column + two tables
#   Downgrade: removes both tables + column
#
# ============================================================

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0021"
down_revision = "0020"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ~~~~~~~~~ 1. Per-user idle timeout preference ~~~~~~~~~
    op.add_column(
        "users",
        sa.Column(
            "idle_timeout_minutes",
            sa.Integer(),
            nullable=False,
            server_default="15",
        ),
    )

    # ~~~~~~~~~ 2. Active session tracker ~~~~~~~~~
    # UNIQUE on user_id enforces the single-session rule at the DB level;
    # the application layer checks it before writing and drives the conflict UI.
    op.create_table(
        "user_sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
            index=True,
        ),
        # JTI of the refresh token that is currently alive for this user.
        sa.Column("refresh_jti", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "last_seen_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )

    # ~~~~~~~~~ 3. Trusted device store (2FA bypass) ~~~~~~~~~
    # Device token cookies are SHA-256 hashed before storage.
    # Multiple devices can be trusted per user, hence no UNIQUE on user_id.
    op.create_table(
        "trusted_devices",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("device_token_hash", sa.Text(), nullable=False, unique=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "expires_at",
            sa.DateTime(timezone=True),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_table("trusted_devices")
    op.drop_table("user_sessions")
    op.drop_column("users", "idle_timeout_minutes")
