// ============================================================
// frontend/web/app/(dashboard)/dashboard/vehicles/[id]/audit/page.tsx
// ============================================================
//
// Purpose:
//   Vehicle audit log page. Shows every create, update and delete
//   action taken on records, documents and other tracked rows for
//   this account. This is the compliance-grade change history.
//
// Design:
//   Each audit entry shows action (create / update / delete),
//   table name, actor, date, and optionally the old and new
//   JSON values in a collapsible section.
//
//   Mirrors SovCorE QR table patterns exactly — same table shell,
//   same CSS class convention, same inline styles.
//
// Consumed by:
//   - Routed at /dashboard/vehicles/[id]/audit
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

interface AuditEntry {
  id: string;
  account_id: string;
  actor_user_id: string | null;
  action: string;   // "create" | "update" | "delete"
  table_name: string;
  row_id: string;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
}

interface AuditPage {
  items: AuditEntry[];
  total: number;
  page: number;
  page_size: number;
}

// ==================================================
// HELPERS
// ==================================================

function formatDateTime(s: string): string {
  return new Date(s).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const ACTION_COLOURS: Record<string, string> = {
  create: "#22c55e",
  update: "var(--colour-accent)",
  delete: "var(--colour-error)",
};

// ==================================================
// PAGE
// ==================================================

export default function VehicleAuditPage() {
  const { id } = useParams<{ id: string }>();
  const accountId = getAccountId() ?? "";

  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      if (!accountId || !id) return;
      setLoading(true);
      const res = await apiFetch(
        `/api/v1/accounts/${accountId}/vehicles/${id}/audit?page=1&page_size=100`
      );
      if (res.ok) {
        const data: AuditPage = await res.json();
        setEntries(data.items);
        setTotal(data.total);
      }
      setLoading(false);
    }
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="aud-shell">
      {/* Header */}
      <header className="aud-head">
        <Link href={`/dashboard/vehicles/${id}`} className="aud-back">← Vehicle</Link>
        <h1 className="aud-title">Audit log</h1>
        <p className="aud-sub">Every change to records and documents in this account, in order.</p>
      </header>

      <Card>
        {loading ? (
          <div className="aud-skeleton" />
        ) : entries.length === 0 ? (
          <p className="aud-empty">No audit entries yet.</p>
        ) : (
          <>
            <p className="aud-count">{total} entr{total !== 1 ? "ies" : "y"}</p>
            <div className="aud-table-wrap">
              <table className="aud-table">
                <thead>
                  <tr>
                    <th>Action</th>
                    <th>Table</th>
                    <th>Actor</th>
                    <th>When</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => {
                    const colour = ACTION_COLOURS[entry.action] ?? "#94a3b8";
                    const isExpanded = expandedId === entry.id;
                    return (
                      <>
                        <tr key={entry.id} className="aud-row">
                          <td>
                            <span
                              className="aud-action"
                              style={{
                                background: `${colour}22`,
                                color: colour,
                                border: `1px solid ${colour}44`,
                              }}
                            >
                              {entry.action}
                            </span>
                          </td>
                          <td className="aud-td--table">{entry.table_name}</td>
                          <td className="aud-td--actor">
                            {entry.actor_user_id
                              ? entry.actor_user_id.slice(0, 8) + "…"
                              : "system"}
                          </td>
                          <td className="aud-td--when">{formatDateTime(entry.created_at)}</td>
                          <td>
                            {(entry.old_value || entry.new_value) && (
                              <button
                                className="aud-diff-btn"
                                onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                              >
                                {isExpanded ? "Hide" : "Diff"}
                              </button>
                            )}
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr key={`${entry.id}-diff`} className="aud-diff-row">
                            <td colSpan={5}>
                              <div className="aud-diff-grid">
                                {entry.old_value && (
                                  <div>
                                    <p className="aud-diff-label">Before</p>
                                    <pre className="aud-pre">{JSON.stringify(entry.old_value, null, 2)}</pre>
                                  </div>
                                )}
                                {entry.new_value && (
                                  <div>
                                    <p className="aud-diff-label">After</p>
                                    <pre className="aud-pre">{JSON.stringify(entry.new_value, null, 2)}</pre>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>

      <style>{AUD_STYLES}</style>
    </div>
  );
}

// ==================================================
// STYLES
// ==================================================

const AUD_STYLES = `
  .aud-shell { display: flex; flex-direction: column; gap: var(--space-5); max-width: 960px; margin: 0 auto; width: 100%; }

  .aud-head { display: flex; flex-direction: column; gap: 0; }
  .aud-back { font-size: var(--text-sm); color: var(--colour-text-muted); text-decoration: none; margin-bottom: var(--space-2); }
  .aud-back:hover { color: #00d4ff; }
  .aud-title { font-size: var(--text-2xl); letter-spacing: var(--tracking-tight); margin: 0 0 4px; }
  .aud-sub { font-size: var(--text-sm); color: var(--colour-text-muted); max-width: 480px; line-height: var(--leading-normal); margin: 0; }

  .aud-count { font-size: var(--text-sm); color: var(--colour-text-muted); margin: 0 0 var(--space-4); }

  .aud-table-wrap { overflow-x: auto; }
  .aud-table { width: 100%; border-collapse: collapse; font-size: var(--text-sm); }
  .aud-table th {
    text-align: left;
    padding: 0 var(--space-4) var(--space-3);
    font-size: var(--text-xs);
    font-weight: var(--weight-medium);
    color: var(--colour-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    border-bottom: 0.5px solid var(--colour-border);
  }
  .aud-table td {
    padding: var(--space-3) var(--space-4);
    border-bottom: 0.5px solid var(--colour-border);
    vertical-align: middle;
  }

  .aud-action {
    display: inline-block;
    padding: 2px 9px;
    border-radius: var(--radius-full, 999px);
    font-size: var(--text-xs);
    font-weight: var(--weight-medium);
    white-space: nowrap;
    letter-spacing: 0.03em;
  }
  .aud-td--table { color: var(--colour-text-muted); font-family: monospace; font-size: var(--text-xs); }
  .aud-td--actor { color: var(--colour-text-muted); font-family: monospace; font-size: var(--text-xs); white-space: nowrap; }
  .aud-td--when { color: var(--colour-text-muted); white-space: nowrap; font-size: var(--text-xs); }

  .aud-diff-btn {
    background: none;
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-sm);
    padding: 3px 10px;
    font-size: var(--text-xs);
    color: var(--colour-text-muted);
    cursor: none;
    transition: border-color 0.2s, color 0.2s;
    white-space: nowrap;
  }
  .aud-diff-btn:hover { border-color: var(--colour-accent); color: var(--colour-text); }

  .aud-diff-row td { background: rgba(108,99,255,0.03); padding: var(--space-4); border-bottom: 0.5px solid var(--colour-border); }
  .aud-diff-grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-4); }
  .aud-diff-label { font-size: var(--text-xs); font-weight: var(--weight-medium); color: var(--colour-text-muted); text-transform: uppercase; letter-spacing: 0.07em; margin: 0 0 var(--space-2); }
  .aud-pre {
    font-family: monospace;
    font-size: var(--text-xs);
    color: var(--colour-text);
    background: rgba(255,255,255,0.04);
    border: 0.5px solid var(--colour-border);
    border-radius: var(--radius-sm);
    padding: var(--space-3);
    overflow-x: auto;
    white-space: pre-wrap;
    word-break: break-all;
    margin: 0;
    max-height: 240px;
    overflow-y: auto;
  }

  .aud-skeleton { height: 200px; background: rgba(255,255,255,0.04); border-radius: var(--radius-md); animation: shimmer 1.6s infinite; }
  @keyframes shimmer { 0% { opacity: 0.6; } 50% { opacity: 1; } 100% { opacity: 0.6; } }

  .aud-empty { font-size: var(--text-sm); color: var(--colour-text-muted); }

  @media (max-width: 767px) {
    .aud-diff-grid { grid-template-columns: 1fr; }
  }
`;
