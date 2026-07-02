// ============================================================
// frontend/web/app/(dashboard)/layout.tsx
// ============================================================
//
// Purpose:
//   Authenticated dashboard shell. Wraps every route under
//   /dashboard/* with the sidebar and the main content slot.
//   Performs a silent token refresh on mount; redirects to
//   /login if no valid session can be established.
//
// Design:
//   Exact structural mirror of SovCorE QR app/layout.tsx.
//   Uses useRequireAuth to authenticate; shows a full-screen
//   loading skeleton while the check runs so no protected UI
//   flashes before the auth state resolves.
//
//   Responsive layout:
//     > 1023 px (desktop): sidebar and main sit in a flex row.
//     ≤ 1023 px (tablet / mobile): the sidebar becomes an
//     off-canvas drawer. A sticky mobile top bar contains the
//     hamburger button that opens the drawer, and the backdrop
//     overlay allows the user to close it by tapping outside.
//
//   Idle timer:
//     idle_timeout_minutes is read from /api/v1/auth/me on mount
//     (the same call useRequireAuth already makes and caches in
//     sessionStorage as "sva_idle_timeout"). The useIdleTimer hook
//     drives activity tracking; IdleWarningModal renders when the
//     user is near the threshold.
//
// Consumed by:
//   - All routes under app/(dashboard)/*
// ============================================================

"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { Sidebar } from "@/src/components/dashboard/sidebar";
import { IdleWarningModal } from "@/src/components/auth/idle-warning-modal";
import { useRequireAuth } from "@/src/lib/hooks/use-auth";
import { useIdleTimer } from "@/src/lib/hooks/use-idle-timer";
import { apiFetch } from "@/src/lib/api/fetch";

