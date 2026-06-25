// ============================================================
// frontend/web/app/(dashboard)/dashboard/page.tsx
// ============================================================
//
// Purpose:
//   Main dashboard page. Provides a full-fleet overview:
//   six stat cards (vehicles, members, alerts, due soon, open
//   tasks, monthly spend), a fleet health distribution bar,
//   the active vehicle card grid, and a quick-actions panel.
//
// Design:
//   Mirrors SovCorE QR dashboard layout exactly — six-stat row
//   at the top, two-column content grid on desktop, single
//   column on tablet and mobile.
//
//   Two API calls run in parallel on mount:
//     - GET /accounts/{id}/vehicles — for cards + RAG indicators
//     - GET /accounts/{id}/summary  — for task/reminder/spend totals
//
//   The health distribution bar (red / amber / green) is derived
//   client-side from vehicle renewals; no extra API call is needed.
//
//   Monthly spend is converted from pence to pounds and formatted
//   with the account's currency symbol (GBP £ by default).
//
//   Responsive:
//     > 1023 px: stats row (6 cols) + content grid (main + sidebar).
//     768–1023 px: stats row (3 cols) + content stack.
//     < 768 px: stats (2 cols) + single-column stack.
//
// Consumed by:
//   - Routed at /dashboard
// ============================================================

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Card } from "@/src/components/ui/card";
import { VehicleCard, type VehicleCard as VehicleCardType } from "@/src/components/vehicles/vehicle-card";
import { apiFetch, getAccountId } from "@/src/lib/api/fetch";

// ==================================================
// TYPES
// ==================================================

interface DashboardSummary {
  active_vehicle_count: number;
  member_count: number;
  open_task_count: number;
  due_soon_reminder_count: number;
  custom_alert_count: number;
  monthly_spend_pence: number;
}

interface DashData {
  vehicles: VehicleCardType[];
  summary: DashboardSummary | null;
  loading: boolean;
}

// ==================================================
// HELPERS
// ==================================================

function ragCount(
  vehicles: VehicleCardType[],
  colour: "red" | "amber" | "green"
): number {
  return vehicles.filter((v) => {
    const r = v.renewals;
    const keys = ["mot", "tax", "insurance", "service"] as const;
    if (colour === "red") return keys.some((k) => r[k] === "red");
    if (colour === "amber")
      return keys.some((k) => r[k] === "amber") && keys.every((k) => r[k] !== "red");
    return keys.every((k) => r[k] === "green");
  }).length;
}

