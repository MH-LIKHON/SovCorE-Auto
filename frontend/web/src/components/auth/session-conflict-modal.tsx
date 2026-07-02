// ============================================================
// frontend/web/src/components/auth/session-conflict-modal.tsx
// ============================================================
//
// Purpose:
//   Modal shown on the login page when the backend returns
//   session_conflict=true, meaning a session is already active
//   on another browser or device. The user chooses to either
//   replace the existing session or cancel the new login.
//
// Design:
//   Shown on top of the login page (not the dashboard) so it
//   renders inside the login layout, not via the dashboard portal.
//   The caller passes the conflict_token from the API response.
//
//   60-second auto-cancel: if the user does nothing within 60
//   seconds the modal fires onCancel automatically. This prevents
//   the conflict token from staying alive in the in-memory store
//   longer than needed and matches the stated UX requirement.
//
//   POST /api/v1/auth/session/resolve carries no auth header —
//   the conflict_token acts as a single-use bearer for this
//   specific action. On replace success the caller stores the
//   returned tokens and navigates to the dashboard.
//
// Consumed by:
//   - frontend/web/app/(auth)/login/page.tsx
// ============================================================

"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ==================================================
// CONSTANTS
// ==================================================

const AUTO_CANCEL_SECONDS = 60;
const API = "";

// ==================================================
// TYPES
// ==================================================

interface SessionConflictModalProps {
  conflictToken: string;
  /** Called when replace succeeds — caller stores tokens and navigates. */
  onReplaced: (accessToken: string, accountId: string | null) => void;
  /** Called on cancel (user choice or timeout). */
  onCancel: () => void;
}

// ==================================================
// COMPONENT
// ==================================================

export function SessionConflictModal({ conflictToken, onReplaced, onCancel }: SessionConflictModalProps) {
  const [seconds, setSeconds] = useState(AUTO_CANCEL_SECONDS);
  const [loading, setLoading] = useState<"replace" | "cancel" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelledRef = useRef(false);

  // ~~~~~~~~~ Auto-cancel countdown ~~~~~~~~~
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setSeconds((s) => {
        if (s <= 1) {
          clearInterval(intervalRef.current!);
          if (!cancelledRef.current) {
            cancelledRef.current = true;
            onCancel();
          }
          return 0;
        }
        return s - 1;
      });
    }, 1_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ~~~~~~~~~ Replace action ~~~~~~~~~
  const handleReplace = useCallback(async () => {
    if (loading) return;
    setLoading("replace");
    setError(null);
    try {
      const res = await fetch(`${API}/api/v1/auth/session/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ conflict_token: conflictToken, action: "replace" }),
      });
      const data = await res.json().catch(() => ({})) as {
        ok?: boolean;
        access_token?: string;
        account_id?: string | null;
        detail?: string;
      };
      if (!res.ok) {
        setError(data.detail ?? "Something went wrong. Please sign in again.");
        setLoading(null);
        return;
      }
      clearInterval(intervalRef.current!);
      if (data.access_token) {
        sessionStorage.setItem("sva_access", data.access_token);
        if (data.account_id) sessionStorage.setItem("sva_account_id", data.account_id);
      }
      onReplaced(data.access_token ?? "", data.account_id ?? null);
    } catch {
      setError("Could not reach the server. Check your connection.");
      setLoading(null);
    }
  }, [conflictToken, loading, onReplaced]);

  // ~~~~~~~~~ Cancel action ~~~~~~~~~
  const handleCancel = useCallback(async () => {
    if (loading || cancelledRef.current) return;
    cancelledRef.current = true;
    setLoading("cancel");
    clearInterval(intervalRef.current!);
    // Fire-and-forget — the backend just discards the pending tokens.
    fetch(`${API}/api/v1/auth/session/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ conflict_token: conflictToken, action: "cancel" }),
    }).catch(() => undefined);
    onCancel();
  }, [conflictToken, loading, onCancel]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: "var(--z-modal)" as unknown as number,
        background: "rgba(0,0,0,0.7)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
        padding: "var(--space-5)",
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="conflict-title"
    >
      <div style={{
        background: "var(--colour-bg-card-solid)",
        border: "0.5px solid var(--colour-border)",
        borderRadius: "var(--radius-lg)",
        padding: "var(--space-6)",
        maxWidth: 400,
        width: "100%",
        animation: "conflictModalIn 0.35s var(--ease-spring) forwards",
      }}>

        {/* ~~~~~~~~~ Icon ~~~~~~~~~ */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: "var(--space-4)" }}>
          <div style={{
            width: 48,
            height: 48,
            borderRadius: "50%",
            background: "rgba(108, 99, 255, 0.1)",
            border: "1px solid rgba(108, 99, 255, 0.25)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <rect x="3" y="11" width="18" height="11" rx="2" stroke="var(--colour-accent)" strokeWidth="1.5" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" stroke="var(--colour-accent)" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
        </div>

        {/* ~~~~~~~~~ Title ~~~~~~~~~ */}
        <p id="conflict-title" style={{
          fontSize: "var(--text-lg)",
          fontWeight: "var(--weight-medium)",
          textAlign: "center",
          marginBottom: "var(--space-3)",
          color: "var(--colour-text)",
        }}>
          Already signed in
        </p>

        {/* ~~~~~~~~~ Body ~~~~~~~~~ */}
        <p style={{
          fontSize: "var(--text-sm)",
          color: "var(--colour-text-muted)",
          textAlign: "center",
          lineHeight: "var(--leading-normal)",
          marginBottom: "var(--space-5)",
        }}>
          Your account is active on another browser or device. Sign out of that session to continue here, or cancel this sign-in.
        </p>

        {/* ~~~~~~~~~ Countdown ~~~~~~~~~ */}
        <p style={{
          fontSize: "var(--text-xs)",
          color: seconds <= 10 ? "var(--colour-error)" : "var(--colour-text-faint)",
          textAlign: "center",
          marginBottom: "var(--space-5)",
          fontVariantNumeric: "tabular-nums",
          transition: "color 0.3s",
        }}>
          This will cancel automatically in {seconds}s
        </p>

        {/* ~~~~~~~~~ Error ~~~~~~~~~ */}
        {error && (
          <p style={{
            fontSize: "var(--text-xs)",
            color: "var(--colour-error)",
            textAlign: "center",
            marginBottom: "var(--space-4)",
          }}>
            {error}
          </p>
        )}

        {/* ~~~~~~~~~ Actions ~~~~~~~~~ */}
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
          <button
            className="rec-btn rec-btn--primary"
            onClick={handleReplace}
            disabled={!!loading}
            style={{ width: "100%" }}
          >
            {loading === "replace" ? "Signing out other session..." : "Sign out other device"}
          </button>
          <button
            className="rec-btn rec-btn--ghost"
            onClick={handleCancel}
            disabled={!!loading}
            style={{ width: "100%", fontSize: "var(--text-sm)" }}
          >
            Cancel
          </button>
        </div>

      </div>

      <style>{`
        @keyframes conflictModalIn {
          from { opacity: 0; transform: scale(0.93) translateY(14px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  );
}
