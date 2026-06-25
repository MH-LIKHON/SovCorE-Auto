// ============================================================
// frontend/web/app/legal/security/page.tsx
// ============================================================
//
// Purpose:
//   Security policy for SovCorE Auto. States the security
//   posture using only the approved information-security
//   wording defined in PRIVATE/BLUEPRINT/05-legal-content.md.
//
// Information-security wording rule:
//   The only permitted phrasing for the security posture is
//   "Built to ISO/IEC 27001:2022 control principles" together
//   with "not currently certified". No other form is written.
//
// Consumed by:
//   - Routed at /legal/security
// ============================================================

import type { Metadata } from "next";

import { LegalPage, type LegalSection } from "@/src/components/marketing/legal-page";
import { legalEmails } from "@/src/lib/constants/legal";

// ==================================================
// PAGE METADATA
// ==================================================

export const metadata: Metadata = {
  title: "Security | SovCorE Auto",
  description:
    "Security policy for SovCorE Auto. Our security posture, responsible disclosure, and contact details.",
};

// ==================================================
// LAST-UPDATED DATE
// ==================================================

const LAST_UPDATED = "23 June 2026";

// ==================================================
// SECTIONS
// ==================================================

const SECTIONS: readonly LegalSection[] = [
  {
    heading: "Security posture",
    body: (
      <p>
        SovCorE Auto is built to ISO/IEC 27001:2022 control principles. It is not currently
        certified against that standard.
      </p>
    ),
  },
  {
    heading: "Authentication",
    body: (
      <>
        <p>
          SovCorE Auto uses passwordless email sign-in. A six-digit one-time code is sent to
          your email address each time you sign in. The code is hashed before storage and is
          valid for ten minutes. It is consumed on first use and cannot be replayed.
        </p>
        <p>
          Time-based one-time password (TOTP) two-factor authentication is available as an
          additional layer. The TOTP secret is encrypted at rest.
        </p>
        <p>
          Microsoft OpenID Connect sign-in is available as an alternative to email codes. We do
          not store your Microsoft password or credentials.
        </p>
      </>
    ),
  },
  {
    heading: "Session management",
    body: (
      <p>
        Access tokens are short-lived (thirty minutes) and held in browser memory only, not
        in localStorage or sessionStorage beyond the active session. Refresh tokens are stored
        exclusively in HTTP-only, Secure, SameSite=Lax cookies and are never accessible to
        page JavaScript. The refresh token path is restricted to the authentication endpoint
        prefix so it is not sent on general requests.
      </p>
    ),
  },
  {
    heading: "Transport security",
    body: (
      <p>
        All communication between the browser and the service uses TLS. The service is served
        exclusively over HTTPS in production. HTTP requests are redirected to HTTPS. HSTS is
        configured on all production domains.
      </p>
    ),
  },
  {
    heading: "Data storage",
    body: (
      <p>
        Structured data is stored in Neon (PostgreSQL). Uploaded documents and images are
        stored in Cloudflare R2 object storage. Both providers use encryption at rest. Database
        credentials and secrets are stored as environment variables, not in source code.
      </p>
    ),
  },
  {
    heading: "Application controls",
    body: (
      <ul>
        <li>Role-based access control (Owner, Admin, Editor, Viewer) on every protected endpoint.</li>
        <li>File uploads are validated before storage.</li>
        <li>Content Security Policy headers are set on all responses.</li>
        <li>Rate limiting is applied to authentication endpoints.</li>
        <li>CSRF protection is applied to the OAuth sign-in callback via a signed state cookie.</li>
      </ul>
    ),
  },
  {
    heading: "Responsible disclosure",
    body: (
      <>
        <p>
          If you believe you have found a security vulnerability in SovCorE Auto, please report
          it to us before disclosing it publicly. We commit to:
        </p>
        <ul>
          <li>acknowledging your report within two working days;</li>
          <li>keeping you informed of our investigation;</li>
          <li>not pursuing legal action against researchers acting in good faith.</li>
        </ul>
        <p>
          Send reports to{" "}
          <a href={`mailto:${legalEmails.security}`} style={{ color: "var(--colour-accent2)" }}>
            {legalEmails.security}
          </a>
          . Please include a description of the issue, steps to reproduce it, and the potential
          impact. We ask that you give us reasonable time to investigate and remediate before
          public disclosure.
        </p>
      </>
    ),
  },
];

// ==================================================
// PAGE
// ==================================================

export default function SecurityPage() {
  return (
    <LegalPage
      title="Security"
      lastUpdated={LAST_UPDATED}
      intro={
        <>
          <p>
            This page describes the security controls in place for SovCorE Auto and how to
            report a security concern.
          </p>
        </>
      }
      sections={SECTIONS}
    />
  );
}
