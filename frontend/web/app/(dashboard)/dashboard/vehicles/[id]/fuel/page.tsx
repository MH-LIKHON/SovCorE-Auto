// ============================================================
// frontend/web/app/(dashboard)/dashboard/vehicles/[id]/fuel/page.tsx
// ============================================================
//
// Purpose:
//   Fuel module page for a vehicle. Shows analytics (total fills,
//   total litres, total spend, avg MPG, cost per mile) and a
//   chronological fill log.
//
// Design:
//   Analytics data comes from the fuel analytics endpoint which
//   computes MPG from consecutive full-tank fills. The fill log
//   is included in the same response, ordered newest first.
//
//   The monthly spend section renders a 12-month bar chart using
//   pure CSS proportional widths — no charting library. Each bar
//   is a flex child whose height is set inline as a percentage of
//   the month with the highest spend.
//
//   Mirrors SovCorE QR card and list patterns exactly: rec-shell,
//   Card, rec-btn, rec-row CSS classes, cursor: none on interactive
//   elements.
//
// Consumed by:
//   - Routed at /dashboard/vehicles/[id]/fuel
// ============================================================

"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { Card } from "@/src/components/ui/card";
import { apiFetch, getAccountId } from "@/src/lib/api/fetch";

// ==================================================
// TYPES
// ==================================================

interface FuelFill {
  record_id: string;
  date: string;
  mileage: number | null;
  litres: string;
  price_per_litre_pence: number;
  station: string | null;
  full_tank: boolean;
  cost_pence: number | null;
}

interface MonthlySpend {
  month: string;
  total_pence: number;
}

interface FuelAnalytics {
  total_fills: number;
  full_tank_fills: number;
  total_litres: string;
  total_spend_pence: number;
  annual_spend_pence: number;
  monthly_spend: MonthlySpend[];
  avg_mpg: number | null;
  cost_per_mile_pence: number | null;
  fills: FuelFill[];
  oldest_year: number;
}

// ==================================================
// HELPERS
// ==================================================

function formatGBP(pence: number | null): string {
  if (pence === null) return "-";
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(pence / 100);
}

function formatDate(d: string | null): string {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function formatMonthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}

// ==================================================
// YEAR CONSTANTS
// ==================================================

const CURRENT_YEAR = new Date().getFullYear();

// ==================================================
// PAGE
// ==================================================

