# ============================================================
# backend/app/app/erasure/repositories/erasure_repository.py
# ============================================================
#
# Purpose:
#   Persistence layer for the erasure_requests table. Manages
#   the lifecycle of GDPR erasure requests from submission
#   through completion.
#
# Design:
#   Only one active erasure request is allowed per account at a
#   time. get_active_for_account checks for a 'requested' or
#   'confirmed' row before allowing a new request to be created.
#
# Consumed by:
#   - backend/app/app/erasure/services/erasure_service.py
# ============================================================

import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.erasure.models.erasure_request import ErasureRequest

# ==================================================
# ERASURE REPOSITORY
# ==================================================


class ErasureRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create(
        self, account_id: uuid.UUID, requested_by: uuid.UUID
    ) -> ErasureRequest:
        req = ErasureRequest(
            account_id=account_id,
            requested_by=requested_by,
            status="requested",
        )
        self._session.add(req)
        await self._session.flush()
        return req

    async def get_active_for_account(
        self, account_id: uuid.UUID
    ) -> ErasureRequest | None:
        """Returns a pending (requested or confirmed) erasure request if one exists."""
        res = await self._session.execute(
            select(ErasureRequest)
            .where(ErasureRequest.account_id == account_id)
            .where(ErasureRequest.status.in_(["requested", "confirmed"]))
            .order_by(ErasureRequest.requested_at.desc())
            .limit(1)
        )
        return res.scalar_one_or_none()

    async def get_by_id(self, erasure_id: uuid.UUID) -> ErasureRequest | None:
        res = await self._session.execute(
            select(ErasureRequest).where(ErasureRequest.id == erasure_id)
        )
        return res.scalar_one_or_none()

    async def mark_confirmed(self, req: ErasureRequest) -> ErasureRequest:
        req.status = "confirmed"
        req.confirmed_at = datetime.now(timezone.utc)
        await self._session.flush()
        return req

    async def mark_completed(self, req: ErasureRequest) -> ErasureRequest:
        req.status = "completed"
        req.completed_at = datetime.now(timezone.utc)
        await self._session.flush()
        return req

    async def cancel(self, req: ErasureRequest) -> ErasureRequest:
        req.status = "cancelled"
        await self._session.flush()
        return req
