# ============================================================
# backend/app/app/entity_attachments/models/__init__.py
# ============================================================
#
# Purpose:
#   Re-exports the EntityAttachment ORM model so Alembic
#   env.py can discover the table via a single package import.
#
# Consumed by:
#   - backend/app/alembic/env.py
# ============================================================

from app.entity_attachments.models.entity_attachment import EntityAttachment

__all__ = ["EntityAttachment"]
