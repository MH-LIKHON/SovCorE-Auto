// ============================================================
// frontend/web/app/(auth)/layout.tsx
// ============================================================
//
// Purpose:
//   Shared shell for every auth-flow page (login, register,
//   forgot, reset). Holds the centred card layout, the SovCorE
//   wordmark at the top, and the legal disclosure line at the
//   bottom.
//
// Design:
//   No navbar, no footer. The auth pages are deliberately
//   minimal so the user has nothing to do other than the form
//   in front of them. Mirrors the QR auth layout exactly
//   with subtitle "Auto" instead of "QR".
//
// Consumed by:
//   - app/(auth)/login/page.tsx
//   - app/(auth)/register/page.tsx
//   - app/(auth)/forgot/page.tsx
//   - app/(auth)/reset/page.tsx
// ============================================================

import Link from "next/link";
import type { ReactNode } from "react";

import { BrandLockup } from "@/src/components/ui/brand-lockup";
import { Copyright } from "@/src/components/ui/copyright";
import { companyDisclosureLineBrandLed } from "@/src/lib/constants/legal";

// ==================================================
// AUTH LAYOUT
// ==================================================

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="auth-shell">
      {/* ---------- Top brand bar ---------- */}
      <header className="auth-shell__head">
        <Link href="/" className="auth-shell__brand" aria-label="SovCorE Auto, home">
          <BrandLockup subtitle="Auto" size="md" />
        </Link>
      </header>

      {/* ---------- Centred card slot ---------- */}
      <main className="auth-shell__main">{children}</main>

      {/* ---------- Foot ---------- */}
      <footer className="auth-shell__foot">
        <Copyright />
        <p className="auth-shell__disclosure">{companyDisclosureLineBrandLed}</p>
      </footer>

      <style>{AUTH_STYLES}</style>
    </div>
  );
}

// ==================================================
// AUTH SHELL STYLES
// ==================================================

const AUTH_STYLES = `
  .auth-shell {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    background: var(--colour-bg);
  }
  .auth-shell__head {
    padding: var(--space-6) var(--space-10);
  }
  .auth-shell__brand { text-decoration: none; }
  .auth-shell__main {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-8) var(--space-5);
  }
  .auth-shell__foot {
    padding: var(--space-6) var(--space-10);
    border-top: 1px solid var(--colour-border);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-5);
  }
  .auth-shell__disclosure {
    font-size: var(--text-xs);
    color: var(--colour-text-faint);
    line-height: var(--leading-normal);
    margin: 0;
    text-align: right;
    max-width: 480px;
  }
  @media (max-width: 767px) {
    .auth-shell__head { padding: var(--space-4) var(--space-5); }
    .auth-shell__foot { padding: var(--space-4) var(--space-5); flex-direction: column; align-items: flex-start; }
    .auth-shell__disclosure { text-align: left; }
  }
`;
