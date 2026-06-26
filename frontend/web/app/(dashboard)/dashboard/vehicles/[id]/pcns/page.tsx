// ============================================================
// frontend/web/app/(dashboard)/dashboard/vehicles/[id]/pcns/page.tsx
// ============================================================
//
// Purpose:
//   Penalty charge notice (PCN) management page for a vehicle.
//   Lists all PCNs with reference, authority, date, amount, and
//   status. Provides an inline form to add a new PCN and a status
//   update action on each row.
//
// Design:
//   Status values: open, paid, appealed, cancelled.
//   Status badge colours follow the platform convention:
//     open → amber, paid → green, appealed → accent, cancelled → muted.
//   Amount is stored and returned in pence; displayed in GBP.
//
//   Mirrors SovCorE QR card and list patterns: rec-shell, Card,
//   rec-btn, rec-row, cursor: none on all interactive elements.
//
// Consumed by:
//   - Routed at /dashboard/vehicles/[id]/pcns
// ============================================================

"use client";

import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { Card } from "@/src/components/ui/card";
import { TextArea, TextField } from "@/src/components/ui/input";
import { EntityAttachmentPanel } from "@/src/components/vehicle/EntityAttachmentPanel";
import { apiFetch, getAccountId } from "@/src/lib/api/fetch";

// ==================================================
// TYPES
// ==================================================

type PCNStatus = "open" | "paid" | "appealed" | "cancelled";

