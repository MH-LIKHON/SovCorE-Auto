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

from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.core.settings import get_settings

# ==================================================
# ENGINE
# ==================================================

settings = get_settings()

# echo=False in production; can be set to True temporarily via debug flag.
engine = create_async_engine(
    settings.database_url,
    echo=settings.app_debug,
    pool_size=10,
    max_overflow=20,
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
