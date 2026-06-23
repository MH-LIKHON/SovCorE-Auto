// ============================================================
// frontend/web/src/components/ui/input.tsx
// ============================================================
//
// Purpose:
//   Text input and textarea primitives used by every form in
//   the application. Wraps a labelled control with a consistent
//   focus-ring, error state, and helper-text treatment.
//
// Origin:
//   Copied verbatim from SovCorE QR src/components/ui/input.tsx.
//
// Design:
//   Label above, input below, helper or error text below that.
//   The border tightens to accent on focus. The keystroke pulse
//   scatters coloured dots on each character typed.
//
// Consumed by:
//   - app/(auth)/login/page.tsx
//   - app/(auth)/register/page.tsx
//   - app/(app)/vehicles/new/page.tsx
//   - any form that needs a labelled text control
// ============================================================

"use client";

import clsx from "clsx";
import { useRef } from "react";
import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";

// ==================================================
// SHARED FIELD PROPS + PULSE HELPER
// ==================================================

interface FieldProps {
  label: string;
  helper?: string;
  error?: string;
}

const PULSE_COLOURS = ["#6c63ff", "#7b73ff", "#5548e0", "#00d4ff"];

function usePulse() {
  const ringRef = useRef<HTMLDivElement>(null);
  function fire() {
    const ring = ringRef.current;
    if (!ring) return;
    const dot = document.createElement("div");
    const colour = PULSE_COLOURS[Math.floor(Math.random() * PULSE_COLOURS.length)] ?? "#6c63ff";
    dot.style.cssText = `position:absolute;height:100%;width:20px;border-radius:1px;background:${colour};left:${Math.random() * 80 + 10}%;animation:keystrokePulse 0.5s ease-out forwards`;
    ring.appendChild(dot);
    setTimeout(() => dot.remove(), 500);
  }
  return { ringRef, fire };
}

const PULSE_RING_STYLE: React.CSSProperties = {
  position: "absolute",
  bottom: -2,
  left: 12,
  right: 12,
  height: 2,
  borderRadius: 1,
  overflow: "hidden",
};

// ==================================================
// TEXT FIELD
// ==================================================

type TextFieldProps = FieldProps & InputHTMLAttributes<HTMLInputElement>;

export function TextField({ label, helper, error, className, id, onChange, ...rest }: TextFieldProps) {
  const inputId = id ?? `field-${label.replace(/\s+/g, "-").toLowerCase()}`;
  const { ringRef, fire } = usePulse();
  return (
    <div className={clsx("sov-field", error && "sov-field--error", className)}>
      <label htmlFor={inputId} className="sov-field__label">
        {label}
      </label>
      <div className="sov-input-wrap">
        <input
          id={inputId}
          className="sov-field__control"
          onChange={(e) => { fire(); onChange?.(e); }}
          {...rest}
        />
        <div ref={ringRef} aria-hidden="true" style={PULSE_RING_STYLE} />
      </div>
      {(error || helper) && <p className="sov-field__hint">{error ?? helper}</p>}
      <style>{FIELD_STYLES}</style>
    </div>
  );
}

// ==================================================
// TEXT AREA
// ==================================================

type TextAreaProps = FieldProps & TextareaHTMLAttributes<HTMLTextAreaElement>;

export function TextArea({ label, helper, error, className, id, onChange, ...rest }: TextAreaProps) {
  const inputId = id ?? `field-${label.replace(/\s+/g, "-").toLowerCase()}`;
  const { ringRef, fire } = usePulse();
  return (
    <div className={clsx("sov-field", error && "sov-field--error", className)}>
      <label htmlFor={inputId} className="sov-field__label">
        {label}
      </label>
      <div className="sov-input-wrap">
        <textarea
          id={inputId}
          className="sov-field__control sov-field__control--area"
          onChange={(e) => { fire(); onChange?.(e); }}
          {...rest}
        />
        <div ref={ringRef} aria-hidden="true" style={PULSE_RING_STYLE} />
      </div>
      {(error || helper) && <p className="sov-field__hint">{error ?? helper}</p>}
      <style>{FIELD_STYLES}</style>
    </div>
  );
}

// ==================================================
// FIELD STYLES
// ==================================================

const FIELD_STYLES = `
  .sov-field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  /* ---------- Label ---------- */
  .sov-field__label {
    font-size: var(--text-sm);
    color: var(--colour-text-muted);
    font-weight: var(--weight-medium);
    letter-spacing: var(--tracking-wide);
  }

  /* ---------- Control ---------- */
  .sov-field__control {
    width: 100%;
    background: var(--colour-bg-2);
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-md);
    padding: 12px 14px;
    color: var(--colour-text);
    font-family: var(--font-sans);
    font-size: var(--text-base);
    line-height: var(--leading-snug);
    transition:
      border-color var(--duration-normal) var(--ease-smooth),
      box-shadow var(--duration-normal) var(--ease-smooth),
      background var(--duration-normal) var(--ease-smooth);
  }

  .sov-field__control::placeholder {
    color: var(--colour-text-faint);
  }

  .sov-field__control:hover {
    border-color: var(--colour-border-hover);
  }

  .sov-field__control:focus {
    outline: none;
    border-color: var(--colour-border-active);
    box-shadow: 0 0 0 3px rgba(108, 99, 255, 0.18);
  }

  /* ---------- Textarea modifier ---------- */
  .sov-field__control--area {
    min-height: 96px;
    resize: vertical;
    line-height: var(--leading-normal);
  }

  /* ---------- Hint / helper / error text ---------- */
  .sov-field__hint {
    font-size: var(--text-xs);
    color: var(--colour-text-faint);
    margin: 0;
  }

  /* ---------- Error state ---------- */
  .sov-field--error .sov-field__control,
  .sov-field--error .sov-field__control:focus {
    border-color: var(--colour-error);
    box-shadow: 0 0 0 3px rgba(255, 107, 107, 0.18);
  }

  .sov-field--error .sov-field__hint {
    color: var(--colour-error);
  }
`;
