# ============================================================
# backend/app/app/audit/models/__init__.py
# ============================================================
#
# Purpose:
#   Re-exports all audit-domain ORM models so alembic/env.py
#   can register every table with a single import statement.
#
# Consumed by:
#   - backend/app/alembic/env.py
# ============================================================

from app.audit.models.audit_log import AuditLog  # noqa: F401
