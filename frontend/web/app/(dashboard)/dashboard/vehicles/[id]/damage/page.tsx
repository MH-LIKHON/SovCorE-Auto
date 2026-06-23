// ============================================================
// frontend/web/app/(dashboard)/dashboard/vehicles/[id]/damage/page.tsx
// ============================================================
//
// Purpose:
//   Damage history page for a vehicle. Lists damage events with
//   kind badge, date, description, and repair cost. Provides an
//   inline add form with optional before and after R2 image keys.
//
// Design:
//   Damage kind values: scratch, dent, paintwork, accident,
//   glass, stone_chip. Each kind has a distinct colour badge.
//
//   Image keys (before_key, after_key) are plain text fields for
//   now. Full R2 presigned-upload flow is wired in Phase 8 when
//   the full upload experience is built. This page records the
//   key strings so the data is correct from day one.
//
//   Mirrors SovCorE QR card and list patterns exactly.
//
// Consumed by:
//   - Routed at /dashboard/vehicles/[id]/damage
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

type DamageKind = "scratch" | "dent" | "paintwork" | "accident" | "glass" | "stone_chip";

interface DamageItem {
  id: string;
  kind: DamageKind;
  description: string | null;
  date: string;
  repair_cost: number | null;
  before_key: string | null;
  after_key: string | null;
  created_at: string;
  updated_at: string;
}

interface DamagePage {
  items: DamageItem[];
  total: number;
  page: number;
  page_size: number;
}

interface AddForm {
  kind: DamageKind;
  description: string;
  date: string;
  repair_cost: string;  // pounds
  before_key: string;
  after_key: string;
}

// ==================================================
// CONSTANTS
// ==================================================

const DAMAGE_KINDS: { value: DamageKind; label: string }[] = [
  { value: "scratch",    label: "Scratch" },
  { value: "dent",       label: "Dent" },
  { value: "paintwork",  label: "Paintwork" },
  { value: "accident",   label: "Accident" },
  { value: "glass",      label: "Glass" },
  { value: "stone_chip", label: "Stone chip" },
];

const EMPTY_FORM: AddForm = {
  kind:        "scratch",
  description: "",
  date:        new Date().toISOString().split("T")[0],
  repair_cost: "",
  before_key:  "",
  after_key:   "",
};

// ==================================================
// HELPERS
// ==================================================

function formatGBP(pence: number | null): string {
  if (pence === null) return "—";
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(pence / 100);
}

function formatDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function kindLabel(k: DamageKind): string {
  return DAMAGE_KINDS.find((d) => d.value === k)?.label ?? k;
}

function kindBadgeClass(k: DamageKind): string {
  if (k === "accident") return "dmg-badge dmg-badge--accident";
  if (k === "glass")    return "dmg-badge dmg-badge--glass";
  return "dmg-badge dmg-badge--default";
}

// ==================================================
// PAGE
// ==================================================

