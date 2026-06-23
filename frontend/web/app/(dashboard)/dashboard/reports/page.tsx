// ============================================================
// frontend/web/app/(dashboard)/dashboard/reports/page.tsx
// ============================================================
//
// Purpose:
//   Fleet-level reports page. Aggregates spending, fuel economy,
//   and maintenance statistics across every vehicle in the account.
//
// Design:
//   Three parallel requests run on mount: costs, fuel, and
//   maintenance. Each renders independently — a slow maintenance
//   query does not block the costs section from appearing.
//
//   Each section follows the same card-stats-chart pattern used
//   in the per-vehicle fuel and expenses pages (Phase 4). The
//   monthly bar chart is pure CSS; no charting library is used.
//
//   Mirrors SovCorE QR card and list patterns exactly: rec-shell,
//   Card, rec-btn, rec-row CSS conventions. cursor: none on all
//   interactive elements.
//
// Consumed by:
//   - Routed at /dashboard/reports
// ============================================================

"use client";

import { useEffect, useState } from "react";

import { Card } from "@/src/components/ui/card";
import { apiFetch, getAccountId } from "@/src/lib/api/fetch";

// ==================================================
// TYPES
// ==================================================

interface MonthlyTotal {
  month: string;
  total_pence: number;
}

interface CategoryTotal {
  record_type: string;
  label: string;
  total_pence: number;
  count: number;
}

interface VehicleCostRow {
  vehicle_id: string;
  registration: string;
  make: string;
  model: string;
  year: number | null;
  annual_spend_pence: number;
  total_spend_pence: number;
}

interface CostsReport {
  total_spend_pence: number;
  annual_spend_pence: number;
  by_category: CategoryTotal[];
  monthly: MonthlyTotal[];
  by_vehicle: VehicleCostRow[];
}

interface FuelReport {
  total_fills: number;
  total_litres: number;
  total_spend_pence: number;
  annual_spend_pence: number;
  avg_mpg: number | null;
  monthly: MonthlyTotal[];
}

interface MaintenanceCategoryRow {
  category: string;
  label: string;
  total_pence: number;
  count: number;
}

interface MaintenanceReport {
  total_jobs: number;
  total_spend_pence: number;
  annual_spend_pence: number;
  by_category: MaintenanceCategoryRow[];
  monthly: MonthlyTotal[];
}

// ==================================================
// HELPERS
// ==================================================

function formatGBP(pence: number | null): string {
  if (pence === null) return "—";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(pence / 100);
}

function formatMonthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-GB", {
    month: "short",
    year: "2-digit",
  });
}

function maxOf(items: MonthlyTotal[]): number {
  return Math.max(...items.map((m) => m.total_pence), 1);
}

// ==================================================
// EXPORT BUTTON
// ==================================================

interface ExportButtonProps {
  accountId: string;
  vehicleId: string;
  type: string;
  label: string;
}

