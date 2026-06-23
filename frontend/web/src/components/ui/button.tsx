// ============================================================
// frontend/web/src/components/ui/button.tsx
// ============================================================
//
// Purpose:
//   Primary call-to-action button used across marketing pages
//   and the application shell. Two variants:
//     primary    purple-to-cyan gradient with accent glow
//     secondary  glass surface with thin accent border
//
// Origin:
//   Copied verbatim from SovCorE QR src/components/ui/button.tsx.
//   The styles compose design tokens from variables.css so the
//   button matches the wider SovCorE suite without hand-tuned
//   colour values.
//
// Consumed by:
//   - src/components/layout/navbar.tsx
//   - app/(public)/page.tsx (hero CTA)
//   - any page form that needs a primary action
// ============================================================

"use client";

import clsx from "clsx";
import type { ButtonHTMLAttributes, ReactNode } from "react";

// ==================================================
// TYPES
// ==================================================

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary";
  size?: "sm" | "md" | "lg";
  children: ReactNode;
}

// ==================================================
// BUTTON COMPONENT
// ==================================================

export function Button({
  variant = "primary",
  size = "md",
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      className={clsx("sov-btn", `sov-btn--${variant}`, `sov-btn--${size}`, className)}
    >
      {/* Label is wrapped so the shine-sweep pseudo-element
          underneath does not overlay the text contents. */}
      <span className="sov-btn__label">{children}</span>
      <style>{BUTTON_STYLES}</style>
    </button>
  );
}

// ==================================================
// BUTTON STYLES
// ==================================================

const BUTTON_STYLES = `
  .sov-btn {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    border: 1px solid transparent;
    border-radius: var(--radius-md);
    font-family: var(--font-sans);
    font-weight: var(--weight-medium);
    line-height: 1;
    cursor: none;
    transition:
      transform var(--duration-normal) var(--ease-smooth),
      box-shadow var(--duration-normal) var(--ease-smooth),
      background var(--duration-normal) var(--ease-smooth),
      border-color var(--duration-normal) var(--ease-smooth);
    overflow: hidden;
    isolation: isolate;
  }

  .sov-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* ---------- Sizes ---------- */
  .sov-btn--sm { padding: 8px 14px; font-size: var(--text-sm); }
  .sov-btn--md { padding: 12px 20px; font-size: var(--text-base); }
  .sov-btn--lg { padding: 16px 28px; font-size: var(--text-md); }

  /* ---------- Primary variant ---------- */
  .sov-btn--primary {
    color: #ffffff;
    background: linear-gradient(135deg, var(--colour-accent) 0%, var(--colour-accent-dim) 100%);
    box-shadow: var(--glow-accent);
  }

  .sov-btn--primary:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: var(--glow-accent-strong);
  }

  /* Shine sweep on hover - single pass per hover entry. */
  .sov-btn--primary::after {
    content: "";
    position: absolute;
    top: 0;
    left: -120%;
    width: 60%;
    height: 100%;
    background: linear-gradient(
      90deg,
      transparent,
      rgba(255, 255, 255, 0.25),
      transparent
    );
    transform: skewX(-20deg);
    pointer-events: none;
    z-index: 1;
  }

  .sov-btn--primary:hover::after {
    animation: shineSweep 0.9s var(--ease-smooth);
  }

  .sov-btn__label {
    position: relative;
    z-index: 2;
  }

  /* ---------- Secondary variant ---------- */
  .sov-btn--secondary {
    color: var(--colour-text);
    background: var(--colour-bg-2);
    border-color: var(--colour-border);
  }

  .sov-btn--secondary:hover:not(:disabled) {
    border-color: var(--colour-border-active);
    background: var(--colour-bg-3);
    transform: translateY(-1px);
  }
`;
