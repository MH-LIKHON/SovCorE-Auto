// ============================================================
// frontend/web/src/components/marketing/legal-page.tsx
// ============================================================
//
// Purpose:
//   Shared shell for all legal pages (Privacy, Terms, Cookies,
//   Security). Renders the page title, the last-updated date,
//   the legal copy via a typed section list, and a mandatory
//   UK Companies (Trading Disclosures) Regulations 2008 operator
//   block at the foot pulled directly from the legal constants.
//
// Design:
//   Section list is rendered from a typed array so each legal
//   page's copy lives next to its route file and the shell
//   never holds any text of its own. The Operator block is the
//   single source of the trading disclosure across legal pages.
//
// Consumed by:
//   - app/legal/privacy/page.tsx
//   - app/legal/terms/page.tsx
//   - app/legal/cookies/page.tsx
//   - app/legal/security/page.tsx
// ============================================================

import type { ReactNode } from "react";

import { companyInfo, legalEmails } from "@/src/lib/constants/legal";

// ==================================================
// TYPES
// ==================================================

export interface LegalSection {
  heading: string;
  body: ReactNode;
}

interface LegalPageProps {
  title: string;
  lastUpdated: string;
  intro: ReactNode;
  sections: readonly LegalSection[];
}

// ==================================================
// LEGAL PAGE COMPONENT
// ==================================================

export function LegalPage({ title, lastUpdated, intro, sections }: LegalPageProps) {
  return (
    <article className="legal page-shell">
      {/* ---------- Title and last-updated stamp ---------- */}
      <header className="legal__head">
        <h1 className="legal__title">{title}</h1>
        <p className="legal__updated">Last updated {lastUpdated}.</p>
      </header>

      {/* ---------- Intro paragraph(s) ---------- */}
      <div className="legal__intro">{intro}</div>

      {/* ---------- Numbered sections ---------- */}
      <ol className="legal__list">
        {sections.map((section, idx) => (
          <li key={section.heading}>
            <h2 className="legal__section-heading">
              {idx + 1}. {section.heading}
            </h2>
            <div className="legal__section-body">{section.body}</div>
          </li>
        ))}
      </ol>

      {/* ---------- Operator block (mandatory disclosure) ---------- */}
      <aside className="legal__operator">
        <h3 className="legal__section-heading">Operator</h3>
        <p>
          {companyInfo.tradingName} is operated by {companyInfo.legalName}, a company
          registered in {companyInfo.jurisdiction} with company number{" "}
          {companyInfo.companiesHouseNumber}. Registered office: {companyInfo.registeredOffice}.
          {companyInfo.icoRegistrationNumber
            ? ` Registered with the Information Commissioner's Office under registration ${companyInfo.icoRegistrationNumber}.`
            : ""}
        </p>
        <p>
          Privacy enquiries:{" "}
          <a href={`mailto:${legalEmails.privacy}`} className="legal__email">
            {legalEmails.privacy}
          </a>
          . Legal correspondence:{" "}
          <a href={`mailto:${legalEmails.legal}`} className="legal__email">
            {legalEmails.legal}
          </a>
          . Support:{" "}
          <a href={`mailto:${legalEmails.support}`} className="legal__email">
            {legalEmails.support}
          </a>
          .
        </p>
      </aside>

      <style>{LEGAL_STYLES}</style>
    </article>
  );
}

// ==================================================
// LEGAL PAGE STYLES
// ==================================================

const LEGAL_STYLES = `
  .legal { max-width: 760px; padding-top: var(--space-12); padding-bottom: var(--space-16); }

  /* ---------- Head ---------- */
  .legal__head { margin-bottom: var(--space-6); }
  .legal__title { font-size: var(--text-3xl); margin-bottom: var(--space-2); letter-spacing: var(--tracking-tight); }
  .legal__updated { color: var(--colour-text-faint); font-size: var(--text-sm); }

  /* ---------- Intro ---------- */
  .legal__intro { color: var(--colour-text-muted); font-size: var(--text-base); margin-bottom: var(--space-10); line-height: var(--leading-normal); }
  .legal__intro p { margin-bottom: var(--space-3); }

  /* ---------- Section list ---------- */
  .legal__list { list-style: none; padding: 0; display: flex; flex-direction: column; gap: var(--space-8); }
  .legal__section-heading { font-size: var(--text-lg); color: var(--colour-text); margin-bottom: var(--space-3); letter-spacing: normal; }
  .legal__section-body { color: var(--colour-text-muted); font-size: var(--text-base); line-height: var(--leading-normal); }
  .legal__section-body p { margin-bottom: var(--space-3); }
  .legal__section-body ul { list-style: disc; padding-left: 22px; margin: var(--space-3) 0; display: flex; flex-direction: column; gap: 8px; }
  .legal__section-body strong { color: var(--colour-text); }

  /* ---------- Operator block ---------- */
  .legal__operator {
    margin-top: var(--space-12);
    padding-top: var(--space-6);
    border-top: 1px solid var(--colour-border);
    color: var(--colour-text-muted);
    font-size: var(--text-sm);
    line-height: var(--leading-normal);
  }
  .legal__operator p { margin-bottom: var(--space-3); }
  .legal__email { color: var(--colour-accent2); }
`;
