// ============================================================
// frontend/web/src/lib/format.ts
// ============================================================
//
// Purpose:
//   Single source of truth for all display-formatting helpers
//   used across the dashboard. Every date, currency, mileage,
//   and duration string in the frontend is produced here.
//
// Design:
//   All functions are null-safe: a null/undefined input returns
//   "-" or null (documented per function) rather than throwing.
//   Call sites never guard before calling.
//
// Consumed by:
//   - All vehicle sub-pages (records, tasks, reminders, warranty,
//     pcns, damage, fuel, maintenance, repairs, insurance, etc.)
//   - Dashboard settings pages (backups, account)
//   - Reports page
// ============================================================

// ==================================================
// DATE
// ==================================================

export function formatDate(d: string | null | undefined): string {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatDateLong(d: string | null | undefined): string {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

// "2026-06" → "Jun 2026"  (used in monthly chart x-axis labels)
export function formatMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number) as [number, number];
  return new Date(y, m - 1, 1).toLocaleDateString("en-GB", {
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(s: string): string {
  return new Date(s).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ==================================================
// RELATIVE TIME
// ==================================================

export function daysUntil(d: string | null | undefined): number | null {
  if (!d) return null;
  return Math.ceil((new Date(d).getTime() - Date.now()) / 86_400_000);
}

// ==================================================
// CURRENCY AND NUMBERS
// ==================================================

export function formatGBP(pence: number | null | undefined): string {
  if (pence == null) return "-";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(pence / 100);
}

export function formatMiles(n: number | null | undefined): string {
  if (n == null) return "-";
  return n.toLocaleString("en-GB") + " mi";
}
