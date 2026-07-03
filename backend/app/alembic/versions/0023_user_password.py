# ============================================================
# backend/app/alembic/versions/0023_user_password.py
# ============================================================
#
# Purpose:
#   Adds optional password-based authentication to user accounts.
#   Password hash and the timestamp of the last password change
#   are stored directly on the users table.
#
#   Both columns are nullable: NULL means the user has not set a
#   password and must use passwordless email OTP (or SSO). Users
#   who set a password can use either method; they are not locked
#   into one or the other.
#
#   Upgrade:   adds users.password_hash, users.password_updated_at
#   Downgrade: drops both columns
#
# ============================================================

import sqlalchemy as sa
from alembic import op

revision = "0023"
down_revision = "0022"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("password_hash", sa.Text(), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column(
            "password_updated_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "password_updated_at")
    op.drop_column("users", "password_hash")
