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

import { useEffect, useMemo, useState } from "react";

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
  oldest_year: number;
}

interface FuelReport {
  total_fills: number;
  total_litres: number;
  total_spend_pence: number;
  annual_spend_pence: number;
  avg_mpg: number | null;
  monthly: MonthlyTotal[];
  oldest_year: number;
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
  oldest_year: number;
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
// YEAR CONSTANTS
// ==================================================

const CURRENT_YEAR = new Date().getFullYear();

// ==================================================
// ACCOUNT EXPORT BUTTON
// ==================================================

function AccountExportButton({ accountId }: { accountId: string }) {
  const [busy, setBusy] = useState(false);

  async function handleExport() {
    setBusy(true);
    try {
      const res = await apiFetch(`/api/v1/accounts/${accountId}/exports/account`, { method: "POST" });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `sovcoreAuto-export-${new Date().toISOString().split("T")[0]}.zip`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <button className="rec-btn rec-btn--primary" onClick={handleExport} disabled={busy}>
      {busy ? "Preparing export…" : "Download account data"}
    </button>
  );
}

// ==================================================
// EXPORT MODAL
// ==================================================

const REPORT_TYPES = [
  { value: "vehicle",        label: "Vehicle report" },
  { value: "service_history", label: "Service history" },
  { value: "maintenance",    label: "Maintenance" },
  { value: "expenses",       label: "Expenses" },
];

interface VehicleItem {
  vehicle_id: string;
  registration: string;
  make: string;
  model: string;
  year: number | null;
}

interface ExportModalProps {
  accountId: string;
  vehicles: VehicleItem[];
  onClose: () => void;
}

function ExportModal({ accountId, vehicles, onClose }: ExportModalProps) {
  const [selected, setSelected] = useState<string>("all");
  const [reportType, setReportType]  = useState("vehicle");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    setBusy(true);
    setError(null);
    try {
      let url: string;
      let filename: string;
      const today = new Date().toISOString().split("T")[0];
      if (selected === "all") {
        url      = `/api/v1/accounts/${accountId}/exports/fleet`;
        filename = `sovcoreAuto-fleet-report-${today}.pdf`;
      } else {
        url      = `/api/v1/accounts/${accountId}/exports/vehicle/${selected}?type=${reportType}`;
        filename = `sovcoreAuto-${reportType.replace("_", "-")}-${today}.pdf`;
      }
      const res = await apiFetch(url, { method: "POST" });
      if (!res.ok) { setError(`Export failed (${res.status}).`); return; }
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objUrl;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(objUrl);
      onClose();
    } catch {
      setError("Network error — could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="xpm-overlay" onClick={onClose}>
      <div className="xpm-modal" onClick={(e) => e.stopPropagation()}>
        <header className="xpm-header">
          <span className="xpm-title">Export PDF report</span>
          <button className="xpm-close" onClick={onClose} aria-label="Close">✕</button>
        </header>

        <div className="xpm-body">
          {/* Vehicle selector */}
          <p className="xpm-label">Select vehicle</p>
          <div className="xpm-vehicle-list">
            <button
              className={`xpm-vehicle-row${selected === "all" ? " xpm-vehicle-row--active" : ""}`}
              onClick={() => setSelected("all")}
            >
              <span className="xpm-vehicle-reg xpm-vehicle-reg--fleet">All vehicles</span>
              <span className="xpm-vehicle-desc">Fleet report: all vehicles merged</span>
            </button>
            {vehicles.map((v) => (
              <button
                key={v.vehicle_id}
                className={`xpm-vehicle-row${selected === v.vehicle_id ? " xpm-vehicle-row--active" : ""}`}
                onClick={() => setSelected(v.vehicle_id)}
              >
                <span className="xpm-vehicle-reg">{v.registration}</span>
                <span className="xpm-vehicle-desc">
                  {v.make} {v.model}{v.year ? ` · ${v.year}` : ""}
                </span>
              </button>
            ))}
          </div>

          {/* Report type — only for single vehicle */}
          {selected !== "all" && (
            <>
              <p className="xpm-label" style={{ marginTop: "var(--space-4)" }}>Report type</p>
              <div className="xpm-type-grid">
                {REPORT_TYPES.map((rt) => (
                  <button
                    key={rt.value}
                    className={`xpm-type-btn${reportType === rt.value ? " xpm-type-btn--active" : ""}`}
                    onClick={() => setReportType(rt.value)}
                  >
                    {rt.label}
                  </button>
                ))}
              </div>
            </>
          )}

          {error && <p className="xpm-error">{error}</p>}
        </div>

        <footer className="xpm-footer">
          <button className="rec-btn rec-btn--ghost" onClick={onClose}>Cancel</button>
          <button className="rec-btn rec-btn--primary" onClick={handleGenerate} disabled={busy}>
            {busy ? "Generating…" : "Generate PDF"}
          </button>
        </footer>
      </div>
    </div>
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

  const [exportOpen, setExportOpen] = useState(false);
  const [year, setYear] = useState(CURRENT_YEAR);

  // Build year options from the oldest record across all three reports.
  const yearOptions = useMemo(() => {
    const candidates: number[] = [];
    if (costs) candidates.push(costs.oldest_year);
    if (fuel) candidates.push(fuel.oldest_year);
    if (maint) candidates.push(maint.oldest_year);
    const oldest = candidates.length > 0 ? Math.min(...candidates) : CURRENT_YEAR;
    return Array.from({ length: CURRENT_YEAR - oldest + 1 }, (_, i) => CURRENT_YEAR - i);
  }, [costs, fuel, maint]);

  // ==================================================
  // DATA LOADING
  // ==================================================

  useEffect(() => {
    if (!accountId) return;

    // ~~~~~~~~~ Three parallel fetches — each section renders independently ~~~~~~~~~
    (async () => {
      setCostsLoading(true);
      const res = await apiFetch(`/api/v1/accounts/${accountId}/reports/costs?year=${year}`);
      if (res.ok) setCosts(await res.json());
      setCostsLoading(false);
    })();

    (async () => {
      setFuelLoading(true);
      const res = await apiFetch(`/api/v1/accounts/${accountId}/reports/fuel?year=${year}`);
      if (res.ok) setFuel(await res.json());
      setFuelLoading(false);
    })();

    (async () => {
      setMaintLoading(true);
      const res = await apiFetch(`/api/v1/accounts/${accountId}/reports/maintenance?year=${year}`);
      if (res.ok) setMaint(await res.json());
      setMaintLoading(false);
    })();
  }, [accountId, year]); // eslint-disable-line react-hooks/exhaustive-deps

  // ==================================================
  // RENDER
  // ==================================================

  return (
    <div className="rec-shell">

      {/* ---- Header ---- */}
      <header className="rec-head">
        <div className="rec-head__row">
          <div>
            <div className="rpt-title-row">
              <h1 className="rec-title">Reports</h1>
              <select
                className="rpt-year-select"
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
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
            <Card style={{ overflow: "visible" }}>
              <h3 className="rec-section-title">Overview</h3>
              <div className="rpt-stats">
                <Card className="rpt-stat" padding="var(--space-4)" hoverEffect="glow">
                  <span className="rpt-stat__value">{formatGBP(costs.total_spend_pence)}</span>
                  <span className="rpt-stat__label">All-time spend</span>
                </Card>
                <Card className="rpt-stat" padding="var(--space-4)" hoverEffect="glow">
                  <span className="rpt-stat__value">{formatGBP(costs.annual_spend_pence)}</span>
                  <span className="rpt-stat__label">{year}</span>
                </Card>
                <Card className="rpt-stat" padding="var(--space-4)" hoverEffect="glow">
                  <span className="rpt-stat__value">
                    {formatGBP(Math.round(costs.annual_spend_pence / (year === CURRENT_YEAR ? Math.max(new Date().getMonth() + 1, 1) : 12)))}
                  </span>
                  <span className="rpt-stat__label">Monthly avg</span>
                </Card>
                <Card className="rpt-stat" padding="var(--space-4)" hoverEffect="glow">
                  <span className="rpt-stat__value">{costs.by_vehicle.length}</span>
                  <span className="rpt-stat__label">Vehicles tracked</span>
                </Card>
                <Card className="rpt-stat" padding="var(--space-4)" hoverEffect="glow">
                  <span className="rpt-stat__value">{costs.by_category.reduce((s, c) => s + c.count, 0)}</span>
                  <span className="rpt-stat__label">Total records</span>
                </Card>
              </div>
            </Card>

            {/* Monthly spend chart */}
            {costs.monthly.some((m) => m.total_pence > 0) && (
              <Card>
                <h3 className="rec-section-title">Monthly spend, {year}</h3>
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
                        <span className="rpt-row__sub">{formatGBP(v.annual_spend_pence)} in {year}</span>
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
            <Card style={{ overflow: "visible" }}>
              <h3 className="rec-section-title">Overview</h3>
              <div className="rpt-stats">
                <Card className="rpt-stat" padding="var(--space-4)" hoverEffect="glow">
                  <span className="rpt-stat__value">{fuel.total_fills}</span>
                  <span className="rpt-stat__label">Total fills</span>
                </Card>
                <Card className="rpt-stat" padding="var(--space-4)" hoverEffect="glow">
                  <span className="rpt-stat__value">{fuel.total_litres.toFixed(1)} L</span>
                  <span className="rpt-stat__label">Total litres</span>
                </Card>
                <Card className="rpt-stat" padding="var(--space-4)" hoverEffect="glow">
                  <span className="rpt-stat__value">{formatGBP(fuel.total_spend_pence)}</span>
                  <span className="rpt-stat__label">Total spend</span>
                </Card>
                <Card className="rpt-stat" padding="var(--space-4)" hoverEffect="glow">
                  <span className="rpt-stat__value">{formatGBP(fuel.annual_spend_pence)}</span>
                  <span className="rpt-stat__label">{year}</span>
                </Card>
                <Card className="rpt-stat" padding="var(--space-4)" hoverEffect="glow">
                  <span className="rpt-stat__value">
                    {fuel.avg_mpg !== null ? `${fuel.avg_mpg} mpg` : "—"}
                  </span>
                  <span className="rpt-stat__label">Fleet avg MPG</span>
                </Card>
              </div>
              {fuel.avg_mpg === null && fuel.total_fills > 0 && (
                <p className="rpt-note">
                  Fleet MPG requires consecutive full-tank fills with mileage recorded on at least one vehicle.
                </p>
              )}
            </Card>

            {fuel.monthly.some((m) => m.total_pence > 0) && (
              <Card>
                <h3 className="rec-section-title">Monthly fuel spend, {year}</h3>
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
            <Card style={{ overflow: "visible" }}>
              <h3 className="rec-section-title">Overview</h3>
              <div className="rpt-stats">
                <Card className="rpt-stat" padding="var(--space-4)" hoverEffect="glow">
                  <span className="rpt-stat__value">{maint.total_jobs}</span>
                  <span className="rpt-stat__label">Total jobs</span>
                </Card>
                <Card className="rpt-stat" padding="var(--space-4)" hoverEffect="glow">
                  <span className="rpt-stat__value">{formatGBP(maint.total_spend_pence)}</span>
                  <span className="rpt-stat__label">Total spend</span>
                </Card>
                <Card className="rpt-stat" padding="var(--space-4)" hoverEffect="glow">
                  <span className="rpt-stat__value">{formatGBP(maint.annual_spend_pence)}</span>
                  <span className="rpt-stat__label">{year}</span>
                </Card>
                <Card className="rpt-stat" padding="var(--space-4)" hoverEffect="glow">
                  <span className="rpt-stat__value">
                    {maint.total_jobs > 0 ? formatGBP(Math.round(maint.total_spend_pence / maint.total_jobs)) : "—"}
                  </span>
                  <span className="rpt-stat__label">Avg job cost</span>
                </Card>
                <Card className="rpt-stat" padding="var(--space-4)" hoverEffect="glow">
                  <span className="rpt-stat__value">
                    {formatGBP(Math.round(maint.annual_spend_pence / (year === CURRENT_YEAR ? Math.max(new Date().getMonth() + 1, 1) : 12)))}
                  </span>
                  <span className="rpt-stat__label">Monthly avg</span>
                </Card>
              </div>
            </Card>

            {maint.monthly.some((m) => m.total_pence > 0) && (
              <Card>
                <h3 className="rec-section-title">Monthly maintenance spend, {year}</h3>
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

      {/* ---- Export pair: side-by-side on large screens ---- */}
      <div className="rpt-export-pair">
        <section className="rpt-section rpt-export-col">
          <h2 className="rpt-section-heading">Account data export</h2>
          <Card className="rpt-export-card">
            <h3 className="rec-section-title">Download your data</h3>
            <p className="rpt-note" style={{ marginTop: 0, paddingTop: 0, border: "none", marginBottom: "var(--space-4)" }}>
              All vehicles, records, documents and tasks as a ZIP of CSV files.
            </p>
            <AccountExportButton accountId={accountId} />
          </Card>
        </section>

        <section className="rpt-section rpt-export-col">
          <h2 className="rpt-section-heading">PDF export</h2>
          <Card className="rpt-export-card">
            <h3 className="rec-section-title">Generate a PDF report</h3>
            <p className="rpt-note" style={{ marginTop: 0, paddingTop: 0, border: "none", marginBottom: "var(--space-4)" }}>
              Export a report for a single vehicle or a merged fleet report for all vehicles.
            </p>
            <button
              className="rec-btn rec-btn--primary"
              onClick={() => setExportOpen(true)}
              disabled={!costs || costs.by_vehicle.length === 0}
            >
              Export PDF report
            </button>
          </Card>
        </section>
      </div>

      <style>{RPT_STYLES}</style>

      {exportOpen && costs && (
        <ExportModal
          accountId={accountId}
          vehicles={costs.by_vehicle}
          onClose={() => setExportOpen(false)}
        />
      )}
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
    letter-spacing: normal;
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
    min-width: 0;
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
    margin-top: 4px;
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
    transition: transform 0.2s ease;
  }
  .rpt-bar-col:hover .rpt-bar-amount { transform: translateY(-6px); }
  .rpt-bar-track {
    width: 100%;
    flex: 1;
    display: flex;
    align-items: flex-end;
    background: rgba(255,255,255,0.03);
    border-radius: var(--radius-sm) var(--radius-sm) 0 0;
  }
  .rpt-bar-col { cursor: default; }
  .rpt-bar-fill {
    width: 100%;
    background: rgba(108,99,255,0.5);
    border-radius: var(--radius-sm) var(--radius-sm) 0 0;
    min-height: 4px;
    transition: height 0.3s ease, transform 0.2s ease, background 0.2s;
    transform-origin: bottom center;
  }
  .rpt-bar-fill--fuel  { background: rgba(74,222,128,0.4); }
  .rpt-bar-fill--maint { background: rgba(245,158,11,0.45); }
  /* Hover: each fill type shifts to its brightest complementary colour */
  .rpt-bar-col:hover .rpt-bar-fill                     { transform: scaleY(1.12); background: rgba(0,212,255,0.7); }
  .rpt-bar-col:hover .rpt-bar-fill.rpt-bar-fill--fuel  { background: rgba(74,222,128,0.85); }
  .rpt-bar-col:hover .rpt-bar-fill.rpt-bar-fill--maint { background: rgba(251,191,36,0.85); }
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

  /* ---- Export modal ---- */
  .xpm-overlay {
    position: fixed; inset: 0; z-index: 9000;
    background: rgba(0,0,0,0.65); backdrop-filter: blur(4px);
    display: flex; align-items: center; justify-content: center;
    cursor: none;
  }
  .xpm-modal {
    background: var(--colour-surface);
    border: 0.5px solid var(--colour-border);
    border-radius: var(--radius-md);
    width: min(480px, 94vw);
    max-height: 80vh;
    display: flex; flex-direction: column;
    cursor: none;
  }
  .xpm-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: var(--space-4) var(--space-5);
    border-bottom: 0.5px solid var(--colour-border);
    flex-shrink: 0;
  }
  .xpm-title { font-size: var(--text-md); font-weight: var(--weight-medium); }
  .xpm-close {
    background: none; border: none; color: var(--colour-text-muted);
    font-size: var(--text-lg); cursor: none; line-height: 1;
    transition: color 0.2s;
  }
  .xpm-close:hover { color: var(--colour-text); }
  .xpm-body { padding: var(--space-5); overflow-y: auto; flex: 1; }
  .xpm-label {
    font-size: var(--text-xs); color: var(--colour-text-muted);
    text-transform: uppercase; letter-spacing: 0.06em;
    margin: 0 0 var(--space-2);
  }
  .xpm-vehicle-list { display: flex; flex-direction: column; gap: 6px; }
  .xpm-vehicle-row {
    display: flex; flex-direction: column; gap: 2px; text-align: left;
    padding: var(--space-3) var(--space-4);
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-sm);
    background: none; cursor: none;
    transition: border-color 0.2s, background 0.2s;
  }
  .xpm-vehicle-row:hover { border-color: var(--colour-accent); background: rgba(108,99,255,0.04); }
  .xpm-vehicle-row--active { border-color: var(--colour-accent); background: rgba(108,99,255,0.08); }
  .xpm-vehicle-reg { font-size: var(--text-sm); font-weight: var(--weight-medium); color: var(--colour-text); letter-spacing: 0.04em; }
  .xpm-vehicle-reg--fleet { color: var(--colour-accent); }
  .xpm-vehicle-desc { font-size: var(--text-xs); color: var(--colour-text-muted); }
  .xpm-type-grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-2); }
  .xpm-type-btn {
    padding: var(--space-2) var(--space-3); font-size: var(--text-sm);
    border: 1px solid var(--colour-border); border-radius: var(--radius-sm);
    background: none; color: var(--colour-text-muted); cursor: none;
    transition: border-color 0.2s, color 0.2s, background 0.2s; text-align: left;
  }
  .xpm-type-btn:hover { border-color: var(--colour-accent); color: var(--colour-text); }
  .xpm-type-btn--active { border-color: var(--colour-accent); background: rgba(108,99,255,0.08); color: var(--colour-text); }
  .xpm-error { font-size: var(--text-sm); color: var(--colour-error); margin-top: var(--space-3); }
  .xpm-footer {
    display: flex; gap: var(--space-3); justify-content: flex-end;
    padding: var(--space-4) var(--space-5);
    border-top: 0.5px solid var(--colour-border); flex-shrink: 0;
  }

  /* ---- Export pair: two columns on large screens ---- */
  .rpt-export-pair {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-5);
    align-items: start;
  }
  .rpt-export-col { height: 100%; }
  .rpt-export-card { height: 100%; box-sizing: border-box; }

  /* ---- Year select + title row ---- */
  .rpt-title-row {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }
  .rpt-year-select {
    appearance: none;
    background: var(--colour-surface);
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-sm);
    color: var(--colour-text);
    font-size: var(--text-sm);
    font-family: inherit;
    padding: 4px 28px 4px 10px;
    cursor: none;
    transition: border-color 0.2s;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23888'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 9px center;
  }
  .rpt-year-select:hover { border-color: var(--colour-accent); }
  .rpt-year-select:focus { outline: none; border-color: var(--colour-accent); }

  /* ---- Responsive ---- */
  @media (max-width: 767px) {
    .rpt-stats { grid-template-columns: repeat(2, 1fr); }
    .rpt-chart { height: 100px; }
    .rpt-bar-amount { display: none; }
    .rpt-row { flex-direction: column; align-items: flex-start; }
    .rpt-row__right { align-items: flex-start; }
    .rpt-export-pair { grid-template-columns: 1fr; }
  }
`;
