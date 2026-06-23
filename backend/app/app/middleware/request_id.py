# ============================================================
# backend/app/app/middleware/request_id.py
# ============================================================
#
# Purpose:
#   Starlette middleware that attaches a unique request ID to every
#   HTTP request and binds it into the structlog context so every
#   log line emitted during that request carries the same ID.
#   The ID is also returned in the X-Request-ID response header so
#   a support operator can search for it in the log store.
#
# Design:
#   The middleware reads X-Request-ID from the incoming request if
#   present (e.g. set by Cloudflare or an upstream client). If the
#   header is absent, a new UUID4 is generated. Either way, the
#   same value is echoed back in the response header and bound into
#   structlog.contextvars so it appears in every log line for the
#   request — not just the access log line.
#
#   structlog.contextvars.clear_contextvars() is called after the
#   response so the request-scoped binding does not leak into the
#   next request that runs on the same thread.
#
# Consumed by:
#   - backend/app/main.py (app.add_middleware)
# ============================================================

import uuid

import structlog
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

# ==================================================
# MIDDLEWARE
# ==================================================

_REQUEST_ID_HEADER = "X-Request-ID"


class RequestIDMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:  # type: ignore[override]
        # ~~~~~~~~~ Resolve request ID ~~~~~~~~~
        request_id = request.headers.get(_REQUEST_ID_HEADER) or str(uuid.uuid4())

        # ~~~~~~~~~ Bind to structlog context ~~~~~~~~~
        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(request_id=request_id)

        response: Response = await call_next(request)

        # ~~~~~~~~~ Echo in response header ~~~~~~~~~
        response.headers[_REQUEST_ID_HEADER] = request_id

        # ~~~~~~~~~ Clear context so it does not bleed into the next request ~~~~~~~~~
        structlog.contextvars.clear_contextvars()

        return response
