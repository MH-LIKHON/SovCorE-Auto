// ============================================================
// frontend/web/app/(dashboard)/dashboard/page.tsx
// ============================================================
//
// Purpose:
//   Main dashboard page. Shows at-a-glance counts (vehicles,
//   members), upcoming renewal alerts, recent vehicle cards,
//   and quick-action shortcuts.
//
// Design:
//   Mirrors SovCorE QR's dashboard overview layout — stats row
//   at the top, then a two-column grid of content panels on
//   desktop, single column on tablet and mobile.
//
//   Data loads in parallel on mount. The vehicle list and member
//   count come from existing API endpoints. Renewal alerts are
//   derived client-side from the vehicle cards' RAG status to
//   avoid a separate server round-trip.
//
//   Responsive:
//     > 1024 px: stats row (4 cols) + content grid (2 cols).
//     768–1023 px: stats row (2 cols) + content stack.
//     < 768 px: stats (1 col) + content stack.
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

interface DashData {
  vehicles: VehicleCardType[];
  memberCount: number;
  loading: boolean;
}

// ==================================================
// HELPERS
// ==================================================

function alertCount(vehicles: VehicleCardType[]): number {
  return vehicles.filter((v) => {
    const r = v.renewals;
    return (
      r.mot === "red" ||
      r.tax === "red" ||
      r.insurance === "red" ||
      r.service === "red"
    );
  }).length;
}

function warnCount(vehicles: VehicleCardType[]): number {
  return vehicles.filter((v) => {
    const r = v.renewals;
    return (
      (r.mot === "amber" || r.tax === "amber" || r.insurance === "amber" || r.service === "amber") &&
      r.mot !== "red" && r.tax !== "red" && r.insurance !== "red" && r.service !== "red"
    );
  }).length;
}

// ==================================================
// PAGE
// ==================================================

export default function DashboardPage() {
  const [data, setData] = useState<DashData>({
    vehicles: [],
    memberCount: 0,
    loading: true,
  });

  useEffect(() => {
    const accountId = getAccountId();
    if (!accountId) return;

    Promise.all([
      apiFetch(`/api/v1/accounts/${accountId}/vehicles`).then((r) =>
        r.ok ? r.json() : []
      ),
      apiFetch(`/api/v1/accounts/${accountId}/members`).then((r) =>
        r.ok ? r.json() : []
      ),
    ]).then(([vehicles, members]) => {
      setData({
        vehicles: vehicles ?? [],
        memberCount: Array.isArray(members) ? members.length : 0,
        loading: false,
      });
    });
  }, []);

  const { vehicles, memberCount, loading } = data;
  const activeVehicles = vehicles.filter((v) => v.lifecycle_state === "active");
  const redCount = alertCount(activeVehicles);
  const amberCount = warnCount(activeVehicles);
  const accountId = getAccountId() ?? "";

  return (
    <div className="db-shell">
      {/* ---------- Page header ---------- */}
      <header className="db-head">
        <h1 className="db-title">Dashboard</h1>
        <p className="db-sub">Your fleet at a glance.</p>
      </header>

      {/* ---------- Stats row ---------- */}
      <div className="db-stats">
        <div className="db-stat">
          <span className="db-stat__value">{loading ? "—" : activeVehicles.length}</span>
          <span className="db-stat__label">Vehicles</span>
        </div>
        <div className="db-stat">
          <span className="db-stat__value">{loading ? "—" : memberCount}</span>
          <span className="db-stat__label">Members</span>
        </div>
        <div className="db-stat" style={{ "--dot-colour": "var(--colour-error)" } as React.CSSProperties}>
          <span className="db-stat__value" style={{ color: redCount > 0 ? "var(--colour-error)" : undefined }}>
            {loading ? "—" : redCount}
          </span>
          <span className="db-stat__label">Alerts</span>
        </div>
        <div className="db-stat">
          <span className="db-stat__value" style={{ color: amberCount > 0 ? "var(--colour-amber)" : undefined }}>
            {loading ? "—" : amberCount}
          </span>
          <span className="db-stat__label">Due soon</span>
        </div>
      </div>

      {/* ---------- Content grid ---------- */}
      <div className="db-grid">
        {/* --- Vehicles panel --- */}
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

        {/* --- Quick actions panel --- */}
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

  /* ---- Stats row ---- */
  .db-stats {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: var(--space-4);
  }
  .db-stat {
    background: var(--colour-card);
    border: 0.5px solid var(--colour-border);
    border-radius: var(--radius-lg);
    padding: var(--space-5);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .db-stat__value { font-size: var(--text-3xl); font-weight: var(--weight-semibold); color: var(--colour-text); line-height: 1; }
  .db-stat__label { font-size: var(--text-sm); color: var(--colour-text-muted); }

  /* ---- Content grid ---- */
  .db-grid {
    display: grid;
    grid-template-columns: 1fr 280px;
    gap: var(--space-6);
    align-items: start;
  }
  .db-panel {
    background: var(--colour-card);
    border: 0.5px solid var(--colour-border);
    border-radius: var(--radius-lg);
    padding: var(--space-6);
  }
  .db-panel--wide { grid-column: 1; }
  .db-panel__head { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-5); }
  .db-panel__title { font-size: var(--text-md); font-weight: var(--weight-medium); margin: 0; }
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
  .db-qa__label { }

  /* ---- Tablet ---- */
  @media (max-width: 1023px) {
    .db-grid { grid-template-columns: 1fr; }
    .db-stats { grid-template-columns: repeat(2, 1fr); }
  }

  /* ---- Phone ---- */
  @media (max-width: 479px) {
    .db-stats { grid-template-columns: 1fr 1fr; }
    .db-card-grid { grid-template-columns: 1fr; }
    .db-skeleton-row { flex-direction: column; }
  }
`;
