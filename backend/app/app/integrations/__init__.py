# ============================================================
# backend/app/app/integrations/__init__.py
# ============================================================
#
# Purpose:
#   Marks the integrations package. External service clients
#   live here: Cloudflare R2 (object storage) and Resend
#   (transactional email). Each module exposes a single
#   function that returns a configured client; callers import
#   the function, not the client directly, so the credentials
#   are read lazily from settings on first use.
#
# ============================================================
