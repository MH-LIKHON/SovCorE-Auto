# ============================================================
# backend/app/app/integrations/resend_client.py
# ============================================================
#
# Purpose:
#   Resend transactional email client configuration. Provides
#   a thin wrapper around the resend SDK, a shared branded
#   HTML shell, and typed content builders for every email
#   type the platform sends.
#
# Design:
#   `configure_resend` is called once at startup from main.py.
#   After that, any module can call `send_email` to dispatch
#   a transactional email, or `send_notification_email` for
#   the async-safe scheduler variant.
#
#   All emails share one shell: `build_email_html`. Content
#   for each email type is produced by a dedicated builder:
#     - build_otp_content           - passwordless login code
#     - build_reminder_content      - MOT / Tax / Insurance / Service renewal
#     - build_custom_alert_content  - date, recurring, and mileage alerts
#
#   Registration plates use the yellow number-plate style from
#   the platform UI and PDF reports. Urgency colouring mirrors
#   the dashboard RAG system: red ≤ 7 days, amber ≤ 30, teal > 30.
#
# Consumed by:
#   - backend/app/main.py (configure_resend in lifespan)
#   - app/auth/services/auth_service.py (OTP login code)
#   - app/scheduler/jobs.py (reminders, custom alerts)
# ============================================================

import resend

from app.core.settings import get_settings

# ==================================================
# SHARED CSS
# ==================================================

# Kept outside f-strings so curly braces need no escaping.
_EMAIL_CSS = """
  @keyframes underlinePing {
    0%   { transform: scaleX(0); opacity: 0; }
    15%  { transform: scaleX(1); opacity: 1; }
    85%  { transform: scaleX(1); opacity: 1; }
    100% { transform: scaleX(0); opacity: 0; }
  }
  .em-wordmark {
    margin: 0;
    font-size: 20px;
    font-weight: 600;
    letter-spacing: 0.5px;
    line-height: 1;
    text-align: center;
    color: #ffffff;
  }
  .em-underline {
    height: 1px;
    background: linear-gradient(90deg, #6c63ff, #00d4ff);
    border-radius: 1px;
    max-width: 140px;
    margin: 10px auto 0;
    transform: scaleX(0);
    opacity: 0;
    transform-origin: center;
    animation: underlinePing 3.2s ease-in-out 0.3s infinite;
  }
"""

# ==================================================
# INTERNAL HELPERS
# ==================================================


def _reg_html(reg: str) -> str:
    """Yellow number-plate block, centered, for the top of an email card."""
    safe = reg.strip().upper()
    return (
        '<table role="presentation" cellpadding="0" cellspacing="0"'
        ' style="margin:0 auto 28px;">'
        "<tr>"
        '<td style="background:#f0c30f;border-radius:6px;padding:7px 22px;">'
        '<p style="margin:0;font-size:17px;font-weight:700;letter-spacing:0.14em;'
        'color:#1a1a1a;text-transform:uppercase;'
        "font-family:'Courier New',Courier,monospace;line-height:1;\">"
        f"{safe}"
        "</p>"
        "</td></tr></table>"
    )


def _urgency_colour(days: int | None, miles: int | None = None) -> str:
    """RAG colour for the countdown value, matching dashboard thresholds."""
    if days is not None:
        if days <= 7:  return "#ef4444"   # red
        if days <= 30: return "#f59e0b"   # amber
        return "#2dd4bf"                  # teal
    if miles is not None:
        if miles <= 0:   return "#ef4444"
        if miles <= 200: return "#ef4444"
        if miles <= 500: return "#f59e0b"
        return "#2dd4bf"
    return "#c0c0d8"


def _countdown(days: int | None, miles: int | None = None) -> tuple[str, str]:
    """Return (display_value, sub_label) for the big countdown block."""
    if days is not None:
        if days <= 0:
            return "OVERDUE", "ACTION REQUIRED"
        return str(days), "DAYS REMAINING"
    if miles is not None:
        if miles <= 0:
            return "OVERDUE", "ACTION REQUIRED"
        return f"{miles:,}", "MILES REMAINING"
    return "-", ""


# ==================================================
# FOOTER
# ==================================================

