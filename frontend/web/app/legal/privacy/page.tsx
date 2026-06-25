// ============================================================
// frontend/web/app/legal/privacy/page.tsx
// ============================================================
//
// Purpose:
//   Privacy policy for SovCorE Auto. States what personal data
//   the service collects (account identity, vehicle records,
//   uploaded documents), the lawful bases, the sub-processors,
//   the retention schedule, and the data-subject rights under
//   UK GDPR and the Data Protection Act 2018.
//
// Consumed by:
//   - Routed at /legal/privacy
// ============================================================

import type { Metadata } from "next";

import { LegalPage, type LegalSection } from "@/src/components/marketing/legal-page";
import { legalEmails } from "@/src/lib/constants/legal";

// ==================================================
// PAGE METADATA
// ==================================================

export const metadata: Metadata = {
  title: "Privacy | SovCorE Auto",
  description:
    "Privacy policy for SovCorE Auto. What personal data we collect, why, how long we keep it, and your rights under UK GDPR.",
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
    heading: "What this policy covers",
    body: (
      <p>
        This policy applies to SovCorE Auto and the domains and APIs through which it is
        delivered. It does not cover other products operated by VelVadY LTD trading as SovCorE,
        each of which publishes its own privacy policy.
      </p>
    ),
  },
  {
    heading: "Data controller",
    body: (
      <p>
        The Data Controller is VelVadY LTD trading as SovCorE, a company registered in England
        and Wales. Contact details are in the Operator section at the foot of this page.
      </p>
    ),
  },
  {
    heading: "Categories of personal data we process",
    body: (
      <>
        <p>We process the following categories of personal data:</p>
        <ul>
          <li>
            <strong>Account identity.</strong> Your email address (required to issue a sign-in
            code) and, optionally, your full name if provided during account setup.
          </li>
          <li>
            <strong>Vehicle and ownership records.</strong> Vehicle registration marks, VINs,
            make, model, year, mileage records, MOT dates, SORN declarations, insurance policy
            references, and similar operational data you enter into the service.
          </li>
          <li>
            <strong>Uploaded documents.</strong> Certificates, schedules, photos, and other
            files you upload. These documents may themselves contain personal data, for example
            a V5C (vehicle logbook) names the registered keeper. We do not read or analyse the
            content of documents you upload.
          </li>
          <li>
            <strong>Expense and fuel records.</strong> Cost, date, category, and free-text
            notes you add to expense and fuel log entries.
          </li>
          <li>
            <strong>Authentication events.</strong> The timestamp and IP address of sign-in
            events and token refreshes, retained for thirty days as security audit data.
          </li>
          <li>
            <strong>Standard web server logs.</strong> IP address, requested URL, timestamp,
            user agent, and referrer for every HTTP request, retained for thirty days.
          </li>
        </ul>
      </>
    ),
  },
  {
    heading: "Lawful bases",
    body: (
      <>
        <p>We process personal data on the following lawful bases under UK GDPR Article 6:</p>
        <ul>
          <li>
            <strong>Contract performance (Article 6(1)(b)).</strong> Account identity, vehicle
            records, documents, and expense data are processed to perform the contract between
            you and SovCorE Auto. Without this data the service cannot function.
          </li>
          <li>
            <strong>Legitimate interests (Article 6(1)(f)).</strong> Authentication events and
            standard web server logs are processed to keep the service available, detect abuse,
            and investigate security incidents. The processing is limited, the retention is
            short, and the data is not used for any other purpose.
          </li>
        </ul>
      </>
    ),
  },
  {
    heading: "Sub-processors",
    body: (
      <>
        <p>We share data with the following sub-processors to operate the service:</p>
        <ul>
          <li>
            <strong>Neon (Neon, Inc.).</strong> Hosts the PostgreSQL database that stores
            account records, vehicle data, and structured application data. Data is stored in
            the European Economic Area.
          </li>
          <li>
            <strong>Cloudflare (Cloudflare, Inc.).</strong> Provides the R2 object storage
            used to store uploaded documents and images, and the CDN through which the service
            is delivered. CDN edge nodes may be located outside the EEA.
          </li>
          <li>
            <strong>Resend (Resend, Inc.).</strong> Delivers transactional email, including
            sign-in codes. Your email address is passed to Resend solely for the purpose of
            delivering each email. Resend does not store the content of emails beyond its
            standard delivery log.
          </li>
          <li>
            <strong>Microsoft Corporation.</strong> If you use the &quot;Continue with Microsoft&quot;
            sign-in option, your Microsoft-issued identity token is exchanged with the
            Microsoft identity platform. We receive your email address and display name from
            this exchange. If you do not use Microsoft sign-in, no data is passed to Microsoft.
          </li>
        </ul>
        <p>
          We do not share personal data with advertising networks, analytics platforms, or data
          brokers.
        </p>
      </>
    ),
  },
  {
    heading: "International transfers",
    body: (
      <p>
        Our primary database is hosted in the EEA (Neon). Cloudflare CDN edge nodes and Resend
        mail infrastructure may process data outside the EEA. Where transfers to third countries
        occur, the sub-processor relies on standard contractual clauses or an adequacy decision.
        Microsoft Corporation is certified under the EU-US Data Privacy Framework.
      </p>
    ),
  },
  {
    heading: "Retention",
    body: (
      <>
        <p>We retain data for the following periods:</p>
        <ul>
          <li>Account identity, vehicle records, documents, and expense data: until you
            submit an account erasure request, which permanently deletes your account and
            all associated data.</li>
          <li>Authentication events and server logs: thirty days, then deleted automatically.</li>
          <li>Sign-in codes: consumed on first use or purged after expiry (ten minutes).</li>
        </ul>
        <p>
          To request erasure, sign in to SovCorE Auto and use the account erasure option in
          account settings, or write to{" "}
          <a href={`mailto:${legalEmails.dpa}`} style={{ color: "var(--colour-accent2)" }}>
            {legalEmails.dpa}
          </a>
          .
        </p>
      </>
    ),
  },
  {
    heading: "Your rights",
    body: (
      <>
        <p>
          Under UK GDPR you have the right to access the personal data we hold about you,
          rectify inaccuracies, erase it, restrict its processing, object to its processing,
          and receive a copy in a portable format. To exercise any of these rights, write to{" "}
          <a href={`mailto:${legalEmails.privacy}`} style={{ color: "var(--colour-accent2)" }}>
            {legalEmails.privacy}
          </a>
          .
        </p>
        <p>
          You may also lodge a complaint with the Information Commissioner&apos;s Office, the UK
          supervisory authority, at ico.org.uk.
        </p>
      </>
    ),
  },
  {
    heading: "Children",
    body: (
      <p>
        SovCorE Auto is a vehicle management tool intended for adults. We do not knowingly
        collect personal data from children under thirteen. A parent or guardian who believes
        a child has provided personal data to the service should contact{" "}
        <a href={`mailto:${legalEmails.privacy}`} style={{ color: "var(--colour-accent2)" }}>
          {legalEmails.privacy}
        </a>{" "}
        and we will respond.
      </p>
    ),
  },
  {
    heading: "Changes to this policy",
    body: (
      <p>
        We update this policy when we ship features that change what we process. Each update
        bumps the &quot;last updated&quot; date at the top of the page. We will notify registered users
        of substantive changes by email before the change takes effect.
      </p>
    ),
  },
];

// ==================================================
// PAGE
// ==================================================

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy"
      lastUpdated={LAST_UPDATED}
      intro={
        <>
          <p>
            We treat privacy as a baseline, not a feature. SovCorE Auto collects only the data
            needed to operate the service and uses no third-party trackers.
          </p>
          <p>
            This page is the canonical record of what we collect, why we collect it, how long
            we keep it, who we share it with, and how to contact us about it.
          </p>
        </>
      }
      sections={SECTIONS}
    />
  );
}