export default function FuelPage() {
  const { id } = useParams<{ id: string }>();
  const accountId = getAccountId() ?? "";

  const [analytics, setAnalytics] = useState<FuelAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(CURRENT_YEAR);

  const yearOptions = useMemo(() => {
    const oldest = analytics?.oldest_year ?? CURRENT_YEAR;
    return Array.from({ length: CURRENT_YEAR - oldest + 1 }, (_, i) => CURRENT_YEAR - i);
  }, [analytics]);

  // ==================================================
  // DATA LOADING
  // ==================================================

  useEffect(() => {
    if (!accountId || !id) return;
    (async () => {
      setLoading(true);
      const res = await apiFetch(
        `/api/v1/accounts/${accountId}/vehicles/${id}/fuel/analytics?year=${year}`
      );
      if (res.ok) {
        const data: FuelAnalytics = await res.json();
        setAnalytics(data);
      }
      setLoading(false);
    })();
  }, [accountId, id, year]); // eslint-disable-line react-hooks/exhaustive-deps

  // ==================================================
  // DERIVED VALUES
  // ==================================================

  const maxMonthlyPence = analytics
    ? Math.max(...analytics.monthly_spend.map((m) => m.total_pence), 1)
    : 1;

  const monthlyAvg = analytics
    ? Math.round(analytics.annual_spend_pence / (year === CURRENT_YEAR ? Math.max(new Date().getMonth() + 1, 1) : 12))
    : 0;

  // ==================================================
  // RENDER
  // ==================================================

  return (
    <div className="rec-shell">
      {/* ---- Header ---- */}
      <header className="rec-head">
        <div className="rec-head__row">
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
              <h1 className="rec-title">Fuel</h1>
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
            <p className="rec-sub">Fill history, economy, and running fuel costs for this vehicle.</p>
          </div>
          <Link href={`/dashboard/vehicles/${id}/records?type=fuel`} className="rec-btn rec-btn--primary">
            Add fuel record
          </Link>
        </div>
      </header>

      {loading && <div className="rec-skeleton" />}

      {!loading && (!analytics || analytics.total_fills === 0) && (
        <Card>
          <div className="rec-empty">
            <p>No fuel records yet. Add a fuel record to see analytics here.</p>
            <Link href={`/dashboard/vehicles/${id}/records?type=fuel`} className="rec-btn rec-btn--primary">
              Add fuel record
            </Link>
          </div>
        </Card>
      )}

      {!loading && analytics && analytics.total_fills > 0 && (
        <>
          {/* ---- Analytics stats row ---- */}
          <Card style={{ overflow: "visible" }}>
            <h2 className="rec-section-title">Analytics</h2>
            <div className="fuel-stats">

              <Card className="fuel-stat" padding="var(--space-4)" hoverEffect="glow">
                <span className="fuel-stat__value">
                  {analytics.cost_per_mile_pence !== null
                    ? `${analytics.cost_per_mile_pence}p / mi`
                    : "-"}
                </span>
                <span className="fuel-stat__label">Cost per mile</span>
              </Card>

              <Card className="fuel-stat" padding="var(--space-4)" hoverEffect="glow">
                <span className="fuel-stat__value">
                  {analytics.avg_mpg !== null ? `${analytics.avg_mpg} mpg` : "-"}
                </span>
                <span className="fuel-stat__label">Avg economy</span>
              </Card>

              <Card className="fuel-stat" padding="var(--space-4)" hoverEffect="glow">
                <span className="fuel-stat__value">{formatGBP(monthlyAvg)}</span>
                <span className="fuel-stat__label">Monthly avg</span>
              </Card>

              <Card className="fuel-stat" padding="var(--space-4)" hoverEffect="glow">
                <span className="fuel-stat__value">{formatGBP(analytics.annual_spend_pence)}</span>
                <span className="fuel-stat__label">{year}</span>
              </Card>

              <Card className="fuel-stat" padding="var(--space-4)" hoverEffect="glow">
                <span className="fuel-stat__value">{formatGBP(analytics.total_spend_pence)}</span>
                <span className="fuel-stat__label">Total spend</span>
              </Card>

            </div>

            {analytics.avg_mpg === null && (
              <p className="fuel-mpg-note">
                Average MPG requires at least two consecutive full-tank fills with mileage recorded.
              </p>
            )}
          </Card>

          {/* ---- Monthly spend chart ---- */}
          <Card>
            <h2 className="rec-section-title">Monthly spend, {year}</h2>
            <div className="fuel-chart">
              {analytics.monthly_spend.map((m) => (
                <div key={m.month} className="fuel-bar-col">
                  <span className="fuel-bar-amount">
                    {m.total_pence > 0 ? formatGBP(m.total_pence) : ""}
                  </span>
                  <div className="fuel-bar-track">
                    <div
                      className="fuel-bar-fill"
                      style={{
                        height: `${Math.round((m.total_pence / maxMonthlyPence) * 100)}%`,
                      }}
                    />
                  </div>
                  <span className="fuel-bar-label">
                    {formatMonthLabel(m.month).split(" ")[0]}
                  </span>
                </div>
              ))}
            </div>
          </Card>

          {/* ---- Fill log ---- */}
          <Card>
            <div className="rec-list-head">
              <h2 className="rec-section-title" style={{ margin: 0 }}>Fill log</h2>
              <span className="rec-count">
                {analytics.total_fills} fill{analytics.total_fills !== 1 ? "s" : ""}
              </span>
            </div>
            <div className="rec-rows">
              {analytics.fills.map((fill) => (
                <div key={fill.record_id} className="fuel-row">
                  <div className="fuel-row__left">
                    <span className="fuel-row__date">{formatDate(fill.date)}</span>
                    {fill.station && <span className="fuel-row__station">{fill.station}</span>}
                  </div>
                  <div className="fuel-row__right">
                    <span className="fuel-row__litres">{Number(fill.litres).toFixed(3)} L</span>
                    <span className="fuel-row__ppl">{fill.price_per_litre_pence}p/L</span>
                    {fill.cost_pence !== null && (
                      <span className="fuel-row__cost">{formatGBP(fill.cost_pence)}</span>
                    )}
                    {fill.mileage !== null && (
                      <span className="fuel-row__mileage">
                        {fill.mileage.toLocaleString("en-GB")} mi
                      </span>
                    )}
                    <span className={fill.full_tank ? "fuel-badge fuel-badge--full" : "fuel-badge fuel-badge--part"}>
                      {fill.full_tank ? "Full" : "Part"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}

      <style>{FUEL_STYLES}</style>
    </div>
  );
}

// ==================================================
// STYLES — mirrors SovCorE QR card and list patterns
// ==================================================

const FUEL_STYLES = `
  /* ---- Stats row ---- */
  .fuel-stats {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: var(--space-4);
  }
  .fuel-stat {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .fuel-stat__value {
    font-size: var(--text-xl);
    font-weight: var(--weight-semibold);
    letter-spacing: var(--tracking-tight);
  }
  .fuel-stat__label {
    font-size: var(--text-xs);
    color: var(--colour-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin-top: 4px;
  }
  .fuel-mpg-note {
    font-size: var(--text-xs);
    color: var(--colour-text-muted);
    margin-top: var(--space-4);
    padding-top: var(--space-4);
    border-top: 0.5px solid var(--colour-border);
  }

  /* ---- Monthly bar chart (pure CSS, no library) ---- */
  .fuel-chart {
    display: flex;
    align-items: flex-end;
    gap: var(--space-2);
    height: 140px;
  }
  .fuel-bar-col {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    height: 100%;
    justify-content: flex-end;
  }
  .fuel-bar-amount {
    font-size: 9px;
    color: var(--colour-text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
    text-align: center;
    transition: transform 0.2s ease;
  }
  .fuel-bar-col:hover .fuel-bar-amount { transform: translateY(-6px); }
  .fuel-bar-track {
    width: 100%;
    flex: 1;
    display: flex;
    align-items: flex-end;
    background: rgba(255,255,255,0.03);
    border-radius: var(--radius-sm) var(--radius-sm) 0 0;
  }
  .fuel-bar-col { cursor: default; }
  .fuel-bar-fill {
    width: 100%;
    background: rgba(108,99,255,0.5);
    border-radius: var(--radius-sm) var(--radius-sm) 0 0;
    min-height: 4px;
    transition: height 0.3s ease, transform 0.2s ease, background 0.2s;
    transform-origin: bottom center;
  }
  .fuel-bar-col:hover .fuel-bar-fill {
    transform: scaleY(1.12);
    background: rgba(0,212,255,0.7);
  }
  .fuel-bar-label {
    font-size: 9px;
    color: var(--colour-text-muted);
    text-align: center;
    white-space: nowrap;
  }

  /* ---- Fill log rows ---- */
  .fuel-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    border-bottom: 0.5px solid var(--colour-border);
    flex-wrap: wrap;
  }
  .fuel-row:last-child { border-bottom: none; }
  .fuel-row__left { display: flex; align-items: center; gap: var(--space-3); }
  .fuel-row__right { display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap; flex-shrink: 0; }
  .fuel-row__date { font-size: var(--text-sm); color: var(--colour-text-muted); white-space: nowrap; }
  .fuel-row__station { font-size: var(--text-sm); color: var(--colour-text); }
  .fuel-row__litres { font-size: var(--text-sm); color: var(--colour-text); font-variant-numeric: tabular-nums; }
  .fuel-row__ppl { font-size: var(--text-xs); color: var(--colour-text-muted); }
  .fuel-row__cost { font-size: var(--text-sm); font-weight: var(--weight-medium); color: var(--colour-text); }
  .fuel-row__mileage { font-size: var(--text-xs); color: var(--colour-text-muted); }

  /* ---- Fill type badge ---- */
  .fuel-badge {
    font-size: var(--text-xs);
    padding: 2px 8px;
    border-radius: var(--radius-full, 999px);
    border: 1px solid;
    white-space: nowrap;
  }
  .fuel-badge--full {
    color: #4ade80;
    border-color: rgba(74,222,128,0.3);
    background: rgba(74,222,128,0.08);
  }
  .fuel-badge--part {
    color: var(--colour-text-muted);
    border-color: var(--colour-border);
    background: none;
  }

  /* ---- Year select (shared style) ---- */
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
    .fuel-stats { grid-template-columns: repeat(2, 1fr); }
    .fuel-stats > :last-child { grid-column: 1 / -1; }
    .fuel-chart { height: 100px; }
    .fuel-bar-amount { display: none; }
    .fuel-row { flex-direction: column; align-items: flex-start; }
    .fuel-row__right { flex-wrap: wrap; }
  }
`;
