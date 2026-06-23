// ============================================================
// frontend/web/src/components/auth/auth-card.tsx
// ============================================================
//
// Purpose:
//   Inner card on every auth page. Renders the title, the
//   optional subline, the form body, and the optional foot
//   row (links to siblings: "Back to sign in", etc.).
//
// Design:
//   Fixed 440px max width on desktop, full width on mobile.
//   Reuses the SovCorE Card primitive so the surface (glass,
//   border, radius) matches the marketing cards exactly.
//
// Consumed by:
//   - app/(auth)/forgot/page.tsx
//   - app/(auth)/reset/page.tsx
//   - app/(auth)/register/page.tsx
// ============================================================

import type { ReactNode } from "react";

import { Card } from "@/src/components/ui/card";

// ==================================================
// TYPES
// ==================================================

interface AuthCardProps {
  title: string;
  subline?: ReactNode;
  children: ReactNode;
  foot?: ReactNode;
}

// ==================================================
// AUTH CARD
// ==================================================

export function AuthCard({ title, subline, children, foot }: AuthCardProps) {
  return (
    <div style={{ width: "100%", maxWidth: 440 }}>
      <Card>
        <h1 className="auth-card__title">{title}</h1>
        {subline && <p className="auth-card__subline">{subline}</p>}
        <div className="auth-card__body">{children}</div>
        {foot && <div className="auth-card__foot">{foot}</div>}
      </Card>
      <style>{AUTH_CARD_STYLES}</style>
    </div>
  );
}

// ==================================================
// STYLES
// ==================================================

const AUTH_CARD_STYLES = `
  .auth-card__title { font-size: var(--text-xl); letter-spacing: var(--tracking-tight); margin-bottom: var(--space-2); }
  .auth-card__subline { color: var(--colour-text-muted); font-size: var(--text-sm); line-height: var(--leading-normal); margin-bottom: var(--space-6); }
  .auth-card__body { display: flex; flex-direction: column; gap: var(--space-4); }
  .auth-card__foot { margin-top: var(--space-6); padding-top: var(--space-4); border-top: 1px solid var(--colour-border); font-size: var(--text-sm); color: var(--colour-text-muted); display: flex; justify-content: space-between; gap: var(--space-4); flex-wrap: wrap; }
  .auth-card__foot a { color: var(--colour-text-muted); text-decoration: none; display: inline-block; transition: color 0.2s, transform 0.25s cubic-bezier(0.34,1.56,0.64,1); }
  .auth-card__foot a:hover { color: var(--colour-accent2); transform: scale(1.08); }
`;
