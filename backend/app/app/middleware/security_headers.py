# ============================================================
# backend/app/app/middleware/security_headers.py
# ============================================================
#
# Purpose:
#   Starlette middleware that attaches security response headers to
#   every HTTP response the backend sends. Centralising the headers
#   here means they are applied unconditionally, regardless of which
#   router or route handler produces the response.
#
# Design:
#   HSTS is only emitted in production because a development HTTPS
#   override would pin HSTS to localhost and break future HTTP dev
#   sessions in browsers that honour it. The `app_env` value is read
#   from settings at class instantiation time (middleware is long-lived).
#
#   The CSP for a REST API is intentionally restrictive:
#   `default-src 'none'; frame-ancestors 'none'` prevents the browser
#   from rendering any resource served from the API origin and denies
#   framing from any parent document. The API does not serve HTML.
#
# Consumed by:
#   - backend/app/main.py (app.add_middleware)
# ============================================================

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.core.settings import get_settings

# ==================================================
# HEADER CONSTANTS
# ==================================================

_HEADERS: dict[str, str] = {
    # Prevents MIME-type sniffing — the browser must trust the declared Content-Type.
    "X-Content-Type-Options": "nosniff",
    # Denies rendering inside any frame or iframe regardless of origin.
    "X-Frame-Options": "DENY",
    # Legacy XSS filter (honoured by some older browsers still in the wild).
    "X-XSS-Protection": "1; mode=block",
    # Sends only the origin on cross-origin requests, no path or query string.
    "Referrer-Policy": "strict-origin-when-cross-origin",
    # Disables browser features the application never uses.
    "Permissions-Policy": "geolocation=(), microphone=(), camera=()",
    # The API serves JSON only; no scripts, styles, or frames are ever needed.
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none';",
}

_HSTS_HEADER = "Strict-Transport-Security"
# 1 year max-age; includeSubDomains covers any API subdomains.
_HSTS_VALUE = "max-age=31536000; includeSubDomains"

# ==================================================
# MIDDLEWARE
# ==================================================


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """
    Attaches security headers to every response. HSTS is added only
    in production to avoid locking the browser into HTTPS on localhost.
    """

    def __init__(self, app, is_production: bool) -> None:
        super().__init__(app)
        self._is_production = is_production

    async def dispatch(self, request: Request, call_next) -> Response:  # type: ignore[override]
        response: Response = await call_next(request)

        # ~~~~~~~~~ Fixed headers ~~~~~~~~~
        for name, value in _HEADERS.items():
            response.headers[name] = value

        # ~~~~~~~~~ HSTS (production only) ~~~~~~~~~
        if self._is_production:
            response.headers[_HSTS_HEADER] = _HSTS_VALUE

        return response


def make_security_middleware(app) -> SecurityHeadersMiddleware:  # type: ignore[type-arg]
    """
    Factory used by main.py so it does not need to import get_settings.
    Reading settings here rather than at import time means the .env
    file is parsed after the module is loaded, not at collection time.
    """
    settings = get_settings()
    return SecurityHeadersMiddleware(app, is_production=settings.app_env == "production")