interface PCNItem {
  id: string;
  reference: string | null;
  authority: string | null;
  date: string;
  amount: number;
  status: PCNStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface PCNPage {
  items: PCNItem[];
  total: number;
  page: number;
  page_size: number;
}

interface AddForm {
  reference: string;
  authority: string;
  date: string;
  amount: string;    // pounds, converted to pence on submit
  status: PCNStatus;
  notes: string;
}

// ==================================================
// CONSTANTS
// ==================================================

const STATUSES: { value: PCNStatus; label: string }[] = [
  { value: "open",      label: "Open" },
  { value: "paid",      label: "Paid" },
  { value: "appealed",  label: "Appealed" },
  { value: "cancelled", label: "Cancelled" },
];

const EMPTY_FORM: AddForm = {
  reference: "",
  authority: "",
  date:      new Date().toISOString().slice(0, 10),
  amount:    "",
  status:    "open",
  notes:     "",
};

// ==================================================
// HELPERS
// ==================================================

function formatGBP(pence: number): string {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(pence / 100);
}

function formatDate(d: string | null): string {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function statusBadgeClass(s: PCNStatus): string {
  if (s === "open")      return "pcn-badge pcn-badge--open";
  if (s === "paid")      return "pcn-badge pcn-badge--paid";
  if (s === "appealed")  return "pcn-badge pcn-badge--appealed";
  return "pcn-badge pcn-badge--cancelled";
}

function statusLabel(s: PCNStatus): string {
  return STATUSES.find((st) => st.value === s)?.label ?? s;
}

// ==================================================
// PAGE
// ==================================================

export default function PCNsPage() {
  const { id } = useParams<{ id: string }>();
  const accountId = getAccountId() ?? "";

  const [pcns, setPCNs] = useState<PCNItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<AddForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [year, setYear] = useState(new Date().getFullYear());

  const { yearOptions, thisMonth, count, avgCost, annualSpend, totalSpend } = useMemo(() => {
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const allYears = [...new Set(pcns.map((p) => parseInt(p.date.slice(0, 4), 10)))].sort((a, b) => b - a);
    const opts = allYears.length > 0 ? allYears : [now.getFullYear()];
    const ye = pcns.filter((p) => p.date.startsWith(`${year}-`));
    const tm = ye.filter((p) => p.date.startsWith(`${year}-${mm}`)).reduce((s, p) => s + p.amount, 0);
    const ann = ye.reduce((s, p) => s + p.amount, 0);
    const cnt = ye.length;
    const avg = cnt > 0 ? Math.round(ann / cnt) : 0;
    const tot = pcns.reduce((s, p) => s + p.amount, 0);
    return { yearOptions: opts, thisMonth: tm, count: cnt, avgCost: avg, annualSpend: ann, totalSpend: tot };
  }, [pcns, year]);

  // ==================================================
  // DATA LOADING
  // ==================================================

  async function loadPCNs() {
    if (!accountId || !id) return;
    setLoading(true);
    const res = await apiFetch(
      `/api/v1/accounts/${accountId}/vehicles/${id}/pcns?page=1&page_size=100`
    );
    if (res.ok) {
      const data: PCNPage = await res.json();
      setPCNs(data.items);
      setTotal(data.total);
    }
    setLoading(false);
  }

  useEffect(() => { loadPCNs(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ==================================================
  // ADD PCN FORM
  // ==================================================

  function handleFormChange<K extends keyof AddForm>(field: K, value: AddForm[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setSaveError(null);
  }

  async function handleAdd() {
    if (!form.date) { setSaveError("Date is required."); return; }
    if (!form.amount) { setSaveError("Amount is required."); return; }
    setSaving(true);
    setSaveError(null);
    try {
      const res = await apiFetch(
        `/api/v1/accounts/${accountId}/vehicles/${id}/pcns`,
        {
          method: "POST",
          body: JSON.stringify({
            reference: form.reference || null,
            authority: form.authority || null,
            date: form.date,
            // Amount entered in pounds; convert to pence.
            amount: Math.round(parseFloat(form.amount) * 100),
            status: form.status,
            notes: form.notes || null,
          }),
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setSaveError(err.detail ?? "Could not save the PCN.");
        return;
      }
      setShowForm(false);
      setForm(EMPTY_FORM);
      await loadPCNs();
    } catch {
      setSaveError("An unexpected error occurred.");
    } finally {
      setSaving(false);
    }
  }

  // ==================================================
  // STATUS UPDATE
  // ==================================================

  async function handleStatusChange(pcn: PCNItem, newStatus: PCNStatus) {
    setUpdatingId(pcn.id);
    await apiFetch(
      `/api/v1/accounts/${accountId}/pcns/${pcn.id}`,
      { method: "PATCH", body: JSON.stringify({ status: newStatus }) }
    );
    setUpdatingId(null);
    setPCNs((prev) =>
      prev.map((p) => (p.id === pcn.id ? { ...p, status: newStatus } : p))
    );
  }

  // ==================================================
  // DELETE
  // ==================================================

  async function handleDelete(pcnId: string) {
    if (!window.confirm("Delete this PCN? This cannot be undone.")) return;
    setDeletingId(pcnId);
    await apiFetch(
      `/api/v1/accounts/${accountId}/pcns/${pcnId}`,
      { method: "DELETE" }
    );
    setDeletingId(null);
    setPCNs((prev) => prev.filter((p) => p.id !== pcnId));
    setTotal((prev) => prev - 1);
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
            <h1 className="rec-title">Penalty charge notices</h1>
            <p className="rec-sub">Council and private parking charges raised against this vehicle.</p>
          </div>
          {showForm ? (
            <button className="rec-btn rec-btn--ghost" onClick={() => { setShowForm(false); setSaveError(null); }}>Cancel</button>
          ) : (
            <button className="rec-btn rec-btn--primary rec-btn--icon" title="Add PCN" onClick={() => { setShowForm(true); setSaveError(null); }}>+</button>
          )}
        </div>
      </header>

      {/* ---- Add form ---- */}
      {showForm && (
        <Card>
          <h2 className="rec-section-title">New PCN</h2>
          <div className="rec-form">

            <div className="rec-form-row">
              <TextField
                className="rec-label"
                label="Date"
                type="date"
                value={form.date}
                onChange={(e) => handleFormChange("date", e.target.value)}
                disabled={saving}
              />
              <TextField
                className="rec-label"
                label="Amount (£)"
                type="text"
                inputMode="decimal"
                placeholder="e.g. 70.00"
                value={form.amount}
                onChange={(e) => {
                  const v = e.target.value.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1");
                  handleFormChange("amount", v);
                }}
                disabled={saving}
              />
              <div className="rec-label sov-field">
                <label htmlFor="pcn-status-sel" className="sov-field__label">Status</label>
                <div className="sov-input-wrap">
                  <select id="pcn-status-sel" className="sov-field__control" value={form.status} onChange={(e) => handleFormChange("status", e.target.value as PCNStatus)} disabled={saving}>
                    {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
              </div>
            </div>

            <div className="rec-form-row">
              <TextField
                className="rec-label rec-label--wide"
                label="Reference number"
                type="text"
                placeholder="e.g. PCN12345"
                value={form.reference}
                onChange={(e) => handleFormChange("reference", e.target.value.toUpperCase())}
                disabled={saving}
              />
              <TextField
                className="rec-label rec-label--wide"
                label="Issuing authority"
                type="text"
                placeholder="e.g. Westminster City Council"
                value={form.authority}
                onChange={(e) => handleFormChange("authority", e.target.value.toUpperCase())}
                disabled={saving}
              />
            </div>

            <TextArea
              className="rec-label rec-label--full"
              label="Notes"
              rows={2}
              placeholder="Any additional notes…"
              value={form.notes}
              onChange={(e) => handleFormChange("notes", e.target.value)}
              disabled={saving}
            />

            {saveError && <p className="rec-error">{saveError}</p>}
            <div className="rec-form-actions">
              <button className="rec-btn rec-btn--primary" onClick={handleAdd} disabled={saving}>
                {saving ? "Saving…" : "Save PCN"}
              </button>
              <button className="rec-btn rec-btn--ghost" onClick={() => { setShowForm(false); setForm(EMPTY_FORM); setSaveError(null); }} disabled={saving}>
                Cancel
              </button>
            </div>
          </div>
        </Card>
      )}

      {/* ---- Summary ---- */}
      <Card>
        <div className="rec-section-head">
          <h2 className="rec-section-title" style={{ margin: 0 }}>Summary</h2>
          <select className="rpt-year-select" value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div className="fuel-stats">
          <div className="fuel-stat">
            <span className="fuel-stat__value">{formatGBP(thisMonth)}</span>
            <span className="fuel-stat__label">This month</span>
          </div>
          <div className="fuel-stat">
            <span className="fuel-stat__value">{count}</span>
            <span className="fuel-stat__label">PCNs ({year})</span>
          </div>
          <div className="fuel-stat">
            <span className="fuel-stat__value">{avgCost > 0 ? formatGBP(avgCost) : "-"}</span>
            <span className="fuel-stat__label">Avg per PCN</span>
          </div>
          <div className="fuel-stat">
            <span className="fuel-stat__value">{formatGBP(annualSpend)}</span>
            <span className="fuel-stat__label">Year total</span>
          </div>
          <div className="fuel-stat">
            <span className="fuel-stat__value">{formatGBP(totalSpend)}</span>
            <span className="fuel-stat__label">Total spend</span>
          </div>
        </div>
      </Card>

      {/* ---- PCN list ---- */}
      <Card>
        <div className="rec-list-head">
          <span className="rec-count">{total} PCN{total !== 1 ? "s" : ""}</span>
        </div>

        {loading ? (
          <div className="rec-skeleton" />
        ) : pcns.length === 0 ? (
          <div className="rec-empty">
            <p>No penalty charge notices recorded for this vehicle.</p>
          </div>
        ) : (
          <div className="rec-rows">
            {pcns.map((pcn) => (
              <div key={pcn.id} className="pcn-entry">
                <div className="pcn-row">
                  <div className="pcn-row__left">
                    <span className={statusBadgeClass(pcn.status)}>{statusLabel(pcn.status)}</span>
                    <span className="pcn-row__date">{formatDate(pcn.date)}</span>
                    {pcn.authority && <span className="pcn-row__authority">{pcn.authority}</span>}
                    {pcn.reference && <span className="pcn-row__ref">{pcn.reference}</span>}
                  </div>
                  <div className="pcn-row__right">
                    <span className="pcn-row__amount">{formatGBP(pcn.amount)}</span>
                    {/* Inline status change */}
                    <select
                      className="pcn-status-select"
                      value={pcn.status}
                      onChange={(e) => handleStatusChange(pcn, e.target.value as PCNStatus)}
                      disabled={updatingId === pcn.id}
                      aria-label="Update status"
                    >
                      {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                    <button
                      className="rec-btn rec-btn--danger-sm"
                      onClick={() => handleDelete(pcn.id)}
                      disabled={deletingId === pcn.id}
                    >
                      {deletingId === pcn.id ? "…" : "Delete"}
                    </button>
                  </div>
                </div>
                <EntityAttachmentPanel
                  entityType="pcn"
                  entityId={pcn.id}
                  accountId={accountId}
                />
              </div>
            ))}
          </div>
        )}
      </Card>

      <style>{PCN_STYLES}</style>
    </div>
  );
}

// ==================================================
// STYLES
// ==================================================

const PCN_STYLES = `
  /* ---- PCN entry wrapper (row + attachment panel) ---- */
  .pcn-entry { border-bottom: 0.5px solid var(--colour-border); }
  .pcn-entry:last-child { border-bottom: none; }

  /* ---- PCN rows ---- */
  .pcn-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    flex-wrap: wrap;
  }
  .pcn-row__left { display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap; }
  .pcn-row__right { display: flex; align-items: center; gap: var(--space-3); flex-shrink: 0; }
  .pcn-row__date { font-size: var(--text-sm); color: var(--colour-text-muted); white-space: nowrap; }
  .pcn-row__authority { font-size: var(--text-sm); color: var(--colour-text); }
  .pcn-row__ref { font-size: var(--text-xs); color: var(--colour-text-muted); font-family: monospace; }
  .pcn-row__amount { font-size: var(--text-sm); font-weight: var(--weight-medium); color: var(--colour-text); white-space: nowrap; }

  /* ---- Status badges ---- */
  .pcn-badge {
    font-size: var(--text-xs);
    padding: 2px 8px;
    border-radius: var(--radius-full, 999px);
    border: 1px solid;
    white-space: nowrap;
  }
  .pcn-badge--open      { color: #f59e0b; border-color: rgba(245,158,11,0.3); background: rgba(245,158,11,0.08); }
  .pcn-badge--paid      { color: #4ade80; border-color: rgba(74,222,128,0.3); background: rgba(74,222,128,0.08); }
  .pcn-badge--appealed  { color: var(--colour-accent); border-color: rgba(108,99,255,0.3); background: rgba(108,99,255,0.08); }
  .pcn-badge--cancelled { color: var(--colour-text-muted); border-color: var(--colour-border); background: none; }

  /* ---- Status select ---- */
  .pcn-status-select {
    background: var(--colour-bg);
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-sm);
    padding: 4px 8px;
    font-size: var(--text-xs);
    color: var(--colour-text);
    cursor: none;
    outline: none;
    transition: border-color 0.2s;
  }
  .pcn-status-select:focus { border-color: var(--colour-accent); }

  /* ---- Responsive ---- */
  @media (max-width: 767px) {
    .pcn-row { flex-direction: column; align-items: flex-start; }
    .pcn-row__right { flex-wrap: wrap; }
  }

  /* ---- Summary card ---- */
  .rec-section-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-4);
  }
  .fuel-stats {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: var(--space-3);
  }
  .fuel-stat {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: var(--space-3);
    border-radius: var(--radius-md);
    background: rgba(255,255,255,0.03);
    border: 0.5px solid var(--colour-border);
  }
  .fuel-stat__value {
    font-size: var(--text-lg);
    font-weight: var(--weight-semibold);
    color: var(--colour-text);
  }
  .fuel-stat__label {
    font-size: var(--text-xs);
    color: var(--colour-text-muted);
  }
  .rpt-year-select {
    background: var(--colour-bg);
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-sm);
    padding: 4px 8px;
    font-size: var(--text-sm);
    color: var(--colour-text);
    cursor: none;
    outline: none;
    transition: border-color 0.2s;
  }
  .rpt-year-select:focus { border-color: var(--colour-accent); }
  @media (max-width: 900px) {
    .fuel-stats { grid-template-columns: repeat(2, 1fr); }
    .fuel-stats .fuel-stat:last-child { grid-column: 1 / -1; }
  }
`;
