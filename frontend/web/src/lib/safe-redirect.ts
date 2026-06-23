// ============================================================
// frontend/web/src/lib/safe-redirect.ts
// ============================================================
//
// Purpose:
//   Defends against open-redirect abuse on any handler that
//   accepts a `next` (or similarly named) query parameter and
//   redirects to it. Only same-origin paths are honoured;
//   anything else falls back to the supplied default.
//
// Design:
//   Strict allowlist: a leading slash followed by a path
//   segment that is NOT also a slash (prevents protocol-relative
//   `//evil.com` strings). Anything else falls through to the
//   default.
//
// Consumed by:
//   - app/(auth)/login/page.tsx
// ============================================================

// ==================================================
// HELPER
// ==================================================

export function safeNextPath(input: string | null | undefined, fallback: string): string {
  if (!input) return fallback;
  // Reject anything that does not start with a single slash.
  if (!input.startsWith("/")) return fallback;
  // Reject protocol-relative paths like `//evil.com/...`.
  if (input.startsWith("//")) return fallback;
  // Reject backslashes (Windows path tricks some browsers
  // normalise to forward-slash).
  if (input.includes("\\")) return fallback;
  // Length cap. Stops attackers from stuffing the URL bar.
  if (input.length > 2000) return fallback;
  return input;
}
