// ============================================================
// frontend/web/src/lib/api/fetch.ts
// ============================================================
//
// Purpose:
//   Shared API fetch helper for dashboard pages. Reads the
//   access token from sessionStorage and attaches it as a
//   Bearer header on every request. Returns the raw Response
//   so callers can call .json() or check .ok themselves.
//
// Design:
//   sessionStorage is the correct store for the access token —
//   cleared on tab close, never written to disk. Dashboard
//   pages and components import apiFetch from here instead of
//   defining their own copies.
//
// Consumed by:
//   - All pages under frontend/web/app/(dashboard)/dashboard/
// ============================================================

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ==================================================
// HELPERS
// ==================================================

// ------------------------------ Token read ----------------------------------
// Reads from sessionStorage only. Called inside functions, not at module
// level, so it is safe in SSR contexts where sessionStorage does not exist.

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem("sva_access");
}

export function getAccountId(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem("sva_account_id");
}

// ==================================================
// FETCH
// ==================================================

export async function apiFetch(
  path: string,
  opts: RequestInit = {}
): Promise<Response> {
  const token = getToken();
  return fetch(`${API}${path}`, {
    ...opts,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...opts.headers,
    },
  });
}
