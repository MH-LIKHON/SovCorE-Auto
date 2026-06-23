// ============================================================
// frontend/web/src/components/ui/badge.tsx
// ============================================================
//
// Purpose:
//   Small pill used for status labels, feature tags, and
//   vehicle lifecycle state indicators across the application.
//
// Origin:
//   Copied verbatim from SovCorE QR src/components/ui/badge.tsx.
//
// Design:
//   Four tones, each tied to a semantic token in variables.css:
//     muted    grey, for inactive or deferred items
//     accent   purple, for feature or plan markers
//     info     cyan, for upcoming or beta items
//     success  teal, for active or shipped items
//
// Consumed by:
//   - src/components/vehicles/vehicle-card.tsx (lifecycle state)
//   - app/(public)/page.tsx (feature tags)
// ============================================================

import clsx from "clsx";
import type { ReactNode } from "react";

// ==================================================
// TYPES
// ==================================================

interface BadgeProps {
  tone?: "muted" | "accent" | "info" | "success";
  children: ReactNode;
  className?: string;
}

// ==================================================
// BADGE COMPONENT
// ==================================================

export function Badge({ tone = "muted", children, className }: BadgeProps) {
  return (
    <span className={clsx("sov-badge", `sov-badge--${tone}`, className)}>
      {children}
      <style>{BADGE_STYLES}</style>
    </span>
  );
}

// ==================================================
// BADGE STYLES
// ==================================================

const BADGE_STYLES = `
  .sov-badge {
    display: inline-flex;
    align-items: center;
    padding: 3px 8px;
    border-radius: var(--radius-full);
    font-size: 10px;
    font-weight: var(--weight-medium);
    letter-spacing: var(--tracking-widest);
    text-transform: uppercase;
    line-height: 1;
  }

  /* ---------- Muted tone ---------- */
  .sov-badge--muted {
    color: var(--colour-text-faint);
    background: rgba(136, 136, 170, 0.10);
    border: 1px solid rgba(136, 136, 170, 0.18);
  }

  /* ---------- Accent tone ---------- */
  .sov-badge--accent {
    color: #cdc8ff;
    background: rgba(108, 99, 255, 0.14);
    border: 1px solid rgba(108, 99, 255, 0.32);
  }

  /* ---------- Info tone ---------- */
  .sov-badge--info {
    color: #aae6ff;
    background: rgba(0, 212, 255, 0.10);
    border: 1px solid rgba(0, 212, 255, 0.28);
  }

  /* ---------- Success tone ---------- */
  .sov-badge--success {
    color: #9ce6cf;
    background: rgba(0, 212, 170, 0.10);
    border: 1px solid rgba(0, 212, 170, 0.28);
  }
`;
