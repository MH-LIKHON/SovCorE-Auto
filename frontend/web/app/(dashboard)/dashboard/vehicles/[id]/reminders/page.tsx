// ============================================================
// frontend/web/app/(dashboard)/dashboard/vehicles/[id]/reminders/page.tsx
// ============================================================
//
// Purpose:
//   Reminders management page for a vehicle. Lists scheduled
//   notifications by due date. Supports inline create, active
//   toggle via patch, and delete per row.
//
// Design:
//   Reminders are ordered soonest-due first. Each row shows the
//   reminder type, due date, configured intervals, and active
//   status. The due-date RAG matches the vehicle card renewal
//   indicators: green > 90 days, amber 31–90, red ≤ 30.
//
//   The add form captures type (select from the eleven reminder
//   types), due date, optional intervals (comma-separated days),
//   and notes. Intervals default to 90, 60, 30, 14, 7, 1 if
//   left blank.
//
//   Mirrors SovCorE QR card and list patterns exactly.
//
// Consumed by:
//   - Routed at /dashboard/vehicles/[id]/reminders
// ============================================================

"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { Card } from "@/src/components/ui/card";
import { TextArea, TextField } from "@/src/components/ui/input";
import { apiFetch, getAccountId } from "@/src/lib/api/fetch";

// ==================================================
// TYPES
// ==================================================

interface ReminderItem {
  id: string;
  type: string;
  due_date: string;
  intervals: number[];
  last_sent_interval: number | null;
  active: boolean;
  notes: string | null;
  created_at: string;
}

interface ReminderPage {
  items: ReminderItem[];
  total: number;
  page: number;
  page_size: number;
}

interface AddForm {
  type: string;
  due_date: string;
  intervals: string;
  notes: string;
}

// ==================================================
// CONSTANTS
// ==================================================

const EMPTY_FORM: AddForm = {
  type: "mot",
  due_date: "",
  intervals: "90,60,30,14,7,1",
  notes: "",
};

const REMINDER_TYPES: { value: string; label: string }[] = [
  { value: "mot", label: "MOT" },
  { value: "tax", label: "Tax" },
  { value: "insurance", label: "Insurance" },
  { value: "service", label: "Service" },
  { value: "tyres", label: "Tyres" },
  { value: "brake_fluid", label: "Brake fluid" },
  { value: "battery", label: "Battery" },
  { value: "warranty", label: "Warranty" },
  { value: "finance", label: "Finance" },
  { value: "breakdown_cover", label: "Breakdown cover" },
  { value: "custom", label: "Custom" },
];

const DEFAULT_INTERVALS = [90, 60, 30, 14, 7, 1];

// ==================================================
// HELPERS
// ==================================================

function formatDate(d: string | null): string {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function daysUntil(d: string | null): number | null {
  if (!d) return null;
  return Math.ceil((new Date(d).getTime() - Date.now()) / 86_400_000);
}

function dueBadgeClass(d: string): string {
  const days = daysUntil(d);
  if (days === null) return "rem-badge rem-badge--none";
  if (days <= 30) return "rem-badge rem-badge--red";
  if (days <= 90) return "rem-badge rem-badge--amber";
  return "rem-badge rem-badge--green";
}

function typeLabel(t: string): string {
  return REMINDER_TYPES.find((r) => r.value === t)?.label ?? t.replace(/_/g, " ");
}

function parseIntervals(raw: string): number[] {
  const parts = raw.split(",").map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n) && n > 0);
  return parts.length > 0 ? parts : DEFAULT_INTERVALS;
}

// ==================================================
// PAGE
// ==================================================

