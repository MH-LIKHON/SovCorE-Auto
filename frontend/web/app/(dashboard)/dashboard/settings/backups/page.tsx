// ============================================================
// frontend/web/app/(dashboard)/dashboard/settings/backups/page.tsx
// ============================================================
//
// Purpose:
//   Account backups settings page. Lists all backup runs with
//   their status, size, and timestamp. Allows owners and admins
//   to trigger a new manual backup, download a completed backup,
//   and restore data from a completed backup archive.
//
// Design:
//   Mirrors SovCorE QR settings card and table patterns exactly:
//   rec-shell, Card, set-section, set-btn, status badges.
//
//   Trigger — POST /accounts/{id}/backups. The UI shows a loading
//   state on the button and reloads the list on completion.
//
//   Download — GET /accounts/{id}/backups/{bid}/download returns
//   a presigned R2 URL. The frontend opens it in a new tab to
//   start the download.
//
//   Restore — POST /accounts/{id}/backups/{bid}/restore. A
//   confirmation dialog is shown before proceeding. The response
//   shows the per-entity row counts that were inserted.
//
//   Scheduled backups run automatically at 02:00 UTC each night.
//   This page explains the schedule but does not provide a toggle
//   (it is always on in Phase 7; an on/off preference is deferred
//   to Phase 8 or the settings future work).
//
//   Responsive:
//     > 1023 px: full table layout.
//     ≤ 767 px: table columns compress; size and completed_at
//               are hidden to keep the row readable.
//
// Consumed by:
//   - Routed at /dashboard/settings/backups
// ============================================================

"use client";

import { useEffect, useState } from "react";

import { Card } from "@/src/components/ui/card";
import { apiFetch, getAccountId } from "@/src/lib/api/fetch";

// ==================================================
// TYPES
// ==================================================

interface Backup {
  id: string;
  account_id: string;
  kind: "manual" | "scheduled";
  r2_key: string | null;
  size_bytes: number | null;
  status: "running" | "complete" | "failed";
  created_at: string;
  completed_at: string | null;
}

interface RestoreResult {
  backup_id: string;
  vehicles_restored: number;
  records_restored: number;
  documents_restored: number;
  tasks_restored: number;
  reminders_restored: number;
  pcns_restored: number;
  damage_restored: number;
  warranties_restored: number;
}

// ==================================================
// HELPERS
// ==================================================

