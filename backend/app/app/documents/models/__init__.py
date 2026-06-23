# ============================================================
# backend/app/app/documents/models/__init__.py
# ============================================================
#
# Purpose:
#   Re-exports the Document ORM model for Alembic discovery.
#
# Consumed by:
#   - backend/app/alembic/env.py
# ============================================================

from app.documents.models.document import Document, DocumentType  # noqa: F401
