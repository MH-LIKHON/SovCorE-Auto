// ============================================================
// frontend/web/app/(dashboard)/dashboard/vehicles/[id]/alerts/page.tsx
// ============================================================
//
// Purpose:
//   Custom alert management page for a vehicle. Supports
//   flexible trigger conditions: specific date, recurring by
//   months/years, mileage threshold, or recurring mileage.
//   Multiple conditions can be combined on one alert.
//
// Design:
//   Condition builder is a dynamic list — "Add condition" appends
//   a blank row, each row shows type-specific fields, remove
//   button per row. email_days_before and miles_warning are
//   shared across all conditions on the alert.
//
//   The Monthly Odometer Log Reminder (account-wide mileage_log_settings)
//   is pinned as the first row — fires a prompt email on a chosen
//   day each month and uses the same rem-row / Pause / Edit UI.
//
//   Mirrors the reminders page layout exactly (rec-shell, Card,
//   rem-row pattern).
//
// Consumed by:
//   - Routed at /dashboard/vehicles/[id]/alerts
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

interface AlertCondition {
  type: "date" | "recurring" | "mileage" | "mileage_recurring";
  // date
  on?: string;
  // recurring
  unit?: "months" | "years";
  every?: number;
  start?: string;
  next_due?: string;
  last_fired?: string | null;
  // mileage
  at?: number;
  fired?: boolean;
  // mileage_recurring
  start_mileage?: number;
  next_due_mileage?: number;
  last_fired_mileage?: number | null;
}

interface AlertItem {
  id: string;
  name: string;
  conditions: AlertCondition[];
  condition_mode: string;
  email_days_before: number[];
  miles_warning: number;
  active: boolean;
  last_notified_at: string | null;
  notes: string | null;
  is_system_default: boolean;
  created_at: string;
  updated_at: string;
}

interface AlertPage {
  items: AlertItem[];
  total: number;
  page: number;
  page_size: number;
}

interface LogSettings {
  reminder_day: number;
  active: boolean;
}

// A blank draft condition row in the form.
interface ConditionDraft {
  type: AlertCondition["type"];
  on: string;
  unit: "months" | "years";
  every: string;
  start: string;
  at: string;
  start_mileage: string;
  every_miles: string;
}

interface AddForm {
  name: string;
  conditions: ConditionDraft[];
  email_days_before: string;
  miles_warning: string;
  notes: string;
}

// ==================================================
// CONSTANTS
// ==================================================

const EMPTY_CONDITION: ConditionDraft = {
  type: "date",
  on: "",
  unit: "months",
  every: "6",
  start: "",
  at: "",
  start_mileage: "",
  every_miles: "5000",
};

const EMPTY_FORM: AddForm = {
  name: "",
  conditions: [{ ...EMPTY_CONDITION }],
  email_days_before: "30,14,7,1",
  miles_warning: "500",
  notes: "",
};

const CONDITION_TYPE_LABELS: Record<AlertCondition["type"], string> = {
  date: "On a date",
  recurring: "Recurring (months/years)",
  mileage: "At mileage",
  mileage_recurring: "Every N miles",
};

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

function parseIntList(raw: string): number[] {
  return raw
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !isNaN(n) && n > 0);
}

function conditionSummary(c: AlertCondition): string {
  switch (c.type) {
    case "date":
      return `Date: ${formatDate(c.on ?? null)}`;
    case "recurring":
      return `Every ${c.every} ${c.unit} from ${formatDate(c.start ?? null)}`;
    case "mileage":
      return `At ${(c.at ?? 0).toLocaleString("en-GB")} miles`;
    case "mileage_recurring":
      return `Every ${(c.every ?? 0).toLocaleString("en-GB")} miles from ${(c.start_mileage ?? 0).toLocaleString("en-GB")}`;
    default:
      return "Unknown condition";
  }
}