function ExportButton({ accountId, vehicleId, type, label }: ExportButtonProps) {
  const [busy, setBusy] = useState(false);

  async function handleExport() {
    setBusy(true);
    try {
      const res = await apiFetch(
        `/api/v1/accounts/${accountId}/exports/vehicle/${vehicleId}?type=${type}`,
        { method: "POST" }
      );
      if (res.ok) {
        // ~~~~~~~~~ Trigger a browser file download from the response bytes ~~~~~~~~~
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        const today = new Date().toISOString().split("T")[0];
        a.href = url;
        a.download = `sovcoreAuto-${type.replace("_", "-")}-${today}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      className="rec-btn rec-btn--ghost rpt-export-btn"
      onClick={handleExport}
      disabled={busy}
    >
      {busy ? "…" : label}
    </button>
  );
}

// ==================================================
// PAGE
// ==================================================

export default function ReportsPage() {
  const accountId = getAccountId() ?? "";

  const [costs, setCosts] = useState<CostsReport | null>(null);
  const [fuel, setFuel] = useState<FuelReport | null>(null);
  const [maint, setMaint] = useState<MaintenanceReport | null>(null);

  const [costsLoading, setCostsLoading] = useState(true);
  const [fuelLoading, setFuelLoading] = useState(true);
  const [maintLoading, setMaintLoading] = useState(true);

  // ==================================================
  // DATA LOADING
  // ==================================================

  useEffect(() => {
    if (!accountId) return;

    // ~~~~~~~~~ Three parallel fetches — each section renders independently ~~~~~~~~~
    (async () => {
      setCostsLoading(true);
      const res = await apiFetch(`/api/v1/accounts/${accountId}/reports/costs`);
      if (res.ok) setCosts(await res.json());
      setCostsLoading(false);
    })();

    (async () => {
      setFuelLoading(true);
      const res = await apiFetch(`/api/v1/accounts/${accountId}/reports/fuel`);
      if (res.ok) setFuel(await res.json());
      setFuelLoading(false);
    })();

    (async () => {
      setMaintLoading(true);
      const res = await apiFetch(`/api/v1/accounts/${accountId}/reports/maintenance`);
      if (res.ok) setMaint(await res.json());
      setMaintLoading(false);
    })();
  }, [accountId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ==================================================
  // RENDER
  // ==================================================

  return (
    <div className="rec-shell">

      {/* ---- Header ---- */}
      <header className="rec-head">
        <div className="rec-head__row">
          <div>
            <h1 className="rec-title">Reports</h1>
            <p className="rec-sub">Spending, fuel economy, and maintenance analytics across your fleet.</p>
          </div>
        </div>
      </header>

      {/* ---- Costs section ---- */}
      <section className="rpt-section">
        <h2 className="rpt-section-heading">Costs</h2>

        {costsLoading && <Card><div className="rec-skeleton" /></Card>}

        {!costsLoading && costs && (
          <>
            {/* Stats row */}
            <Card>
              <h3 className="rec-section-title">Overview</h3>
              <div className="rpt-stats">
                <div className="rpt-stat">
                  <span className="rpt-stat__value">{formatGBP(costs.total_spend_pence)}</span>
                  <span className="rpt-stat__label">All-time spend</span>
                </div>
                <div className="rpt-stat">
                  <span className="rpt-stat__value">{formatGBP(costs.annual_spend_pence)}</span>
                  <span className="rpt-stat__label">This year</span>
                </div>
                <div className="rpt-stat">
                  <span className="rpt-stat__value">{costs.by_vehicle.length}</span>
                  <span className="rpt-stat__label">Vehicles tracked</span>
                </div>
                <div className="rpt-stat">
                  <span className="rpt-stat__value">{costs.by_category.reduce((s, c) => s + c.count, 0)}</span>
                  <span className="rpt-stat__label">Total records</span>
                </div>
              </div>
            </Card>

            {/* Monthly spend chart */}
            {costs.monthly.some((m) => m.total_pence > 0) && (
              <Card>
                <h3 className="rec-section-title">Monthly spend — last 12 months</h3>
                <div className="rpt-chart">
                  {costs.monthly.map((m) => (
                    <div key={m.month} className="rpt-bar-col">
                      <span className="rpt-bar-amount">
                        {m.total_pence > 0 ? formatGBP(m.total_pence) : ""}
                      </span>
                      <div className="rpt-bar-track">
                        <div
                          className="rpt-bar-fill"
                          style={{ height: `${Math.round((m.total_pence / maxOf(costs.monthly)) * 100)}%` }}
                        />
                      </div>
                      <span className="rpt-bar-label">{formatMonthLabel(m.month).split(" ")[0]}</span>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Category breakdown */}
            {costs.by_category.length > 0 && (
              <Card>
                <h3 className="rec-section-title">By category</h3>
                <div className="rec-rows">
                  {costs.by_category.map((cat) => (
                    <div key={cat.record_type} className="rpt-row">
                      <div className="rpt-row__left">
                        <span className="rpt-row__label">{cat.label}</span>
                        <span className="rpt-row__count">{cat.count} record{cat.count !== 1 ? "s" : ""}</span>
                      </div>
                      <span className="rpt-row__value">{formatGBP(cat.total_pence)}</span>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Per-vehicle breakdown */}
            {costs.by_vehicle.length > 1 && (
              <Card>
                <h3 className="rec-section-title">By vehicle</h3>
                <div className="rec-rows">
                  {costs.by_vehicle.map((v) => (
                    <div key={v.vehicle_id} className="rpt-row">
                      <div className="rpt-row__left">
                        <span className="rpt-row__label rpt-row__reg">{v.registration}</span>
                        <span className="rpt-row__count">
                          {v.make} {v.model}{v.year ? ` · ${v.year}` : ""}
                        </span>
                      </div>
                      <div className="rpt-row__right">
                        <span className="rpt-row__sub">{formatGBP(v.annual_spend_pence)} this year</span>
                        <span className="rpt-row__value">{formatGBP(v.total_spend_pence)} total</span>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {costs.total_spend_pence === 0 && (
              <Card>
                <div className="rec-empty">
                  <p>No cost records yet. Add maintenance, fuel, insurance, and other records to see analytics here.</p>
                </div>
              </Card>
            )}
          </>
        )}
      </section>

      {/* ---- Fuel section ---- */}
      <section className="rpt-section">
        <h2 className="rpt-section-heading">Fuel</h2>

        {fuelLoading && <Card><div className="rec-skeleton" /></Card>}

        {!fuelLoading && fuel && (
          <>
            <Card>
              <h3 className="rec-section-title">Overview</h3>
              <div className="rpt-stats">
                <div className="rpt-stat">
                  <span className="rpt-stat__value">{fuel.total_fills}</span>
                  <span className="rpt-stat__label">Total fills</span>
                </div>
                <div className="rpt-stat">
                  <span className="rpt-stat__value">{fuel.total_litres.toFixed(1)} L</span>
                  <span className="rpt-stat__label">Total litres</span>
                </div>
                <div className="rpt-stat">
                  <span className="rpt-stat__value">{formatGBP(fuel.total_spend_pence)}</span>
                  <span className="rpt-stat__label">Total spend</span>
                </div>
                <div className="rpt-stat">
                  <span className="rpt-stat__value">{formatGBP(fuel.annual_spend_pence)}</span>
                  <span className="rpt-stat__label">This year</span>
                </div>
                <div className="rpt-stat">
                  <span className="rpt-stat__value">
                    {fuel.avg_mpg !== null ? `${fuel.avg_mpg} mpg` : "—"}
                  </span>
                  <span className="rpt-stat__label">Fleet avg MPG</span>
                </div>
              </div>
              {fuel.avg_mpg === null && fuel.total_fills > 0 && (
                <p className="rpt-note">
                  Fleet MPG requires consecutive full-tank fills with mileage recorded on at least one vehicle.
                </p>
              )}
            </Card>

            {fuel.monthly.some((m) => m.total_pence > 0) && (
              <Card>
                <h3 className="rec-section-title">Monthly fuel spend — last 12 months</h3>
                <div className="rpt-chart">
                  {fuel.monthly.map((m) => (
                    <div key={m.month} className="rpt-bar-col">
                      <span className="rpt-bar-amount">
                        {m.total_pence > 0 ? formatGBP(m.total_pence) : ""}
                      </span>
                      <div className="rpt-bar-track">
                        <div
                          className="rpt-bar-fill rpt-bar-fill--fuel"
                          style={{ height: `${Math.round((m.total_pence / maxOf(fuel.monthly)) * 100)}%` }}
                        />
                      </div>
                      <span className="rpt-bar-label">{formatMonthLabel(m.month).split(" ")[0]}</span>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {fuel.total_fills === 0 && (
              <Card>
                <div className="rec-empty">
                  <p>No fuel records yet. Add fuel records to see fleet fuel analytics here.</p>
                </div>
              </Card>
            )}
          </>
        )}
      </section>

      {/* ---- Maintenance section ---- */}
      <section className="rpt-section">
        <h2 className="rpt-section-heading">Maintenance</h2>

        {maintLoading && <Card><div className="rec-skeleton" /></Card>}

        {!maintLoading && maint && (
          <>
            <Card>
              <h3 className="rec-section-title">Overview</h3>
              <div className="rpt-stats">
                <div className="rpt-stat">
                  <span className="rpt-stat__value">{maint.total_jobs}</span>
                  <span className="rpt-stat__label">Total jobs</span>
                </div>
                <div className="rpt-stat">
                  <span className="rpt-stat__value">{formatGBP(maint.total_spend_pence)}</span>
                  <span className="rpt-stat__label">Total spend</span>
                </div>
                <div className="rpt-stat">
                  <span className="rpt-stat__value">{formatGBP(maint.annual_spend_pence)}</span>
                  <span className="rpt-stat__label">This year</span>
                </div>
              </div>
            </Card>

            {maint.monthly.some((m) => m.total_pence > 0) && (
              <Card>
                <h3 className="rec-section-title">Monthly maintenance spend — last 12 months</h3>
                <div className="rpt-chart">
                  {maint.monthly.map((m) => (
                    <div key={m.month} className="rpt-bar-col">
                      <span className="rpt-bar-amount">
                        {m.total_pence > 0 ? formatGBP(m.total_pence) : ""}
                      </span>
                      <div className="rpt-bar-track">
                        <div
                          className="rpt-bar-fill rpt-bar-fill--maint"
                          style={{ height: `${Math.round((m.total_pence / maxOf(maint.monthly)) * 100)}%` }}
                        />
                      </div>
                      <span className="rpt-bar-label">{formatMonthLabel(m.month).split(" ")[0]}</span>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {maint.by_category.length > 0 && (
              <Card>
                <h3 className="rec-section-title">By category</h3>
                <div className="rec-rows">
                  {maint.by_category.map((cat) => (
                    <div key={cat.category} className="rpt-row">
                      <div className="rpt-row__left">
                        <span className="rpt-row__label">{cat.label}</span>
                        <span className="rpt-row__count">{cat.count} job{cat.count !== 1 ? "s" : ""}</span>
                      </div>
                      <span className="rpt-row__value">{formatGBP(cat.total_pence)}</span>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {maint.total_jobs === 0 && (
              <Card>
                <div className="rec-empty">
                  <p>No maintenance records yet. Add maintenance records to see analytics here.</p>
                </div>
              </Card>
            )}
          </>
        )}
      </section>

      {/* ---- Exports section ---- */}
      {costs && costs.by_vehicle.length > 0 && (
        <section className="rpt-section">
          <h2 className="rpt-section-heading">Export</h2>
          <Card>
            <h3 className="rec-section-title">PDF reports by vehicle</h3>
            <p className="rpt-note" style={{ marginTop: 0, paddingTop: 0, border: "none" }}>
              Download a PDF report for any vehicle. Reports open as file downloads.
            </p>
            <div className="rec-rows">
              {costs.by_vehicle.map((v) => (
                <div key={v.vehicle_id} className="rpt-row">
                  <div className="rpt-row__left">
                    <span className="rpt-row__label rpt-row__reg">{v.registration}</span>
                    <span className="rpt-row__count">
                      {v.make} {v.model}{v.year ? ` · ${v.year}` : ""}
                    </span>
                  </div>
                  <div className="rpt-export-btns">
                    <ExportButton accountId={accountId} vehicleId={v.vehicle_id} type="vehicle" label="Vehicle report" />
                    <ExportButton accountId={accountId} vehicleId={v.vehicle_id} type="service_history" label="Service history" />
                    <ExportButton accountId={accountId} vehicleId={v.vehicle_id} type="maintenance" label="Maintenance" />
                    <ExportButton accountId={accountId} vehicleId={v.vehicle_id} type="expenses" label="Expenses" />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </section>
      )}

      <style>{RPT_STYLES}</style>
    </div>
  );
}

// ==================================================
// STYLES — mirrors SovCorE QR card and list patterns
// ==================================================

const RPT_STYLES = `
  /* ---- Section headings ---- */
  .rpt-section { display: flex; flex-direction: column; gap: var(--space-4); }
  .rpt-section-heading {
    font-size: var(--text-base);
    font-weight: var(--weight-semibold);
    color: var(--colour-text);
    letter-spacing: var(--tracking-tight);
    margin: 0;
    padding-top: var(--space-2);
  }

  /* ---- Stats grid ---- */
  .rpt-stats {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: var(--space-4);
  }
  .rpt-stat {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: var(--space-4);
    border: 0.5px solid var(--colour-border);
    border-radius: var(--radius-md);
  }
  .rpt-stat__value {
    font-size: var(--text-xl);
    font-weight: var(--weight-semibold);
    letter-spacing: var(--tracking-tight);
  }
  .rpt-stat__label {
    font-size: var(--text-xs);
    color: var(--colour-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  /* ---- Monthly bar chart ---- */
  .rpt-chart {
    display: flex;
    align-items: flex-end;
    gap: var(--space-2);
    height: 140px;
  }
  .rpt-bar-col {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    height: 100%;
    justify-content: flex-end;
  }
  .rpt-bar-amount {
    font-size: 9px;
    color: var(--colour-text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
    text-align: center;
  }
  .rpt-bar-track {
    width: 100%;
    flex: 1;
    display: flex;
    align-items: flex-end;
    background: rgba(255,255,255,0.03);
    border-radius: var(--radius-sm) var(--radius-sm) 0 0;
  }
  .rpt-bar-fill {
    width: 100%;
    background: rgba(108,99,255,0.5);
    border-radius: var(--radius-sm) var(--radius-sm) 0 0;
    min-height: 4px;
    transition: height 0.3s ease;
  }
  .rpt-bar-fill--fuel  { background: rgba(74,222,128,0.4); }
  .rpt-bar-fill--maint { background: rgba(245,158,11,0.45); }
  .rpt-bar-label {
    font-size: 9px;
    color: var(--colour-text-muted);
    text-align: center;
    white-space: nowrap;
  }

  /* ---- Category / vehicle rows ---- */
  .rpt-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    border-bottom: 0.5px solid var(--colour-border);
    flex-wrap: wrap;
  }
  .rpt-row:last-child { border-bottom: none; }
  .rpt-row__left  { display: flex; flex-direction: column; gap: 2px; }
  .rpt-row__right { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; flex-shrink: 0; }
  .rpt-row__label { font-size: var(--text-sm); color: var(--colour-text); }
  .rpt-row__reg   { font-weight: var(--weight-medium); letter-spacing: 0.04em; }
  .rpt-row__count { font-size: var(--text-xs); color: var(--colour-text-muted); }
  .rpt-row__sub   { font-size: var(--text-xs); color: var(--colour-text-muted); }
  .rpt-row__value { font-size: var(--text-sm); font-weight: var(--weight-medium); color: var(--colour-text); white-space: nowrap; }

  /* ---- Info note ---- */
  .rpt-note {
    font-size: var(--text-xs);
    color: var(--colour-text-muted);
    margin-top: var(--space-4);
    padding-top: var(--space-4);
    border-top: 0.5px solid var(--colour-border);
  }

  /* ---- Export buttons strip ---- */
  .rpt-export-btns {
    display: flex;
    gap: var(--space-2);
    flex-wrap: wrap;
    flex-shrink: 0;
  }
  .rpt-export-btn {
    font-size: var(--text-xs);
    padding: 4px 10px;
  }

  /* ---- Responsive ---- */
  @media (max-width: 767px) {
    .rpt-stats { grid-template-columns: repeat(2, 1fr); }
    .rpt-chart { height: 100px; }
    .rpt-bar-amount { display: none; }
    .rpt-row { flex-direction: column; align-items: flex-start; }
    .rpt-row__right { align-items: flex-start; }
    .rpt-export-btns { margin-top: var(--space-2); }
  }
`;
