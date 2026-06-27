// ============================================================
// frontend/web/app/(dashboard)/dashboard/vehicles/[id]/mileage/page.tsx
// ============================================================
//
// Purpose:
//   Odometer analytics page for a vehicle. Shows five summary cards
//   (current odometer, this year's distance, monthly average, last
//   logged, total readings) and a monthly bar chart of miles driven,
//   plus a chronological log of all odometer readings across record types.
//
// Design:
//   Mirrors the fuel analytics page (fuel/page.tsx) exactly —
//   same Card shells, same CSS class conventions, same pure-CSS
//   bar chart pattern, same responsive grid. No chart library.
//
//   Any record with an odometer value feeds this page (fuel fills,
//   repairs, dedicated odometer logs, etc.). The "Log odometer" button
//   links to records with ?type=odometer pre-selected.
//
// Consumed by:
//   - Routed at /dashboard/vehicles/[id]/mileage
// ============================================================

"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { Card } from "@/src/components/ui/card";
import { apiFetch, getAccountId } from "@/src/lib/api/fetch";
import { formatDate, formatMiles, formatMonth } from "@/src/lib/format";

// ==================================================
// TYPES
// ==================================================

interface MonthlyMileage {
  month: string;              // "YYYY-MM"
  odometer: number;
  miles_this_month: number | null;
}

interface MileageAnalytics {
  total_logs: number;
  current_mileage: number | null;
  annual_mileage: number | null;
  monthly_avg: number | null;
  last_logged_date: string | null;
  monthly_history: MonthlyMileage[];
  oldest_year: number;
}


// ==================================================
// YEAR CONSTANTS
// ==================================================

const CURRENT_YEAR = new Date().getFullYear();

// ==================================================
// PAGE
// ==================================================

