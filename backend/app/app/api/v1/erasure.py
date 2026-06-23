# ============================================================
# backend/app/app/api/v1/erasure.py
# ============================================================
#
# Purpose:
#   REST endpoints for UK GDPR right-to-erasure requests.
#   Two-step flow: an owner requests erasure, then confirms by
#   typing the required phrase. On confirmation the purge worker
#   deletes all account data and R2 objects.
#
# Design:
#   Both endpoints are restricted to account owners only via
#   require_owner. Admins and below cannot trigger erasure.
#
#   POST /erasure          — step 1: create the request row.
#   POST /erasure/confirm  — step 2: type phrase, run purge.
#
# Consumed by:
#   - backend/app/app/api/v1/router.py
# ============================================================

import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.accounts.models.user import User
from app.core.database import get_db
from app.core.permissions import require_owner
from app.erasure.schemas.erasure_schemas import (
    ErasureCompleteOut,
    ErasureConfirmIn,
    ErasureRequestOut,
)
from app.erasure.services.erasure_service import ErasureService

# ==================================================
# ROUTER
# ==================================================

router = APIRouter()

# ==================================================
# ERASURE ENDPOINTS
# ==================================================


@router.post(
    "/accounts/{account_id}/erasure",
    response_model=ErasureRequestOut,
    status_code=status.HTTP_201_CREATED,
    summary="Request account and data erasure (UK GDPR Article 17)",
)
async def request_erasure(
    account_id: uuid.UUID,
    current_user: User = Depends(require_owner),
    db: AsyncSession = Depends(get_db),
) -> ErasureRequestOut:
    return await ErasureService(db).request_erasure(
        account_id=account_id,
        requesting_user_id=current_user.id,
    )


@router.post(
    "/accounts/{account_id}/erasure/confirm",
    response_model=ErasureCompleteOut,
    summary=(
        "Confirm erasure and permanently delete all account data "
        "(requires typing 'DELETE MY ACCOUNT')"
    ),
)
async def confirm_erasure(
    account_id: uuid.UUID,
    body: ErasureConfirmIn,
    _: User = Depends(require_owner),
    db: AsyncSession = Depends(get_db),
) -> ErasureCompleteOut:
    return await ErasureService(db).confirm_erasure(
        account_id=account_id,
        confirmation=body.confirmation,
    )
