# ============================================================
# backend/app/app/core/database.py
# ============================================================
#
# Purpose:
#   Neon PostgreSQL connection and session management. Provides
#   the async SQLAlchemy engine, session factory, and the
#   FastAPI dependency `get_db` for injecting database sessions
#   into route handlers.
#
# Design:
#   Uses SQLAlchemy 2.x async engine with asyncpg as the driver.
#   The Neon connection string uses `postgresql+asyncpg://`.
#   `get_db` is a FastAPI dependency that yields a session and
#   commits on success or rolls back on exception — callers
#   never manage transactions directly.
#
#   The `Base` class is the declarative base for all models.
#   Every model module imports `Base` from here; Alembic reads
#   `Base.metadata` to auto-generate migrations.
#
# Consumed by:
#   - backend/app/app/core/dependencies.py (get_db injected into routes)
#   - every domain model in backend/app/app/<domain>/models/
#   - backend/app/alembic/env.py (metadata for autogenerate)
# ============================================================

import ssl
from collections.abc import AsyncGenerator
from urllib.parse import parse_qs, urlencode, urlparse, urlunparse

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.core.settings import get_settings

# ==================================================
# ENGINE
# ==================================================

settings = get_settings()

# asyncpg raises "sslmode is specified both in the DSN and as connect argument"
# if sslmode= appears in the URL AND ssl= is passed via connect_args.
# Strip it here so we control SSL entirely via the explicit SSLContext below.
# This also bypasses asyncpg's ~/.postgresql/root.crt lookup, which fails
# under ProtectHome=true (the service user's home directory is inaccessible).
_db_url = settings.database_url
if "sslmode=" in _db_url:
    _parsed = urlparse(_db_url)
    _qs = parse_qs(_parsed.query, keep_blank_values=True)
    _qs.pop("sslmode", None)
    _qs.pop("sslrootcert", None)
    _db_url = urlunparse(_parsed._replace(query=urlencode({k: v[0] for k, v in _qs.items()})))

# ssl.create_default_context() reads the OS CA bundle (/etc/ssl/certs/ on Ubuntu),
# which is readable by the service user and does not require ProtectHome access.
_ssl_ctx = ssl.create_default_context()

# echo=False in production; can be set to True temporarily via debug flag.
# pool_pre_ping: issues SELECT 1 before reusing a pooled connection; discards
# it and reconnects if the server has closed it (Neon closes idle connections
# after ~5 minutes on the serverless tier).
# pool_recycle: force-retire connections after 4 minutes so they are never
# handed back to Neon's idle timeout window.
engine = create_async_engine(
    _db_url,
    echo=settings.app_debug,
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True,
    pool_recycle=240,
    connect_args={"ssl": _ssl_ctx},
)

# ==================================================
# SESSION FACTORY
# ==================================================

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)

# Alias exposed for the background scheduler, which creates its own sessions
# outside the FastAPI dependency injection system (no request scope).
async_session_factory = AsyncSessionLocal

# ==================================================
# DECLARATIVE BASE
# ==================================================

class Base(DeclarativeBase):
    pass

# ==================================================
# DEPENDENCY
# ==================================================


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
