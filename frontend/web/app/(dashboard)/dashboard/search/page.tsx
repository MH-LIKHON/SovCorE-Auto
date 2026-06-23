// ============================================================
// frontend/web/app/(dashboard)/dashboard/search/page.tsx
// ============================================================
//
// Purpose:
//   Full-text cross-entity search page. Searches vehicles,
//   records, documents, tasks, and tags across the account.
//
// Design:
//   The query is driven by a controlled input. A search fires
//   on form submit (Enter key or the search button) to avoid
//   excessive backend requests on each keystroke.
//
//   Results are grouped by entity type (vehicles, records,
//   documents, tasks, tags) and each group renders in its own
//   Card section. Empty groups are not rendered. A "no results"
//   state is shown only when the query returned and found
//   nothing — not while loading.
//
//   Each vehicle result links to /dashboard/vehicles/{id}.
//   Each record result links to the vehicle's records page.
//   Each document result links to the vehicle's documents page.
//   Each task result links to the vehicle's tasks page.
//   Each tag result links to the record on the vehicle's records page.
//
//   Mirrors SovCorE QR card and list patterns exactly: rec-shell,
//   Card, rec-btn, rec-row CSS conventions. cursor: none on inputs
//   and buttons.
//
// Consumed by:
//   - Routed at /dashboard/search
// ============================================================

"use client";

import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { Card } from "@/src/components/ui/card";
import { apiFetch, getAccountId } from "@/src/lib/api/fetch";

// ==================================================
// TYPES
// ==================================================

interface VehicleResult {
  id: string;
  registration: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
  lifecycle_state: string;
}

interface RecordResult {
  id: string;
  vehicle_id: string;
  vehicle_registration: string | null;
  type: string;
  date: string;
  supplier: string | null;
  garage: string | null;
  notes: string | null;
}

interface DocumentResult {
  id: string;
  vehicle_id: string;
  vehicle_registration: string | null;
  type: string;
  filename: string;
}

interface TaskResult {
  id: string;
  vehicle_id: string;
  vehicle_registration: string | null;
  title: string;
  status: string;
  due_date: string | null;
}

interface TagResult {
  record_id: string;
  vehicle_id: string;
  vehicle_registration: string | null;
  tag: string;
  record_type: string;
  record_date: string;
}

interface SearchResults {
  query: string;
  total: number;
  vehicles: VehicleResult[];
  records: RecordResult[];
  documents: DocumentResult[];
  tasks: TaskResult[];
  tags: TagResult[];
}

// ==================================================
// HELPERS
// ==================================================

const RECORD_LABELS: Record<string, string> = {
  maintenance: "Maintenance", repair: "Repair", fuel: "Fuel",
  mot: "MOT", tax: "Road tax", insurance: "Insurance",
  parking: "Parking", pcn: "Penalty notice", cleaning: "Cleaning",
  accessories: "Accessories", warranty: "Warranty",
  diagnostics: "Diagnostics", damage: "Damage", custom: "Other",
};

const DOC_LABELS: Record<string, string> = {
  v5c: "V5C", insurance_certificate: "Insurance certificate",
  mot_certificate: "MOT certificate", warranty_document: "Warranty document",
  finance_agreement: "Finance agreement", invoice: "Invoice", other: "Other",
};

const STATUS_LABELS: Record<string, string> = {
  open: "Open", in_progress: "In progress", completed: "Completed",
};

function formatDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
  });
}

function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ") : "—";
}

// ==================================================
// SEARCH INNER PAGE (requires Suspense for useSearchParams)
// ==================================================

function SearchInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const accountId = getAccountId() ?? "";

  const initialQ = searchParams.get("q") ?? "";
  const [input, setInput] = useState(initialQ);
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  // ==================================================
  // RUN SEARCH
  // ==================================================

  async function runSearch(q: string) {
    if (!accountId || !q.trim()) return;
    setLoading(true);
    setSearched(true);
    const res = await apiFetch(
      `/api/v1/accounts/${accountId}/search?q=${encodeURIComponent(q.trim())}`
    );
    if (res.ok) {
      setResults(await res.json());
    }
    setLoading(false);
  }

  // Run search if the URL already carries a query on mount.
  useEffect(() => {
    if (initialQ) runSearch(initialQ);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Reflect the query in the URL so the page is bookmarkable.
    router.replace(`/dashboard/search?q=${encodeURIComponent(input.trim())}`);
    runSearch(input);
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
            <h1 className="rec-title">Search</h1>
            <p className="rec-sub">Find vehicles, records, documents, tasks, and tags across your account.</p>
          </div>
        </div>
      </header>

      {/* ---- Search form ---- */}
      <Card>
        <form className="srch-form" onSubmit={handleSubmit}>
          <input
            className="srch-input"
            type="search"
            placeholder="Search registration, make, model, supplier, tag…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            autoFocus
          />
          <button className="rec-btn rec-btn--primary" type="submit" disabled={loading}>
            {loading ? "Searching…" : "Search"}
          </button>
        </form>
      </Card>

      {/* ---- Loading ---- */}
      {loading && <Card><div className="rec-skeleton" /></Card>}

      {/* ---- No results ---- */}
      {!loading && searched && results && results.total === 0 && (
        <Card>
          <div className="rec-empty">
            <p>No results for <strong>{results.query}</strong>. Try a different search term.</p>
          </div>
        </Card>
      )}

      {/* ---- Results ---- */}
      {!loading && results && results.total > 0 && (
        <>
          <p className="srch-summary">
            {results.total} result{results.total !== 1 ? "s" : ""} for <strong>{results.query}</strong>
          </p>

          {/* ---- Vehicles ---- */}
          {results.vehicles.length > 0 && (
            <Card>
              <div className="rec-list-head">
                <h2 className="rec-section-title" style={{ margin: 0 }}>Vehicles</h2>
                <span className="rec-count">{results.vehicles.length}</span>
              </div>
              <div className="rec-rows">
                {results.vehicles.map((v) => (
                  <Link
                    key={v.id}
                    href={`/dashboard/vehicles/${v.id}`}
                    className="srch-row"
                  >
                    <div className="srch-row__left">
                      <span className="srch-row__title srch-row__reg">{v.registration || "—"}</span>
                      <span className="srch-row__sub">
                        {[v.make, v.model, v.year].filter(Boolean).join(" · ")}
                      </span>
                    </div>
                    <span className={`srch-badge srch-badge--${v.lifecycle_state}`}>
                      {capitalize(v.lifecycle_state)}
                    </span>
                  </Link>
                ))}
              </div>
            </Card>
          )}

          {/* ---- Records ---- */}
          {results.records.length > 0 && (
            <Card>
              <div className="rec-list-head">
                <h2 className="rec-section-title" style={{ margin: 0 }}>Records</h2>
                <span className="rec-count">{results.records.length}</span>
              </div>
              <div className="rec-rows">
                {results.records.map((r) => (
                  <Link
                    key={r.id}
                    href={`/dashboard/vehicles/${r.vehicle_id}/records`}
                    className="srch-row"
                  >
                    <div className="srch-row__left">
                      <span className="srch-row__title">
                        {RECORD_LABELS[r.type] || capitalize(r.type)}
                      </span>
                      <span className="srch-row__sub">
                        {[r.vehicle_registration, r.supplier || r.garage].filter(Boolean).join(" · ")}
                      </span>
                    </div>
                    <span className="srch-row__date">{formatDate(r.date)}</span>
                  </Link>
                ))}
              </div>
            </Card>
          )}

          {/* ---- Documents ---- */}
          {results.documents.length > 0 && (
            <Card>
              <div className="rec-list-head">
                <h2 className="rec-section-title" style={{ margin: 0 }}>Documents</h2>
                <span className="rec-count">{results.documents.length}</span>
              </div>
              <div className="rec-rows">
                {results.documents.map((d) => (
                  <Link
                    key={d.id}
                    href={`/dashboard/vehicles/${d.vehicle_id}/documents`}
                    className="srch-row"
                  >
                    <div className="srch-row__left">
                      <span className="srch-row__title">{d.filename}</span>
                      <span className="srch-row__sub">
                        {d.vehicle_registration ? `${d.vehicle_registration} · ` : ""}
                        {DOC_LABELS[d.type] || capitalize(d.type)}
                      </span>
                    </div>
                    <span className="srch-badge srch-badge--doc">Document</span>
                  </Link>
                ))}
              </div>
            </Card>
          )}

          {/* ---- Tasks ---- */}
          {results.tasks.length > 0 && (
            <Card>
              <div className="rec-list-head">
                <h2 className="rec-section-title" style={{ margin: 0 }}>Tasks</h2>
                <span className="rec-count">{results.tasks.length}</span>
              </div>
              <div className="rec-rows">
                {results.tasks.map((t) => (
                  <Link
                    key={t.id}
                    href={`/dashboard/vehicles/${t.vehicle_id}/tasks`}
                    className="srch-row"
                  >
                    <div className="srch-row__left">
                      <span className="srch-row__title">{t.title}</span>
                      <span className="srch-row__sub">
                        {t.vehicle_registration || "—"}
                        {t.due_date ? ` · Due ${formatDate(t.due_date)}` : ""}
                      </span>
                    </div>
                    <span className={`srch-badge srch-badge--${t.status.replace("_", "-")}`}>
                      {STATUS_LABELS[t.status] || capitalize(t.status)}
                    </span>
                  </Link>
                ))}
              </div>
            </Card>
          )}

          {/* ---- Tags ---- */}
          {results.tags.length > 0 && (
            <Card>
              <div className="rec-list-head">
                <h2 className="rec-section-title" style={{ margin: 0 }}>Tags</h2>
                <span className="rec-count">{results.tags.length}</span>
              </div>
              <div className="rec-rows">
                {results.tags.map((t, i) => (
                  <Link
                    key={`${t.record_id}-${i}`}
                    href={`/dashboard/vehicles/${t.vehicle_id}/records`}
                    className="srch-row"
                  >
                    <div className="srch-row__left">
                      <span className="srch-row__tag">#{t.tag}</span>
                      <span className="srch-row__sub">
                        {t.vehicle_registration || "—"} · {RECORD_LABELS[t.record_type] || capitalize(t.record_type)}
                      </span>
                    </div>
                    <span className="srch-row__date">{formatDate(t.record_date)}</span>
                  </Link>
                ))}
              </div>
            </Card>
          )}
        </>
      )}

      <style>{SRCH_STYLES}</style>
    </div>
  );
}

