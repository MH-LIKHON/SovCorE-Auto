// ============================================================
// frontend/web/app/(dashboard)/dashboard/vehicles/[id]/warranty/page.tsx
// ============================================================
//
// Purpose:
//   Warranty tracker page for a vehicle. Lists active and expired
//   warranty items with component, supplier, expiry date (RAG
//   status), labour cost, parts cost, and notes.
//
// Design:
//   Warranties are ordered soonest-to-expire first by the backend.
//   The expiry RAG uses the same thresholds as the vehicle card
//   renewal indicators: green = >30 days, amber = 1–30 days,
//   red = expired (≤ 0 days).
//
//   The inline add form captures component, supplier, expiry date,
//   costs, and notes. The invoice R2 key field is present but kept
//   as a plain text input; the full upload flow lands in Phase 8.
//
//   Mirrors SovCorE QR card and list patterns exactly.
//
// Consumed by:
//   - Routed at /dashboard/vehicles/[id]/warranty
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

interface WarrantyItem {
  id: string;
  component: string;
  supplier: string | null;
  expiry_date: string | null;
  labour_cost: number | null;
  parts_cost: number | null;
  notes: string | null;
  invoice_key: string | null;
  created_at: string;
  updated_at: string;
}

interface WarrantyPage {
  items: WarrantyItem[];
  total: number;
  page: number;
  page_size: number;
}

interface AddForm {
  component: string;
  supplier: string;
  expiry_date: string;
  labour_cost: string;
  parts_cost: string;
  notes: string;
}

// ==================================================
// CONSTANTS
// ==================================================

const EMPTY_FORM: AddForm = {
  component:   "",
  supplier:    "",
  expiry_date: "",
  labour_cost: "",
  parts_cost:  "",
  notes:       "",
};

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

