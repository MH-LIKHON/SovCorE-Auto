// ============================================================
// frontend/web/app/(dashboard)/dashboard/vehicles/[id]/timeline/page.tsx
// ============================================================
//
// Purpose:
//   Vehicle timeline page. Renders a chronological feed of
//   timeline_events for this vehicle: records created, documents
//   uploaded, and lifecycle transitions.
//
// Design:
//   Each event is a row with an icon, a kind tag, a summary, and
//   the date. The kind tag mirrors the RecordTypeBadge colour map
//   where the event is record-based. Non-record events use a
//   neutral accent.
//
//   Mirrors SovCorE QR timeline styling exactly — same card shell,
//   same CSS class convention, same vertical-line connector design.
//
// Consumed by:
//   - Routed at /dashboard/vehicles/[id]/timeline
// ============================================================

"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { Card } from "@/src/components/ui/card";
import { apiFetch, getAccountId } from "@/src/lib/api/fetch";

// ==================================================
// TYPES
// ==================================================

interface TimelineEvent {
  id: string;
  account_id: string;
  vehicle_id: string | null;
  kind: string;
  summary: string;
  ref_table: string | null;
  ref_id: string | null;
  occurred_at: string;
}

interface TimelinePage {
  items: TimelineEvent[];
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
  });
}

// Map the event kind to a display label and colour.
function kindMeta(kind: string): { label: string; colour: string } {
  const map: Record<string, { label: string; colour: string }> = {
    "record.maintenance":  { label: "Maintenance",  colour: "var(--colour-accent)" },
    "record.repair":       { label: "Repair",       colour: "var(--colour-accent2, #6c63ff)" },
    "record.fuel":         { label: "Fuel",         colour: "#22c55e" },
    "record.mot":          { label: "MOT",          colour: "#f59e0b" },
    "record.tax":          { label: "Tax",          colour: "#06b6d4" },
    "record.insurance":    { label: "Insurance",    colour: "#8b5cf6" },
    "record.parking":      { label: "Parking",      colour: "#64748b" },
    "record.pcn":          { label: "PCN",          colour: "var(--colour-error)" },
    "record.cleaning":     { label: "Cleaning",     colour: "#0ea5e9" },
    "record.accessories":  { label: "Accessories",  colour: "#d946ef" },
    "record.warranty":     { label: "Warranty",     colour: "#10b981" },
    "record.diagnostics":  { label: "Diagnostics",  colour: "#f97316" },
    "record.damage":       { label: "Damage",       colour: "#ef4444" },
    "record.custom":       { label: "Custom",       colour: "#94a3b8" },
    "record.deleted":      { label: "Deleted",      colour: "#64748b" },
    "document.upload":     { label: "Document",     colour: "#6366f1" },
    "lifecycle.sold":      { label: "Sold",         colour: "#f59e0b" },
    "lifecycle.scrapped":  { label: "Scrapped",     colour: "var(--colour-error)" },
    "lifecycle.archived":  { label: "Archived",     colour: "#94a3b8" },
    "lifecycle.active":    { label: "Active",       colour: "#22c55e" },
  };
  return map[kind] ?? { label: kind, colour: "#94a3b8" };
}

// ==================================================
// PAGE
// ==================================================

