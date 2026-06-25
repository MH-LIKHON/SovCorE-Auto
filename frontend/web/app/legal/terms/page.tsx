// ============================================================
// frontend/web/app/legal/terms/page.tsx
// ============================================================
//
// Purpose:
//   Terms of service for SovCorE Auto. Covers acceptance, the
//   service description, acceptable use, intellectual property,
//   liability, and governing law. Written in Register C.
//
// Consumed by:
//   - Routed at /legal/terms
// ============================================================

import type { Metadata } from "next";

import { LegalPage, type LegalSection } from "@/src/components/marketing/legal-page";
import { legalEmails } from "@/src/lib/constants/legal";

// ==================================================
// PAGE METADATA
// ==================================================

export const metadata: Metadata = {
  title: "Terms | SovCorE Auto",
  description:
    "Terms of service for SovCorE Auto, operated by VelVadY LTD trading as SovCorE.",
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
    heading: "Acceptance",
    body: (
      <p>
        By creating an account or using SovCorE Auto, you agree to these terms. If you do not
        accept the terms, do not use the service. These terms apply between you and VelVadY LTD
        trading as SovCorE (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;). The Effective Date of these terms is the date
        you first accept them.
      </p>
    ),
  },
  {
    heading: "The service",
    body: (
      <>
        <p>
          SovCorE Auto is a vehicle management application that enables you to track MOT and
          road-tax renewal dates, insurance renewals, fuel, expenses, maintenance records, and
          vehicle documents for vehicles associated with your account.
        </p>
        <p>
          The service is provided via a web application. We may change, extend, suspend, or
          withdraw any part of the service at any time, including individual features, API
          endpoints, and file storage limits. Where a change materially reduces the service for
          registered users we will give reasonable notice by email.
        </p>
        <p>
          SovCorE Auto is not an authoritative source for DVLA, DVSA, HMRC, or insurer records.
          Dates and figures drawn from official sources may differ from the information you have
          recorded in the application. You are responsible for verifying compliance with
          regulatory requirements.
        </p>
      </>
    ),
  },
  {
    heading: "Account",
    body: (
      <>
        <p>
          You must create an account to use the service. You are responsible for maintaining the
          security of your account, including the confidentiality of any sign-in codes, and for
          all activities that occur under it. If you believe your account has been compromised,
          contact{" "}
          <a href={`mailto:${legalEmails.security}`} style={{ color: "var(--colour-accent2)" }}>
            {legalEmails.security}
          </a>{" "}
          immediately.
        </p>
        <p>
          You may not transfer your account or the access rights attached to it to another
          person without our written consent.
        </p>
      </>
    ),
  },
  {
    heading: "Acceptable use",
    body: (
      <>
        <p>You must not use SovCorE Auto to:</p>
        <ul>
          <li>store vehicle data for vehicles you do not own, operate, or manage on behalf of
            a third party with that party&apos;s consent;</li>
          <li>upload documents you do not have the right to upload or store, including
            documents whose contents are subject to confidentiality obligations you cannot
            waive;</li>
          <li>impersonate any person or organisation, or misrepresent your affiliation
            with one;</li>
          <li>probe, scan, or test the vulnerability of the service, or breach its security
            or authentication measures;</li>
          <li>scrape, mirror, or systematically download the service or any part of its
            stored data by automated means;</li>
          <li>interfere with another user&apos;s access to the service, or place an excessive
            load on the infrastructure by automated or other means.</li>
        </ul>
        <p>
          We may suspend or terminate your account without notice if we reasonably believe you
          are doing any of the above.
        </p>
      </>
    ),
  },
  {
    heading: "Your data",
    body: (
      <>
        <p>
          You retain all rights to the vehicle data, documents, and records you store in
          SovCorE Auto. We do not claim any ownership over the content you upload or create.
        </p>
        <p>
          You grant us a limited, worldwide, royalty-free licence to host, store, transmit, and
          display your data solely as necessary to provide the service to you.
        </p>
        <p>
          You can export and delete your data at any time from the account settings page. On
          account deletion, all your data is permanently purged from the primary database and
          object storage within thirty days.
        </p>
      </>
    ),
  },
  {
    heading: "Intellectual property",
    body: (
      <>
        <p>
          The SovCorE wordmark, logo, design system, and the source code of the application
          are the property of VelVadY LTD trading as SovCorE. Nothing in these terms grants
          you any rights in those assets.
        </p>
        <p>
          The vehicle data, documents, and records you store in the service are your
          intellectual property. We claim no rights in them beyond the limited hosting
          licence described above.
        </p>
      </>
    ),
  },
  {
    heading: "Warranties and liability",
    body: (
      <>
        <p>
          SovCorE Auto is provided without warranty of any kind, express or implied, to the
          fullest extent permitted by law. We do not warrant that the service will be
          uninterrupted, error-free, or fit for any particular purpose, including the purpose
          of managing regulatory compliance.
        </p>
        <p>
          To the fullest extent permitted by law, our total liability arising out of or in
          connection with the service is limited to the greater of one hundred pounds sterling
          or the total fees you have paid to us in the twelve months preceding the claim.
          Nothing in these terms limits or excludes liability that cannot lawfully be limited
          or excluded, including liability for death or personal injury caused by negligence,
          or for fraudulent misrepresentation.
        </p>
      </>
    ),
  },
  {
    heading: "Changes to these terms",
    body: (
      <p>
        We may update these terms from time to time. We will give you at least fourteen days&apos;
        notice of material changes by email. Continued use of the service after the effective
        date of a change is acceptance of the updated terms. If you do not accept the updated
        terms, close your account before the effective date.
      </p>
    ),
  },
  {
    heading: "Governing law and jurisdiction",
    body: (
      <p>
        These terms are governed by the law of England and Wales. The courts of England and
        Wales have exclusive jurisdiction over any dispute arising out of or in connection
        with these terms or the service, save that we reserve the right to seek injunctive
        relief in any competent court.
      </p>
    ),
  },
];

// ==================================================
// PAGE
// ==================================================

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms"
      lastUpdated={LAST_UPDATED}
      intro={
        <>
          <p>
            These terms set out the rules for using SovCorE Auto. They govern the relationship
            between you and VelVadY LTD trading as SovCorE. Read them before creating
            an account.
          </p>
        </>
      }
      sections={SECTIONS}
    />
  );
}
