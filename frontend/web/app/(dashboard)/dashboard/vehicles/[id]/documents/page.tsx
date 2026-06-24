// ============================================================
// frontend/web/app/(dashboard)/dashboard/vehicles/[id]/documents/page.tsx
// ============================================================
//
// Purpose:
//   Vehicle documents page. Lists uploaded documents and provides
//   a file upload flow using the two-step presigned R2 pattern:
//   1. POST /sign-upload to receive a presigned PUT URL.
//   2. Browser PUTs the file directly to R2.
//   3. POST /documents to persist the row in the database.
//
// Design:
//   A table lists existing documents (name, type, uploaded at,
//   uploader). An upload panel above accepts a file input and a
//   document-type selector. Inline progress feedback during
//   upload. Delete button with confirmation.
//
// Consumed by:
//   - Routed at /dashboard/vehicles/[id]/documents
// ============================================================

"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Badge } from "@/src/components/ui/badge";
import { Card } from "@/src/components/ui/card";
import { apiFetch, getAccountId } from "@/src/lib/api/fetch";

// ==================================================
// TYPES
// ==================================================

interface Document {
  id: string;
  vehicle_id: string;
  document_type: string;
  filename: string;
  r2_key: string;
  mime_type: string | null;
  file_size: number | null;
  uploaded_by_email: string | null;
  created_at: string;
}

const DOC_TYPE_LABELS: Record<string, string> = {
  v5c: "V5C logbook",
  insurance: "Insurance",
  mot: "MOT certificate",
  service: "Service record",
  finance: "Finance agreement",
  warranty: "Warranty",
  invoice: "Purchase invoice",
  other: "Other",
};

const DOC_TYPES = Object.entries(DOC_TYPE_LABELS).map(([value, label]) => ({ value, label }));

// ==================================================
// HELPERS
// ==================================================

