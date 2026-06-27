// ============================================================
// frontend/web/app/(dashboard)/dashboard/vehicles/[id]/damage/page.tsx
// ============================================================
//
// Purpose:
//   Damage history page for a vehicle. One place for everything
//   damage-related: stats, entry management, and inline before/
//   after photo galleries per entry.
//
// Design:
//   Damage kind values: scratch, dent, paintwork, accident,
//   glass, stone_chip. Each kind has a distinct colour badge.
//   Each entry has a status badge (urgent/in_progress/deferred/
//   resolved). Status gates photo deletion: photos on active
//   entries cannot be deleted; resolved entries allow deletion
//   with a typed DELETE confirmation modal.
//
//   Before/after photo galleries are inline on each entry row.
//   Multiple photos per slot are supported. Add button always
//   visible; Remove only appears when entry is resolved.
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
import { apiFetch, apiUpload, getAccountId } from "@/src/lib/api/fetch";

// ==================================================
// TYPES
// ==================================================

type DamageKind   = "scratch" | "dent" | "paintwork" | "accident" | "glass" | "stone_chip";
type DamageStatus = "urgent" | "in_progress" | "deferred" | "resolved";

interface DamagePhotoItem {
  id: string;
  r2_key: string;
  url: string | null;
  display_order: number;
}

