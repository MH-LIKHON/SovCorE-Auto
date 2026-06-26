// ============================================================
// frontend/web/app/(dashboard)/dashboard/vehicles/[id]/diagnostics/page.tsx
// ============================================================
//
// Purpose:
//   Analytics page for diagnostics records on a vehicle. Shows
//   spend summary, open fault code counts by severity, monthly bar
//   chart, and an expandable record list with inline fault code rows
//   and per-code severity update capability.
//
// Design:
//   Two API calls on mount:
//     1. Records list (lightweight, for stat cards and chart).
//     2. All diagnostic fault codes for the vehicle (for counts
//        and the expanded record rows).
//   The fault code list is merged with records by record_id in state.
//   Marking a fault code resolved calls the targeted PATCH endpoint
//   and refreshes only the fault codes state, not the full record list.
//
//   Follows the fuel-stats / fuel-chart / an-rec-row pattern exactly.
//
// Consumed by:
//   - Routed at /dashboard/vehicles/[id]/diagnostics
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

interface RecordItem {
  id: string;
  date: string;
  mileage: number | null;
  cost: number | null;
  supplier: string | null;
  garage: string | null;
  notes: string | null;
}

interface FaultCode {
  id: string;
  record_id: string;
  code: string | null;
  description: string;
  notes: string | null;
  severity: "advisory" | "amber" | "red" | "resolved";
  trigger_date: string | null;
  trigger_mileage: number | null;
  resolved_at: string | null;
  sort_order: number;
}

// ==================================================
// HELPERS
// ==================================================

function formatGBP(pence: number): string {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(pence / 100);
}
function formatDate(d: string): string {
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
function formatMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number) as [number, number];
  return new Date(y, m - 1, 1).toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}

const CURRENT_YEAR = new Date().getFullYear();

function buildMonths(records: RecordItem[], year: number) {
  return Array.from({ length: 12 }, (_, i) => {
    const key = `${year}-${String(i + 1).padStart(2, "0")}`;
    const total = records.filter((r) => r.date.startsWith(key)).reduce((s, r) => s + (r.cost ?? 0), 0);
    return { month: key, total };
  });
}

function severityLabel(s: FaultCode["severity"]): string {
  return { advisory: "Advisory", amber: "Amber", red: "Red", resolved: "Resolved" }[s];
}

// ==================================================
// PAGE
// ==================================================