function buildConditionPayload(draft: ConditionDraft): AlertCondition | null {
  switch (draft.type) {
    case "date":
      if (!draft.on) return null;
      return { type: "date", on: draft.on };
    case "recurring": {
      if (!draft.start || !draft.every) return null;
      const every = parseInt(draft.every, 10);
      if (isNaN(every) || every < 1) return null;
      // Compute next_due from start using simple offset.
      const startDate = new Date(draft.start);
      const unit = draft.unit;
      const nextDue = new Date(startDate);
      if (unit === "months") nextDue.setMonth(nextDue.getMonth() + every);
      else nextDue.setFullYear(nextDue.getFullYear() + every);
      return {
        type: "recurring",
        unit,
        every,
        start: draft.start,
        next_due: nextDue.toISOString().slice(0, 10),
        last_fired: null,
      };
    }
    case "mileage": {
      const at = parseInt(draft.at, 10);
      if (isNaN(at) || at < 1) return null;
      return { type: "mileage", at, fired: false };
    }
    case "mileage_recurring": {
      const startMi = parseInt(draft.start_mileage, 10);
      const everyMi = parseInt(draft.every_miles, 10);
      if (isNaN(startMi) || isNaN(everyMi) || startMi < 0 || everyMi < 1) return null;
      return {
        type: "mileage_recurring",
        every: everyMi,
        start_mileage: startMi,
        next_due_mileage: startMi + everyMi,
        last_fired_mileage: null,
      };
    }
    default:
      return null;
  }
}

// ==================================================
// PAGE
// ==================================================

