# ============================================================
# backend/app/app/integrations/resend_client.py
# ============================================================
#
# Purpose:
#   Resend transactional email client configuration. Provides
#   a thin wrapper around the resend SDK that reads credentials
#   from application settings and exposes a type-safe send
#   function.
#
# Design:
#   `configure_resend` is called once at startup from main.py
#   lifespan to set the API key. After that, any module can
#   call `send_email` to dispatch a transactional email.
#
#   Phase 0 wires configuration only. Email templates and
#   dispatch logic are implemented in Phase 1 (passwordless
#   login code) and Phase 5 (reminders).
#
# Consumed by:
#   - backend/app/main.py (configure_resend in lifespan)
#   - app/auth/services/email_service.py (Phase 1)
#   - app/jobs/reminder_job.py (Phase 5)
# ============================================================

import resend

from app.core.settings import get_settings

# ==================================================
# CONFIGURATION
# ==================================================


def configure_resend() -> None:
    settings = get_settings()
    resend.api_key = settings.resend_api_key


# ==================================================
# SEND HELPER
# ==================================================


def send_email(
    to: str | list[str],
    subject: str,
    html: str,
    from_address: str | None = None,
) -> resend.Email:
    settings = get_settings()
    sender = from_address or settings.resend_from_address
    params: resend.Emails.SendParams = {
        "from": sender,
        "to": [to] if isinstance(to, str) else to,
        "subject": subject,
        "html": html,
    }
    return resend.Emails.send(params)
