// ============================================================
// frontend/web/app/(dashboard)/dashboard/vehicles/[id]/damage/page.tsx
// ============================================================
//
// Purpose:
//   Damage history page for a vehicle. Lists damage events with
//   kind badge, date, description, and repair cost. Provides an
//   inline add form and per-entry before/after photo upload.
//
// Design:
//   Damage kind values: scratch, dent, paintwork, accident,
//   glass, stone_chip. Each kind has a distinct colour badge.
//
//   Photo upload flow (Phase 8):
//     1. Add form saves the damage entry (gets entry_id).
//     2. Before/after photo slots appear on saved entries.
//     3. Clicking a slot calls the sign endpoint, PUTs to R2,
//        then PATCHes the entry with the returned key.
//     4. Delete photo button calls DELETE .../photo/{slot}.
//
//   Mirrors SovCorE QR card and list patterns exactly.
//
// Consumed by:
//   - Routed at /dashboard/vehicles/[id]/damage
// ============================================================

"use client";

import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { Card } from "@/src/components/ui/card";
import { TextArea, TextField } from "@/src/components/ui/input";
import { EntityAttachmentPanel } from "@/src/components/vehicle/EntityAttachmentPanel";
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
  repair_cost: string;
}

// ==================================================
// CONSTANTS
// ==================================================

const R2_PUBLIC = process.env.NEXT_PUBLIC_R2_PUBLIC_URL ?? "";

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
  date:        new Date().toISOString().slice(0, 10),
  repair_cost: "",
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

function kindLabel(k: DamageKind): string {
  return DAMAGE_KINDS.find((d) => d.value === k)?.label ?? k;
}

function kindBadgeClass(k: DamageKind): string {
  if (k === "accident") return "dmg-badge dmg-badge--accident";
  if (k === "glass")    return "dmg-badge dmg-badge--glass";
  return "dmg-badge dmg-badge--default";
}

// ==================================================
// PHOTO SLOT COMPONENT
// ==================================================