function formatBytes(n: number | null): string {
  if (n === null) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDateTime(s: string): string {
  return new Date(s).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// ==================================================
// PAGE
// ==================================================

export default function VehicleDocumentsPage() {
  const { id } = useParams<{ id: string }>();
  const accountId = getAccountId() ?? "";

  const [docs, setDocs] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);

  // Upload form state
  const [docType, setDocType] = useState("other");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<"idle" | "signing" | "uploading" | "saving" | "done">("idle");
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function loadDocs() {
    if (!accountId || !id) return;
    setLoading(true);
    const res = await apiFetch(`/api/v1/accounts/${accountId}/vehicles/${id}/documents`);
    const data = res.ok ? await res.json() : [];
    setDocs(data ?? []);
    setLoading(false);
  }

  useEffect(() => { loadDocs(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleUpload() {
    if (!file || !accountId || !id) return;
    setUploading(true);
    setUploadError(null);

    try {
      // Step 1 — get presigned PUT URL
      setUploadProgress("signing");
      const signRes = await apiFetch(`/api/v1/accounts/${accountId}/vehicles/${id}/documents/sign-upload`, {
        method: "POST",
        body: JSON.stringify({
          filename: file.name,
          content_type: file.type || "application/octet-stream",
          document_type: docType,
        }),
      });
      if (!signRes.ok) throw new Error("Could not get upload URL.");
      const { upload_url, r2_key } = await signRes.json();

      // Step 2 — PUT directly to R2
      setUploadProgress("uploading");
      const putRes = await fetch(upload_url, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type || "application/octet-stream" },
      });
      if (!putRes.ok) throw new Error("Upload to storage failed.");

      // Step 3 — persist document row
      setUploadProgress("saving");
      const saveRes = await apiFetch(`/api/v1/accounts/${accountId}/vehicles/${id}/documents`, {
        method: "POST",
        body: JSON.stringify({
          r2_key,
          filename: file.name,
          document_type: docType,
          mime_type: file.type || null,
          file_size: file.size,
        }),
      });
      if (!saveRes.ok) throw new Error("Could not save document record.");

      setUploadProgress("done");
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      await loadDocs();
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setUploading(false);
      setTimeout(() => setUploadProgress("idle"), 2000);
    }
  }

  async function handleDelete(doc: Document) {
    if (!window.confirm(`Delete "${doc.filename}"? This cannot be undone.`)) return;
    await apiFetch(`/api/v1/accounts/${accountId}/vehicles/${id}/documents/${doc.id}`, { method: "DELETE" });
    setDocs((prev) => prev.filter((d) => d.id !== doc.id));
  }

  const progressLabel =
    uploadProgress === "signing"   ? "Getting upload URL…" :
    uploadProgress === "uploading" ? "Uploading file…" :
    uploadProgress === "saving"    ? "Saving record…" :
    uploadProgress === "done"      ? "Uploaded." : null;

  return (
    <div className="docs-shell">
      {/* Header */}
      <header className="docs-head">
        <Link href={`/dashboard/vehicles/${id}`} className="docs-back">← Vehicle</Link>
        <h1 className="docs-title">Documents</h1>
        <p className="docs-sub">
          Upload certificates, invoices and records for this vehicle.
        </p>
      </header>

      {/* Upload panel */}
      <Card>
        <h2 className="docs-section-title">Upload a document</h2>
        <div className="docs-upload-row">
          <div className="docs-label">
            <span className="docs-label__text">Document type</span>
            <div className="sov-input-wrap">
              <select
                className="sov-field__control"
                value={docType}
                onChange={(e) => setDocType(e.target.value)}
                disabled={uploading}
              >
                {DOC_TYPES.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>
          <label className="docs-label docs-label--file">
            <span className="docs-label__text">File</span>
            <input
              ref={fileInputRef}
              className="docs-file-input"
              type="file"
              disabled={uploading}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
          <div className="docs-upload-action">
            <span className="docs-label__text">&nbsp;</span>
            <button
              className="docs-btn docs-btn--primary"
              onClick={handleUpload}
              disabled={uploading || !file}
            >
              {uploading ? "Uploading…" : "Upload"}
            </button>
          </div>
        </div>
        {progressLabel && (
          <p className="docs-progress">{progressLabel}</p>
        )}
        {uploadError && (
          <p className="docs-error">{uploadError}</p>
        )}
      </Card>

      {/* Document list */}
      <Card>
        <h2 className="docs-section-title">Uploaded documents</h2>
        {loading ? (
          <div className="docs-skeleton" />
        ) : docs.length === 0 ? (
          <p className="docs-empty">No documents uploaded yet.</p>
        ) : (
          <div className="docs-table-wrap">
            <table className="docs-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Size</th>
                  <th>Uploaded</th>
                  <th>By</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {docs.map((doc) => (
                  <tr key={doc.id}>
                    <td className="docs-td--name">
                      <span className="docs-filename">{doc.filename}</span>
                    </td>
                    <td>
                      <Badge tone="info">
                        {DOC_TYPE_LABELS[doc.document_type] ?? doc.document_type}
                      </Badge>
                    </td>
                    <td className="docs-td--size">{formatBytes(doc.file_size)}</td>
                    <td className="docs-td--date">{formatDateTime(doc.created_at)}</td>
                    <td className="docs-td--by">{doc.uploaded_by_email ?? "—"}</td>
                    <td>
                      <button
                        className="docs-delete-btn"
                        onClick={() => handleDelete(doc)}
                        aria-label={`Delete ${doc.filename}`}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <style>{DOCS_STYLES}</style>
    </div>
  );
}

// ==================================================
// STYLES
// ==================================================

const DOCS_STYLES = `
  .docs-shell { display: flex; flex-direction: column; gap: var(--space-6); max-width: 900px; }

  .docs-head { display: flex; flex-direction: column; gap: var(--space-2); }
  .docs-back { font-size: var(--text-sm); color: var(--colour-text-muted); text-decoration: none; }
  .docs-back:hover { color: var(--colour-text); }
  .docs-title { font-size: var(--text-2xl); letter-spacing: var(--tracking-tight); margin: 0; }
  .docs-sub { font-size: var(--text-sm); color: var(--colour-text-muted); max-width: 480px; line-height: var(--leading-normal); }

  .docs-section-title { font-size: var(--text-md); font-weight: var(--weight-medium); margin-bottom: var(--space-5); }

  /* Upload row */
  .docs-upload-row { display: flex; align-items: flex-end; gap: var(--space-4); flex-wrap: wrap; }
  .docs-label { display: flex; flex-direction: column; gap: 6px; }
  .docs-label--file { flex: 1; min-width: 200px; }
  .docs-label__text { font-size: var(--text-sm); color: var(--colour-text-muted); }
  .docs-file-input {
    background: var(--colour-bg);
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-sm);
    padding: 7px 12px;
    font-size: var(--text-sm);
    color: var(--colour-text);
    outline: none;
    cursor: none;
    width: 100%;
  }
  .docs-upload-action { display: flex; flex-direction: column; gap: 6px; }

  .docs-progress { font-size: var(--text-sm); color: var(--colour-accent2); margin-top: var(--space-3); }
  .docs-error { font-size: var(--text-sm); color: var(--colour-error); margin-top: var(--space-3); }

  /* Buttons */
  .docs-btn { padding: 8px 18px; border-radius: var(--radius-sm); font-size: var(--text-sm); cursor: none; border: none; transition: opacity 0.2s; }
  .docs-btn--primary { background: var(--colour-accent); color: #fff; }
  .docs-btn--primary:disabled { opacity: 0.55; }

  /* Table */
  .docs-table-wrap { overflow-x: auto; }
  .docs-table { width: 100%; border-collapse: collapse; font-size: var(--text-sm); }
  .docs-table th {
    text-align: left;
    padding: 0 var(--space-4) var(--space-3);
    font-size: var(--text-xs);
    font-weight: var(--weight-medium);
    color: var(--colour-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    border-bottom: 0.5px solid var(--colour-border);
  }
  .docs-table td {
    padding: var(--space-3) var(--space-4);
    border-bottom: 0.5px solid var(--colour-border);
    vertical-align: middle;
  }
  .docs-table tr:last-child td { border-bottom: none; }

  .docs-td--name { max-width: 240px; }
  .docs-filename { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--colour-text); }
  .docs-td--size { color: var(--colour-text-muted); white-space: nowrap; }
  .docs-td--date { color: var(--colour-text-muted); white-space: nowrap; }
  .docs-td--by { color: var(--colour-text-muted); white-space: nowrap; }

  .docs-delete-btn {
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
  .docs-delete-btn:hover { border-color: var(--colour-error); color: var(--colour-error); }

  /* Skeleton */
  .docs-skeleton {
    height: 120px;
    background: rgba(255,255,255,0.04);
    border-radius: var(--radius-md);
    animation: shimmer 1.6s infinite;
  }
  @keyframes shimmer { 0% { opacity: 0.6; } 50% { opacity: 1; } 100% { opacity: 0.6; } }

  .docs-empty { font-size: var(--text-sm); color: var(--colour-text-muted); }

  @media (max-width: 639px) {
    .docs-upload-row { flex-direction: column; align-items: stretch; }
  }
`;
