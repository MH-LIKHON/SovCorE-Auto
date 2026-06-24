// ============================================================
// frontend/web/app/(dashboard)/dashboard/vehicles/[id]/tasks/page.tsx
// ============================================================
//
// Purpose:
//   Task management page for a vehicle. Lists open, in-progress,
//   and completed tasks. Supports inline create, inline status
//   change, and delete per row.
//
// Design:
//   Tasks are ordered soonest-due first (nulls last). The status
//   badge uses green for completed, amber for in_progress, and
//   muted for open. The status dropdown on each row allows
//   one-click progression through the workflow.
//
//   Mirrors SovCorE QR card and list patterns exactly — same
//   rec-shell / Card / rec-btn / rec-row class conventions used
//   in Phase 3 and Phase 4.
//
// Consumed by:
//   - Routed at /dashboard/vehicles/[id]/tasks
// ============================================================

"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { Card } from "@/src/components/ui/card";
import { TextArea, TextField } from "@/src/components/ui/input";
import { apiFetch, getAccountId } from "@/src/lib/api/fetch";

// ==================================================
// TYPES
// ==================================================

interface TaskItem {
  id: string;
  title: string;
  status: "open" | "in_progress" | "completed";
  due_date: string | null;
  notes: string | null;
  assignee_user_id: string | null;
  created_at: string;
  updated_at: string;
}

interface TaskPage {
  items: TaskItem[];
  total: number;
  page: number;
  page_size: number;
}

interface AddForm {
  title: string;
  due_date: string;
  notes: string;
}

// ==================================================
// CONSTANTS
// ==================================================

const EMPTY_FORM: AddForm = { title: "", due_date: "", notes: "" };

const STATUS_LABELS: Record<string, string> = {
  open: "Open",
  in_progress: "In progress",
  completed: "Completed",
};

// ==================================================
// HELPERS
// ==================================================