export default function DiagnosticsPage() {
  const { id }    = useParams<{ id: string }>();
  const accountId = getAccountId() ?? "";

  const [records, setRecords]         = useState<RecordItem[]>([]);
  const [faultCodes, setFaultCodes]   = useState<FaultCode[]>([]);
  const [loading, setLoading]         = useState(true);
  const [year, setYear]               = useState(CURRENT_YEAR);
  const [expandedId, setExpandedId]   = useState<string | null>(null);
  const [resolving, setResolving]     = useState<string | null>(null);

  // ==================================================
  // DATA LOADING
  // ==================================================

  async function loadData() {
    if (!accountId || !id) return;
    setLoading(true);
    const [recRes, fcRes] = await Promise.all([
      apiFetch(`/api/v1/accounts/${accountId}/vehicles/${id}/records?type=diagnostics&page_size=200`),
      apiFetch(`/api/v1/accounts/${accountId}/vehicles/${id}/diagnostic-fault-codes`),
    ]);
    if (recRes.ok) setRecords((await recRes.json()).items ?? []);
    if (fcRes.ok) setFaultCodes(await fcRes.json());
    setLoading(false);
  }

  useEffect(() => { loadData().catch(() => {}); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ==================================================
  // DERIVED STATE
  // ==================================================

  const yearRecords = useMemo(() => records.filter((r) => r.date.startsWith(`${year}-`)), [records, year]);
  const monthly     = useMemo(() => buildMonths(records, year), [records, year]);
  const totalSpend  = useMemo(() => records.reduce((s, r) => s + (r.cost ?? 0), 0), [records]);
  const annualSpend = useMemo(() => yearRecords.reduce((s, r) => s + (r.cost ?? 0), 0), [yearRecords]);
  const count       = yearRecords.length;

  const thisMonthKey = `${year}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
  const thisMonth    = monthly.find((m) => m.month === thisMonthKey)?.total ?? 0;
  const maxMonthly   = Math.max(...monthly.map((m) => m.total), 1);

  const oldestYear  = records.length > 0 ? Math.min(...records.map((r) => parseInt(r.date.slice(0, 4)))) : CURRENT_YEAR;
  const yearOptions = Array.from({ length: CURRENT_YEAR - oldestYear + 1 }, (_, i) => CURRENT_YEAR - i);
  const hasData     = totalSpend > 0 || records.length > 0;

  // Open fault codes: advisory + amber + red (not resolved).
  const openCodes   = useMemo(() => faultCodes.filter((fc) => fc.severity !== "resolved"), [faultCodes]);
  const redCount    = useMemo(() => faultCodes.filter((fc) => fc.severity === "red").length, [faultCodes]);
  const amberCount  = useMemo(() => faultCodes.filter((fc) => fc.severity === "amber").length, [faultCodes]);

  function codesForRecord(recordId: string): FaultCode[] {
    return faultCodes.filter((fc) => fc.record_id === recordId).sort((a, b) => a.sort_order - b.sort_order);
  }

  // ==================================================
  // MARK RESOLVED
  // ==================================================

  async function handleMarkResolved(faultCodeId: string) {
    if (!accountId) return;
    setResolving(faultCodeId);
    const today = new Date().toISOString().slice(0, 10);
    const res = await apiFetch(
      `/api/v1/accounts/${accountId}/diagnostic-fault-codes/${faultCodeId}`,
      {
        method: "PATCH",
        body: JSON.stringify({ severity: "resolved", resolved_at: today }),
      }
    );
    if (res.ok) {
      const updated: FaultCode = await res.json();
      setFaultCodes((prev) => prev.map((fc) => (fc.id === faultCodeId ? updated : fc)));
    }
    setResolving(null);
  }

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
              <h1 className="rec-title">Diagnostics</h1>
              <select
                className="rpt-year-select"
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
              >
                {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <p className="rec-sub">Diagnostic records, inspection findings, and fault codes.</p>
          </div>
          <Link
            href={`/dashboard/vehicles/${id}/records?type=diagnostics`}
            className="rec-btn rec-btn--primary rec-btn--icon"
            title="Add record"
          >
            +
          </Link>
        </div>
      </header>

      {loading && <div className="rec-skeleton" />}

      {!loading && !hasData && (
        <Card>
          <div className="rec-empty">
            <p>No diagnostics records yet. Add records via the Records page.</p>
          </div>
        </Card>
      )}

      {!loading && hasData && (
        <>
          {/* ---- Stat cards ---- */}
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
                <span
                  className="fuel-stat__value"
                  style={{
                    color: redCount > 0
                      ? "var(--colour-severity-red)"
                      : amberCount > 0
                      ? "var(--colour-severity-amber)"
                      : "inherit",
                  }}
                >
                  {openCodes.length}
                </span>
                <span className="fuel-stat__label">Open fault codes</span>
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

          {/* ---- Monthly chart ---- */}
          <Card>
            <h2 className="rec-section-title">Monthly spend, {year}</h2>
            <div className="fuel-chart">
              {monthly.map((m) => (
                <div key={m.month} className="fuel-bar-col">
                  <span className="fuel-bar-amount">
                    {m.total > 0 ? formatGBP(m.total) : ""}
                  </span>
                  <div className="fuel-bar-track">
                    <div
                      className="fuel-bar-fill"
                      style={{ height: `${Math.round((m.total / maxMonthly) * 100)}%` }}
                    />
                  </div>
                  <span className="fuel-bar-label">{formatMonth(m.month).split(" ")[0]}</span>
                </div>
              ))}
            </div>
          </Card>

          {/* ---- Records table with expandable fault codes ---- */}
          <Card>
            <div className="rec-list-head">
              <h2 className="rec-section-title" style={{ margin: 0 }}>Records</h2>
              <span className="rec-count">
                {count} record{count !== 1 ? "s" : ""} in {year} &middot; {records.length} total
              </span>
            </div>
            <div className="an-rec-list">
              {yearRecords.length === 0 && (
                <p style={{ color: "var(--colour-text-muted)", fontSize: "var(--text-sm)" }}>
                  No records for {year}.
                </p>
              )}
              {yearRecords.map((r) => {
                const codes   = codesForRecord(r.id);
                const isOpen  = expandedId === r.id;
                return (
                  <div key={r.id}>
                    {/* Record summary row */}
                    <div
                      className={`an-rec-row an-rec-row--clickable${isOpen ? " an-rec-row--open" : ""}`}
                      onClick={() => setExpandedId(isOpen ? null : r.id)}
                    >
                      <span className="an-rec-date">{formatDate(r.date)}</span>
                      <span className="an-rec-meta">{r.garage ?? r.supplier ?? "-"}</span>
                      <span className="an-rec-codes-count">
                        {codes.length > 0 && (
                          <span className="diag-code-pill">
                            {codes.filter((c) => c.severity !== "resolved").length > 0
                              ? `${codes.filter((c) => c.severity !== "resolved").length} open`
                              : `${codes.length} resolved`}
                          </span>
                        )}
                      </span>
                      <span className="an-rec-cost">
                        {r.cost !== null ? formatGBP(r.cost) : "-"}
                      </span>
                      <span className="an-rec-chevron">{isOpen ? "▲" : "▼"}</span>
                    </div>

                    {/* Expanded fault code rows */}
                    {isOpen && (
                      <div className="diag-expand">
                        {r.notes && (
                          <p className="diag-expand__notes">{r.notes}</p>
                        )}
                        {codes.length === 0 ? (
                          <p className="diag-expand__empty">No fault codes recorded for this inspection.</p>
                        ) : (
                          <div className="diag-fc-list">
                            <div className="diag-fc-head">
                              <span>Code</span>
                              <span>Description</span>
                              <span>Severity</span>
                              <span>Trigger</span>
                              <span></span>
                            </div>
                            {codes.map((fc) => (
                              <div key={fc.id} className="diag-fc-row">
                                <span className="diag-fc-code">
                                  {fc.code ?? <span style={{ opacity: 0.4 }}>-</span>}
                                </span>
                                <div className="diag-fc-desc-col">
                                  <span className="diag-fc-desc">{fc.description}</span>
                                  {fc.notes && (
                                    <span className="diag-fc-notes">{fc.notes}</span>
                                  )}
                                </div>
                                <span className={`diag-sev diag-sev--${fc.severity}`}>
                                  {severityLabel(fc.severity)}
                                </span>
                                <span className="diag-fc-trigger">
                                  {fc.trigger_date
                                    ? formatDate(fc.trigger_date)
                                    : fc.trigger_mileage
                                    ? `${fc.trigger_mileage.toLocaleString("en-GB")} mi`
                                    : <span style={{ opacity: 0.4 }}>-</span>}
                                </span>
                                <span className="diag-fc-action">
                                  {fc.severity !== "resolved" && (
                                    <button
                                      className="rec-btn rec-btn--ghost rec-btn--sm"
                                      disabled={resolving === fc.id}
                                      onClick={(e) => { e.stopPropagation(); handleMarkResolved(fc.id); }}
                                    >
                                      {resolving === fc.id ? "Saving…" : "Mark resolved"}
                                    </button>
                                  )}
                                  {fc.severity === "resolved" && fc.resolved_at && (
                                    <span className="diag-fc-resolved-date">
                                      Resolved {formatDate(fc.resolved_at)}
                                    </span>
                                  )}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                        <div style={{ marginTop: "var(--space-3)" }}>
                          <Link
                            href={`/dashboard/vehicles/${id}/records`}
                            className="rec-btn rec-btn--ghost rec-btn--sm"
                            onClick={(e) => e.stopPropagation()}
                          >
                            Edit record
                          </Link>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        </>
      )}

      <style>{AN_STYLES}</style>
    </div>
  );
}

// ==================================================
// STYLES
// ==================================================

const AN_STYLES = `
  /* ---- Severity colour tokens ---- */
  :root {
    --colour-severity-advisory: var(--colour-text-muted);
    --colour-severity-amber: #f59e0b;
    --colour-severity-red: #ef4444;
    --colour-severity-resolved: var(--colour-text-muted);
  }

  /* ---- Stat cards ---- */
  .fuel-stats { display: grid; grid-template-columns: repeat(5, 1fr); gap: var(--space-4); }
  .fuel-stat { display: flex; flex-direction: column; min-width: 0; }
  .fuel-stat__value { font-size: var(--text-xl); font-weight: var(--weight-semibold); letter-spacing: var(--tracking-tight); }
  .fuel-stat__label { font-size: var(--text-xs); color: var(--colour-text-muted); text-transform: uppercase; letter-spacing: 0.06em; margin-top: 4px; }

  /* ---- Bar chart ---- */
  .fuel-chart { display: flex; align-items: flex-end; gap: var(--space-2); height: 140px; }
  .fuel-bar-col { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px; height: 100%; justify-content: flex-end; cursor: default; }
  .fuel-bar-amount { font-size: 9px; color: var(--colour-text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; text-align: center; transition: transform 0.2s ease; }
  .fuel-bar-col:hover .fuel-bar-amount { transform: translateY(-6px); }
  .fuel-bar-track { width: 100%; flex: 1; display: flex; align-items: flex-end; background: rgba(255,255,255,0.03); border-radius: var(--radius-sm) var(--radius-sm) 0 0; }
  .fuel-bar-fill { width: 100%; background: rgba(108,99,255,0.5); border-radius: var(--radius-sm) var(--radius-sm) 0 0; min-height: 4px; transition: height 0.3s ease, transform 0.2s ease, background 0.2s; transform-origin: bottom center; }
  .fuel-bar-col:hover .fuel-bar-fill { transform: scaleY(1.12); background: rgba(0,212,255,0.7); }
  .fuel-bar-label { font-size: 9px; color: var(--colour-text-muted); text-align: center; white-space: nowrap; }

  /* ---- Year select ---- */
  .rpt-year-select { appearance: none; background: var(--colour-surface); border: 1px solid var(--colour-border); border-radius: var(--radius-sm); color: var(--colour-text); font-size: var(--text-sm); font-family: inherit; padding: 4px 28px 4px 10px; cursor: none; transition: border-color 0.2s; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23888'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 9px center; }
  .rpt-year-select:hover { border-color: var(--colour-accent); }
  .rpt-year-select:focus { outline: none; border-color: var(--colour-accent); }

  /* ---- Record list ---- */
  .an-rec-list { display: flex; flex-direction: column; gap: 0; margin-top: var(--space-3); }

  /* ---- Record row ---- */
  .an-rec-row {
    display: grid;
    grid-template-columns: 140px 1fr auto auto 20px;
    align-items: center;
    gap: var(--space-4);
    padding: var(--space-3) 0;
    border-bottom: 0.5px solid var(--colour-border);
    cursor: pointer;
    transition: background 0.15s;
  }
  .an-rec-row:last-child { border-bottom: none; }
  .an-rec-row--clickable:hover { background: rgba(255,255,255,0.02); margin: 0 calc(-1 * var(--space-3)); padding-left: var(--space-3); padding-right: var(--space-3); border-radius: var(--radius-sm); }
  .an-rec-row--open { border-bottom: none; }
  .an-rec-date { font-size: var(--text-sm); color: var(--colour-text-muted); white-space: nowrap; }
  .an-rec-meta { font-size: var(--text-sm); color: var(--colour-text); }
  .an-rec-codes-count { display: flex; justify-content: flex-end; }
  .an-rec-cost { font-size: var(--text-sm); font-weight: var(--weight-medium); color: var(--colour-text); text-align: right; white-space: nowrap; }
  .an-rec-chevron { font-size: 9px; color: var(--colour-text-muted); text-align: right; }
  .an-rec-notes { grid-column: 2 / -1; font-size: var(--text-xs); color: var(--colour-text-muted); }

  /* ---- Open code pill ---- */
  .diag-code-pill { font-size: var(--text-xs); color: var(--colour-text-muted); background: rgba(255,255,255,0.06); border: 0.5px solid var(--colour-border); border-radius: 99px; padding: 2px 8px; white-space: nowrap; }

  /* ---- Expanded section ---- */
  .diag-expand {
    padding: var(--space-3) 0 var(--space-4);
    border-bottom: 0.5px solid var(--colour-border);
    background: rgba(255,255,255,0.01);
  }
  .diag-expand__notes { font-size: var(--text-xs); color: var(--colour-text-muted); margin: 0 0 var(--space-3); }
  .diag-expand__empty { font-size: var(--text-sm); color: var(--colour-text-muted); margin: 0; }

  /* ---- Fault code table ---- */
  .diag-fc-list { display: flex; flex-direction: column; gap: 0; }
  .diag-fc-head {
    display: grid;
    grid-template-columns: 80px 1fr 90px 120px 140px;
    gap: var(--space-3);
    padding-bottom: var(--space-2);
    border-bottom: 0.5px solid var(--colour-border);
    font-size: var(--text-xs);
    color: var(--colour-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .diag-fc-row {
    display: grid;
    grid-template-columns: 80px 1fr 90px 120px 140px;
    gap: var(--space-3);
    align-items: start;
    padding: var(--space-2) 0;
    border-bottom: 0.5px solid rgba(255,255,255,0.04);
  }
  .diag-fc-row:last-child { border-bottom: none; }
  .diag-fc-code { font-size: var(--text-sm); font-family: monospace; color: var(--colour-text); letter-spacing: 0.04em; padding-top: 2px; }
  .diag-fc-desc-col { display: flex; flex-direction: column; gap: 2px; }
  .diag-fc-desc { font-size: var(--text-sm); color: var(--colour-text); }
  .diag-fc-notes { font-size: var(--text-xs); color: var(--colour-text-muted); }
  .diag-fc-trigger { font-size: var(--text-xs); color: var(--colour-text-muted); padding-top: 3px; }
  .diag-fc-action { display: flex; align-items: flex-start; padding-top: 1px; }
  .diag-fc-resolved-date { font-size: var(--text-xs); color: var(--colour-text-muted); }

  /* ---- Severity badges ---- */
  .diag-sev {
    display: inline-block;
    font-size: var(--text-xs);
    font-weight: var(--weight-medium);
    border-radius: 99px;
    padding: 2px 9px;
    white-space: nowrap;
    border: 1px solid transparent;
    padding-top: 3px;
  }
  .diag-sev--advisory {
    background: rgba(255,255,255,0.06);
    color: var(--colour-text-muted);
    border-color: rgba(255,255,255,0.1);
  }
  .diag-sev--amber {
    background: rgba(245,158,11,0.12);
    color: #f59e0b;
    border-color: rgba(245,158,11,0.25);
  }
  .diag-sev--red {
    background: rgba(239,68,68,0.12);
    color: #ef4444;
    border-color: rgba(239,68,68,0.25);
  }
  .diag-sev--resolved {
    background: rgba(255,255,255,0.04);
    color: var(--colour-text-muted);
    border-color: rgba(255,255,255,0.08);
    text-decoration: line-through;
    opacity: 0.6;
  }

  /* ---- Responsive ---- */
  @media (max-width: 1023px) {
    .diag-fc-head,
    .diag-fc-row { grid-template-columns: 70px 1fr 80px 100px 130px; }
  }
  @media (max-width: 767px) {
    .fuel-stats { grid-template-columns: repeat(2, 1fr); }
    .fuel-stats > :last-child { grid-column: 1 / -1; }
    .fuel-chart { height: 100px; }
    .fuel-bar-amount { display: none; }
    .an-rec-row { grid-template-columns: 110px 1fr auto 20px; }
    .an-rec-codes-count { display: none; }
    .diag-fc-head,
    .diag-fc-row { grid-template-columns: 70px 1fr 80px auto; }
    .diag-fc-head > :nth-child(4),
    .diag-fc-row > :nth-child(4) { display: none; }
  }
  @media (max-width: 479px) {
    .an-rec-row { grid-template-columns: 1fr auto 20px; }
    .an-rec-date { grid-column: 1 / -1; }
    .diag-fc-head,
    .diag-fc-row { grid-template-columns: 1fr 80px auto; }
    .diag-fc-head > :first-child,
    .diag-fc-row > :first-child { display: none; }
  }
`;