function formatDate(d: string | null): string {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatBytes(n: number | null): string {
  if (n == null) return "-";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

// ==================================================
// PAGE
// ==================================================

export default function BackupsPage() {
  const accountId = getAccountId() ?? "";
  const [backups, setBackups] = useState<Backup[]>([]);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [triggerError, setTriggerError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [restoreResult, setRestoreResult] = useState<RestoreResult | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  async function load() {
    if (!accountId) return;
    setLoading(true);
    const res = await apiFetch(`/api/v1/accounts/${accountId}/backups`);
    if (res.ok) setBackups(await res.json());
    setLoading(false);
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ==================================================
  // TRIGGER
  // ==================================================

  async function handleTrigger() {
    if (!accountId) return;
    setTriggering(true);
    setTriggerError(null);
    const res = await apiFetch(`/api/v1/accounts/${accountId}/backups`, {
      method: "POST",
      body: JSON.stringify({ kind: "manual" }),
    });
    setTriggering(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setTriggerError(data.detail ?? "Backup failed. Please try again.");
      return;
    }
    await load();
  }

  // ==================================================
  // DOWNLOAD
  // ==================================================

  async function handleDownload(backup: Backup) {
    if (!accountId) return;
    const res = await apiFetch(
      `/api/v1/accounts/${accountId}/backups/${backup.id}/download`
    );
    if (!res.ok) return;
    const data = await res.json();
    // Open the presigned URL in a new tab to start the download.
    window.open(data.download_url, "_blank", "noopener");
  }

  // ==================================================
  // RESTORE
  // ==================================================

  async function handleRestore(backup: Backup) {
    if (!accountId) return;
    const confirmed = window.confirm(
      "Restore data from this backup?\n\n" +
      "Rows that already exist in the database are skipped (no data will be overwritten). " +
      "Only rows missing from the current database are inserted back. " +
      "This cannot be undone without another backup.\n\n" +
      "Continue?"
    );
    if (!confirmed) return;

    setRestoring(backup.id);
    setRestoreResult(null);
    setRestoreError(null);

    const res = await apiFetch(
      `/api/v1/accounts/${accountId}/backups/${backup.id}/restore`,
      { method: "POST" }
    );
    setRestoring(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setRestoreError(data.detail ?? "Restore failed. Please try again.");
      return;
    }
    setRestoreResult(await res.json());
  }

  // ==================================================
  // RENDER
  // ==================================================

  return (
    <div className="set-shell">

      {/* ---- Header ---- */}
      <header className="set-head">
        <h1 className="set-title">Backups</h1>
        <p className="set-sub">Protect your account data with regular backups stored in R2.</p>
      </header>

      {/* ---- Schedule notice ---- */}
      <Card>
        <h2 className="set-section">Automatic backups</h2>
        <p className="set-muted">
          Scheduled backups run automatically each night at 02:00 UTC and are kept in your
          account's R2 bucket. Manual backups can be triggered at any time below.
        </p>
      </Card>

      {/* ---- Trigger ---- */}
      <Card>
        <h2 className="set-section">Trigger a backup</h2>
        <p className="set-muted" style={{ marginBottom: "var(--space-4)" }}>
          Creates a full snapshot of all vehicles, records, documents, tasks, reminders,
          PCNs, damage entries, and warranties for this account.
        </p>
        {triggerError && <p className="set-error" style={{ marginBottom: "var(--space-3)" }}>{triggerError}</p>}
        <button
          className="set-btn set-btn--primary"
          onClick={handleTrigger}
          disabled={triggering}
        >
          {triggering ? "Creating backup…" : "Create backup now"}
        </button>
      </Card>

      {/* ---- Restore result notice ---- */}
      {restoreResult && (
        <Card>
          <h2 className="set-section" style={{ color: "var(--colour-success, #22c55e)" }}>
            Restore complete
          </h2>
          <div className="bkp-restore-grid">
            {[
              ["Vehicles", restoreResult.vehicles_restored],
              ["Records", restoreResult.records_restored],
              ["Documents", restoreResult.documents_restored],
              ["Tasks", restoreResult.tasks_restored],
              ["Reminders", restoreResult.reminders_restored],
              ["PCNs", restoreResult.pcns_restored],
              ["Damage entries", restoreResult.damage_restored],
              ["Warranties", restoreResult.warranties_restored],
            ].map(([label, count]) => (
              <div key={label as string} className="bkp-restore-stat">
                <span className="bkp-restore-stat__value">{count as number}</span>
                <span className="bkp-restore-stat__label">{label as string} inserted</span>
              </div>
            ))}
          </div>
        </Card>
      )}
      {restoreError && (
        <Card>
          <p className="set-error">{restoreError}</p>
        </Card>
      )}

      {/* ---- Backup list ---- */}
      <Card>
        <div className="rec-list-head">
          <h2 className="set-section" style={{ margin: 0 }}>Backup history</h2>
          {loading && <span className="set-muted" style={{ fontSize: "var(--text-xs)" }}>Loading…</span>}
        </div>

        {!loading && backups.length === 0 && (
          <div className="rec-empty">
            <p>No backups yet. Trigger one above or wait for the nightly run.</p>
          </div>
        )}

        {backups.length > 0 && (
          <div className="bkp-table-wrap">
            <table className="bkp-table">
              <thead>
                <tr>
                  <th>Kind</th>
                  <th>Status</th>
                  <th className="bkp-col--size">Size</th>
                  <th>Created</th>
                  <th className="bkp-col--completed">Completed</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {backups.map((b) => (
                  <tr key={b.id} className="bkp-row">
                    <td>
                      <span className={`bkp-kind bkp-kind--${b.kind}`}>
                        {b.kind === "scheduled" ? "Scheduled" : "Manual"}
                      </span>
                    </td>
                    <td>
                      <span className={`bkp-status bkp-status--${b.status}`}>
                        {b.status === "complete" ? "Complete" : b.status === "failed" ? "Failed" : "Running"}
                      </span>
                    </td>
                    <td className="bkp-col--size set-muted">{formatBytes(b.size_bytes)}</td>
                    <td className="set-muted">{formatDate(b.created_at)}</td>
                    <td className="bkp-col--completed set-muted">{formatDate(b.completed_at)}</td>
                    <td>
                      {b.status === "complete" && (
                        <div className="bkp-actions">
                          <button
                            className="bkp-action-btn"
                            onClick={() => handleDownload(b)}
                          >
                            Download
                          </button>
                          <button
                            className="bkp-action-btn bkp-action-btn--warn"
                            onClick={() => handleRestore(b)}
                            disabled={restoring === b.id}
                          >
                            {restoring === b.id ? "Restoring…" : "Restore"}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <style>{BKP_STYLES}</style>
    </div>
  );
}

// ==================================================
// STYLES
// ==================================================

const BKP_STYLES = `
  .set-shell { display: flex; flex-direction: column; gap: var(--space-5); max-width: 860px; margin: 0 auto; width: 100%; }

  /* ---- Page headings ---- */
  .set-title { font-size: var(--text-2xl); letter-spacing: var(--tracking-tight); margin-bottom: 6px; }
  .set-sub { color: var(--colour-text-muted); }
  .set-section { font-size: var(--text-md); margin-bottom: var(--space-4); letter-spacing: normal; }

  /* ---- Restore summary grid ---- */
  .bkp-restore-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: var(--space-3);
    margin-top: var(--space-3);
  }
  .bkp-restore-stat {
    display: flex;
    flex-direction: column;
    gap: 4px;
    background: var(--colour-bg);
    border: 0.5px solid var(--colour-border);
    border-radius: var(--radius-md);
    padding: var(--space-3) var(--space-4);
  }
  .bkp-restore-stat__value { font-size: var(--text-xl); font-weight: var(--weight-semibold); color: var(--colour-text); }
  .bkp-restore-stat__label { font-size: var(--text-xs); color: var(--colour-text-muted); }

  /* ---- Table ---- */
  .bkp-table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; margin-top: var(--space-4); }
  .bkp-table { width: 100%; border-collapse: collapse; font-size: var(--text-sm); }
  .bkp-table th {
    text-align: left;
    color: var(--colour-text-muted);
    font-weight: 500;
    padding: 0 12px 10px 0;
    border-bottom: 1px solid var(--colour-border);
    white-space: nowrap;
  }
  .bkp-row td {
    padding: 10px 12px 10px 0;
    border-bottom: 1px solid var(--colour-border);
    vertical-align: middle;
  }
  .bkp-row:last-child td { border-bottom: none; }

  /* ---- Kind badge ---- */
  .bkp-kind {
    font-size: var(--text-xs);
    padding: 2px 8px;
    border-radius: var(--radius-full, 999px);
    border: 1px solid;
  }
  .bkp-kind--manual   { color: rgba(108,99,255,0.9); border-color: rgba(108,99,255,0.3); background: rgba(108,99,255,0.08); }
  .bkp-kind--scheduled { color: var(--colour-text-muted); border-color: var(--colour-border); background: none; }

  /* ---- Status badge ---- */
  .bkp-status {
    font-size: var(--text-xs);
    padding: 2px 8px;
    border-radius: var(--radius-full, 999px);
    border: 1px solid;
  }
  .bkp-status--complete { color: #4ade80; border-color: rgba(74,222,128,0.3); background: rgba(74,222,128,0.08); }
  .bkp-status--running  { color: #f59e0b; border-color: rgba(245,158,11,0.3); background: rgba(245,158,11,0.08); }
  .bkp-status--failed   { color: #ef4444; border-color: rgba(239,68,68,0.3);  background: rgba(239,68,68,0.08); }

  /* ---- Action buttons ---- */
  .bkp-actions { display: flex; gap: 8px; }
  .bkp-action-btn {
    background: none;
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-sm);
    padding: 4px 10px;
    font-size: var(--text-xs);
    color: var(--colour-text-muted);
    cursor: none;
    transition: border-color 0.2s, color 0.2s;
    white-space: nowrap;
  }
  .bkp-action-btn:hover { border-color: var(--colour-accent); color: var(--colour-text); }
  .bkp-action-btn--warn:hover { border-color: var(--colour-amber, #f59e0b); color: var(--colour-amber, #f59e0b); }
  .bkp-action-btn:disabled { opacity: 0.5; }

  /* ---- Responsive ---- */
  @media (max-width: 767px) {
    .bkp-col--size { display: none; }
    .bkp-col--completed { display: none; }
    .bkp-restore-grid { grid-template-columns: repeat(2, 1fr); }
  }
  @media (max-width: 479px) {
    .bkp-restore-grid { grid-template-columns: 1fr 1fr; }
  }
`;
