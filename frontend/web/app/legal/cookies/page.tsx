// ============================================================
// frontend/web/app/legal/cookies/page.tsx
// ============================================================
//
// Purpose:
//   Cookie policy for SovCorE Auto. Lists each cookie set by
//   the service, its purpose, its duration, and the consent
//   posture under the Privacy and Electronic Communications
//   Regulations 2003. Written in Register C.
//
// Consumed by:
//   - Routed at /legal/cookies
// ============================================================

import type { Metadata } from "next";

import { LegalPage, type LegalSection } from "@/src/components/marketing/legal-page";
import { legalEmails } from "@/src/lib/constants/legal";

// ==================================================
// PAGE METADATA
// ==================================================

export const metadata: Metadata = {
  title: "Cookies — SovCorE Auto",
  description:
    "Cookie policy for SovCorE Auto. Which cookies we set, their purposes, and the consent posture under PECR 2003.",
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
    heading: "What cookies are",
    body: (
      <p>
        Cookies are small text files placed on your device by a web application. The Privacy
        and Electronic Communications Regulations 2003 (PECR) require us to tell you which
        cookies we set, why we set them, and whether they require your consent. Strictly
        necessary cookies may be set without consent. All other categories require your
        explicit opt-in before they are placed.
      </p>
    ),
  },
  {
    heading: "Strictly necessary cookies",
    body: (
      <>
        <p>
          We set the following strictly necessary cookies. They cannot be disabled without
          breaking the service and do not require your consent under PECR 2003 Regulation 6.
        </p>
        <ul>
          <li>
            <strong>sva_refresh.</strong> An HTTP-only, Secure, SameSite=Lax session cookie
            that holds your encrypted refresh token. It is used to issue a new access token
            when the short-lived access token expires (every thirty minutes). Without this
            cookie you would need to sign in again on every page load. Duration: thirty days
            from last sign-in, or until you sign out. Accessible only by our server — not by
            JavaScript running in the page.
          </li>
          <li>
            <strong>sva_oauth_state.</strong> An HTTP-only, SameSite=Lax cookie set for the
            duration of a Microsoft sign-in redirect. It holds a random state value used to
            verify that the callback belongs to the same browser session that started the
            sign-in (CSRF protection). The cookie is deleted immediately after the callback
            completes. Duration: five minutes maximum; deleted on use. Accessible only by our
            server.
          </li>
        </ul>
      </>
    ),
  },
  {
    heading: "Analytics and advertising cookies",
    body: (
      <p>
        We set no analytics cookies, tracking cookies, or advertising cookies. We do not load
        any third-party tracking scripts, pixels, or beacons. No data is sent to advertising
        networks or analytics platforms.
      </p>
    ),
  },
  {
    heading: "Third-party cookies",
    body: (
      <p>
        Cloudflare may set cookies on its edge nodes for bot-detection purposes under its own
        cookie policy. These are strictly necessary for the delivery and protection of the
        service. The Microsoft sign-in flow operates on microsoft.com subdomains, which may
        set their own cookies under Microsoft's cookie policy during the sign-in redirect.
        We have no control over those cookies.
      </p>
    ),
  },
  {
    heading: "Consent",
    body: (
      <p>
        We do not present a cookie-consent banner because all cookies we set are strictly
        necessary. If we add optional cookies in a future release, we will implement a consent
        mechanism before placing them.
      </p>
    ),
  },
  {
    heading: "Managing cookies",
    body: (
      <>
        <p>
          You can control cookies through your browser settings. Blocking or deleting the
          sva_refresh cookie will sign you out and require you to sign in on each visit.
          Blocking the sva_oauth_state cookie will prevent the Microsoft SSO sign-in from
          completing; you will still be able to sign in with an email code.
        </p>
        <p>
          For questions about cookies, write to{" "}
          <a href={`mailto:${legalEmails.privacy}`} style={{ color: "var(--colour-accent2)" }}>
            {legalEmails.privacy}
          </a>
          .
        </p>
      </>
    ),
  },
];

// ==================================================
// PAGE
// ==================================================

export default function CookiesPage() {
  return (
    <LegalPage
      title="Cookies"
      lastUpdated={LAST_UPDATED}
      intro={
        <>
          <p>
            SovCorE Auto sets only the cookies that are strictly necessary to authenticate you
            and protect sign-in requests from forgery. We set no tracking, analytics, or
            advertising cookies.
          </p>
        </>
      }
      sections={SECTIONS}
    />
  );
}
