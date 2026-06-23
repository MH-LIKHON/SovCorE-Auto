# ============================================================
# backend/app/app/core/rate_limit.py
# ============================================================
#
# Purpose:
#   Shared rate-limiter instance and the key function used across
#   all rate-limited endpoints. Slowapi wraps `limits` and
#   integrates with the FastAPI decorator pattern.
#
# Design:
#   The key function prioritises CF-Connecting-IP (set by Cloudflare
#   in production) over X-Real-IP (set by Nginx) over the raw socket
#   address. This order ensures the real client IP is used even when
#   the app sits behind multiple reverse proxies.
#
#   The module also exports the RateLimitExceeded exception class so
#   main.py can register the error handler without importing slowapi
#   directly.
#
# Consumed by:
#   - backend/app/main.py (app.state.limiter, exception handler)
#   - backend/app/app/api/v1/auth.py (@limiter.limit decorators)
# ============================================================

from fastapi import Request
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

# ==================================================
# KEY FUNCTION
# ==================================================


def _client_ip(request: Request) -> str:
    # Trust order: CF-Connecting-IP (Cloudflare) → X-Real-IP (Nginx) → raw socket.
    # This is only safe when Cloudflare Tunnel and Nginx sit in front of the app,
    # as documented in DEPLOYMENT/VM-CLOUDFLARE-PLAYBOOK.md. If the app is exposed
    # directly (no tunnel), a client can inject a spoofed CF-Connecting-IP or
    # X-Real-IP header and bypass the per-IP rate limit entirely. The current
    # deployment architecture eliminates that risk, but any future deployment change
    # that removes Cloudflare or Nginx must revisit this key function.

    # Cloudflare sets this header only when the request passes through
    # their network — it cannot be spoofed by the upstream client.
    cf_ip = request.headers.get("CF-Connecting-IP")
    if cf_ip:
        return cf_ip

    # Nginx sets X-Real-IP from $remote_addr when proxying.
    real_ip = request.headers.get("X-Real-IP")
    if real_ip:
        return real_ip

    # Fall back to the raw ASGI scope address (works in development).
    return get_remote_address(request)


# ==================================================
# LIMITER
# ==================================================

# default_limits applies to every route that uses @limiter.limit without
# an explicit string; individual routes override as needed.
limiter = Limiter(key_func=_client_ip, default_limits=["200/minute"])

# Re-export so callers do not import slowapi directly.
__all__ = ["limiter", "RateLimitExceeded"]