interface DamageItem {
  id: string;
  kind: DamageKind;
  status: DamageStatus;
  description: string | null;
  date: string;
  repair_cost: number | null;
  before_photos: DamagePhotoItem[];
  after_photos: DamagePhotoItem[];
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

const DAMAGE_KINDS: { value: DamageKind; label: string }[] = [
  { value: "scratch",    label: "Scratch" },
  { value: "dent",       label: "Dent" },
  { value: "paintwork",  label: "Paintwork" },
  { value: "accident",   label: "Accident" },
  { value: "glass",      label: "Glass" },
  { value: "stone_chip", label: "Stone chip" },
];

const STATUS_LABELS: Record<DamageStatus, string> = {
  urgent:      "Urgent",
  in_progress: "In Progress",
  deferred:    "Deferred",
  resolved:    "Resolved",
};

const STATUS_CLASS: Record<DamageStatus, string> = {
  urgent:      "dmg-status dmg-status--urgent",
  in_progress: "dmg-status dmg-status--in-progress",
  deferred:    "dmg-status dmg-status--deferred",
  resolved:    "dmg-status dmg-status--resolved",
};

const EMPTY_FORM: AddForm = {
  kind:        "scratch",
  description: "",
  date:        new Date().toISOString().slice(0, 10),
  repair_cost: "",
};

const ACCEPTED_IMAGE = "image/jpeg,image/png,image/webp";

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
// TYPED DELETE MODAL
// ==================================================

function TypedDeleteModal({
  open,
  warning,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  warning: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [typed, setTyped] = useState("");
  useEffect(() => { if (open) setTyped(""); }, [open]);
  if (!open) return null;
  return (
    <div className="dmg-modal-backdrop" onClick={onCancel}>
      <div className="dmg-modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="dmg-modal-title">Delete photo</h3>
        <p className="dmg-modal-body">{warning}</p>
        <p className="dmg-modal-caution">
          This action is permanent. The photo will be deleted from storage and cannot be recovered.
        </p>
        <input
          type="text"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder="Type DELETE to confirm"
          className="dmg-modal-input"
          autoFocus
        />
        <div className="dmg-modal-actions">
          <button onClick={onCancel} className="rec-btn rec-btn--secondary">Cancel</button>
          <button
            onClick={onConfirm}
            disabled={typed !== "DELETE"}
            className="rec-btn dmg-btn--danger"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ==================================================
// DAMAGE PHOTO SLOT
// ==================================================

function DamagePhotoSlot({
  slot,
  photos,
  entry,
  vehicleId,
  accountId,
  onAdded,
  onRequestDelete,
}: {
  slot: "before" | "after";
  photos: DamagePhotoItem[];
  entry: DamageItem;
  vehicleId: string;
  accountId: string;
  onAdded: (updated: DamageItem) => void;
  onRequestDelete: (entry: DamageItem, photo: DamagePhotoItem, slot: "before" | "after") => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canDelete = entry.status === "resolved";

  async function handleUpload(file: File) {
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("slot", slot);
      const res = await apiUpload(
        `/api/v1/accounts/${accountId}/vehicles/${vehicleId}/damage/${entry.id}/photo/upload`,
        form,
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.detail ?? "Upload failed. Please try again.");
        return;
      }
      onAdded(await res.json());
    } catch {
      setError("An unexpected error occurred.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="dmg-slot">
      <p className="dmg-slot__label">{slot === "before" ? "Before" : "After"}</p>
      <div className="dmg-slot__row">
        {photos.map((photo) => (
          <div key={photo.id} className="dmg-slot__item">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo.url ?? ""} alt={`${slot} damage`} className="dmg-slot__img" />
            {canDelete && (
              <button
                className="rec-btn rec-btn--danger-sm"
                onClick={() => onRequestDelete(entry, photo, slot)}
              >
                Remove
              </button>
            )}
          </div>
        ))}
        <button
          className="dmg-slot__add"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? "Uploading…" : `Add ${slot}`}
        </button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_IMAGE}
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleUpload(f);
          e.target.value = "";
        }}
      />
      {error && <p className="dmg-slot__err">{error}</p>}
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

  // Damage photo delete modal
  const [deleteModal, setDeleteModal] = useState<{
    entry: DamageItem;
    photo: DamagePhotoItem;
    slot: "before" | "after";
    deleting: boolean;
  } | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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
  // DELETE ENTRY
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
  // DAMAGE PHOTOS
  // ==================================================

  function handleEntryUpdated(updated: DamageItem) {
    setEntries((prev) => prev.map((e) => e.id === updated.id ? updated : e));
  }

  function openDeleteModal(entry: DamageItem, photo: DamagePhotoItem, slot: "before" | "after") {
    setDeleteError(null);
    setDeleteModal({ entry, photo, slot, deleting: false });
  }

  async function confirmDamageDelete() {
    if (!deleteModal || !accountId) return;
    setDeleteModal((m) => m ? { ...m, deleting: true } : null);
    setDeleteError(null);
    const { entry, photo, slot } = deleteModal;
    try {
      const res = await apiFetch(
        `/api/v1/accounts/${accountId}/damage/${entry.id}/photos/${photo.id}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setDeleteError(data.detail ?? "Could not delete photo.");
        setDeleteModal((m) => m ? { ...m, deleting: false } : null);
        return;
      }
      setEntries((prev) =>
        prev.map((e) =>
          e.id === entry.id
            ? {
                ...e,
                before_photos: slot === "before" ? e.before_photos.filter((p) => p.id !== photo.id) : e.before_photos,
                after_photos:  slot === "after"  ? e.after_photos.filter((p)  => p.id !== photo.id) : e.after_photos,
              }
            : e,
        ),
      );
      setDeleteModal(null);
    } catch {
      setDeleteError("An unexpected error occurred.");
      setDeleteModal((m) => m ? { ...m, deleting: false } : null);
    }
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
            <p className="rec-sub" style={{ marginTop: 0 }}>Save the entry first, then add before and after photos directly on the entry below.</p>
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
                {/* ~~~~~~~~~ Summary row ~~~~~~~~~ */}
                <div className="pcn-row">
                  <div className="pcn-row__left">
                    <span className={kindBadgeClass(entry.kind)}>{kindLabel(entry.kind)}</span>
                    <span className={STATUS_CLASS[entry.status]}>{STATUS_LABELS[entry.status]}</span>
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

                {/* ~~~~~~~~~ Before / After photos ~~~~~~~~~ */}
                <div className="dmg-photos-area">
                  {entry.status !== "resolved" && (
                    <p className="dmg-photo-note">
                      Photos can only be removed once this entry is marked Resolved.
                    </p>
                  )}
                  <div className="dmg-photo-slots">
                    <DamagePhotoSlot
                      slot="before"
                      photos={entry.before_photos}
                      entry={entry}
                      vehicleId={id ?? ""}
                      accountId={accountId}
                      onAdded={handleEntryUpdated}
                      onRequestDelete={openDeleteModal}
                    />
                    <DamagePhotoSlot
                      slot="after"
                      photos={entry.after_photos}
                      entry={entry}
                      vehicleId={id ?? ""}
                      accountId={accountId}
                      onAdded={handleEntryUpdated}
                      onRequestDelete={openDeleteModal}
                    />
                  </div>
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

      {/* ---- Typed delete modal ---- */}
      {deleteModal && (
        <>
          <TypedDeleteModal
            open={!deleteModal.deleting}
            warning={`You are about to permanently delete a ${deleteModal.slot} photo from the "${kindLabel(deleteModal.entry.kind)}" entry (${formatDate(deleteModal.entry.date)}).`}
            onConfirm={confirmDamageDelete}
            onCancel={() => setDeleteModal(null)}
          />
          {deleteError && <p className="dmg-modal-outer-err">{deleteError}</p>}
        </>
      )}

      <style>{DMG_STYLES}</style>
    </div>
  );
}

// ==================================================
// STYLES
// ==================================================

const DMG_STYLES = `
  /* Damage kind badges */
  .dmg-badge {
    font-size: var(--text-xs); padding: 2px 8px;
    border-radius: var(--radius-full, 999px); border: 1px solid; white-space: nowrap;
  }
  .dmg-badge--default  { color: var(--colour-text-muted); border-color: var(--colour-border); background: rgba(255,255,255,0.04); }
  .dmg-badge--accident { color: #f87171; border-color: rgba(248,113,113,0.3); background: rgba(248,113,113,0.08); }
  .dmg-badge--glass    { color: #60a5fa; border-color: rgba(96,165,250,0.3); background: rgba(96,165,250,0.08); }

  /* Damage status badges */
  .dmg-status {
    font-size: var(--text-xs); padding: 2px 8px; border-radius: var(--radius-full, 999px);
    font-weight: var(--weight-medium); white-space: nowrap; border: 1px solid;
  }
  .dmg-status--urgent      { color: #f87171; border-color: rgba(248,113,113,0.35); background: rgba(248,113,113,0.08); }
  .dmg-status--in-progress { color: #fbbf24; border-color: rgba(251,191,36,0.35);  background: rgba(251,191,36,0.08); }
  .dmg-status--deferred    { color: #60a5fa; border-color: rgba(96,165,250,0.35);  background: rgba(96,165,250,0.08); }
  .dmg-status--resolved    { color: #4ade80; border-color: rgba(74,222,128,0.35);  background: rgba(74,222,128,0.08); }

  /* Damage entry wrapper */
  .dmg-entry { border-bottom: 0.5px solid var(--colour-border); }
  .dmg-entry:last-child { border-bottom: none; }

  /* Reuse pcn-row for damage summary rows */
  .pcn-row {
    display: flex; align-items: center; justify-content: space-between;
    gap: var(--space-3); padding: var(--space-3) var(--space-4); flex-wrap: wrap;
  }
  .pcn-row__left  { display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap; }
  .pcn-row__right { display: flex; align-items: center; gap: var(--space-3); flex-shrink: 0; }
  .pcn-row__date      { font-size: var(--text-sm); color: var(--colour-text-muted); white-space: nowrap; }
  .pcn-row__authority { font-size: var(--text-sm); color: var(--colour-text); }
  .pcn-row__amount    { font-size: var(--text-sm); font-weight: var(--weight-medium); color: var(--colour-text); white-space: nowrap; }

  /* Before / after photos area */
  .dmg-photos-area { padding: 0 var(--space-4) var(--space-4); }
  .dmg-photo-note  { font-size: var(--text-xs); color: var(--colour-text-muted); font-style: italic; margin: 0 0 var(--space-3); }
  .dmg-photo-slots { display: flex; gap: var(--space-6); flex-wrap: wrap; }

  /* Photo slot — label + horizontal row of thumbs + add tile */
  .dmg-slot { display: flex; flex-direction: column; gap: 6px; }
  .dmg-slot__label { font-size: var(--text-xs); color: var(--colour-text-muted); text-transform: uppercase; letter-spacing: 0.06em; margin: 0; }
  .dmg-slot__row   { display: flex; gap: var(--space-3); flex-wrap: wrap; align-items: flex-start; }
  .dmg-slot__item  { display: flex; flex-direction: column; gap: 4px; }
  .dmg-slot__img {
    width: 140px; height: 96px; object-fit: cover;
    border-radius: var(--radius-md); border: 0.5px solid var(--colour-border); display: block;
  }
  .dmg-slot__add {
    width: 140px; height: 96px; border: 1px dashed var(--colour-border);
    border-radius: var(--radius-md); background: rgba(255,255,255,0.02);
    font-size: var(--text-xs); color: var(--colour-text-muted); cursor: none; flex-shrink: 0;
    transition: border-color 0.2s, color 0.2s;
  }
  .dmg-slot__add:hover:not(:disabled) { border-color: var(--colour-accent); color: var(--colour-text); }
  .dmg-slot__add:disabled { opacity: 0.5; }
  .dmg-slot__err { font-size: var(--text-xs); color: var(--colour-error); margin: 0; }

  /* Typed delete modal */
  .dmg-modal-backdrop {
    position: fixed; inset: 0; background: rgba(0,0,0,0.65); z-index: 200;
    display: flex; align-items: center; justify-content: center; padding: var(--space-4);
  }
  .dmg-modal {
    background: var(--colour-surface, #1a1a2e); border: 0.5px solid var(--colour-border);
    border-radius: var(--radius-lg); padding: var(--space-6); max-width: 420px; width: 100%;
    display: flex; flex-direction: column; gap: var(--space-4);
  }
  .dmg-modal-title   { font-size: var(--text-lg); font-weight: var(--weight-semibold); margin: 0; }
  .dmg-modal-body    { font-size: var(--text-sm); color: var(--colour-text); margin: 0; }
  .dmg-modal-caution {
    font-size: var(--text-sm); color: var(--colour-error); margin: 0;
    padding: var(--space-3); background: rgba(248,113,113,0.08);
    border: 1px solid rgba(248,113,113,0.25); border-radius: var(--radius-md);
  }
  .dmg-modal-input {
    width: 100%; padding: 8px 12px; font-size: var(--text-sm);
    background: rgba(255,255,255,0.04); border: 1px solid var(--colour-border);
    border-radius: var(--radius-md); color: var(--colour-text); outline: none; font-family: inherit;
  }
  .dmg-modal-input:focus { border-color: var(--colour-accent); }
  .dmg-modal-actions { display: flex; gap: var(--space-3); justify-content: flex-end; }
  .dmg-modal-outer-err { font-size: var(--text-xs); color: var(--colour-error); }
  .dmg-btn--danger {
    background: rgba(239,68,68,0.12); border-color: rgba(239,68,68,0.45); color: #f87171;
    transition: background 0.2s, border-color 0.2s, color 0.2s, transform 0.15s;
  }
  .dmg-btn--danger:hover:not(:disabled) { background: rgba(239,68,68,0.22); border-color: #f87171; color: #fff; transform: translateY(-1px); }
  .dmg-btn--danger:disabled { opacity: 0.35; }

  @media (max-width: 767px) {
    .pcn-row { flex-direction: column; align-items: flex-start; }
    .pcn-row__right { flex-wrap: wrap; }
    .dmg-photo-slots { flex-direction: column; }
  }

  /* ---- Summary card ---- */
  .rec-section-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-4); }
  .fuel-stats {
    display: grid; grid-template-columns: repeat(5, 1fr); gap: var(--space-3);
  }
  .fuel-stat {
    display: flex; flex-direction: column; gap: 4px;
    padding: var(--space-3); border-radius: var(--radius-md);
    background: rgba(255,255,255,0.03); border: 0.5px solid var(--colour-border);
  }
  .fuel-stat__value { font-size: var(--text-lg); font-weight: var(--weight-semibold); color: var(--colour-text); }
  .fuel-stat__label { font-size: var(--text-xs); color: var(--colour-text-muted); }
  .rpt-year-select {
    background: var(--colour-bg); border: 1px solid var(--colour-border);
    border-radius: var(--radius-sm); padding: 4px 8px; font-size: var(--text-sm);
    color: var(--colour-text); cursor: none; outline: none; transition: border-color 0.2s;
  }
  .rpt-year-select:focus { border-color: var(--colour-accent); }
  @media (max-width: 900px) {
    .fuel-stats { grid-template-columns: repeat(2, 1fr); }
    .fuel-stats .fuel-stat:last-child { grid-column: 1 / -1; }
  }
`;