function daysUntil(d: string | null): number | null {
  if (!d) return null;
  const diff = new Date(d).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function expiryColour(d: string | null): string {
  const days = daysUntil(d);
  if (days === null) return "var(--colour-text-muted)";
  if (days <= 0)  return "#ef4444";
  if (days <= 30) return "#f59e0b";
  return "#4ade80";
}

function expiryBadgeClass(d: string | null): string {
  const days = daysUntil(d);
  if (days === null)  return "war-badge war-badge--none";
  if (days <= 0)      return "war-badge war-badge--red";
  if (days <= 30)     return "war-badge war-badge--amber";
  return "war-badge war-badge--green";
}

function expiryLabel(d: string | null): string {
  const days = daysUntil(d);
  if (days === null) return "No expiry";
  if (days <= 0)     return `Expired ${Math.abs(days)} day${Math.abs(days) !== 1 ? "s" : ""} ago`;
  return `Expires in ${days} day${days !== 1 ? "s" : ""}`;
}

// ==================================================
// PAGE
// ==================================================

export default function WarrantyPage() {
  const { id } = useParams<{ id: string }>();
  const accountId = getAccountId() ?? "";

  const [warranties, setWarranties] = useState<WarrantyItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<AddForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [year, setYear] = useState(new Date().getFullYear());

  const { yearOptions, thisMonth, count, avgCost, annualSpend, totalSpend } = useMemo(() => {
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const allYears = [...new Set(warranties.map((w) => parseInt(w.created_at.slice(0, 4), 10)))].sort((a, b) => b - a);
    const opts = allYears.length > 0 ? allYears : [now.getFullYear()];
    const cost = (w: WarrantyItem) => (w.labour_cost ?? 0) + (w.parts_cost ?? 0);
    const ye = warranties.filter((w) => w.created_at.startsWith(`${year}-`));
    const tm = ye.filter((w) => w.created_at.startsWith(`${year}-${mm}`)).reduce((s, w) => s + cost(w), 0);
    const ann = ye.reduce((s, w) => s + cost(w), 0);
    const cnt = ye.length;
    const avg = cnt > 0 ? Math.round(ann / cnt) : 0;
    const tot = warranties.reduce((s, w) => s + cost(w), 0);
    return { yearOptions: opts, thisMonth: tm, count: cnt, avgCost: avg, annualSpend: ann, totalSpend: tot };
  }, [warranties, year]);

  // ==================================================
  // DATA LOADING
  // ==================================================

  async function loadWarranties() {
    if (!accountId || !id) return;
    setLoading(true);
    const res = await apiFetch(
      `/api/v1/accounts/${accountId}/vehicles/${id}/warranties?page=1&page_size=100`
    );
    if (res.ok) {
      const data: WarrantyPage = await res.json();
      setWarranties(data.items);
      setTotal(data.total);
    }
    setLoading(false);
  }

  useEffect(() => { loadWarranties(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ==================================================
  // ADD FORM
  // ==================================================

  function handleFormChange<K extends keyof AddForm>(field: K, value: AddForm[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setSaveError(null);
  }

  async function handleAdd() {
    if (!form.component.trim()) { setSaveError("Component name is required."); return; }
    setSaving(true);
    setSaveError(null);
    try {
      const res = await apiFetch(
        `/api/v1/accounts/${accountId}/vehicles/${id}/warranties`,
        {
          method: "POST",
          body: JSON.stringify({
            component:   form.component.trim(),
            supplier:    form.supplier    || null,
            expiry_date: form.expiry_date || null,
            labour_cost: form.labour_cost
              ? Math.round(parseFloat(form.labour_cost) * 100)
              : null,
            parts_cost: form.parts_cost
              ? Math.round(parseFloat(form.parts_cost) * 100)
              : null,
            notes: form.notes || null,
          }),
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setSaveError(err.detail ?? "Could not save the warranty.");
        return;
      }
      setShowForm(false);
      setForm(EMPTY_FORM);
      await loadWarranties();
    } catch {
      setSaveError("An unexpected error occurred.");
    } finally {
      setSaving(false);
    }
  }

  // ==================================================
  // DELETE
  // ==================================================

  async function handleDelete(warrantyId: string) {
    if (!window.confirm("Delete this warranty entry? This cannot be undone.")) return;
    setDeletingId(warrantyId);
    await apiFetch(
      `/api/v1/accounts/${accountId}/warranties/${warrantyId}`,
      { method: "DELETE" }
    );
    setDeletingId(null);
    setWarranties((prev) => prev.filter((w) => w.id !== warrantyId));
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
            <h1 className="rec-title">Warranty</h1>
            <p className="rec-sub">Component warranties for this vehicle, ordered by earliest expiry.</p>
          </div>
          <button
            className="rec-btn rec-btn--primary rec-btn--icon"
            title={showForm ? "Cancel" : "Add warranty"}
            onClick={() => { setShowForm(!showForm); setSaveError(null); }}
          >
            {showForm ? "×" : "+"}
          </button>
        </div>
      </header>

      {/* ---- Add form ---- */}
      {showForm && (
        <Card>
          <h2 className="rec-section-title">New warranty</h2>
          <div className="rec-form">

            <div className="rec-form-row">
              <TextField
                className="rec-label rec-label--wide"
                label="Component"
                type="text"
                placeholder="e.g. Clutch assembly"
                value={form.component}
                onChange={(e) => handleFormChange("component", e.target.value.toUpperCase())}
                disabled={saving}
              />
              <TextField
                className="rec-label rec-label--wide"
                label="Supplier"
                type="text"
                placeholder="e.g. Halfords"
                value={form.supplier}
                onChange={(e) => handleFormChange("supplier", e.target.value.toUpperCase())}
                disabled={saving}
              />
              <TextField
                className="rec-label"
                label="Expiry date"
                type="date"
                value={form.expiry_date}
                onChange={(e) => handleFormChange("expiry_date", e.target.value)}
                disabled={saving}
              />
            </div>

            <div className="rec-form-row">
              <TextField
                className="rec-label"
                label="Labour cost (£)"
                type="text"
                inputMode="decimal"
                placeholder="Optional"
                value={form.labour_cost}
                onChange={(e) => {
                  const v = e.target.value.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1");
                  handleFormChange("labour_cost", v);
                }}
                disabled={saving}
              />
              <TextField
                className="rec-label"
                label="Parts cost (£)"
                type="text"
                inputMode="decimal"
                placeholder="Optional"
                value={form.parts_cost}
                onChange={(e) => {
                  const v = e.target.value.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1");
                  handleFormChange("parts_cost", v);
                }}
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
                {saving ? "Saving…" : "Save warranty"}
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
            <span className="fuel-stat__label">Warranties ({year})</span>
          </div>
          <div className="fuel-stat">
            <span className="fuel-stat__value">{avgCost > 0 ? formatGBP(avgCost) : "-"}</span>
            <span className="fuel-stat__label">Avg per warranty</span>
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

      {/* ---- Warranty list ---- */}
      <Card>
        <div className="rec-list-head">
          <span className="rec-count">{total} warrant{total !== 1 ? "ies" : "y"}</span>
        </div>

        {loading ? (
          <div className="rec-skeleton" />
        ) : warranties.length === 0 ? (
          <div className="rec-empty">
            <p>No warranties recorded for this vehicle.</p>
          </div>
        ) : (
          <div className="rec-rows">
            {warranties.map((w) => (
              <div key={w.id} className="war-entry">
                <div className="war-row">
                  <div className="war-row__left">
                    <span className={expiryBadgeClass(w.expiry_date)}>{expiryLabel(w.expiry_date)}</span>
                    <div className="war-row__info">
                      <span className="war-row__component">{w.component}</span>
                      {w.supplier && <span className="war-row__supplier">{w.supplier}</span>}
                    </div>
                  </div>
                  <div className="war-row__right">
                    {w.expiry_date && (
                      <span className="war-row__expiry" style={{ color: expiryColour(w.expiry_date) }}>
                        {formatDate(w.expiry_date)}
                      </span>
                    )}
                    {(w.labour_cost !== null || w.parts_cost !== null) && (
                      <span className="war-row__cost">
                        {formatGBP((w.labour_cost ?? 0) + (w.parts_cost ?? 0))}
                      </span>
                    )}
                    <button
                      className="rec-btn rec-btn--danger-sm"
                      onClick={() => handleDelete(w.id)}
                      disabled={deletingId === w.id}
                    >
                      {deletingId === w.id ? "…" : "Delete"}
                    </button>
                  </div>
                </div>
                <EntityAttachmentPanel
                  entityType="warranty"
                  entityId={w.id}
                  accountId={accountId}
                />
              </div>
            ))}
          </div>
        )}
      </Card>

      <style>{WAR_STYLES}</style>
    </div>
  );
}

// ==================================================
// STYLES
// ==================================================

const WAR_STYLES = `
  /* ---- Warranty entry wrapper (row + attachment panel) ---- */
  .war-entry { border-bottom: 0.5px solid var(--colour-border); }
  .war-entry:last-child { border-bottom: none; }

  /* ---- Warranty rows ---- */
  .war-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
    padding: var(--space-3) var(--space-4);
    flex-wrap: wrap;
  }
  .war-row__left { display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap; }
  .war-row__right { display: flex; align-items: center; gap: var(--space-3); flex-shrink: 0; }
  .war-row__info { display: flex; flex-direction: column; gap: 2px; }
  .war-row__component { font-size: var(--text-sm); color: var(--colour-text); }
  .war-row__supplier { font-size: var(--text-xs); color: var(--colour-text-muted); }
  .war-row__expiry { font-size: var(--text-sm); font-weight: var(--weight-medium); white-space: nowrap; }
  .war-row__cost { font-size: var(--text-sm); color: var(--colour-text-muted); white-space: nowrap; }

  /* ---- RAG expiry badges ---- */
  .war-badge {
    font-size: var(--text-xs);
    padding: 2px 8px;
    border-radius: var(--radius-full, 999px);
    border: 1px solid;
    white-space: nowrap;
    flex-shrink: 0;
  }
  .war-badge--green  { color: #4ade80; border-color: rgba(74,222,128,0.3); background: rgba(74,222,128,0.08); }
  .war-badge--amber  { color: #f59e0b; border-color: rgba(245,158,11,0.3); background: rgba(245,158,11,0.08); }
  .war-badge--red    { color: #ef4444; border-color: rgba(239,68,68,0.3); background: rgba(239,68,68,0.08); }
  .war-badge--none   { color: var(--colour-text-muted); border-color: var(--colour-border); background: none; }

  @media (max-width: 767px) {
    .war-row { flex-direction: column; align-items: flex-start; }
    .war-row__right { flex-wrap: wrap; }
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
