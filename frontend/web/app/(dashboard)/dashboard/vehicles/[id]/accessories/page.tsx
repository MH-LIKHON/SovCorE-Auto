// ============================================================
// frontend/web/app/(dashboard)/dashboard/vehicles/[id]/accessories/page.tsx
// ============================================================
//
// Purpose:
//   Analytics page for accessories records on a vehicle.
//
// Consumed by:
//   - Routed at /dashboard/vehicles/[id]/accessories
// ============================================================

"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { Card } from "@/src/components/ui/card";
import { apiFetch, getAccountId } from "@/src/lib/api/fetch";
import { formatDate, formatGBP, formatMonth } from "@/src/lib/format";

interface RecordItem {
  id: string;
  date: string;
  mileage: number | null;
  cost: number | null;
  supplier: string | null;
  garage: string | null;
  notes: string | null;
}

const CURRENT_YEAR = new Date().getFullYear();

function buildMonths(records: RecordItem[], year: number) {
  return Array.from({ length: 12 }, (_, i) => {
    const key = `${year}-${String(i + 1).padStart(2, "0")}`;
    const total = records.filter((r) => r.date.startsWith(key)).reduce((s, r) => s + (r.cost ?? 0), 0);
    return { month: key, total };
  });
}

export default function AccessoriesPage() {
  const { id }    = useParams<{ id: string }>();
  const accountId = getAccountId() ?? "";

  const [records, setRecords] = useState<RecordItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [year, setYear]       = useState(CURRENT_YEAR);

  useEffect(() => {
    if (!accountId || !id) return;
    (async () => {
      setLoading(true);
      const res = await apiFetch(`/api/v1/accounts/${accountId}/vehicles/${id}/records?type=accessories&page_size=200`);
      if (res.ok) setRecords((await res.json()).items ?? []);
      setLoading(false);
    })();
  }, [accountId, id]);

  const yearRecords  = useMemo(() => records.filter((r) => r.date.startsWith(`${year}-`)), [records, year]);
  const monthly      = useMemo(() => buildMonths(records, year), [records, year]);
  const totalSpend   = useMemo(() => records.reduce((s, r) => s + (r.cost ?? 0), 0), [records]);
  const annualSpend  = useMemo(() => yearRecords.reduce((s, r) => s + (r.cost ?? 0), 0), [yearRecords]);
  const count        = yearRecords.length;
  const avgCost      = count > 0 ? Math.round(annualSpend / count) : 0;
  const thisMonthKey = `${year}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
  const thisMonth    = monthly.find((m) => m.month === thisMonthKey)?.total ?? 0;
  const maxMonthly   = Math.max(...monthly.map((m) => m.total), 1);
  const oldestYear   = records.length > 0 ? Math.min(...records.map((r) => parseInt(r.date.slice(0, 4)))) : CURRENT_YEAR;
  const yearOptions  = Array.from({ length: CURRENT_YEAR - oldestYear + 1 }, (_, i) => CURRENT_YEAR - i);
  const hasData      = totalSpend > 0 || records.length > 0;

  return (
    <div className="rec-shell">
      <header className="rec-head">
        <div className="rec-head__row">
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
              <h1 className="rec-title">Accessories</h1>
              <select className="rpt-year-select" value={year} onChange={(e) => setYear(Number(e.target.value))}>
                {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <p className="rec-sub">Accessories and add-ons fitted to this vehicle.</p>
          </div>
          <Link href={`/dashboard/vehicles/${id}/records?type=accessories`} className="rec-btn rec-btn--primary rec-btn--icon" title="Add record">+</Link>
        </div>
      </header>

      {loading && <div className="rec-skeleton" />}

      {!loading && !hasData && (
        <Card><div className="rec-empty"><p>No accessories records yet. Add records via the Records page.</p></div></Card>
      )}

      {!loading && hasData && (
        <>
          <Card style={{ overflow: "visible" }}>
            <h2 className="rec-section-title">Summary</h2>
            <div className="fuel-stats">
              <Card className="fuel-stat" padding="var(--space-4)" hoverEffect="glow">
                <span className="fuel-stat__value">{formatGBP(thisMonth)}</span>
                <span className="fuel-stat__label">This month</span>
              </Card>
              <Card className="fuel-stat" padding="var(--space-4)" hoverEffect="glow">
                <span className="fuel-stat__value">{count}</span>
                <span className="fuel-stat__label">Records ({year})</span>
              </Card>
              <Card className="fuel-stat" padding="var(--space-4)" hoverEffect="glow">
                <span className="fuel-stat__value">{count > 0 ? formatGBP(avgCost) : "-"}</span>
                <span className="fuel-stat__label">Avg per record</span>
              </Card>
              <Card className="fuel-stat" padding="var(--space-4)" hoverEffect="glow">
                <span className="fuel-stat__value">{formatGBP(annualSpend)}</span>
                <span className="fuel-stat__label">{year}</span>
              </Card>
              <Card className="fuel-stat" padding="var(--space-4)" hoverEffect="glow">
                <span className="fuel-stat__value">{formatGBP(totalSpend)}</span>
                <span className="fuel-stat__label">Total spend</span>
              </Card>
            </div>
          </Card>

          <Card>
            <h2 className="rec-section-title">Monthly spend, {year}</h2>
            <div className="fuel-chart">
              {monthly.map((m) => (
                <div key={m.month} className="fuel-bar-col">
                  <span className="fuel-bar-amount">{m.total > 0 ? formatGBP(m.total) : ""}</span>
                  <div className="fuel-bar-track">
                    <div className="fuel-bar-fill" style={{ height: `${Math.round((m.total / maxMonthly) * 100)}%` }} />
                  </div>
                  <span className="fuel-bar-label">{formatMonth(m.month).split(" ")[0]}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <div className="rec-list-head">
              <h2 className="rec-section-title" style={{ margin: 0 }}>Records</h2>
              <span className="rec-count">{count} record{count !== 1 ? "s" : ""} in {year} · {records.length} total</span>
            </div>
            <div className="an-rec-list">
              {yearRecords.length === 0 && <p style={{ color: "var(--colour-text-muted)", fontSize: "var(--text-sm)" }}>No records for {year}.</p>}
              {yearRecords.map((r) => (
                <div key={r.id} className="an-rec-row">
                  <span className="an-rec-date">{formatDate(r.date)}</span>
                  <span className="an-rec-meta">{r.garage ?? r.supplier ?? "-"}</span>
                  <span className="an-rec-cost">{r.cost !== null ? formatGBP(r.cost) : "-"}</span>
                  {r.notes && <span className="an-rec-notes">{r.notes}</span>}
                </div>
              ))}
            </div>
          </Card>
        </>
      )}

      <style>{AN_STYLES}</style>
    </div>
  );
}

const AN_STYLES = `
  .fuel-stats { display: grid; grid-template-columns: repeat(5, 1fr); gap: var(--space-4); }
  .fuel-stat { display: flex; flex-direction: column; min-width: 0; }
  .fuel-stat__value { font-size: var(--text-xl); font-weight: var(--weight-semibold); letter-spacing: var(--tracking-tight); }
  .fuel-stat__label { font-size: var(--text-xs); color: var(--colour-text-muted); text-transform: uppercase; letter-spacing: 0.06em; margin-top: 4px; }
  .fuel-chart { display: flex; align-items: flex-end; gap: var(--space-2); height: 140px; }
  .fuel-bar-col { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px; height: 100%; justify-content: flex-end; cursor: default; }
  .fuel-bar-amount { font-size: 9px; color: var(--colour-text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; text-align: center; transition: transform 0.2s ease; }
  .fuel-bar-col:hover .fuel-bar-amount { transform: translateY(-6px); }
  .fuel-bar-track { width: 100%; flex: 1; display: flex; align-items: flex-end; background: rgba(255,255,255,0.03); border-radius: var(--radius-sm) var(--radius-sm) 0 0; }
  .fuel-bar-fill { width: 100%; background: rgba(108,99,255,0.5); border-radius: var(--radius-sm) var(--radius-sm) 0 0; min-height: 4px; transition: height 0.3s ease, transform 0.2s ease, background 0.2s; transform-origin: bottom center; }
  .fuel-bar-col:hover .fuel-bar-fill { transform: scaleY(1.12); background: rgba(0,212,255,0.7); }
  .fuel-bar-label { font-size: 9px; color: var(--colour-text-muted); text-align: center; white-space: nowrap; }
  .rpt-year-select { appearance: none; background: var(--colour-surface); border: 1px solid var(--colour-border); border-radius: var(--radius-sm); color: var(--colour-text); font-size: var(--text-sm); font-family: inherit; padding: 4px 28px 4px 10px; cursor: none; transition: border-color 0.2s; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23888'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 9px center; }
  .rpt-year-select:hover { border-color: var(--colour-accent); }
  .rpt-year-select:focus { outline: none; border-color: var(--colour-accent); }
  .an-rec-list { display: flex; flex-direction: column; gap: 0; margin-top: var(--space-3); }
  .an-rec-row { display: grid; grid-template-columns: 140px 1fr auto; align-items: baseline; gap: var(--space-4); padding: var(--space-3) 0; border-bottom: 0.5px solid var(--colour-border); }
  .an-rec-row:last-child { border-bottom: none; }
  .an-rec-date { font-size: var(--text-sm); color: var(--colour-text-muted); white-space: nowrap; }
  .an-rec-meta { font-size: var(--text-sm); color: var(--colour-text); }
  .an-rec-cost { font-size: var(--text-sm); font-weight: var(--weight-medium); color: var(--colour-text); text-align: right; white-space: nowrap; }
  .an-rec-notes { grid-column: 2 / -1; font-size: var(--text-xs); color: var(--colour-text-muted); }
  @media (max-width: 767px) {
    .fuel-stats { grid-template-columns: repeat(2, 1fr); }
    .fuel-stats > :last-child { grid-column: 1 / -1; }
    .fuel-chart { height: 100px; }
    .fuel-bar-amount { display: none; }
    .an-rec-row { grid-template-columns: 120px 1fr auto; gap: var(--space-2); }
  }
  @media (max-width: 479px) {
    .an-rec-row { grid-template-columns: 1fr auto; }
    .an-rec-date { grid-column: 1 / -1; }
  }
`;
