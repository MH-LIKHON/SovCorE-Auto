# ============================================================
# backend/app/alembic/env.py
# ============================================================
#
# Purpose:
#   Alembic environment configuration. Reads the database URL
#   from the application settings and passes the SQLAlchemy
#   metadata so autogenerate can diff the schema.
#
# Design:
#   The async engine requires a synchronous wrapper for Alembic's
#   run_migrations_online. asyncpg does not support Alembic's
#   synchronous path natively, so we use run_sync inside the
#   async context to satisfy both requirements.
#
#   All domain model modules must be imported here (or via a
#   single models/__init__.py) before `target_metadata` is read,
#   so Alembic can see every table. Imports are added as domains
#   are built through the phases.
#
# Consumed by:
#   - alembic CLI during `alembic revision` and `alembic upgrade`
# ============================================================

import asyncio
from logging.config import fileConfig

from sqlalchemy import pool
from sqlalchemy.ext.asyncio import async_engine_from_config

from alembic import context

# ---- Application imports ----
# Import Base so Alembic can read metadata. Domain model imports
# are added below as each phase lands; they must be imported
# before target_metadata is assigned.
from app.core.database import Base
from app.core.settings import get_settings

# Phase 1 — identity, accounts and auth models.
# These imports register the ORM tables with Base.metadata so
# autogenerate and manual migrations can see the full schema.
import app.accounts.models  # noqa: F401, E402
import app.auth.models      # noqa: F401, E402

# Phase 2 — vehicles domain models.
import app.vehicles.models  # noqa: F401, E402
import app.documents.models  # noqa: F401, E402

# Phase 3 — records domain models (records, attachments, tags, maintenance,
# fuel, timeline_events) and audit_log.
import app.records.models  # noqa: F401, E402
import app.audit.models    # noqa: F401, E402

# ==================================================
# ALEMBIC CONFIG
# ==================================================

config = context.config
settings = get_settings()

# Inject the real database URL from application settings rather
# than reading from alembic.ini, which holds a placeholder.
config.set_main_option("sqlalchemy.url", settings.database_url)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# ==================================================
# METADATA
# ==================================================

# Import domain model modules here as they are added.
# Phase 0: no domain models yet; all tables are added in Phases 1-7.

target_metadata = Base.metadata

# ==================================================
# OFFLINE MODE
# ==================================================


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


# ==================================================
# ONLINE MODE (ASYNC)
# ==================================================


def do_run_migrations(connection: object) -> None:
    context.configure(connection=connection, target_metadata=target_metadata)  # type: ignore[arg-type]
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
