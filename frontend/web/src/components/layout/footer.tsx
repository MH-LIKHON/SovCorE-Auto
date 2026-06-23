// ============================================================
// frontend/web/src/components/layout/footer.tsx
// ============================================================
//
// Purpose:
//   Site footer. Carries the brand-led trading disclosure,
//   the company address, ICO registration, support email,
//   legal page links, and the copyright line.
//
// Origin:
//   Mirrored from SovCorE QR src/components/layout/footer.tsx.
//   Changes: heading is "SovCorE Auto", product links point to
//   Auto routes, and the about blurb describes Auto.
//
// Design:
//   Three-column grid on desktop, single column on mobile.
//   Hidden on /app/* routes: the dashboard shell is self-contained.
//
// Consumed by:
//   - app/layout.tsx
// ============================================================

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Copyright } from "@/src/components/ui/copyright";
import {
  companyInfo,
  companyDisclosureLineBrandLed,
  legalEmails,
} from "@/src/lib/constants/legal";

// ==================================================
// FOOTER COMPONENT
// ==================================================

export function Footer() {
  const pathname = usePathname();
  if (pathname.startsWith("/app")) return null;

  return (
    <footer className="sov-foot">
      <div className="sov-foot__inner">
        {/* ---------- Top grid ---------- */}
        <div className="sov-foot__grid">
          {/* About column */}
          <div className="sov-foot__col">
            <h4 className="sov-foot__heading">SovCorE Auto</h4>
            <p className="sov-foot__body">
              Self-hosted vehicle management for individuals, families and small fleets. Track
              every service, MOT, expense, and document for every vehicle in one place.
            </p>
          </div>

          {/* Product links column */}
          <div className="sov-foot__col">
            <h4 className="sov-foot__heading">Product</h4>
            <ul className="sov-foot__list">
              <li>
                <Link href="/vehicles" className="sov-foot__link sov-link">
                  My vehicles
                </Link>
              </li>
              <li>
                <Link href="/legal/privacy" className="sov-foot__link sov-link">
                  Privacy
                </Link>
              </li>
              <li>
                <Link href="/legal/terms" className="sov-foot__link sov-link">
                  Terms
                </Link>
              </li>
            </ul>
          </div>

          {/* Company column */}
          <div className="sov-foot__col">
            <h4 className="sov-foot__heading">Company</h4>
            <p className="sov-foot__body sov-foot__body--small">
              {companyDisclosureLineBrandLed}
            </p>
            <p className="sov-foot__body sov-foot__body--small">
              Registered office: {companyInfo.registeredOffice}.
            </p>
            {companyInfo.icoRegistrationNumber && (
              <p className="sov-foot__body sov-foot__body--small">
                ICO registration {companyInfo.icoRegistrationNumber}.
              </p>
            )}
            <p className="sov-foot__body sov-foot__body--small">
              Support:{" "}
              <a href={`mailto:${legalEmails.support}`} className="sov-foot__link sov-link">
                {legalEmails.support}
              </a>
            </p>
          </div>
        </div>

        {/* ---------- Bottom bar ---------- */}
        <div className="sov-foot__bottom">
          <Copyright />
          <p className="sov-foot__body sov-foot__body--small">
            Built on the SovCorE platform.
          </p>
        </div>
      </div>

      <style>{FOOT_STYLES}</style>
    </footer>
  );
}

// ==================================================
// FOOTER STYLES
// ==================================================

const FOOT_STYLES = `
  .sov-foot {
    border-top: 1px solid var(--colour-border);
    background: var(--colour-bg);
    padding: var(--space-16) var(--space-10) var(--space-10);
    margin-top: var(--space-24);
  }

  .sov-foot__inner {
    max-width: 1280px;
    margin: 0 auto;
  }

  /* ---------- Grid ---------- */
  .sov-foot__grid {
    display: grid;
    grid-template-columns: 1.4fr 1fr 1.2fr;
    gap: var(--space-12);
    margin-bottom: var(--space-12);
  }

  .sov-foot__col { display: flex; flex-direction: column; gap: var(--space-3); }

  /* ---------- Typography ---------- */
  .sov-foot__heading {
    font-size: var(--text-sm);
    color: var(--colour-text);
    font-weight: var(--weight-medium);
    letter-spacing: var(--tracking-wide);
    margin-bottom: var(--space-2);
  }

  .sov-foot__body {
    font-size: var(--text-sm);
    color: var(--colour-text-muted);
    line-height: var(--leading-normal);
  }

  .sov-foot__body--small { font-size: var(--text-xs); }

  /* ---------- Lists and links ---------- */
  .sov-foot__list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: var(--space-2); }

  .sov-foot__link {
    color: var(--colour-text-muted);
    text-decoration: none;
  }

  /* ---------- Bottom bar ---------- */
  .sov-foot__bottom {
    border-top: 1px solid var(--colour-border);
    padding-top: var(--space-6);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-5);
  }

  /* ---------- Tablet + mobile ---------- */
  @media (max-width: 1023px) {
    .sov-foot { padding: var(--space-10) var(--space-6) var(--space-8); }
    .sov-foot__grid { grid-template-columns: 1fr; gap: var(--space-8); }
    .sov-foot__bottom { flex-direction: column; align-items: flex-start; }
  }

  /* ---------- Small phone ---------- */
  @media (max-width: 479px) {
    .sov-foot { padding: var(--space-8) var(--space-5) var(--space-6); margin-top: var(--space-16); }
  }
`;