// ==================================================
// PAGE — wraps SearchInner in Suspense for useSearchParams
// ==================================================

export default function SearchPage() {
  return (
    <Suspense>
      <SearchInner />
    </Suspense>
  );
}

// ==================================================
// STYLES
// ==================================================

const SRCH_STYLES = `
  /* ---- Search form ---- */
  .srch-form {
    display: flex;
    gap: var(--space-3);
    align-items: center;
  }
  .srch-input {
    flex: 1;
    background: var(--colour-bg);
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-md);
    padding: 10px 14px;
    font-size: var(--text-sm);
    color: var(--colour-text);
    outline: none;
    transition: border-color 0.2s;
    cursor: none;
  }
  .srch-input:focus { border-color: var(--colour-accent); }
  .srch-input::placeholder { color: var(--colour-text-muted); }

  /* ---- Summary line ---- */
  .srch-summary {
    font-size: var(--text-sm);
    color: var(--colour-text-muted);
    margin: 0;
  }
  .srch-summary strong { color: var(--colour-text); }

  /* ---- Result rows ---- */
  .srch-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    border-bottom: 0.5px solid var(--colour-border);
    text-decoration: none;
    color: inherit;
    transition: background 0.15s;
    flex-wrap: wrap;
  }
  .srch-row:last-child { border-bottom: none; }
  .srch-row:hover { background: rgba(108, 99, 255, 0.05); }
  .srch-row__left { display: flex; flex-direction: column; gap: 2px; }
  .srch-row__title { font-size: var(--text-sm); color: var(--colour-text); }
  .srch-row__reg { font-weight: var(--weight-medium); letter-spacing: 0.04em; }
  .srch-row__tag { font-size: var(--text-sm); color: var(--colour-accent); font-weight: var(--weight-medium); }
  .srch-row__sub { font-size: var(--text-xs); color: var(--colour-text-muted); }
  .srch-row__date { font-size: var(--text-xs); color: var(--colour-text-muted); white-space: nowrap; flex-shrink: 0; }

  /* ---- Badges ---- */
  .srch-badge {
    font-size: var(--text-xs);
    padding: 2px 8px;
    border-radius: var(--radius-full, 999px);
    border: 1px solid;
    white-space: nowrap;
    flex-shrink: 0;
    color: var(--colour-text-muted);
    border-color: var(--colour-border);
    background: none;
  }
  .srch-badge--active     { color: #4ade80; border-color: rgba(74,222,128,0.3); background: rgba(74,222,128,0.08); }
  .srch-badge--sold       { color: #f59e0b; border-color: rgba(245,158,11,0.3); background: rgba(245,158,11,0.08); }
  .srch-badge--scrapped   { color: #ef4444; border-color: rgba(239,68,68,0.3);  background: rgba(239,68,68,0.08); }
  .srch-badge--completed  { color: #4ade80; border-color: rgba(74,222,128,0.3); background: rgba(74,222,128,0.08); }
  .srch-badge--in-progress { color: #f59e0b; border-color: rgba(245,158,11,0.3); background: rgba(245,158,11,0.08); }
  .srch-badge--doc        { color: rgba(108,99,255,0.9); border-color: rgba(108,99,255,0.3); background: rgba(108,99,255,0.08); }

  /* ---- Responsive ---- */
  @media (max-width: 767px) {
    .srch-form { flex-direction: column; align-items: stretch; }
    .srch-row { flex-direction: column; align-items: flex-start; }
  }
`;