function PhotoSlot({
  slot,
  entry,
  vehicleId,
  accountId,
  onUpdated,
}: {
  slot: "before" | "after";
  entry: DamageItem;
  vehicleId: string;
  accountId: string;
  onUpdated: (updated: DamageItem) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const r2Key = slot === "before" ? entry.before_key : entry.after_key;
  const imageUrl = r2Key && R2_PUBLIC ? `${R2_PUBLIC}/${r2Key}` : null;

  async function handleUpload(file: File) {
    setUploading(true);
    setError(null);
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
    try {
      const signRes = await apiFetch(
        `/api/v1/accounts/${accountId}/vehicles/${vehicleId}/damage/${entry.id}/photo/sign`,
        { method: "POST", body: JSON.stringify({ slot, ext }) }
      );
      if (!signRes.ok) { setError("Could not generate upload URL."); return; }
      const { upload_url, key } = await signRes.json();
      const putRes = await fetch(upload_url, {
        method: "PUT",
        headers: { "Content-Type": file.type || "image/jpeg" },
        body: file,
      });
      if (!putRes.ok) { setError("Upload to storage failed."); return; }
      const patchRes = await apiFetch(
        `/api/v1/accounts/${accountId}/damage/${entry.id}`,
        {
          method: "PATCH",
          body: JSON.stringify(slot === "before" ? { before_key: key } : { after_key: key }),
        }
      );
      if (!patchRes.ok) { setError("Could not save photo key."); return; }
      onUpdated(await patchRes.json());
    } catch {
      setError("An unexpected error occurred.");
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm(`Remove ${slot} photo?`)) return;
    setUploading(true);
    setError(null);
    try {
      const res = await apiFetch(
        `/api/v1/accounts/${accountId}/damage/${entry.id}/photo/${slot}`,
        { method: "DELETE" }
      );
      if (!res.ok) { setError("Could not remove photo."); return; }
      onUpdated({ ...entry, [slot === "before" ? "before_key" : "after_key"]: null });
    } catch {
      setError("An unexpected error occurred.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="dmg-photo-slot">
      <p className="dmg-photo-label">{slot === "before" ? "Before" : "After"}</p>
      {imageUrl ? (
        <div className="dmg-photo-preview">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl} alt={`${slot} photo`} className="dmg-photo-img" />
          <button
            className="dmg-photo-remove"
            onClick={handleDelete}
            disabled={uploading}
          >
            {uploading ? "…" : "Remove"}
          </button>
        </div>
      ) : (
        <button
          className="dmg-photo-upload-btn"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? "Uploading…" : `Add ${slot} photo`}
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleUpload(f);
          e.target.value = "";
        }}
      />
      {error && <p className="dmg-photo-err">{error}</p>}
    </div>
  );
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
  const [year, setYear] = useState(new Date().getFullYear());

  const { yearOptions, thisMonth, count, avgCost, annualSpend, totalSpend } = useMemo(() => {
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const allYears = [...new Set(entries.map((e) => parseInt(e.date.slice(0, 4), 10)))].sort((a, b) => b - a);
    const opts = allYears.length > 0 ? allYears : [now.getFullYear()];
    const ye = entries.filter((e) => e.date.startsWith(`${year}-`));
    const tm = ye.filter((e) => e.date.startsWith(`${year}-${mm}`)).reduce((s, e) => s + (e.repair_cost ?? 0), 0);
    const ann = ye.reduce((s, e) => s + (e.repair_cost ?? 0), 0);
    const cnt = ye.length;
    const avg = cnt > 0 ? Math.round(ann / cnt) : 0;
    const tot = entries.reduce((s, e) => s + (e.repair_cost ?? 0), 0);
    return { yearOptions: opts, thisMonth: tm, count: cnt, avgCost: avg, annualSpend: ann, totalSpend: tot };
  }, [entries, year]);

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

  function handleEntryUpdated(updated: DamageItem) {
    setEntries((prev) => prev.map((e) => e.id === updated.id ? updated : e));
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
            <h1 className="rec-title">Damage history</h1>
            <p className="rec-sub">Scratches, dents, paintwork, glass damage and accident records for this vehicle.</p>
          </div>
          {showForm ? (
            <button className="rec-btn rec-btn--ghost" onClick={() => { setShowForm(false); setSaveError(null); }}>Cancel</button>
          ) : (
            <button className="rec-btn rec-btn--primary rec-btn--icon" title="Add entry" onClick={() => { setShowForm(true); setSaveError(null); }}>+</button>
          )}
        </div>
      </header>

      {/* ---- Add form ---- */}
      {showForm && (
        <Card>
          <h2 className="rec-section-title">New damage entry</h2>
          <div className="rec-form">

            <div className="rec-form-row">
              <div className="rec-label sov-field">
                <label htmlFor="dmg-kind-sel" className="sov-field__label">Kind</label>
                <div className="sov-input-wrap">
                  <select id="dmg-kind-sel" className="sov-field__control" value={form.kind} onChange={(e) => handleFormChange("kind", e.target.value as DamageKind)} disabled={saving}>
                    {DAMAGE_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
                  </select>
                </div>
              </div>
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
                label="Repair cost (£)"
                type="text"
                inputMode="decimal"
                placeholder="Optional"
                value={form.repair_cost}
                onChange={(e) => {
                  const v = e.target.value.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1");
                  handleFormChange("repair_cost", v);
                }}
                disabled={saving}
              />
            </div>

            <TextArea
              className="rec-label rec-label--full"
              label="Description"
              rows={2}
              placeholder="Describe the damage…"
              value={form.description}
              onChange={(e) => handleFormChange("description", e.target.value)}
              disabled={saving}
            />

            <p className="rec-sub" style={{ marginTop: 0 }}>Save the entry first, then add before and after photos from the list below.</p>

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
            <span className="fuel-stat__label">Entries ({year})</span>
          </div>
          <div className="fuel-stat">
            <span className="fuel-stat__value">{avgCost > 0 ? formatGBP(avgCost) : "-"}</span>
            <span className="fuel-stat__label">Avg per entry</span>
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
          </div>
        ) : (
          <div className="rec-rows">
            {entries.map((entry) => (
              <div key={entry.id} className="dmg-entry">
                {/* ~~~~~~~~~ Row ~~~~~~~~~ */}
                <div className="pcn-row">
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
                {/* ~~~~~~~~~ Photo slots ~~~~~~~~~ */}
                <div className="dmg-photos">
                  <PhotoSlot
                    slot="before"
                    entry={entry}
                    vehicleId={id ?? ""}
                    accountId={accountId}
                    onUpdated={handleEntryUpdated}
                  />
                  <PhotoSlot
                    slot="after"
                    entry={entry}
                    vehicleId={id ?? ""}
                    accountId={accountId}
                    onUpdated={handleEntryUpdated}
                  />
                </div>
                {/* ~~~~~~~~~ Attachments ~~~~~~~~~ */}
                <EntityAttachmentPanel
                  entityType="damage"
                  entityId={entry.id}
                  accountId={accountId}
                />
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

  /* Damage entry wrapper */
  .dmg-entry { border-bottom: 0.5px solid var(--colour-border); }
  .dmg-entry:last-child { border-bottom: none; }

  /* Reuse pcn-row for damage rows */
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
  .pcn-row__amount { font-size: var(--text-sm); font-weight: var(--weight-medium); color: var(--colour-text); white-space: nowrap; }

  /* Photo slots */
  .dmg-photos {
    display: flex;
    gap: var(--space-4);
    padding: var(--space-3) var(--space-4) var(--space-4);
    flex-wrap: wrap;
  }
  .dmg-photo-slot { display: flex; flex-direction: column; gap: 6px; }
  .dmg-photo-label { font-size: var(--text-xs); color: var(--colour-text-muted); text-transform: uppercase; letter-spacing: 0.06em; margin: 0; }
  .dmg-photo-preview { position: relative; display: inline-flex; flex-direction: column; gap: 4px; }
  .dmg-photo-img {
    width: 120px;
    height: 80px;
    object-fit: cover;
    border-radius: var(--radius-md);
    border: 0.5px solid var(--colour-border);
  }
  .dmg-photo-remove {
    font-size: var(--text-xs);
    color: var(--colour-error);
    background: none;
    border: none;
    padding: 0;
    cursor: none;
    text-decoration: underline;
    text-underline-offset: 2px;
    text-align: left;
  }
  .dmg-photo-upload-btn {
    width: 120px;
    height: 80px;
    border: 1px dashed var(--colour-border);
    border-radius: var(--radius-md);
    background: rgba(255,255,255,0.02);
    font-size: var(--text-xs);
    color: var(--colour-text-muted);
    cursor: none;
    transition: border-color 0.2s, color 0.2s;
  }
  .dmg-photo-upload-btn:hover { border-color: var(--colour-accent); color: var(--colour-text); }
  .dmg-photo-upload-btn:disabled { opacity: 0.5; }
  .dmg-photo-err { font-size: var(--text-xs); color: var(--colour-error); margin: 0; }

  @media (max-width: 767px) {
    .pcn-row { flex-direction: column; align-items: flex-start; }
    .pcn-row__right { flex-wrap: wrap; }
    .dmg-photos { flex-direction: column; }
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