export default function VehicleTimelinePage() {
  const { id } = useParams<{ id: string }>();
  const accountId = getAccountId() ?? "";

  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      if (!accountId || !id) return;
      setLoading(true);
      const res = await apiFetch(
        `/api/v1/accounts/${accountId}/vehicles/${id}/timeline?page=1&page_size=100`
      );
      if (res.ok) {
        const data: TimelinePage = await res.json();
        setEvents(data.items);
        setTotal(data.total);
      }
      setLoading(false);
    }
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="tl-shell">
      {/* Header */}
      <header className="tl-head">
        <h1 className="tl-title">Timeline</h1>
        <p className="tl-sub">A chronological record of everything that has happened to this vehicle.</p>
      </header>

      <Card>
        {loading ? (
          <div className="tl-skeleton" />
        ) : events.length === 0 ? (
          <p className="tl-empty">No timeline events yet. Add a record to get started.</p>
        ) : (
          <>
            <p className="tl-count">{total} event{total !== 1 ? "s" : ""}</p>
            <ol className="tl-list">
              {events.map((event, idx) => {
                const { label, colour } = kindMeta(event.kind);
                const isLast = idx === events.length - 1;
                return (
                  <li key={event.id} className={isLast ? "tl-item tl-item--last" : "tl-item"}>
                    {/* Vertical connector line */}
                    <div className="tl-connector">
                      <div className="tl-dot" style={{ background: colour }} />
                      {!isLast && <div className="tl-line" />}
                    </div>

                    {/* Event content */}
                    <div className="tl-body">
                      <div className="tl-body__top">
                        <span
                          className="tl-kind"
                          style={{
                            background: `${colour}22`,
                            color: colour,
                            border: `1px solid ${colour}44`,
                          }}
                        >
                          {label}
                        </span>
                        <span className="tl-date">{formatDateTime(event.occurred_at)}</span>
                      </div>
                      <p className="tl-summary">{event.summary}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </>
        )}
      </Card>

      <style>{TL_STYLES}</style>
    </div>
  );
}

// ==================================================
// STYLES
// ==================================================

const TL_STYLES = `
  .tl-shell { display: flex; flex-direction: column; gap: var(--space-5); max-width: 780px; margin: 0 auto; width: 100%; }

  .tl-head { display: flex; flex-direction: column; gap: 0; }
  .tl-back { font-size: var(--text-sm); color: var(--colour-text-muted); text-decoration: none; margin-bottom: var(--space-2); }
  .tl-back:hover { color: #00d4ff; }
  .tl-title { font-size: var(--text-2xl); letter-spacing: var(--tracking-tight); margin: 0 0 4px; }
  .tl-sub { font-size: var(--text-sm); color: var(--colour-text-muted); max-width: 480px; line-height: var(--leading-normal); margin: 0; }

  .tl-count { font-size: var(--text-sm); color: var(--colour-text-muted); margin: 0 0 var(--space-5); }

  .tl-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }

  .tl-item { display: flex; gap: var(--space-4); }
  .tl-item--last .tl-line { display: none; }

  .tl-connector { display: flex; flex-direction: column; align-items: center; width: 20px; flex-shrink: 0; }
  .tl-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; margin-top: 5px; }
  .tl-line { width: 1px; flex: 1; background: var(--colour-border); margin-top: 4px; min-height: 24px; }

  .tl-body { padding-bottom: var(--space-5); flex: 1; min-width: 0; }
  .tl-body__top { display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap; margin-bottom: 6px; }

  .tl-kind {
    display: inline-block;
    padding: 2px 9px;
    border-radius: var(--radius-full, 999px);
    font-size: var(--text-xs);
    font-weight: var(--weight-medium);
    white-space: nowrap;
    letter-spacing: 0.03em;
  }
  .tl-date { font-size: var(--text-xs); color: var(--colour-text-muted); white-space: nowrap; }
  .tl-summary { font-size: var(--text-sm); color: var(--colour-text); margin: 0; line-height: var(--leading-normal); }

  .tl-skeleton { height: 240px; background: rgba(255,255,255,0.04); border-radius: var(--radius-md); animation: shimmer 1.6s infinite; }
  @keyframes shimmer { 0% { opacity: 0.6; } 50% { opacity: 1; } 100% { opacity: 0.6; } }

  .tl-empty { font-size: var(--text-sm); color: var(--colour-text-muted); }

  @media (max-width: 767px) {
    .tl-body__top { flex-direction: column; align-items: flex-start; gap: 4px; }
  }
`;
