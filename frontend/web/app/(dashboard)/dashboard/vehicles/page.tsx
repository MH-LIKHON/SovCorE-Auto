// ============================================================
// frontend/web/app/(dashboard)/dashboard/vehicles/page.tsx
// ============================================================
//
// Purpose:
//   Vehicle grid page. Lists all active vehicles for the account
//   as cards, with a toggle to show inactive (sold, scrapped,
//   archived) vehicles. Provides an "Add vehicle" shortcut.
//
// Design:
//   Cards reflow from 1 column on mobile to 2 at md to 3 at lg.
//   Loading state shows skeleton cards. Empty state shows a
//   prompt to add the first vehicle.
//
//   The "Include inactive" toggle appends ?include_inactive=true
//   to the API call and shows a muted badge on inactive cards.
//
// Consumed by:
//   - Routed at /dashboard/vehicles
// ============================================================

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { VehicleCard, type VehicleCard as VehicleCardType } from "@/src/components/vehicles/vehicle-card";
import { apiFetch, getAccountId } from "@/src/lib/api/fetch";

// ==================================================
// PAGE
// ==================================================

export default function VehiclesPage() {
  const [vehicles, setVehicles] = useState<VehicleCardType[]>([]);
  const [loading, setLoading] = useState(true);
  const [includeInactive, setIncludeInactive] = useState(false);

  const accountId = getAccountId() ?? "";

  async function load(inactive: boolean) {
    if (!accountId) return;
    setLoading(true);
    const qs = inactive ? "?include_inactive=true" : "";
    const res = await apiFetch(
      `/api/v1/accounts/${accountId}/vehicles${qs}`
    );
    const data = res.ok ? await res.json() : [];
    setVehicles(data ?? []);
    setLoading(false);
  }

  useEffect(() => { load(includeInactive); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleToggleInactive() {
    const next = !includeInactive;
    setIncludeInactive(next);
    load(next);
  }

  return (
    <div className="vp-shell">
      {/* ~~~~~~~~~ Header ~~~~~~~~~ */}
      <header className="vp-head">
        <div className="vp-head__left">
          <h1 className="vp-title">Vehicles</h1>
          <p className="vp-sub">
            {loading
              ? "Loading…"
              : `${vehicles.filter((v) => v.lifecycle_state === "active").length} active vehicle${vehicles.filter((v) => v.lifecycle_state === "active").length !== 1 ? "s" : ""}`}
          </p>
        </div>
        <div className="vp-head__actions">
          <label className="vp-toggle">
            <input
              type="checkbox"
              checked={includeInactive}
              onChange={handleToggleInactive}
              className="vp-toggle__input"
            />
            <span className="vp-toggle__label">Include inactive</span>
          </label>
          <Link href="/dashboard/vehicles/new" className="vp-add-btn">
            Add vehicle
          </Link>
        </div>
      </header>

      {/* ~~~~~~~~~ Grid ~~~~~~~~~ */}
      {loading ? (
        <div className="vp-grid">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="vp-skeleton" />
          ))}
        </div>
      ) : vehicles.length === 0 ? (
        <div className="vp-empty">
          <p className="vp-empty__text">No vehicles yet.</p>
          <Link href="/dashboard/vehicles/new" className="vp-empty__link">
            Add your first vehicle
          </Link>
        </div>
      ) : (
        <div className="vp-grid">
          {vehicles.map((v) => (
            <VehicleCard key={v.id} vehicle={v} accountId={accountId} />
          ))}
        </div>
      )}

      <style>{VP_STYLES}</style>
    </div>
  );
}

// ==================================================
// STYLES
// ==================================================

const VP_STYLES = `
  .vp-shell { display: flex; flex-direction: column; gap: var(--space-6); }

  .vp-head { display: flex; align-items: flex-end; justify-content: space-between; gap: var(--space-4); flex-wrap: wrap; }
  .vp-head__left { }
  .vp-title { font-size: var(--text-2xl); letter-spacing: var(--tracking-tight); margin-bottom: 4px; }
  .vp-sub { color: var(--colour-text-muted); font-size: var(--text-sm); }
  .vp-head__actions { display: flex; align-items: center; gap: var(--space-4); flex-wrap: wrap; }

  .vp-toggle { display: flex; align-items: center; gap: 8px; cursor: none; }
  .vp-toggle__input { width: 16px; height: 16px; accent-color: var(--colour-accent); cursor: none; }
  .vp-toggle__label { font-size: var(--text-sm); color: var(--colour-text-muted); }

  .vp-add-btn {
    padding: 8px 18px;
    background: var(--colour-accent);
    color: #fff;
    border-radius: var(--radius-sm);
    font-size: var(--text-sm);
    text-decoration: none;
    transition: opacity 0.2s;
    white-space: nowrap;
  }
  .vp-add-btn:hover { opacity: 0.85; }

  /* ---- Card grid — three columns on desktop ---- */
  .vp-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--space-5);
  }

  /* Skeleton */
  .vp-skeleton {
    height: 280px;
    background: rgba(255,255,255,0.04);
    border-radius: var(--radius-lg);
    animation: shimmer 1.6s infinite;
  }
  @keyframes shimmer { 0% { opacity: 0.6; } 50% { opacity: 1; } 100% { opacity: 0.6; } }

  /* Empty state */
  .vp-empty { text-align: center; padding: var(--space-14) 0; }
  .vp-empty__text { color: var(--colour-text-muted); font-size: var(--text-sm); margin-bottom: var(--space-4); }
  .vp-empty__link {
    display: inline-block;
    padding: 9px 22px;
    background: var(--colour-accent);
    color: #fff;
    border-radius: var(--radius-sm);
    font-size: var(--text-sm);
    text-decoration: none;
    transition: opacity 0.2s;
  }
  .vp-empty__link:hover { opacity: 0.85; }

  /* ---- Tablet: two columns ---- */
  @media (max-width: 1023px) {
    .vp-grid { grid-template-columns: repeat(2, 1fr); }
  }

  /* ---- Phone: one column ---- */
  @media (max-width: 639px) {
    .vp-grid { grid-template-columns: 1fr; }
    .vp-head { align-items: flex-start; flex-direction: column; }
  }
`;