function formatDate(d: string | null): string {
  if (!d) return "—";
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

function statusBadgeClass(s: string): string {
  if (s === "completed") return "tsk-badge tsk-badge--green";
  if (s === "in_progress") return "tsk-badge tsk-badge--amber";
  return "tsk-badge tsk-badge--muted";
}

function dueBadgeClass(d: string | null): string {
  const days = daysUntil(d);
  if (days === null) return "";
  if (days < 0) return "tsk-due tsk-due--red";
  if (days <= 7) return "tsk-due tsk-due--amber";
  return "tsk-due";
}

// ==================================================
// PAGE
// ==================================================

export default function TasksPage() {
  const { id } = useParams<{ id: string }>();
  const accountId = getAccountId() ?? "";

  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<AddForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // ==================================================
  // DATA LOADING
  // ==================================================

  async function loadTasks() {
    if (!accountId || !id) return;
    setLoading(true);
    const res = await apiFetch(
      `/api/v1/accounts/${accountId}/vehicles/${id}/tasks?page=1&page_size=100`
    );
    if (res.ok) {
      const data: TaskPage = await res.json();
      setTasks(data.items);
      setTotal(data.total);
    }
    setLoading(false);
  }

  useEffect(() => { loadTasks(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ==================================================
  // ADD FORM
  // ==================================================

  function handleFormChange<K extends keyof AddForm>(field: K, value: AddForm[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setSaveError(null);
  }

  async function handleAdd() {
    if (!form.title.trim()) { setSaveError("Title is required."); return; }
    setSaving(true);
    setSaveError(null);
    try {
      const res = await apiFetch(
        `/api/v1/accounts/${accountId}/vehicles/${id}/tasks`,
        {
          method: "POST",
          body: JSON.stringify({
            title: form.title.trim(),
            due_date: form.due_date || null,
            notes: form.notes || null,
          }),
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setSaveError(err.detail ?? "Could not save the task.");
        return;
      }
      setShowForm(false);
      setForm(EMPTY_FORM);
      await loadTasks();
    } catch {
      setSaveError("An unexpected error occurred.");
    } finally {
      setSaving(false);
    }
  }

  // ==================================================
  // STATUS UPDATE
  // ==================================================

  async function handleStatusChange(task: TaskItem, newStatus: string) {
    setUpdatingId(task.id);
    await apiFetch(`/api/v1/tasks/${task.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: newStatus }),
    });
    setUpdatingId(null);
    setTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, status: newStatus as TaskItem["status"] } : t))
    );
  }

  // ==================================================
  // DELETE
  // ==================================================

  async function handleDelete(taskId: string) {
    if (!window.confirm("Delete this task? This cannot be undone.")) return;
    setDeletingId(taskId);
    await apiFetch(`/api/v1/tasks/${taskId}`, { method: "DELETE" });
    setDeletingId(null);
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
    setTotal((prev) => prev - 1);
  }

  // ==================================================
  // RENDER
  // ==================================================

  const open = tasks.filter((t) => t.status === "open").length;
  const inProgress = tasks.filter((t) => t.status === "in_progress").length;

  return (
    <div className="rec-shell">
      {/* ---- Header ---- */}
      <header className="rec-head">
        <Link href={`/dashboard/vehicles/${id}`} className="rec-back">← Vehicle</Link>
        <div className="rec-head__row">
          <div>
            <h1 className="rec-title">Tasks</h1>
            <p className="rec-sub">
              {open} open · {inProgress} in progress
            </p>
          </div>
          <button
            className="rec-btn rec-btn--primary"
            onClick={() => { setShowForm(!showForm); setSaveError(null); }}
          >
            {showForm ? "Cancel" : "Add task"}
          </button>
        </div>
      </header>

      {/* ---- Add form ---- */}
      {showForm && (
        <Card>
          <h2 className="rec-section-title">New task</h2>
          <div className="rec-form">

            <TextField
              className="rec-label rec-label--full"
              label="Title"
              type="text"
              placeholder="What needs to be done?"
              value={form.title}
              onChange={(e) => handleFormChange("title", e.target.value)}
              disabled={saving}
            />

            <div className="rec-form-row">
              <TextField
                className="rec-label"
                label="Due date"
                type="date"
                value={form.due_date}
                onChange={(e) => handleFormChange("due_date", e.target.value)}
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
                {saving ? "Saving…" : "Save task"}
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

      {/* ---- Task list ---- */}
      <Card>
        <div className="rec-list-head">
          <span className="rec-count">{total} task{total !== 1 ? "s" : ""}</span>
        </div>

        {loading ? (
          <div className="rec-skeleton" />
        ) : tasks.length === 0 ? (
          <div className="rec-empty">
            <p>No tasks recorded for this vehicle.</p>
            <button className="rec-btn rec-btn--primary" onClick={() => setShowForm(true)}>Add task</button>
          </div>
        ) : (
          <div className="rec-rows">
            {tasks.map((t) => (
              <div key={t.id} className="tsk-row">

                {/* ---- Left: status badge + title ---- */}
                <div className="tsk-row__left">
                  <span className={statusBadgeClass(t.status)}>
                    {STATUS_LABELS[t.status]}
                  </span>
                  <div className="tsk-row__info">
                    <span className="tsk-row__title">{t.title}</span>
                    {t.notes && <span className="tsk-row__notes">{t.notes}</span>}
                  </div>
                </div>

                {/* ---- Right: due date + status select + delete ---- */}
                <div className="tsk-row__right">
                  {t.due_date && (
                    <span className={dueBadgeClass(t.due_date)}>
                      {formatDate(t.due_date)}
                    </span>
                  )}

                  <select
                    className="tsk-select"
                    value={t.status}
                    disabled={updatingId === t.id}
                    onChange={(e) => handleStatusChange(t, e.target.value)}
                  >
                    <option value="open">Open</option>
                    <option value="in_progress">In progress</option>
                    <option value="completed">Completed</option>
                  </select>

                  <button
                    className="rec-btn rec-btn--danger-sm"
                    onClick={() => handleDelete(t.id)}
                    disabled={deletingId === t.id}
                  >
                    {deletingId === t.id ? "…" : "Delete"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <style>{TSK_STYLES}</style>
    </div>
  );
}

// ==================================================
// STYLES
// ==================================================

const TSK_STYLES = `
  /* ---- Task rows ---- */
  .tsk-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
    padding: var(--space-3) var(--space-4);
    border-bottom: 0.5px solid var(--colour-border);
    flex-wrap: wrap;
  }
  .tsk-row:last-child { border-bottom: none; }
  .tsk-row__left { display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap; }
  .tsk-row__right { display: flex; align-items: center; gap: var(--space-3); flex-shrink: 0; flex-wrap: wrap; }
  .tsk-row__info { display: flex; flex-direction: column; gap: 2px; }
  .tsk-row__title { font-size: var(--text-sm); color: var(--colour-text); }
  .tsk-row__notes { font-size: var(--text-xs); color: var(--colour-text-muted); }

  /* ---- Status badges ---- */
  .tsk-badge {
    font-size: var(--text-xs);
    padding: 2px 8px;
    border-radius: var(--radius-full, 999px);
    border: 1px solid;
    white-space: nowrap;
    flex-shrink: 0;
  }
  .tsk-badge--green  { color: #4ade80; border-color: rgba(74,222,128,0.3); background: rgba(74,222,128,0.08); }
  .tsk-badge--amber  { color: #f59e0b; border-color: rgba(245,158,11,0.3); background: rgba(245,158,11,0.08); }
  .tsk-badge--muted  { color: var(--colour-text-muted); border-color: var(--colour-border); background: none; }

  /* ---- Due date display ---- */
  .tsk-due { font-size: var(--text-sm); color: var(--colour-text-muted); white-space: nowrap; }
  .tsk-due--amber { color: #f59e0b; }
  .tsk-due--red   { color: #ef4444; }

  /* ---- Status select ---- */
  .tsk-select {
    background: var(--colour-bg);
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-sm);
    padding: 4px 8px;
    font-size: var(--text-xs);
    color: var(--colour-text-muted);
    cursor: none;
    outline: none;
  }
  .tsk-select:focus { border-color: var(--colour-accent); }

  @media (max-width: 767px) {
    .tsk-row { flex-direction: column; align-items: flex-start; }
    .tsk-row__right { flex-wrap: wrap; }
  }
`;
