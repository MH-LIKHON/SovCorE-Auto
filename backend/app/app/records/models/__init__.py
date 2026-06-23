# ============================================================
# backend/app/app/records/models/__init__.py
# ============================================================
#
# Purpose:
#   Re-exports all record-domain ORM models so alembic/env.py
#   can register every table with a single import statement.
#
# Consumed by:
#   - backend/app/alembic/env.py
# ============================================================

from app.records.models.record import (  # noqa: F401
    AttachmentKind,
    FuelDetail,
    MaintenanceCategory,
    MaintenanceDetail,
    Record,
    RecordAttachment,
    RecordTag,
    RecordType,
)
from app.records.models.timeline_event import TimelineEvent  # noqa: F401