export default function DamagePage() {
  const { id } = useParams<{ id: string }>();
  const accountId = getAccountId() ?? "";

  const [entries, setEntries] = useState<DamageItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<AddForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [deletingId, setDeletingId] = useState<string | null>(null);

  // ==================================================
  // DATA LOADING
  // ==================================================

  async function loadEntries() {
    if (!accountId || !id) return;
    setLoading(true);
    const res = await apiFetch(
      `/api/v1/accounts/${accountId}/vehicles/${id}/damage?page=1&page_size=100`
    );
    if (res.ok) {
      const data: DamagePage = await res.json();
      setEntries(data.items);
      setTotal(data.total);
    }
    setLoading(false);
  }

  useEffect(() => { loadEntries(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ==================================================
  // ADD FORM
  // ==================================================

  function handleFormChange<K extends keyof AddForm>(field: K, value: AddForm[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setSaveError(null);
  }

  async function handleAdd() {
    if (!form.date) { setSaveError("Date is required."); return; }
    setSaving(true);
    setSaveError(null);
    try {
      const res = await apiFetch(
        `/api/v1/accounts/${accountId}/vehicles/${id}/damage`,
        {
          method: "POST",
          body: JSON.stringify({
            kind: form.kind,
            description: form.description || null,
            date: form.date,
            repair_cost: form.repair_cost
              ? Math.round(parseFloat(form.repair_cost) * 100)
              : null,
            before_key: form.before_key || null,
            after_key:  form.after_key  || null,
          }),
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setSaveError(err.detail ?? "Could not save the damage entry.");
        return;
      }
      setShowForm(false);
      setForm(EMPTY_FORM);
      await loadEntries();
    } catch {
      setSaveError("An unexpected error occurred.");
    } finally {
      setSaving(false);
    }
  }

  // ==================================================
  // DELETE
  // ==================================================

  async function handleDelete(entryId: string) {
    if (!window.confirm("Delete this damage entry? This cannot be undone.")) return;
    setDeletingId(entryId);
    await apiFetch(
      `/api/v1/accounts/${accountId}/damage/${entryId}`,
      { method: "DELETE" }
    );
    setDeletingId(null);
    setEntries((prev) => prev.filter((e) => e.id !== entryId));
    setTotal((prev) => prev - 1);
  }

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
            <h1 className="rec-title">Damage history</h1>
            <p className="rec-sub">Scratches, dents, paintwork, glass damage and accident records for this vehicle.</p>
          </div>
          <button
            className="rec-btn rec-btn--primary"
            onClick={() => { setShowForm(!showForm); setSaveError(null); }}
          >
            {showForm ? "Cancel" : "Add damage entry"}
          </button>
        </div>
      </header>

      {/* ---- Add form ---- */}
      {showForm && (
        <Card>
          <h2 className="rec-section-title">New damage entry</h2>
          <div className="rec-form">

            <div className="rec-form-row">
              <label className="rec-label">
                <span className="rec-label__text">Kind</span>
                <select className="rec-select" value={form.kind} onChange={(e) => handleFormChange("kind", e.target.value as DamageKind)} disabled={saving}>
                  {DAMAGE_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
                </select>
              </label>
              <label className="rec-label">
                <span className="rec-label__text">Date</span>
                <input className="rec-input" type="date" value={form.date} onChange={(e) => handleFormChange("date", e.target.value)} disabled={saving} />
              </label>
              <label className="rec-label">
                <span className="rec-label__text">Repair cost (£)</span>
                <input className="rec-input" type="number" step="0.01" placeholder="Optional" value={form.repair_cost} onChange={(e) => handleFormChange("repair_cost", e.target.value)} disabled={saving} />
              </label>
            </div>

            <label className="rec-label rec-label--full">
              <span className="rec-label__text">Description</span>
              <textarea className="rec-textarea" rows={2} placeholder="Describe the damage…" value={form.description} onChange={(e) => handleFormChange("description", e.target.value)} disabled={saving} />
            </label>

            {saveError && <p className="rec-error">{saveError}</p>}
            <div className="rec-form-actions">
              <button className="rec-btn rec-btn--primary" onClick={handleAdd} disabled={saving}>
                {saving ? "Saving…" : "Save entry"}
              </button>
              <button className="rec-btn rec-btn--ghost" onClick={() => { setShowForm(false); setForm(EMPTY_FORM); setSaveError(null); }} disabled={saving}>
                Cancel
              </button>
            </div>
          </div>
        </Card>
      )}

      {/* ---- Damage list ---- */}
      <Card>
        <div className="rec-list-head">
          <span className="rec-count">{total} entr{total !== 1 ? "ies" : "y"}</span>
        </div>

        {loading ? (
          <div className="rec-skeleton" />
        ) : entries.length === 0 ? (
          <div className="rec-empty">
            <p>No damage entries recorded for this vehicle.</p>
            <button className="rec-btn rec-btn--primary" onClick={() => setShowForm(true)}>Add damage entry</button>
          </div>
        ) : (
          <div className="rec-rows">
            {entries.map((entry) => (
              <div key={entry.id} className="pcn-row">
                <div className="pcn-row__left">
                  <span className={kindBadgeClass(entry.kind)}>{kindLabel(entry.kind)}</span>
                  <span className="pcn-row__date">{formatDate(entry.date)}</span>
                  {entry.description && (
                    <span className="pcn-row__authority">{entry.description}</span>
                  )}
                </div>
                <div className="pcn-row__right">
                  {entry.repair_cost !== null && (
                    <span className="pcn-row__amount">{formatGBP(entry.repair_cost)}</span>
                  )}
                  <button
                    className="rec-btn rec-btn--danger-sm"
                    onClick={() => handleDelete(entry.id)}
                    disabled={deletingId === entry.id}
                  >
                    {deletingId === entry.id ? "…" : "Delete"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <style>{DMG_STYLES}</style>
    </div>
  );
}

// ==================================================
// STYLES
// ==================================================

const DMG_STYLES = `
  /* Damage kind badges — shares pcn-row pattern */
  .dmg-badge {
    font-size: var(--text-xs);
    padding: 2px 8px;
    border-radius: var(--radius-full, 999px);
    border: 1px solid;
    white-space: nowrap;
  }
  .dmg-badge--default  { color: var(--colour-text-muted); border-color: var(--colour-border); background: rgba(255,255,255,0.04); }
  .dmg-badge--accident { color: #f87171; border-color: rgba(248,113,113,0.3); background: rgba(248,113,113,0.08); }
  .dmg-badge--glass    { color: #60a5fa; border-color: rgba(96,165,250,0.3); background: rgba(96,165,250,0.08); }

  /* Reuse pcn-row for damage rows */
  .pcn-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    border-bottom: 0.5px solid var(--colour-border);
    flex-wrap: wrap;
  }
  .pcn-row:last-child { border-bottom: none; }
  .pcn-row__left { display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap; }
  .pcn-row__right { display: flex; align-items: center; gap: var(--space-3); flex-shrink: 0; }
  .pcn-row__date { font-size: var(--text-sm); color: var(--colour-text-muted); white-space: nowrap; }
  .pcn-row__authority { font-size: var(--text-sm); color: var(--colour-text); }
  .pcn-row__amount { font-size: var(--text-sm); font-weight: var(--weight-medium); color: var(--colour-text); white-space: nowrap; }

  @media (max-width: 767px) {
    .pcn-row { flex-direction: column; align-items: flex-start; }
    .pcn-row__right { flex-wrap: wrap; }
  }
`;