_FOOTER_ROWS = """
  <tr>
    <td style="padding-top:32px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="border-top:1px solid rgba(255,255,255,0.06);padding-top:20px;">

            <p style="margin:0 0 8px;font-size:11px;color:#44445a;text-align:center;line-height:1.7;">
              This is an automated notification from
              <span style="color:#5a5a78;font-weight:600;">SovCorE&nbsp;Auto</span>.
              Replies to this email are not monitored.
            </p>

            <p style="margin:0 0 16px;font-size:11px;color:#44445a;text-align:center;line-height:1.7;">
              To adjust your notification preferences, sign in and go to
              <span style="color:#5a5a78;">Settings &rarr; Notifications</span>.
            </p>

            <hr style="border:none;border-top:1px solid rgba(255,255,255,0.05);margin:0 0 16px;">

            <p style="margin:0 0 12px;font-size:10px;color:#38384e;text-align:center;line-height:1.75;">
              This message is intended solely for the named recipient and relates to their
              registered SovCorE Auto fleet account. If you received it in error, please
              disregard and delete it immediately. Nothing in this email constitutes legal,
              regulatory, financial, or insurance advice. Renewal dates and mileage figures
              are provided for informational purposes only. Always verify with the relevant
              authority or insurer before taking action. SovCorE Auto processes personal data
              in accordance with its Privacy Policy and applicable data protection legislation.
            </p>

            <p style="margin:0;font-size:11px;color:#38384e;text-align:center;">
              &copy; 2026 SovCorE. All rights reserved.
            </p>

          </td>
        </tr>
      </table>
    </td>
  </tr>
"""

# ==================================================
# BRANDED EMAIL SHELL
# ==================================================


def build_email_html(content: str) -> str:
    """Wrap content in the SovCorE Auto dark branded shell with wordmark and footer."""
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="dark">
  <title>SovCorE Auto</title>
  <style>{_EMAIL_CSS}</style>
</head>
<body style="margin:0;padding:0;background:#08080f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
         style="background:#08080f;min-height:100vh;">
    <tr>
      <td align="center" style="padding:48px 20px 48px;">
        <table role="presentation" cellpadding="0" cellspacing="0"
               style="max-width:520px;width:100%;">

          <!-- ~~~~~ Wordmark ~~~~~ -->
          <tr>
            <td align="center" style="padding-bottom:32px;">
              <p class="em-wordmark">SovCorE&nbsp;|&nbsp;AUTO</p>
              <div class="em-underline"></div>
            </td>
          </tr>

          <!-- ~~~~~ Content card ~~~~~ -->
          <tr>
            <td style="background:#0d0d1a;border-radius:16px;
                       border:1px solid rgba(108,99,255,0.15);
                       padding:40px 36px;">
              {content}
            </td>
          </tr>

          <!-- ~~~~~ Footer ~~~~~ -->
          {_FOOTER_ROWS}

        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""


# ==================================================
# CONTENT BUILDERS
# ==================================================


def build_otp_content(code: str) -> str:
    """OTP login code email. No vehicle context, identity only."""
    digit_cells = "".join(
        f'<td style="padding:0 4px;">'
        f'<div style="width:42px;height:56px;line-height:56px;text-align:center;'
        f'background:#131326;border:1px solid rgba(108,99,255,0.28);border-radius:8px;'
        f'font-family:\'Courier New\',Courier,monospace;font-size:28px;font-weight:700;'
        f'color:#6c63ff;">{c}</div>'
        f"</td>"
        for c in code
    )
    return f"""
      <p style="margin:0 0 6px;font-size:11px;font-weight:600;letter-spacing:0.1em;
                text-transform:uppercase;color:#66667a;text-align:center;">
        Login Code
      </p>
      <p style="margin:0 0 28px;font-size:21px;font-weight:600;color:#e0e0f0;
                text-align:center;line-height:1.3;">
        Your SovCorE Auto login code
      </p>

      <table role="presentation" cellpadding="0" cellspacing="0"
             style="margin:0 auto 28px;">
        <tr>{digit_cells}</tr>
      </table>

      <p style="margin:0 0 20px;font-size:13px;color:#66667a;text-align:center;">
        Valid for <strong style="color:#8888aa;">10 minutes</strong>.
        Do not share this code with anyone.
      </p>

      <hr style="border:none;border-top:1px solid rgba(255,255,255,0.07);margin:0 0 20px;">

      <p style="margin:0;font-size:12px;color:#44445a;text-align:center;line-height:1.65;">
        If you did not request this code, you can safely ignore this email.
        Your account is not at risk unless you enter the code yourself.
      </p>
    """