export default function RemindersPage() {
  const { id } = useParams<{ id: string }>();
  const accountId = getAccountId() ?? "";

  const [reminders, setReminders] = useState<ReminderItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<AddForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // ==================================================
  // DATA LOADING
  // ==================================================

  async function loadReminders() {
    if (!accountId || !id) return;
    setLoading(true);
    const res = await apiFetch(
      `/api/v1/accounts/${accountId}/vehicles/${id}/reminders?page=1&page_size=100`
    );
    if (res.ok) {
      const data: ReminderPage = await res.json();
      setReminders(data.items);
      setTotal(data.total);
    }
    setLoading(false);
  }

  useEffect(() => { loadReminders(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ==================================================
  // ADD FORM
  // ==================================================

  function handleFormChange<K extends keyof AddForm>(field: K, value: AddForm[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setSaveError(null);
  }

  async function handleAdd() {
    if (!form.due_date) { setSaveError("Due date is required."); return; }
    setSaving(true);
    setSaveError(null);
    try {
      const res = await apiFetch(
        `/api/v1/accounts/${accountId}/vehicles/${id}/reminders`,
        {
          method: "POST",
          body: JSON.stringify({
            type: form.type,
            due_date: form.due_date,
            intervals: parseIntervals(form.intervals),
            notes: form.notes || null,
          }),
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setSaveError(err.detail ?? "Could not save the reminder.");
        return;
      }
      setShowForm(false);
      setForm(EMPTY_FORM);
      await loadReminders();
    } catch {
      setSaveError("An unexpected error occurred.");
    } finally {
      setSaving(false);
    }
  }

  // ==================================================
  // TOGGLE ACTIVE
  // ==================================================

  async function handleToggleActive(reminder: ReminderItem) {
    setTogglingId(reminder.id);
    await apiFetch(`/api/v1/reminders/${reminder.id}`, {
      method: "PATCH",
      body: JSON.stringify({ active: !reminder.active }),
    });
    setTogglingId(null);
    setReminders((prev) =>
      prev.map((r) => (r.id === reminder.id ? { ...r, active: !r.active } : r))
    );
  }

  // ==================================================
  // DELETE
  // ==================================================

  async function handleDelete(reminderId: string) {
    if (!window.confirm("Delete this reminder? This cannot be undone.")) return;
    setDeletingId(reminderId);
    await apiFetch(`/api/v1/reminders/${reminderId}`, { method: "DELETE" });
    setDeletingId(null);
    setReminders((prev) => prev.filter((r) => r.id !== reminderId));
    setTotal((prev) => prev - 1);
  }

  // ==================================================
  // RENDER
  // ==================================================

  const active = reminders.filter((r) => r.active).length;

  return (
    <div className="rec-shell">
      {/* ---- Header ---- */}
      <header className="rec-head">
        <div className="rec-head__row">
          <div>
            <h1 className="rec-title">Reminders</h1>
            <p className="rec-sub">
              {active} active · {total} total
            </p>
          </div>
          {showForm ? (
            <button className="rec-btn rec-btn--ghost" onClick={() => { setShowForm(false); setSaveError(null); }}>Cancel</button>
          ) : (
            <button className="rec-btn rec-btn--primary rec-btn--icon" title="Add reminder" onClick={() => { setShowForm(true); setSaveError(null); }}>+</button>
          )}
        </div>
      </header>

      {/* ---- Add form ---- */}
      {showForm && (
        <Card>
          <h2 className="rec-section-title">New reminder</h2>
          <div className="rec-form">

            <div className="rec-form-row">
              <div className="rec-label sov-field">
                <label htmlFor="rem-type-sel" className="sov-field__label">Type</label>
                <div className="sov-input-wrap">
                  <select
                    id="rem-type-sel"
                    className="sov-field__control"
                    value={form.type}
                    onChange={(e) => handleFormChange("type", e.target.value)}
                    disabled={saving}
                  >
                    {REMINDER_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <TextField
                className="rec-label"
                label="Due date"
                type="date"
                value={form.due_date}
                onChange={(e) => handleFormChange("due_date", e.target.value)}
                disabled={saving}
              />
              <TextField
                className="rec-label rec-label--wide"
                label="Notify at (days before)"
                type="text"
                placeholder="90,60,30,14,7,1"
                value={form.intervals}
                onChange={(e) => handleFormChange("intervals", e.target.value)}
                disabled={saving}
              />
            </div>

            <TextArea
              className="rec-label rec-label--full"
              label="Notes"
              rows={2}
              placeholder="Optional notes…"
              value={form.notes}
              onChange={(e) => handleFormChange("notes", e.target.value)}
              disabled={saving}
            />

            {saveError && <p className="rec-error">{saveError}</p>}
            <div className="rec-form-actions">
              <button className="rec-btn rec-btn--primary" onClick={handleAdd} disabled={saving}>
                {saving ? "Saving…" : "Save reminder"}
              </button>
              <button
                className="rec-btn rec-btn--ghost"
                onClick={() => { setShowForm(false); setForm(EMPTY_FORM); setSaveError(null); }}
                disabled={saving}
              >
                Cancel
              </button>
            </div>
          </div>
        </Card>
      )}

      {/* ---- Reminder list ---- */}
      <Card>
        <div className="rec-list-head">
          <span className="rec-count">{total} reminder{total !== 1 ? "s" : ""}</span>
        </div>

        {loading ? (
          <div className="rec-skeleton" />
        ) : reminders.length === 0 ? (
          <div className="rec-empty">
            <p>No reminders set for this vehicle.</p>
            <button className="rec-btn rec-btn--primary" onClick={() => setShowForm(true)}>Add reminder</button>
          </div>
        ) : (
          <div className="rec-rows">
            {reminders.map((r) => (
              <div key={r.id} className={`rem-row${r.active ? "" : " rem-row--inactive"}`}>

                {/* ---- Left: due badge + type + intervals ---- */}
                <div className="rem-row__left">
                  <span className={dueBadgeClass(r.due_date)}>
                    {formatDate(r.due_date)}
                  </span>
                  <div className="rem-row__info">
                    <span className="rem-row__type">{typeLabel(r.type)}</span>
                    <span className="rem-row__intervals">
                      Notify at {r.intervals.sort((a, b) => b - a).join(", ")} days
                    </span>
                  </div>
                </div>

                {/* ---- Right: active toggle + delete ---- */}
                <div className="rem-row__right">
                  {!r.active && (
                    <span className="rem-inactive-label">Paused</span>
                  )}
                  <button
                    className={`rem-toggle${r.active ? " rem-toggle--on" : ""}`}
                    onClick={() => handleToggleActive(r)}
                    disabled={togglingId === r.id}
                    title={r.active ? "Pause this reminder" : "Reactivate this reminder"}
                  >
                    {togglingId === r.id ? "…" : r.active ? "Pause" : "Resume"}
                  </button>
                  <button
                    className="rec-btn rec-btn--danger-sm"
                    onClick={() => handleDelete(r.id)}
                    disabled={deletingId === r.id}
                  >
                    {deletingId === r.id ? "…" : "Delete"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <style>{REM_STYLES}</style>
    </div>
  );
}

// ==================================================
// STYLES
// ==================================================

const REM_STYLES = `
  /* ---- Reminder rows ---- */
  .rem-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
    padding: var(--space-3) var(--space-4);
    border-bottom: 0.5px solid var(--colour-border);
    flex-wrap: wrap;
    transition: opacity 0.2s;
  }
  .rem-row--inactive { opacity: 0.5; }
  .rem-row:last-child { border-bottom: none; }
  .rem-row__left { display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap; }
  .rem-row__right { display: flex; align-items: center; gap: var(--space-3); flex-shrink: 0; }
  .rem-row__info { display: flex; flex-direction: column; gap: 2px; }
  .rem-row__type { font-size: var(--text-sm); color: var(--colour-text); }
  .rem-row__intervals { font-size: var(--text-xs); color: var(--colour-text-muted); }
  .rem-inactive-label { font-size: var(--text-xs); color: var(--colour-text-muted); }

  /* ---- Due date badges ---- */
  .rem-badge {
    font-size: var(--text-xs);
    padding: 2px 8px;
    border-radius: var(--radius-full, 999px);
    border: 1px solid;
    white-space: nowrap;
    flex-shrink: 0;
    font-weight: var(--weight-medium);
  }
  .rem-badge--green  { color: #4ade80; border-color: rgba(74,222,128,0.3); background: rgba(74,222,128,0.08); }
  .rem-badge--amber  { color: #f59e0b; border-color: rgba(245,158,11,0.3); background: rgba(245,158,11,0.08); }
  .rem-badge--red    { color: #ef4444; border-color: rgba(239,68,68,0.3); background: rgba(239,68,68,0.08); }
  .rem-badge--none   { color: var(--colour-text-muted); border-color: var(--colour-border); background: none; }

  /* ---- Pause/Resume toggle ---- */
  .rem-toggle {
    background: none;
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-sm);
    padding: 3px 10px;
    font-size: var(--text-xs);
    color: var(--colour-text-muted);
    cursor: none;
    transition: border-color 0.2s, color 0.2s;
  }
  .rem-toggle:hover { border-color: var(--colour-accent); color: var(--colour-text); }
  .rem-toggle--on:hover { border-color: #f59e0b; color: #f59e0b; }

  /* ---- Select in add form ---- */
  .rec-select {
    background: var(--colour-bg);
    cursor: none;
    appearance: auto;
  }

  @media (max-width: 767px) {
    .rem-row { flex-direction: column; align-items: flex-start; }
    .rem-row__right { flex-wrap: wrap; }
  }
`;
