// ============================================================
// frontend/web/src/lib/api/fetch.ts
// ============================================================
//
// Purpose:
//   Shared API fetch helper for dashboard pages. Reads the
//   access token from sessionStorage and attaches it as a
//   Bearer header on every request. Intercepts 401 responses,
//   attempts a silent token refresh via the refresh cookie, and
//   retries the original request once. On refresh failure the
//   session is cleared and the browser is redirected to /login.
//
// Design:
//   sessionStorage is the correct store for the access token —
//   cleared on tab close, never written to disk. Dashboard
//   pages and components import apiFetch from here instead of
//   defining their own copies.
//
//   The refresh flow is:
//     1. POST /api/v1/auth/refresh (cookie-based, no body).
//     2. If 200, store the new access token and retry once.
//     3. If not 200, clear sva_access + sva_account_id and
//        redirect to /login?next=<current pathname>.
//
//   A module-level flag prevents concurrent 401s from triggering
//   multiple simultaneous refresh requests.
//
// Consumed by:
//   - All pages under frontend/web/app/(dashboard)/dashboard/
// ============================================================

// Replace localhost with 127.0.0.1 — on Windows, localhost resolves to ::1 (IPv6) first
// but uvicorn only binds to 127.0.0.1 (IPv4), causing "Failed to fetch" in the browser.
const API = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000").replace(
  "//localhost:",
  "//127.0.0.1:",
);

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
// 401 REFRESH LOGIC
// ==================================================

// ------------------------------ Refresh gate --------------------------------
// Ensures only one refresh request runs even when multiple 401s arrive
// simultaneously. All callers that hit the gate wait for the same promise.

let _refreshPromise: Promise<boolean> | null = null;

async function _doRefresh(): Promise<boolean> {
  try {
    const res = await fetch(`${API}/api/v1/auth/refresh`, {
      method: "POST",
      credentials: "include",
    });
    if (!res.ok) return false;
    const data = await res.json();
    const token: string | null = data?.access_token ?? null;
    if (!token) return false;
    sessionStorage.setItem("sva_access", token);
    return true;
  } catch {
    return false;
  }
}

async function _silentRefresh(): Promise<boolean> {
  if (_refreshPromise) return _refreshPromise;
  _refreshPromise = _doRefresh().finally(() => {
    _refreshPromise = null;
  });
  return _refreshPromise;
}

function _clearSession(): void {
  sessionStorage.removeItem("sva_access");
  sessionStorage.removeItem("sva_account_id");
}

function _redirectToLogin(): void {
  if (typeof window === "undefined") return;
  const next = encodeURIComponent(window.location.pathname + window.location.search);
  window.location.href = `/login?next=${next}`;
}

// ==================================================
// FETCH
// ==================================================

// ------------------------------ Build headers --------------------------------

function _buildHeaders(token: string | null, extra?: HeadersInit): HeadersInit {
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(extra ?? {}),
  };
}

// ------------------------------ apiFetch ------------------------------------

// ------------------------------ apiUpload -----------------------------------
// Like apiFetch but for multipart/form-data. Does NOT set Content-Type so the
// browser supplies the boundary automatically. Used for file proxy uploads.

export async function apiUpload(
  path: string,
  body: FormData,
  opts: RequestInit = {}
): Promise<Response> {
  const token = getToken();
  const authHeader = token ? { Authorization: `Bearer ${token}` } : {};
  const res = await fetch(`${API}${path}`, {
    ...opts,
    method: "POST",
    credentials: "include",
    headers: { ...authHeader, ...(opts.headers as Record<string, string> | undefined) } as Record<string, string>,
    body,
  });

  if (res.status !== 401) return res;

  const refreshed = await _silentRefresh();
  if (!refreshed) { _clearSession(); _redirectToLogin(); return res; }

  const newToken = getToken();
  const newAuthHeader = newToken ? { Authorization: `Bearer ${newToken}` } : {};
  return fetch(`${API}${path}`, {
    ...opts,
    method: "POST",
    credentials: "include",
    headers: { ...newAuthHeader, ...(opts.headers as Record<string, string> | undefined) } as Record<string, string>,
    body,
  });
}

export async function apiFetch(
  path: string,
  opts: RequestInit = {}
): Promise<Response> {
  const token = getToken();
  const res = await fetch(`${API}${path}`, {
    ...opts,
    credentials: "include",
    headers: _buildHeaders(token, opts.headers),
  });

  if (res.status !== 401) return res;

  // ~~~~~~~~~ 401 — attempt silent refresh ~~~~~~~~~
  const refreshed = await _silentRefresh();
  if (!refreshed) {
    _clearSession();
    _redirectToLogin();
    // Return the original 401 so any awaiting caller does not hang.
    return res;
  }

  // Retry once with the new token.
  const newToken = getToken();
  return fetch(`${API}${path}`, {
    ...opts,
    credentials: "include",
    headers: _buildHeaders(newToken, opts.headers),
  });
}
