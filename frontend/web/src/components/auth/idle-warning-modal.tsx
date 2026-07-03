// ============================================================
// frontend/web/src/components/auth/idle-warning-modal.tsx
// ============================================================
//
// Purpose:
//   Full-screen modal shown when the user has been idle for
//   (timeoutMinutes - 60) seconds. Displays a live countdown
//   and a "Stay signed in" button. If the user ignores it the
//   parent hook fires the logout callback at zero.
//
// Design:
//   Uses the del-modal-* CSS classes from globals.css so the
//   visual language is identical to the confirm-delete modal.
//   The countdown ticks via setInterval; it is seeded from
//   initialSeconds (passed from the idle timer) and counts down
//   to 0 purely for display. The actual logout is triggered by
//   the parent hook, not by this component, so the two timers
//   cannot diverge.
//
//   Rendered via a portal (document.body) so it sits above the
//   dashboard z-stack without disrupting layout.
//
// Consumed by:
//   - frontend/web/app/(dashboard)/layout.tsx
// ============================================================

"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// ==================================================
// TYPES
// ==================================================

interface IdleWarningModalProps {
  /** Seconds remaining when the warning first appeared. */
  initialSeconds: number;
  /** Called when the user clicks "Stay signed in". */
  onStay: () => void;
  /** Called when the user clicks "Sign out now". */
  onLogout: () => void;
}

// ==================================================
// COMPONENT
// ==================================================

export function IdleWarningModal({ initialSeconds, onStay, onLogout }: IdleWarningModalProps) {
  const [seconds, setSeconds] = useState(initialSeconds);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ~~~~~~~~~ Countdown display ~~~~~~~~~
  useEffect(() => {
    setSeconds(initialSeconds);
    intervalRef.current = setInterval(() => {
      setSeconds((s) => Math.max(0, s - 1));
    }, 1_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [initialSeconds]);

  const content = (
    <div className="del-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="idle-warn-title">
      <div className="del-modal" style={{ maxWidth: 400 }}>

        {/* ~~~~~~~~~ Icon ~~~~~~~~~  */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: "var(--space-4)" }}>
          <div style={{
            width: 48,
            height: 48,
            borderRadius: "50%",
            background: "rgba(250, 200, 117, 0.1)",
            border: "1px solid rgba(250, 200, 117, 0.25)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="12" r="9" stroke="var(--colour-warning)" strokeWidth="1.5" />
              <path d="M12 7v5l3 3" stroke="var(--colour-warning)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>

        {/* ~~~~~~~~~ Title ~~~~~~~~~  */}
        <p id="idle-warn-title" className="del-modal-title" style={{ textAlign: "center", marginBottom: "var(--space-3)" }}>
          Still there?
        </p>

        {/* ~~~~~~~~~ Body ~~~~~~~~~  */}
        <p className="del-modal-body" style={{ textAlign: "center", color: "var(--colour-text-muted)", marginBottom: "var(--space-5)" }}>
          You will be signed out in{" "}
          <strong style={{ color: seconds <= 10 ? "var(--colour-error)" : "var(--colour-warning)", fontVariantNumeric: "tabular-nums" }}>
            {seconds}s
          </strong>{" "}
          due to inactivity.
        </p>

        {/* ~~~~~~~~~ Actions ~~~~~~~~~  */}
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
          <button className="rec-btn rec-btn--primary" onClick={onStay} style={{ width: "100%" }}>
            Stay signed in
          </button>
          <button
            className="rec-btn rec-btn--danger"
            onClick={onLogout}
            style={{ width: "100%", fontSize: "var(--text-sm)" }}
          >
            Sign out now
          </button>
        </div>

      </div>
      <style>{IDLE_STYLES}</style>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(content, document.body);
}

// ==================================================
// STYLES
// ==================================================

const IDLE_STYLES = `
  /* Entrance animation for the idle warning modal. */
  @keyframes idleModalIn {
    from { opacity: 0; transform: scale(0.94) translateY(12px); }
    to   { opacity: 1; transform: scale(1) translateY(0); }
  }
  .del-modal-backdrop .del-modal {
    animation: idleModalIn 0.3s var(--ease-spring) forwards;
  }
`;