def build_reminder_content(
    reminder_type: str,
    days_remaining: int,
    due_date_str: str,
    vehicle_reg: str | None = None,
    vehicle_label: str | None = None,
) -> str:
    """
    Renewal reminder email (MOT / Tax / Insurance / Service).
    reminder_type  - human label, e.g. "MOT", "Tax", "Insurance", "Service"
    days_remaining - integer days; pass 0 or negative for overdue
    due_date_str   - formatted date string, e.g. "25 July 2026"
    vehicle_reg    - registration plate text (optional, displayed in yellow box)
    vehicle_label  - "BMW 5 Series" or similar (optional)
    """
    colour = _urgency_colour(days_remaining)
    value, sublabel = _countdown(days_remaining)
    reg_block = _reg_html(vehicle_reg) if vehicle_reg else ""
    veh_line = (
        f'<p style="margin:0 0 8px;font-size:14px;color:#8888aa;text-align:center;">'
        f'Vehicle: <strong style="color:#c0c0d8;">{vehicle_label}</strong></p>'
        if vehicle_label else ""
    )

    return f"""
      {reg_block}

      <p style="margin:0 0 4px;font-size:11px;font-weight:600;letter-spacing:0.1em;
                text-transform:uppercase;color:#66667a;text-align:center;">
        {reminder_type} Reminder
      </p>
      <p style="margin:0 0 2px;font-size:68px;font-weight:700;letter-spacing:-2px;
                color:{colour};text-align:center;line-height:1.05;">
        {value}
      </p>
      <p style="margin:0 0 28px;font-size:11px;font-weight:600;letter-spacing:0.08em;
                text-transform:uppercase;color:#66667a;text-align:center;">
        {sublabel}
      </p>

      <hr style="border:none;border-top:1px solid rgba(255,255,255,0.07);margin:0 0 20px;">

      <p style="margin:0 0 8px;font-size:14px;color:#8888aa;text-align:center;">
        Due date: <strong style="color:#c0c0d8;">{due_date_str}</strong>
      </p>
      {veh_line}
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px auto 0;">
        <tr>
          <td style="background:#6c63ff;border-radius:8px;">
            <a href="https://app.sovcore.co.uk/login"
               style="display:inline-block;padding:11px 28px;font-size:14px;font-weight:600;
                      color:#ffffff;text-decoration:none;letter-spacing:0.02em;">
              Log In
            </a>
          </td>
        </tr>
      </table>
    """


def build_custom_alert_content(
    alert_name: str,
    days_remaining: int | None,
    miles_remaining: int | None,
    vehicle_reg: str | None = None,
    vehicle_label: str | None = None,
) -> str:
    """
    Custom alert email (date, recurring, mileage, or mileage_recurring condition).
    Pass days_remaining OR miles_remaining, whichever triggered the alert.
    """
    colour = _urgency_colour(days_remaining, miles_remaining)
    value, sublabel = _countdown(days_remaining, miles_remaining)
    reg_block = _reg_html(vehicle_reg) if vehicle_reg else ""
    veh_line = (
        f'<p style="margin:0 0 0;font-size:14px;color:#8888aa;text-align:center;">'
        f'Vehicle: <strong style="color:#c0c0d8;">{vehicle_label}</strong></p>'
        if vehicle_label else ""
    )

    return f"""
      {reg_block}

      <p style="margin:0 0 6px;font-size:11px;font-weight:600;letter-spacing:0.1em;
                text-transform:uppercase;color:#66667a;text-align:center;">
        Custom Alert
      </p>
      <p style="margin:0 0 20px;font-size:19px;font-weight:600;color:#c0c0d8;
                text-align:center;line-height:1.35;">
        {alert_name}
      </p>
      <p style="margin:0 0 2px;font-size:68px;font-weight:700;letter-spacing:-2px;
                color:{colour};text-align:center;line-height:1.05;">
        {value}
      </p>
      <p style="margin:0 0 28px;font-size:11px;font-weight:600;letter-spacing:0.08em;
                text-transform:uppercase;color:#66667a;text-align:center;">
        {sublabel}
      </p>

      <hr style="border:none;border-top:1px solid rgba(255,255,255,0.07);margin:0 0 20px;">

      {veh_line}
      <table role="presentation" cellpadding="0" cellspacing="0"
             style="margin:{"12px" if vehicle_label else "0"} auto 0;">
        <tr>
          <td style="background:#6c63ff;border-radius:8px;">
            <a href="https://app.sovcore.co.uk/login"
               style="display:inline-block;padding:11px 28px;font-size:14px;font-weight:600;
                      color:#ffffff;text-decoration:none;letter-spacing:0.02em;">
              Log In
            </a>
          </td>
        </tr>
      </table>
    """


# ==================================================
# CONFIGURATION
# ==================================================


def configure_resend() -> None:
    settings = get_settings()
    resend.api_key = settings.resend_api_key


# ==================================================
# SEND HELPERS
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


async def send_notification_email(to: str, subject: str, html: str) -> None:
    """Async-safe email dispatch for scheduler jobs. Runs Resend in a thread executor."""
    import asyncio

    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, lambda: send_email(to=to, subject=subject, html=html))


async def send_reminder_email(to: str, subject: str, body: str) -> None:
    """Legacy plain-text body wrapper kept for backward compatibility."""
    body_html = body.replace("\n", "<br>")
    content = (
        f'<p style="font-size:15px;color:#c0c0d8;margin:0;'
        f'text-align:center;line-height:1.6;">{body_html}</p>'
    )
    await send_notification_email(to=to, subject=subject, html=build_email_html(content))