export default function AlertsPage() {
  const { id } = useParams<{ id: string }>();
  const accountId = getAccountId() ?? "";

  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<AddForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Monthly log reminder settings
  const [logSettings, setLogSettings] = useState<LogSettings | null>(null);
  const [editingLog, setEditingLog] = useState(false);
  const [logDay, setLogDay] = useState<string>("1");
  const [savingLog, setSavingLog] = useState(false);

  // Check whether any condition in the form is mileage-based.
  const hasMileageCond = form.conditions.some(
    (c) => c.type === "mileage" || c.type === "mileage_recurring"
  );

  // ==================================================
  // DATA LOADING
  // ==================================================

  async function loadAlerts() {
    if (!accountId || !id) return;
    setLoading(true);
    const res = await apiFetch(
      `/api/v1/accounts/${accountId}/vehicles/${id}/alerts?page=1&page_size=100`
    );
    if (res.ok) {
      const data: AlertPage = await res.json();
      setAlerts(data.items);
      setTotal(data.total);
    }
    setLoading(false);
  }

  async function loadLogSettings() {
    if (!accountId) return;
    const res = await apiFetch(`/api/v1/accounts/${accountId}/mileage-settings`);
    if (res.ok) {
      const s: LogSettings = await res.json();
      setLogSettings(s);
      setLogDay(String(s.reminder_day));
    }
  }

  useEffect(() => { loadAlerts(); loadLogSettings(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ==================================================
  // FORM HELPERS
  // ==================================================

  function setField<K extends keyof Omit<AddForm, "conditions">>(
    field: K,
    value: AddForm[K]
  ) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setSaveError(null);
  }

  function setConditionField<K extends keyof ConditionDraft>(
    index: number,
    field: K,
    value: ConditionDraft[K]
  ) {
    setForm((prev) => {
      const conditions = [...prev.conditions];
      conditions[index] = { ...conditions[index], [field]: value } as ConditionDraft;
      return { ...prev, conditions };
    });
    setSaveError(null);
  }

  function addCondition() {
    setForm((prev) => ({
      ...prev,
      conditions: [...prev.conditions, { ...EMPTY_CONDITION }],
    }));
  }

  function removeCondition(index: number) {
    setForm((prev) => ({
      ...prev,
      conditions: prev.conditions.filter((_, i) => i !== index),
    }));
  }

  // ==================================================
  // SAVE
  // ==================================================

  async function handleAdd() {
    setSaveError(null);
    if (!form.name.trim()) { setSaveError("Alert name is required."); return; }
    if (form.conditions.length === 0) { setSaveError("At least one condition is required."); return; }

    const builtConditions: AlertCondition[] = [];
    for (let i = 0; i < form.conditions.length; i++) {
      const c = buildConditionPayload(form.conditions[i]!);
      if (c === null) {
        setSaveError(`Condition ${i + 1} has missing or invalid fields.`);
        return;
      }
      builtConditions.push(c);
    }

    setSaving(true);
    try {
      const res = await apiFetch(
        `/api/v1/accounts/${accountId}/vehicles/${id}/alerts`,
        {
          method: "POST",
          body: JSON.stringify({
            name: form.name.trim(),
            conditions: builtConditions,
            condition_mode: "any",
            email_days_before: parseIntList(form.email_days_before),
            miles_warning: parseInt(form.miles_warning, 10) || 500,
            notes: form.notes.trim() || null,
          }),
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setSaveError(err.detail ?? "Could not save the alert.");
        return;
      }
      setShowForm(false);
      setForm(EMPTY_FORM);
      await loadAlerts();
    } catch {
      setSaveError("An unexpected error occurred.");
    } finally {
      setSaving(false);
    }
  }

  // ==================================================
  // TOGGLE ACTIVE
  // ==================================================

  async function handleToggleActive(alert: AlertItem) {
    setTogglingId(alert.id);
    await apiFetch(`/api/v1/alerts/${alert.id}`, {
      method: "PATCH",
      body: JSON.stringify({ active: !alert.active }),
    });
    setTogglingId(null);
    setAlerts((prev) =>
      prev.map((a) => (a.id === alert.id ? { ...a, active: !a.active } : a))
    );
  }

  // ==================================================
  // DELETE
  // ==================================================

  async function handleDelete(alertId: string) {
    if (!window.confirm("Delete this alert? This cannot be undone.")) return;
    setDeletingId(alertId);
    await apiFetch(`/api/v1/alerts/${alertId}`, { method: "DELETE" });
    setDeletingId(null);
    setAlerts((prev) => prev.filter((a) => a.id !== alertId));
    setTotal((prev) => prev - 1);
  }

  // ==================================================
  // MONTHLY LOG REMINDER
  // ==================================================

  async function handleToggleLog() {
    if (!logSettings) return;
    setSavingLog(true);
    const res = await apiFetch(`/api/v1/accounts/${accountId}/mileage-settings`, {
      method: "PATCH",
      body: JSON.stringify({ active: !logSettings.active }),
    });
    if (res.ok) {
      const s: LogSettings = await res.json();
      setLogSettings(s);
    }
    setSavingLog(false);
  }

  async function handleSaveLog() {
    const day = parseInt(logDay, 10);
    if (!day || day < 1 || day > 28) return;
    setSavingLog(true);
    const res = await apiFetch(`/api/v1/accounts/${accountId}/mileage-settings`, {
      method: "PATCH",
      body: JSON.stringify({ reminder_day: day }),
    });
    if (res.ok) {
      const s: LogSettings = await res.json();
      setLogSettings(s);
      setEditingLog(false);
    }
    setSavingLog(false);
  }

  // ==================================================
  // RENDER
  // ==================================================

  const active = alerts.filter((a) => a.active).length;

  return (
    <div className="rec-shell">
      {/* ---- Header ---- */}
      <header className="rec-head">
        <div className="rec-head__row">
          <div>
            <h1 className="rec-title">Alerts</h1>
            <p className="rec-sub">{active} active · {total} total</p>
          </div>
          {showForm ? (
            <button className="rec-btn rec-btn--ghost" onClick={() => { setShowForm(false); setSaveError(null); }}>Cancel</button>
          ) : (
            <button className="rec-btn rec-btn--primary rec-btn--icon" title="Add alert" onClick={() => { setShowForm(true); setSaveError(null); }}>+</button>
          )}
        </div>
      </header>

      {/* ---- Add form ---- */}
      {showForm && (
        <Card>
          <h2 className="rec-section-title">New alert</h2>
          <div className="rec-form">

            <TextField
              className="rec-label rec-label--full"
              label="Alert name"
              type="text"
              placeholder="CAMBELT"
              value={form.name}
              onChange={(e) => setField("name", e.target.value.toUpperCase())}
              disabled={saving}
            />

            {/* ---- Conditions ---- */}
            <div className="al-cond-list">
              <p className="al-cond-label">Conditions</p>
              {form.conditions.map((cond, i) => (
                <div key={i} className="al-cond-row">
                  <div className="al-cond-type sov-field">
                    <label className="sov-field__label">Trigger type</label>
                    <div className="sov-input-wrap">
                      <select
                        className="sov-field__control"
                        value={cond.type}
                        onChange={(e) =>
                          setConditionField(i, "type", e.target.value as AlertCondition["type"])
                        }
                        disabled={saving}
                      >
                        {(Object.entries(CONDITION_TYPE_LABELS) as [AlertCondition["type"], string][]).map(
                          ([val, label]) => (
                            <option key={val} value={val}>{label}</option>
                          )
                        )}
                      </select>
                    </div>
                  </div>

                  {/* ---- Type-specific fields ---- */}
                  {cond.type === "date" && (
                    <TextField
                      className="al-cond-field"
                      label="Date"
                      type="date"
                      value={cond.on}
                      onChange={(e) => setConditionField(i, "on", e.target.value)}
                      disabled={saving}
                    />
                  )}

                  {cond.type === "recurring" && (
                    <>
                      <TextField
                        className="al-cond-field"
                        label="Start date"
                        type="date"
                        value={cond.start}
                        onChange={(e) => setConditionField(i, "start", e.target.value)}
                        disabled={saving}
                      />
                      <TextField
                        className="al-cond-field al-cond-field--narrow"
                        label="Repeat every"
                        type="number"
                        min={1}
                        value={cond.every}
                        onChange={(e) => setConditionField(i, "every", e.target.value)}
                        disabled={saving}
                      />
                      <div className="al-cond-field sov-field">
                        <label className="sov-field__label">Unit</label>
                        <div className="sov-input-wrap">
                          <select
                            className="sov-field__control"
                            value={cond.unit}
                            onChange={(e) =>
                              setConditionField(i, "unit", e.target.value as "months" | "years")
                            }
                            disabled={saving}
                          >
                            <option value="months">Months</option>
                            <option value="years">Years</option>
                          </select>
                        </div>
                      </div>
                    </>
                  )}

                  {cond.type === "mileage" && (
                    <TextField
                      className="al-cond-field"
                      label="At mileage"
                      type="number"
                      min={1}
                      placeholder="e.g. 60000"
                      value={cond.at}
                      onChange={(e) => setConditionField(i, "at", e.target.value)}
                      disabled={saving}
                    />
                  )}

                  {cond.type === "mileage_recurring" && (
                    <>
                      <TextField
                        className="al-cond-field"
                        label="Start mileage"
                        type="number"
                        min={0}
                        placeholder="e.g. 40000"
                        value={cond.start_mileage}
                        onChange={(e) => setConditionField(i, "start_mileage", e.target.value)}
                        disabled={saving}
                      />
                      <TextField
                        className="al-cond-field al-cond-field--narrow"
                        label="Repeat every (miles)"
                        type="number"
                        min={1}
                        placeholder="e.g. 5000"
                        value={cond.every_miles}
                        onChange={(e) => setConditionField(i, "every_miles", e.target.value)}
                        disabled={saving}
                      />
                    </>
                  )}

                  {form.conditions.length > 1 && (
                    <button
                      type="button"
                      className="al-cond-remove rec-btn rec-btn--danger-sm"
                      onClick={() => removeCondition(i)}
                      disabled={saving}
                      title="Remove this condition"
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}

              <button
                type="button"
                className="rec-btn rec-btn--ghost al-add-cond"
                onClick={addCondition}
                disabled={saving}
              >
                + Add condition
              </button>
            </div>

            {/* ---- Notification settings ---- */}
            <div className="rec-form-row">
              <TextField
                className="rec-label rec-label--wide"
                label="Notify N days before (date conditions)"
                type="text"
                placeholder="30,14,7,1"
                value={form.email_days_before}
                onChange={(e) => setField("email_days_before", e.target.value)}
                disabled={saving}
              />
              {hasMileageCond && (
                <TextField
                  className="rec-label"
                  label="Notify within N miles (mileage conditions)"
                  type="number"
                  min={1}
                  value={form.miles_warning}
                  onChange={(e) => setField("miles_warning", e.target.value)}
                  disabled={saving}
                />
              )}
            </div>

            <TextArea
              className="rec-label rec-label--full"
              label="Notes"
              rows={2}
              placeholder="Optional notes…"
              value={form.notes}
              onChange={(e) => setField("notes", e.target.value)}
              disabled={saving}
            />

            {saveError && <p className="rec-error">{saveError}</p>}
            <div className="rec-form-actions">
              <button
                className="rec-btn rec-btn--primary"
                onClick={handleAdd}
                disabled={saving}
              >
                {saving ? "Saving…" : "Save alert"}
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

      {/* ---- Alert list ---- */}
      <Card>
        <div className="rec-list-head">
          <span className="rec-count">{total} alert{total !== 1 ? "s" : ""}</span>
        </div>

        {loading ? (
          <div className="rec-skeleton" />
        ) : alerts.length === 0 && logSettings === null ? (
          <div className="rec-empty">
            <p>No custom alerts for this vehicle.</p>
            <button className="rec-btn rec-btn--primary" onClick={() => setShowForm(true)}>
              Add alert
            </button>
          </div>
        ) : (
          <div className="rec-rows">

            {/* ---- Monthly log reminder — pinned first ---- */}
            {logSettings !== null && (
              <div className={`rem-row${!logSettings.active ? " rem-row--inactive" : ""}`}>
                <div className="rem-row__left">
                  <div className="rem-row__info">
                    <span className="rem-row__type">Monthly Odometer Log Reminder</span>
                    {editingLog ? (
                      <div className="al-log-edit">
                        <label className="al-log-field-label">
                          Day (1–28)
                          <input
                            className="al-log-day-input"
                            type="number"
                            min={1}
                            max={28}
                            value={logDay}
                            onChange={(e) => setLogDay(e.target.value)}
                            disabled={savingLog}
                          />
                        </label>
                        <button className="rec-btn rec-btn--primary" onClick={handleSaveLog} disabled={savingLog}>
                          {savingLog ? "Saving…" : "Save"}
                        </button>
                        <button
                          className="rec-btn rec-btn--ghost"
                          onClick={() => { setEditingLog(false); setLogDay(String(logSettings.reminder_day)); }}
                          disabled={savingLog}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <span className="rem-row__intervals">
                        Fires day <strong style={{ color: "var(--colour-text)" }}>{logSettings.reminder_day}</strong> of each month. A preview reminder fires the day before.
                      </span>
                    )}
                  </div>
                </div>
                <div className="rem-row__right">
                  {!logSettings.active && <span className="rem-inactive-label">Paused</span>}
                  <span className="al-default-badge">Default</span>
                  <button
                    className={`rem-toggle${logSettings.active ? " rem-toggle--on" : ""}`}
                    onClick={handleToggleLog}
                    disabled={savingLog}
                    title={logSettings.active ? "Pause this reminder" : "Reactivate this reminder"}
                  >
                    {savingLog ? "…" : logSettings.active ? "Pause" : "Resume"}
                  </button>
                  {!editingLog && (
                    <button className="rec-btn rec-btn--ghost" onClick={() => setEditingLog(true)}>
                      Edit
                    </button>
                  )}
                </div>
              </div>
            )}

            {alerts.map((a) => (
              <div key={a.id} className={`rem-row${a.active ? "" : " rem-row--inactive"}`}>

                {/* ---- Left: name + conditions summary ---- */}
                <div className="rem-row__left">
                  <div className="rem-row__info">
                    <span className="rem-row__type">{a.name}</span>
                    <span className="rem-row__intervals">
                      {a.conditions.map(conditionSummary).join(" · ")}
                    </span>
                    {a.last_notified_at && (
                      <span className="rem-row__intervals al-fired">
                        Last fired: {formatDate(a.last_notified_at)}
                      </span>
                    )}
                  </div>
                </div>

                {/* ---- Right: active toggle + delete (locked for system defaults) ---- */}
                <div className="rem-row__right">
                  {!a.active && <span className="rem-inactive-label">Paused</span>}
                  {a.is_system_default && (
                    <span className="al-default-badge">Default</span>
                  )}
                  <button
                    className={`rem-toggle${a.active ? " rem-toggle--on" : ""}`}
                    onClick={() => handleToggleActive(a)}
                    disabled={togglingId === a.id}
                    title={a.active ? "Pause this alert" : "Reactivate this alert"}
                  >
                    {togglingId === a.id ? "…" : a.active ? "Pause" : "Resume"}
                  </button>
                  {!a.is_system_default && (
                    <button
                      className="rec-btn rec-btn--danger-sm"
                      onClick={() => handleDelete(a.id)}
                      disabled={deletingId === a.id}
                    >
                      {deletingId === a.id ? "…" : "Delete"}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <style>{AL_STYLES}</style>
    </div>
  );
}

// ==================================================
// STYLES
// ==================================================

const AL_STYLES = `
  /* ---- Monthly log reminder inline edit ---- */
  .al-log-edit {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    flex-wrap: wrap;
    margin-top: 4px;
  }
  .al-log-field-label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: var(--text-xs);
    color: var(--colour-text-muted);
  }
  .al-log-day-input {
    width: 64px;
    background: var(--colour-surface);
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-sm);
    color: var(--colour-text);
    font-size: var(--text-sm);
    padding: 4px 8px;
    cursor: none;
    outline: none;
  }
  .al-log-day-input:focus { border-color: var(--colour-accent); }

  /* ---- System default badge ---- */
  .al-default-badge {
    font-size: var(--text-xs);
    padding: 2px 8px;
    border-radius: var(--radius-full, 999px);
    border: 1px solid rgba(108,99,255,0.3);
    background: rgba(108,99,255,0.08);
    color: rgba(108,99,255,0.9);
    white-space: nowrap;
    flex-shrink: 0;
  }

  /* ---- Condition builder ---- */
  .al-cond-list { display: flex; flex-direction: column; gap: var(--space-3); margin-bottom: var(--space-4); }
  .al-cond-label { font-size: var(--text-sm); color: var(--colour-text-muted); margin: 0 0 2px; }
  .al-cond-row {
    display: flex;
    align-items: flex-end;
    gap: var(--space-3);
    flex-wrap: wrap;
    padding: var(--space-3);
    border: 0.5px solid var(--colour-border);
    border-radius: var(--radius-sm);
  }
  .al-cond-type { min-width: 180px; flex-shrink: 0; }
  .al-cond-field { min-width: 140px; }
  .al-cond-field--narrow { min-width: 100px; max-width: 120px; }
  .al-cond-remove { align-self: flex-end; margin-bottom: 1px; }
  .al-add-cond { align-self: flex-start; }
  .al-fired { color: var(--colour-amber, #f59e0b); }

  /* Inherit rem-row styles from reminders page (already in global scope if
     both pages are loaded, but included here for standalone correctness). */
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

  @media (max-width: 767px) {
    .al-cond-row { flex-direction: column; align-items: flex-start; }
    .rem-row { flex-direction: column; align-items: flex-start; }
    .rem-row__right { flex-wrap: wrap; }
  }
`;