function formatCurrency(pence: number): string {
  return `£${(pence / 100).toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

// ==================================================
// PAGE
// ==================================================

export default function DashboardPage() {
  const [data, setData] = useState<DashData>({
    vehicles: [],
    summary: null,
    loading: true,
  });

  useEffect(() => {
    const accountId = getAccountId();
    if (!accountId) return;

    Promise.all([
      apiFetch(`/api/v1/accounts/${accountId}/vehicles`).then((r) =>
        r.ok ? r.json() : []
      ),
      apiFetch(`/api/v1/accounts/${accountId}/summary`).then((r) =>
        r.ok ? r.json() : null
      ),
    ]).then(([vehicles, summary]) => {
      setData({
        vehicles: vehicles ?? [],
        summary,
        loading: false,
      });
    });
  }, []);

  const { vehicles, summary, loading } = data;
  const activeVehicles = vehicles.filter((v) => v.lifecycle_state === "active");
  const redCount = ragCount(activeVehicles, "red");
  const amberCount = ragCount(activeVehicles, "amber");
  const greenCount = ragCount(activeVehicles, "green");
  const accountId = getAccountId() ?? "";
  const totalVeh = activeVehicles.length || 1; // avoid division by zero

  return (
    <div className="db-shell">

      {/* ~~~~~~~~~ Page header ~~~~~~~~~ */}
      <header className="db-head">
        <h1 className="db-title">Dashboard</h1>
        <p className="db-sub">Your fleet at a glance.</p>
      </header>

      {/* ~~~~~~~~~ Stats row ~~~~~~~~~ */}
      <div className="db-stats">
        <Card padding="var(--space-5)" hoverEffect="glow">
          <span className="db-stat__value">{loading ? "—" : (summary?.active_vehicle_count ?? activeVehicles.length)}</span>
          <span className="db-stat__label">Vehicles</span>
        </Card>
        <Card padding="var(--space-5)" hoverEffect="glow">
          <span className="db-stat__value">{loading ? "—" : (summary?.member_count ?? 0)}</span>
          <span className="db-stat__label">Members</span>
        </Card>
        <Card padding="var(--space-5)" hoverEffect="glow">
          <span
            className="db-stat__value"
            style={{ color: redCount > 0 ? "var(--colour-error)" : undefined }}
          >
            {loading ? "—" : redCount}
          </span>
          <span className="db-stat__label">Alerts</span>
        </Card>
        <Card padding="var(--space-5)" hoverEffect="glow">
          <span
            className="db-stat__value"
            style={{ color: amberCount > 0 ? "var(--colour-amber)" : undefined }}
          >
            {loading ? "—" : amberCount}
          </span>
          <span className="db-stat__label">Due soon</span>
        </Card>
        <Card padding="var(--space-5)" hoverEffect="glow">
          <span
            className="db-stat__value"
            style={{ color: (summary?.open_task_count ?? 0) > 0 ? "var(--colour-accent2)" : undefined }}
          >
            {loading ? "—" : (summary?.open_task_count ?? "—")}
          </span>
          <span className="db-stat__label">Open tasks</span>
        </Card>
        <Card padding="var(--space-5)" hoverEffect="glow">
          <span
            className="db-stat__value"
            style={{
              color: (summary?.custom_alert_count ?? 0) > 0 ? "var(--colour-error)" : undefined,
            }}
          >
            {loading ? "—" : (summary?.custom_alert_count ?? 0)}
          </span>
          <span className="db-stat__label">Custom alerts</span>
        </Card>
        <Card padding="var(--space-5)" hoverEffect="glow">
          <span className="db-stat__value" style={{ fontSize: "var(--text-xl)" }}>
            {loading ? "—" : formatCurrency(summary?.monthly_spend_pence ?? 0)}
          </span>
          <span className="db-stat__label">This month</span>
        </Card>
      </div>

      {/* ~~~~~~~~~ Fleet health bar ~~~~~~~~~ */}
      {!loading && activeVehicles.length > 0 && (
        <Card>
          <div className="db-health-head">
            <h2 className="db-panel__title" style={{ margin: 0 }}>Fleet health</h2>
            <span className="db-health-legend">
              <span className="db-health-dot db-health-dot--red" /> {redCount} alert
              <span className="db-health-dot db-health-dot--amber" /> {amberCount} warning
              <span className="db-health-dot db-health-dot--green" /> {greenCount} healthy
            </span>
          </div>
          <div className="db-health-bar">
            {redCount > 0 && (
              <div
                className="db-health-seg db-health-seg--red"
                style={{ width: `${(redCount / totalVeh) * 100}%` }}
                title={`${redCount} vehicle${redCount !== 1 ? "s" : ""} with expired renewal`}
              />
            )}
            {amberCount > 0 && (
              <div
                className="db-health-seg db-health-seg--amber"
                style={{ width: `${(amberCount / totalVeh) * 100}%` }}
                title={`${amberCount} vehicle${amberCount !== 1 ? "s" : ""} with upcoming renewal`}
              />
            )}
            {greenCount > 0 && (
              <div
                className="db-health-seg db-health-seg--green"
                style={{ width: `${(greenCount / totalVeh) * 100}%` }}
                title={`${greenCount} vehicle${greenCount !== 1 ? "s" : ""} fully up to date`}
              />
            )}
          </div>
        </Card>
      )}

      {/* ~~~~~~~~~ Content grid ~~~~~~~~~ */}
      <div className="db-grid">

        {/* ~~~~~~~~~ Vehicles panel ~~~~~~~~~ */}
        <section className="db-panel db-panel--wide">
          <div className="db-panel__head">
            <h2 className="db-panel__title">Vehicles</h2>
            <Link href="/dashboard/vehicles/new" className="db-action-link">
              Add vehicle
            </Link>
          </div>

          {loading ? (
            <div className="db-skeleton-row">
              {[0, 1, 2].map((i) => (
                <div key={i} className="db-skeleton-card" />
              ))}
            </div>
          ) : activeVehicles.length === 0 ? (
            <div className="db-empty">
              <p className="db-empty__text">No vehicles yet.</p>
              <Link href="/dashboard/vehicles/new" className="db-empty__link">
                Add your first vehicle
              </Link>
            </div>
          ) : (
            <div className="db-card-grid">
              {activeVehicles.slice(0, 6).map((v) => (
                <VehicleCard key={v.id} vehicle={v} accountId={accountId} />
              ))}
            </div>
          )}

          {activeVehicles.length > 6 && (
            <div className="db-panel__foot">
              <Link href="/dashboard/vehicles" className="db-more-link">
                View all {activeVehicles.length} vehicles
              </Link>
            </div>
          )}
        </section>

        {/* ~~~~~~~~~ Quick actions + stats panel ~~~~~~~~~ */}
        <div className="db-side-col">
          <section className="db-panel">
            <h2 className="db-panel__title">Quick actions</h2>
            <div className="db-actions">
              <Link href="/dashboard/vehicles/new" className="db-qa">
                <span className="db-qa__icon" aria-hidden="true">+</span>
                <span className="db-qa__label">Add vehicle</span>
              </Link>
              <Link href="/dashboard/vehicles" className="db-qa">
                <span className="db-qa__icon" aria-hidden="true">▤</span>
                <span className="db-qa__label">All vehicles</span>
              </Link>
              <Link href="/dashboard/reports" className="db-qa">
                <span className="db-qa__icon" aria-hidden="true">📊</span>
                <span className="db-qa__label">Reports</span>
              </Link>
              <Link href="/dashboard/settings/backups" className="db-qa">
                <span className="db-qa__icon" aria-hidden="true">💾</span>
                <span className="db-qa__label">Backups</span>
              </Link>
              <Link href="/dashboard/settings/account" className="db-qa">
                <span className="db-qa__icon" aria-hidden="true">⚙</span>
                <span className="db-qa__label">Settings</span>
              </Link>
              <Link href="/dashboard/settings/users" className="db-qa">
                <span className="db-qa__icon" aria-hidden="true">👥</span>
                <span className="db-qa__label">Members</span>
              </Link>
            </div>
          </section>

          {/* ~~~~~~~~~ Attention panel (tasks + reminders) ~~~~~~~~~ */}
          {!loading && summary && (
            <section className="db-panel db-panel--attention">
              <h2 className="db-panel__title">Attention needed</h2>
              <div className="db-attn-rows">
                <div className="db-attn-row">
                  <span className="db-attn-row__label">Open tasks</span>
                  <span
                    className="db-attn-row__val"
                    style={{
                      color: summary.open_task_count > 0 ? "var(--colour-accent2)" : undefined,
                    }}
                  >
                    {summary.open_task_count}
                  </span>
                </div>
                <div className="db-attn-row">
                  <span className="db-attn-row__label">Renewals due in 30 days</span>
                  <span
                    className="db-attn-row__val"
                    style={{
                      color: summary.due_soon_reminder_count > 0 ? "var(--colour-amber)" : undefined,
                    }}
                  >
                    {summary.due_soon_reminder_count}
                  </span>
                </div>
                <div className="db-attn-row">
                  <span className="db-attn-row__label">Vehicles at alert</span>
                  <span
                    className="db-attn-row__val"
                    style={{ color: redCount > 0 ? "var(--colour-error)" : undefined }}
                  >
                    {redCount}
                  </span>
                </div>
                <div className="db-attn-row">
                  <span className="db-attn-row__label">Custom alerts fired (30 days)</span>
                  <span
                    className="db-attn-row__val"
                    style={{
                      color: (summary.custom_alert_count ?? 0) > 0 ? "var(--colour-error)" : undefined,
                    }}
                  >
                    {summary.custom_alert_count ?? 0}
                  </span>
                </div>
              </div>
              <div className="db-panel__foot">
                <Link href="/dashboard/vehicles" className="db-more-link">
                  View vehicles
                </Link>
              </div>
            </section>
          )}
        </div>
      </div>

      <style>{DB_STYLES}</style>
    </div>
  );
}

// ==================================================
// STYLES — mirror SovCorE QR dashboard panel layout
// ==================================================

const DB_STYLES = `
  .db-shell { display: flex; flex-direction: column; gap: var(--space-8); }
  .db-head { }
  .db-title { font-size: var(--text-2xl); letter-spacing: var(--tracking-tight); margin-bottom: 6px; }
  .db-sub { color: var(--colour-text-muted); }

  /* ---- Stats row: 7 cols at XL, responsive below ---- */
  .db-stats {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: var(--space-4);
  }
  .db-stat__value { font-size: var(--text-3xl); font-weight: var(--weight-semibold); color: var(--colour-text); line-height: 1; }
  .db-stat__label { font-size: var(--text-sm); color: var(--colour-text-muted); margin-top: var(--space-2); }

  /* ---- Fleet health bar ---- */
  .db-health-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-4);
    flex-wrap: wrap;
    gap: var(--space-2);
  }
  .db-health-legend {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    font-size: var(--text-xs);
    color: var(--colour-text-muted);
  }
  .db-health-dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    margin-right: 4px;
  }
  .db-health-dot--red   { background: var(--colour-error); }
  .db-health-dot--amber { background: var(--colour-amber, #f59e0b); }
  .db-health-dot--green { background: #4ade80; }

  .db-health-bar {
    display: flex;
    height: 10px;
    border-radius: var(--radius-full, 999px);
    overflow: hidden;
    background: var(--colour-bg);
    border: 0.5px solid var(--colour-border);
  }
  .db-health-seg { height: 100%; transition: width 0.4s; }
  .db-health-seg--red   { background: var(--colour-error); }
  .db-health-seg--amber { background: var(--colour-amber, #f59e0b); }
  .db-health-seg--green { background: #4ade80; }

  /* ---- Content grid ---- */
  .db-grid {
    display: grid;
    grid-template-columns: 1fr 280px;
    gap: var(--space-6);
    align-items: start;
  }
  .db-side-col { display: flex; flex-direction: column; gap: var(--space-4); }
  .db-panel {
    background: var(--colour-card);
    border: 0.5px solid var(--colour-border);
    border-radius: var(--radius-lg);
    padding: var(--space-6);
  }
  .db-panel--wide { grid-column: 1; }
  .db-panel__head { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-5); }
  .db-panel__title { font-size: var(--text-md); font-weight: var(--weight-medium); margin: 0 0 var(--space-4); letter-spacing: normal; }
  .db-panel__foot { margin-top: var(--space-5); padding-top: var(--space-4); border-top: 0.5px solid var(--colour-border); text-align: center; }

  /* Vehicle card grid inside the panel */
  .db-card-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: var(--space-4);
  }

  /* Skeleton placeholders */
  .db-skeleton-row { display: flex; gap: var(--space-4); }
  .db-skeleton-card {
    flex: 1;
    min-width: 200px;
    height: 240px;
    background: rgba(255,255,255,0.04);
    border-radius: var(--radius-lg);
    animation: shimmer 1.6s infinite;
  }
  @keyframes shimmer {
    0%   { opacity: 0.6; }
    50%  { opacity: 1;   }
    100% { opacity: 0.6; }
  }

  /* Empty state */
  .db-empty { text-align: center; padding: var(--space-10) 0; }
  .db-empty__text { color: var(--colour-text-muted); font-size: var(--text-sm); margin-bottom: var(--space-3); }
  .db-empty__link {
    display: inline-block;
    padding: 8px 20px;
    background: var(--colour-accent);
    color: #fff;
    border-radius: var(--radius-sm);
    font-size: var(--text-sm);
    text-decoration: none;
    transition: opacity 0.2s;
  }
  .db-empty__link:hover { opacity: 0.85; }

  /* Link in panel header */
  .db-action-link { font-size: var(--text-sm); color: var(--colour-accent2); text-decoration: none; }
  .db-action-link:hover { color: var(--colour-accent); }
  .db-more-link { font-size: var(--text-sm); color: var(--colour-accent2); text-decoration: none; }
  .db-more-link:hover { color: var(--colour-accent); }

  /* Quick actions */
  .db-actions { display: flex; flex-direction: column; gap: var(--space-2); }
  .db-qa {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: 10px 12px;
    border-radius: var(--radius-md);
    text-decoration: none;
    color: var(--colour-text-muted);
    font-size: var(--text-sm);
    transition: background 0.2s, color 0.2s;
  }
  .db-qa:hover { background: rgba(108,99,255,0.06); color: var(--colour-text); }
  .db-qa__icon { font-size: 14px; width: 20px; text-align: center; flex-shrink: 0; }

  /* Attention rows */
  .db-attn-rows { display: flex; flex-direction: column; gap: var(--space-1); }
  .db-attn-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 0;
    border-bottom: 0.5px solid var(--colour-border);
    font-size: var(--text-sm);
  }
  .db-attn-row:last-child { border-bottom: none; }
  .db-attn-row__label { color: var(--colour-text-muted); }
  .db-attn-row__val { font-weight: var(--weight-semibold); color: var(--colour-text); }

  /* ---- LG: 4 cols → 4+3 (no orphan) ---- */
  @media (max-width: 1199px) {
    .db-stats { grid-template-columns: repeat(4, 1fr); }
  }

  /* ---- Tablet: collapse content grid ---- */
  @media (max-width: 1023px) {
    .db-grid { grid-template-columns: 1fr; }
    .db-side-col { flex-direction: row; flex-wrap: wrap; }
    .db-side-col > * { flex: 1; min-width: 240px; }
  }

  /* ---- MD: 2 cols, spend card spans full width → 2+2+2+full ---- */
  @media (max-width: 639px) {
    .db-stats { grid-template-columns: repeat(2, 1fr); }
    .db-stats > *:nth-child(7) { grid-column: span 2; }
  }

  /* ---- SM: single column stack ---- */
  @media (max-width: 399px) {
    .db-stats { grid-template-columns: 1fr; }
    .db-stats > *:nth-child(7) { grid-column: unset; }
    .db-card-grid { grid-template-columns: 1fr; }
    .db-skeleton-row { flex-direction: column; }
    .db-side-col { flex-direction: column; }
  }

  /* ---- Phone extras (non-stats) ---- */
  @media (max-width: 479px) {
    .db-card-grid { grid-template-columns: 1fr; }
    .db-skeleton-row { flex-direction: column; }
    .db-side-col { flex-direction: column; }
  }
`;
