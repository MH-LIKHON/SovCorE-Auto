// ============================================================
// frontend/web/src/lib/hooks/use-auth.ts
// ============================================================
//
// Purpose:
//   Auth state hook for the dashboard shell. Reads the access
//   token from sessionStorage; if absent, attempts a silent
//   refresh via the HTTP-only cookie. Redirects to /login on
//   failure. Returns { token, accountId, email, isLoading }.
//
// Design:
//   sessionStorage is the intentional choice for access tokens
//   — cleared on tab close, never persisted to disk. The
//   refresh cookie (HTTP-only) provides persistence across
//   reopens. On each dashboard mount, a stale/missing token is
//   silently refreshed before the page renders any protected UI.
//
// Consumed by:
//   - frontend/web/app/(dashboard)/layout.tsx
// ============================================================

"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

// ==================================================
// TYPES
// ==================================================

export interface AuthState {
  token: string | null;
  accountId: string | null;
  email: string | null;
  isLoading: boolean;
}

// ==================================================
// HOOK
// ==================================================

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export function useRequireAuth(): AuthState {
  const router = useRouter();
  const [state, setState] = useState<AuthState>({
    token: null,
    accountId: null,
    email: null,
    isLoading: true,
  });

  useEffect(() => {
    (async () => {
      const stored = sessionStorage.getItem("sva_access");
      const storedAccountId = sessionStorage.getItem("sva_account_id");
      const storedEmail = sessionStorage.getItem("sva_email");

      if (stored) {
        setState({ token: stored, accountId: storedAccountId, email: storedEmail, isLoading: false });
        return;
      }

      // ~~~~~~~~~ No token in sessionStorage — try silent refresh ~~~~~~~~~
      try {
        const res = await fetch(`${API}/api/v1/auth/refresh`, {
          method: "POST",
          credentials: "include", // sends the HTTP-only cookie automatically
        });

        if (!res.ok) throw new Error("refresh_failed");

        const data = await res.json();
        sessionStorage.setItem("sva_access", data.access_token);
        if (data.account_id) sessionStorage.setItem("sva_account_id", data.account_id);

        // Fetch the user's email for the sidebar footer.
        const meRes = await fetch(`${API}/api/v1/auth/me`, {
          headers: { Authorization: `Bearer ${data.access_token}` },
          credentials: "include",
        });
        const meData = meRes.ok ? await meRes.json() : null;
        const email = meData?.email ?? null;
        if (email) sessionStorage.setItem("sva_email", email);

        setState({
          token: data.access_token,
          accountId: data.account_id ?? null,
          email,
          isLoading: false,
        });
      } catch {
        router.replace(`/login?next=${encodeURIComponent(window.location.pathname)}`);
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return state;
}

// ==================================================
// HELPERS
// ==================================================

export function signOut(router: ReturnType<typeof useRouter>): void {
  fetch(`${API}/api/v1/auth/logout`, { method: "POST", credentials: "include" });
  sessionStorage.removeItem("sva_access");
  sessionStorage.removeItem("sva_account_id");
  sessionStorage.removeItem("sva_email");
  router.push("/");
}
