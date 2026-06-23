// ============================================================
// frontend/web/app/(dashboard)/dashboard/vehicles/[id]/expenses/page.tsx
// ============================================================
//
// Purpose:
//   Running-costs page for a vehicle. Shows total and annual
//   spend, a by-category breakdown, and a 12-month bar chart.
//
// Design:
//   Data comes from a single GET /expenses endpoint that
//   aggregates existing records of expense types (insurance,
//   tax, MOT, parking, cleaning, accessories, repairs, other).
//   Fuel is excluded here; it has its own dedicated page.
//
//   The by-category breakdown uses the same stat card pattern
//   as the fuel analytics page. The monthly bar chart is a
//   pure-CSS proportional-height bar chart, no library.
//
//   Adding expenses is done through the records page (the records
//   endpoint accepts all types including expense types), so there
//   is no inline add form here.
//
// Consumed by:
//   - Routed at /dashboard/vehicles/[id]/expenses
// ============================================================

"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { Card } from "@/src/components/ui/card";
import { apiFetch, getAccountId } from "@/src/lib/api/fetch";

// ==================================================
// TYPES
// ==================================================

interface CategoryTotal {
  record_type: string;
  label: string;
  total_pence: number;
  count: number;
}

interface MonthlyTotal {
  month: string;
  total_pence: number;
}

interface ExpenseAnalytics {
  total_spend_pence: number;
  annual_spend_pence: number;
  by_category: CategoryTotal[];
  monthly: MonthlyTotal[];
}

// ==================================================
// HELPERS
// ==================================================

function formatGBP(pence: number): string {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(pence / 100);
}

function formatMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}

// ==================================================
// PAGE
// ==================================================

export default function ExpensesPage() {
  const { id } = useParams<{ id: string }>();
  const accountId = getAccountId() ?? "";

  const [analytics, setAnalytics] = useState<ExpenseAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  // ==================================================
  // DATA LOADING
  // ==================================================

  useEffect(() => {
    if (!accountId || !id) return;
    (async () => {
      setLoading(true);
      const res = await apiFetch(
        `/api/v1/accounts/${accountId}/vehicles/${id}/expenses`
      );
      if (res.ok) {
        const data: ExpenseAnalytics = await res.json();
        setAnalytics(data);
      }
      setLoading(false);
    })();
  }, [accountId, id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ==================================================
  // DERIVED VALUES
  // ==================================================

  const maxMonthlyPence = analytics
    ? Math.max(...analytics.monthly.map((m) => m.total_pence), 1)
    : 1;

  const hasExpenses = analytics && analytics.total_spend_pence > 0;

  // ==================================================
  // RENDER
  // ==================================================

  return (
    <div className="rec-shell">
      {/* ---- Header ---- */}
      <header className="rec-head">
        <Link href={`/dashboard/vehicles/${id}`} className="rec-back">← Vehicle</Link>
        <div className="rec-head__row">
          <div>
            <h1 className="rec-title">Expenses</h1>
            <p className="rec-sub">Running costs by category for this vehicle. Fuel is tracked separately.</p>
          </div>
          <Link href={`/dashboard/vehicles/${id}/records`} className="rec-btn rec-btn--ghost">
            Add expense record
          </Link>
        </div>
      </header>

      {loading && <div className="rec-skeleton" />}

      {!loading && !hasExpenses && (
        <Card>
          <div className="rec-empty">
            <p>No expense records yet. Add insurance, tax, parking or other cost records to see a breakdown here.</p>
            <Link href={`/dashboard/vehicles/${id}/records`} className="rec-btn rec-btn--primary">
              Add expense record
            </Link>
          </div>
        </Card>
      )}

      {!loading && hasExpenses && analytics && (
        <>
          {/* ---- Summary totals ---- */}
          <Card>
            <h2 className="rec-section-title">Summary</h2>
            <div className="fuel-stats">
              <div className="fuel-stat">
                <span className="fuel-stat__value">{formatGBP(analytics.total_spend_pence)}</span>
                <span className="fuel-stat__label">Total spend</span>
              </div>
              <div className="fuel-stat">
                <span className="fuel-stat__value">{formatGBP(analytics.annual_spend_pence)}</span>
                <span className="fuel-stat__label">This year</span>
              </div>
              <div className="fuel-stat">
                <span className="fuel-stat__value">
                  {analytics.by_category.reduce((s, c) => s + c.count, 0)}
                </span>
                <span className="fuel-stat__label">Total records</span>
              </div>
            </div>
          </Card>

          {/* ---- By-category breakdown ---- */}
          <Card>
            <h2 className="rec-section-title">By category</h2>
            <div className="exp-cat-list">
              {analytics.by_category.map((cat) => (
                <div key={cat.record_type} className="exp-cat-row">
                  <div className="exp-cat-row__left">
                    <span className="exp-cat-row__label">{cat.label}</span>
                    <span className="exp-cat-row__count">{cat.count} record{cat.count !== 1 ? "s" : ""}</span>
                  </div>
                  <span className="exp-cat-row__total">{formatGBP(cat.total_pence)}</span>
                </div>
              ))}
            </div>
          </Card>

          {/* ---- Monthly bar chart ---- */}
          <Card>
            <h2 className="rec-section-title">Monthly spend — last 12 months</h2>
            <div className="fuel-chart">
              {analytics.monthly.map((m) => (
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
                    {formatMonth(m.month).split(" ")[0]}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}

      <style>{EXP_STYLES}</style>
    </div>
  );
}

// ==================================================
// STYLES
// ==================================================

const EXP_STYLES = `
  /* ---- Category breakdown ---- */
  .exp-cat-list { display: flex; flex-direction: column; gap: 0; }
  .exp-cat-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
    padding: var(--space-3) 0;
    border-bottom: 0.5px solid var(--colour-border);
  }
  .exp-cat-row:last-child { border-bottom: none; }
  .exp-cat-row__left { display: flex; flex-direction: column; gap: 2px; }
  .exp-cat-row__label { font-size: var(--text-sm); color: var(--colour-text); }
  .exp-cat-row__count { font-size: var(--text-xs); color: var(--colour-text-muted); }
  .exp-cat-row__total { font-size: var(--text-sm); font-weight: var(--weight-medium); color: var(--colour-text); white-space: nowrap; }

  /* ---- Shared with fuel page (bar chart, stats) ---- */
  .fuel-stats {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: var(--space-4);
  }
  .fuel-stat {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: var(--space-4);
    border: 0.5px solid var(--colour-border);
    border-radius: var(--radius-md);
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
  }
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
  }
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
    background: rgba(108,99,255,0.5);
    border-radius: var(--radius-sm) var(--radius-sm) 0 0;
    min-height: 4px;
    transition: height 0.3s ease;
  }
  .fuel-bar-label {
    font-size: 9px;
    color: var(--colour-text-muted);
    text-align: center;
    white-space: nowrap;
  }

  @media (max-width: 767px) {
    .fuel-stats { grid-template-columns: repeat(2, 1fr); }
    .fuel-chart { height: 100px; }
    .fuel-bar-amount { display: none; }
  }
`;