export default function MileagePage() {
  const { id } = useParams<{ id: string }>();
  const accountId = getAccountId() ?? "";

  const [analytics, setAnalytics] = useState<MileageAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(CURRENT_YEAR);

  // ==================================================
  // DATA LOADING
  // ==================================================

  const yearOptions = useMemo(() => {
    const oldest = analytics?.oldest_year ?? CURRENT_YEAR;
    return Array.from(
      { length: CURRENT_YEAR - oldest + 1 },
      (_, i) => CURRENT_YEAR - i
    );
  }, [analytics]);

  useEffect(() => {
    if (!accountId || !id) return;
    (async () => {
      setLoading(true);
      const aRes = await apiFetch(
        `/api/v1/accounts/${accountId}/vehicles/${id}/mileage/analytics?year=${year}`
      );
      if (aRes.ok) setAnalytics(await aRes.json());
      setLoading(false);
    })();
  }, [accountId, id, year]);

  // ==================================================
  // DERIVED VALUES
  // ==================================================

  const maxMonthlyMiles = analytics
    ? Math.max(...analytics.monthly_history.map((m) => m.miles_this_month ?? 0), 1)
    : 1;

  // Only render months for the selected year in the chart.
  const chartMonths = analytics?.monthly_history.filter((m) =>
    m.month.startsWith(String(year))
  ) ?? [];

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
              <h1 className="rec-title">Odometer</h1>
              <select
                className="rpt-year-select"
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
            <p className="rec-sub">
              Odometer readings from all records, annual distance, and monthly trends for this vehicle.
            </p>
          </div>
          <Link
            href={`/dashboard/vehicles/${id}/records?type=odometer`}
            className="rec-btn rec-btn--primary rec-btn--icon"
            title="Log mileage"
          >
            +
          </Link>
        </div>
      </header>

      {loading && <div className="rec-skeleton" />}

      {!loading && (!analytics || analytics.total_logs === 0) && (
        <Card>
          <div className="rec-empty">
            <p>No odometer readings yet. Add any record with an odometer value to start tracking here.</p>
          </div>
        </Card>
      )}

      {!loading && analytics && analytics.total_logs > 0 && (
        <>
          {/* ---- Analytics stats row ---- */}
          <Card style={{ overflow: "visible" }}>
            <h2 className="rec-section-title">Analytics</h2>
            <div className="fuel-stats">

              <Card className="fuel-stat" padding="var(--space-4)" hoverEffect="glow">
                <span className="fuel-stat__value">{formatMiles(analytics.current_mileage)}</span>
                <span className="fuel-stat__label">Current odometer</span>
              </Card>

              <Card className="fuel-stat" padding="var(--space-4)" hoverEffect="glow">
                <span className="fuel-stat__value">{formatMiles(analytics.annual_mileage)}</span>
                <span className="fuel-stat__label">{year}</span>
              </Card>

              <Card className="fuel-stat" padding="var(--space-4)" hoverEffect="glow">
                <span className="fuel-stat__value">{formatMiles(analytics.monthly_avg)}</span>
                <span className="fuel-stat__label">Monthly avg</span>
              </Card>

              <Card className="fuel-stat" padding="var(--space-4)" hoverEffect="glow">
                <span className="fuel-stat__value">{formatDate(analytics.last_logged_date)}</span>
                <span className="fuel-stat__label">Last logged</span>
              </Card>

              <Card className="fuel-stat" padding="var(--space-4)" hoverEffect="glow">
                <span className="fuel-stat__value">{analytics.total_logs}</span>
                <span className="fuel-stat__label">
                  Reading{analytics.total_logs !== 1 ? "s" : ""}
                </span>
              </Card>

            </div>
          </Card>

          {/* ---- Monthly mileage chart ---- */}
          <Card>
            <h2 className="rec-section-title">Monthly odometer, {year}</h2>
            {chartMonths.length === 0 ? (
              <p style={{ fontSize: "var(--text-sm)", color: "var(--colour-text-muted)" }}>
                No odometer readings recorded in {year}.
              </p>
            ) : (
              <div className="fuel-chart">
                {chartMonths.map((m) => (
                  <div key={m.month} className="fuel-bar-col">
                    <span className="fuel-bar-amount">
                      {m.miles_this_month != null && m.miles_this_month > 0
                        ? m.miles_this_month.toLocaleString("en-GB")
                        : ""}
                    </span>
                    <div className="fuel-bar-track">
                      <div
                        className="fuel-bar-fill"
                        style={{
                          height: `${
                            m.miles_this_month != null
                              ? Math.round((m.miles_this_month / maxMonthlyMiles) * 100)
                              : 0
                          }%`,
                        }}
                      />
                    </div>
                    <span className="fuel-bar-label">
                      {formatMonth(m.month).split(" ")[0]}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* ---- Odometer log ---- */}
          <Card>
            <div className="rec-list-head">
              <h2 className="rec-section-title" style={{ margin: 0 }}>Odometer history</h2>
              <span className="rec-count">
                {analytics.total_logs} reading{analytics.total_logs !== 1 ? "s" : ""}
              </span>
            </div>
            <div className="rec-rows">
              {[...analytics.monthly_history].reverse().map((m) => (
                <div key={m.month} className="mil-row">
                  <div className="mil-row__left">
                    <span className="mil-row__month">{formatMonth(m.month)}</span>
                  </div>
                  <div className="mil-row__right">
                    <span className="mil-row__odo">{m.odometer.toLocaleString("en-GB")} mi</span>
                    {m.miles_this_month != null ? (
                      <span className="mil-row__delta">
                        +{m.miles_this_month.toLocaleString("en-GB")} mi
                      </span>
                    ) : (
                      <span className="mil-row__delta mil-row__delta--first">First log</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}


      <style>{MILEAGE_STYLES}</style>
    </div>
  );
}

// ==================================================
// STYLES — mirrors fuel/page.tsx patterns exactly
// ==================================================

const MILEAGE_STYLES = `
  /* ---- Stats row (reuse fuel-stats classes) ---- */
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

  /* ---- Bar chart (reuse fuel-chart classes) ---- */
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
    cursor: default;
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
  .fuel-bar-fill {
    width: 100%;
    background: rgba(0,212,170,0.5);
    border-radius: var(--radius-sm) var(--radius-sm) 0 0;
    min-height: 4px;
    transition: height 0.3s ease, transform 0.2s ease, background 0.2s;
    transform-origin: bottom center;
  }
  .fuel-bar-col:hover .fuel-bar-fill {
    transform: scaleY(1.12);
    background: rgba(0,212,170,0.85);
  }
  .fuel-bar-label {
    font-size: 9px;
    color: var(--colour-text-muted);
    text-align: center;
    white-space: nowrap;
  }

  /* ---- Odometer log rows ---- */
  .mil-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    border-bottom: 0.5px solid var(--colour-border);
  }
  .mil-row:last-child { border-bottom: none; }
  .mil-row__left { display: flex; align-items: center; gap: var(--space-3); }
  .mil-row__right { display: flex; align-items: center; gap: var(--space-4); flex-shrink: 0; }
  .mil-row__month { font-size: var(--text-sm); color: var(--colour-text-muted); }
  .mil-row__odo {
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    color: var(--colour-text);
    font-variant-numeric: tabular-nums;
  }
  .mil-row__delta {
    font-size: var(--text-xs);
    color: var(--colour-teal);
    font-variant-numeric: tabular-nums;
  }
  .mil-row__delta--first { color: var(--colour-text-muted); }

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
    .mil-row { flex-direction: column; align-items: flex-start; }
  }
`;
