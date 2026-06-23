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
// Consumed by:
//   - All routes under app/(dashboard)/*
// ============================================================

"use client";

import type { ReactNode } from "react";

import { Sidebar } from "@/src/components/dashboard/sidebar";
import { useRequireAuth } from "@/src/lib/hooks/use-auth";

// ==================================================
// LAYOUT
// ==================================================

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { email, isLoading } = useRequireAuth();

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
      <Sidebar email={email} />
      <main className="dash-main">{children}</main>

      <style>{`
        .dash-shell { display: flex; min-height: 100vh; background: var(--colour-bg); }
        .dash-main { flex: 1; padding: var(--space-10); min-width: 0; }
        @media (max-width: 900px) {
          .dash-shell { flex-direction: column; }
          .dash-main { padding: var(--space-6); }
        }
      `}</style>
    </div>
  );
}