// ==================================================
// LAYOUT
// ==================================================

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { email, isLoading } = useRequireAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // ------------------------------ Idle timer state -------------------------
  const [idleWarning, setIdleWarning] = useState<{ secondsLeft: number } | null>(null);
  // Read the user's idle preference; default to 15 until /me resolves.
  const idleMinutes = _readIdleTimeout();

  // ------------------------------ Idle callbacks ---------------------------

  const handleIdleLogout = useCallback(async () => {
    setIdleWarning(null);
    // Fire the backend logout to revoke the refresh token.
    await apiFetch("/api/v1/auth/logout", { method: "POST" });
    sessionStorage.clear();
    router.replace("/login?reason=idle");
  }, [router]);

  const handleIdleWarn = useCallback((secondsLeft: number) => {
    setIdleWarning({ secondsLeft });
  }, []);

  const handleIdleActivity = useCallback(() => {
    setIdleWarning(null);
  }, []);

  const handleStaySignedIn = useCallback(() => {
    setIdleWarning(null);
    // Touching sessionStorage is enough — the hook's activity listener
    // resets the timestamp on the next real event. Explicitly bump it here
    // in case the user only interacted with the modal (no underlying DOM event).
    sessionStorage.setItem("sva_idle_ping", String(Date.now()));
    // Trigger the activity reset in the hook by dispatching a synthetic event.
    window.dispatchEvent(new Event("pointerdown"));
  }, []);

  // ------------------------------ Session validity ping --------------------
  // When the user returns to the tab after it was in the background, do a
  // lightweight ping to /me. If the session was replaced on another device
  // the 401 response propagates through apiFetch's refresh chain and
  // redirects to /login automatically — the user is not left on a stale page.
  useEffect(() => {
    if (isLoading) return;
    function _handleVisible() {
      if (document.visibilityState !== "visible") return;
      apiFetch("/api/v1/auth/me").catch(() => undefined);
    }
    document.addEventListener("visibilitychange", _handleVisible);
    return () => document.removeEventListener("visibilitychange", _handleVisible);
  }, [isLoading]);

  // ------------------------------ Idle timer hook --------------------------
  // Only mount when auth has resolved so the timeout does not start running
  // while the loading screen is displayed.
  useIdleTimer(
    isLoading
      ? { timeoutMinutes: 999, onWarn: () => undefined, onLogout: () => undefined, onActivity: () => undefined }
      : { timeoutMinutes: idleMinutes, onWarn: handleIdleWarn, onLogout: handleIdleLogout, onActivity: handleIdleActivity }
  );

  if (isLoading) {
    return (
      <div className="dash-loading" aria-label="Loading…">
        <style>{`
          .dash-loading {
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            background: var(--colour-bg);
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="dash-shell">
      {/* ~~~~~~~~~ Mobile top bar (hidden on desktop) ~~~~~~~~~ */}
      <div className="dash-topbar">
        <button
          className="dash-hamburger"
          onClick={() => setSidebarOpen(true)}
          aria-label="Open navigation"
          aria-expanded={sidebarOpen}
          aria-controls="dash-drawer"
        >
          <span className="dash-hamburger__line" aria-hidden="true" />
          <span className="dash-hamburger__line" aria-hidden="true" />
          <span className="dash-hamburger__line" aria-hidden="true" />
        </button>
        <span className="dash-topbar__name">SovCorE Auto</span>
      </div>

      {/* ~~~~~~~~~ Backdrop — closes the drawer when tapped ~~~~~~~~~ */}
      {sidebarOpen && (
        <div
          className="dash-backdrop"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* ~~~~~~~~~ Sidebar / drawer ~~~~~~~~~ */}
      <Sidebar
        email={email}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <main className="dash-main" id="dash-drawer">
        <div className="dash-content">
          {children}
        </div>
      </main>

      {/* ~~~~~~~~~ Idle warning modal ~~~~~~~~~ */}
      {idleWarning && (
        <IdleWarningModal
          initialSeconds={idleWarning.secondsLeft}
          onStay={handleStaySignedIn}
          onLogout={handleIdleLogout}
        />
      )}

      <style>{SHELL_STYLES}</style>
    </div>
  );
}

// ==================================================
// HELPERS
// ==================================================

function _readIdleTimeout(): number {
  if (typeof window === "undefined") return 15;
  const raw = sessionStorage.getItem("sva_idle_timeout");
  const parsed = raw ? parseInt(raw, 10) : NaN;
  // Clamp to valid range 5-30. Fall back to 15 if unset or invalid.
  return isNaN(parsed) || parsed < 5 || parsed > 30 ? 15 : parsed;
}

// ==================================================
// STYLES
// ==================================================

const SHELL_STYLES = `
  /* Hide the root navbar and footer on all dashboard pages.
     :has() is supported in Chrome 105+, Safari 15.4+, Firefox 121+. */
  body:has(.dash-shell) .sov-nav,
  body:has(.dash-shell) .sov-foot { display: none !important; }

  /* ---- Desktop: sidebar fixed, only the content area scrolls ---- */
  .dash-shell {
    display: flex;
    height: 100vh;
    overflow: hidden;
    background: var(--colour-bg);
  }
  .dash-main {
    flex: 1;
    height: 100vh;
    overflow-y: auto;
    padding: var(--space-10);
    min-width: 0;
  }
  /* Centred content column — caps width so large screens don't leave blank rails */
  .dash-content {
    max-width: 1280px;
    margin: 0 auto;
    width: 100%;
  }

  /* Mobile top bar — hidden on desktop */
  .dash-topbar { display: none; }

  /* Hamburger button shape */
  .dash-hamburger {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 5px;
    background: none;
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-sm);
    padding: 8px 10px;
    transition: border-color 0.2s;
  }
  .dash-hamburger:hover { border-color: rgba(108, 99, 255, 0.45); }
  .dash-hamburger__line {
    display: block;
    width: 18px;
    height: 1.5px;
    background: var(--colour-text-muted);
    border-radius: 1px;
  }

  .dash-topbar__name {
    font-size: var(--text-sm);
    color: var(--colour-text-muted);
    font-weight: var(--weight-medium);
  }

  /* Backdrop overlay behind the open drawer */
  .dash-backdrop {
    position: fixed;
    inset: 0;
    z-index: calc(var(--z-modal) - 1);
    background: rgba(0, 0, 0, 0.55);
    backdrop-filter: blur(2px);
    -webkit-backdrop-filter: blur(2px);
  }

  /* ---- Level 2: Large tablet (≤1023px) — off-canvas drawer, full page scroll ---- */
  @media (max-width: 1023px) {
    .dash-shell { flex-direction: column; height: auto; overflow: visible; --topbar-h: 65px; }
    .dash-main { height: auto; overflow-y: visible; padding: var(--space-6); }
    .dash-topbar {
      display: flex;
      align-items: center;
      gap: var(--space-4);
      padding: var(--space-4) var(--space-5);
      background: rgba(8, 8, 15, 0.85);
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
      border-bottom: 0.5px solid var(--colour-border);
      position: sticky;
      top: 0;
      z-index: var(--z-sidenav);
    }
  }

  /* ---- Level 3: Tablet (≤767px) ---- */
  @media (max-width: 767px) {
    .dash-main { padding: var(--space-5); }
  }

  /* ---- Level 4: Large phone (≤479px) ---- */
  @media (max-width: 479px) {
    .dash-main { padding: var(--space-4); }
    .dash-content { width: 100%; }
  }

  /* ---- Level 5: Small phone (≤359px) ---- */
  @media (max-width: 359px) {
    .dash-main { padding: var(--space-3); }
  }
`;
