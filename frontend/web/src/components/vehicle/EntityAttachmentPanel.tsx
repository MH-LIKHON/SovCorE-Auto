// ============================================================
// frontend/web/src/components/vehicle/EntityAttachmentPanel.tsx
// ============================================================
//
// Purpose:
//   Reusable attachment panel for entity types that support
//   custom-labelled file uploads: damage entries, PCNs, and
//   warranty records.
//
// Design:
//   A toggle button controls open/closed state. On first open
//   the panel lazy-loads existing attachments via GET. After
//   loading, the button label shows the count.
//
//   Upload: multipart POST to the backend proxy → R2.
//   View: apiFetch(download endpoint) → res.blob() → blob URL
//     → DocViewerModal. Blob URL is revoked on modal close.
//   Delete: DELETE endpoint, immediate UI removal.
//
//   Styles live in globals.css under eat-* and dvm-* namespaces.
//
// Consumed by:
//   - damage/page.tsx, pcns/page.tsx, warranty/page.tsx
// ============================================================

"use client";

import { useRef, useState } from "react";

import { apiFetch, apiUpload } from "@/src/lib/api/fetch";
import { DocViewerModal } from "@/src/components/vehicle/DocViewerModal";

// ==================================================
// TYPES
// ==================================================

interface EntityAttachment {
  id: string;
  entity_type: string;
  entity_id: string;
  label: string;
  filename: string;
  content_type: string;
  size_bytes: number;
  created_at: string;
}

interface ViewState {
  url: string;
  filename: string;
  contentType: string;
}

// ==================================================
// HELPERS
// ==================================================

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

// ==================================================
// COMPONENT
// ==================================================

export function EntityAttachmentPanel({
  entityType,
  entityId,
  accountId,
}: {
  entityType: "damage" | "pcn" | "warranty";
  entityId: string;
  accountId: string;
}) {
  const [open, setOpen] = useState(false);
  const [attachments, setAttachments] = useState<EntityAttachment[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);

  const [label, setLabel] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [viewLoading, setViewLoading] = useState<string | null>(null);
  const [viewing, setViewing] = useState<ViewState | null>(null);

  // ==================================================
  // DATA
  // ==================================================

  async function load() {
    if (loaded || loading) return;
    setLoading(true);
    const res = await apiFetch(
      `/api/v1/accounts/${accountId}/entity-attachments?entity_type=${entityType}&entity_id=${entityId}`
    );
    if (res.ok) {
      const data = await res.json();
      setAttachments(data ?? []);
    }
    setLoaded(true);
    setLoading(false);
  }

  function toggle() {
    if (!open && !loaded) load();
    setOpen((v) => !v);
  }

  // ==================================================
  // UPLOAD
  // ==================================================

  async function handleUpload() {
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("entity_type", entityType);
      fd.append("entity_id", entityId);
      fd.append("label", label.trim() || file.name);
      fd.append("filename", file.name);
      const res = await apiUpload(
        `/api/v1/accounts/${accountId}/entity-attachments/upload`,
        fd
      );
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        console.error("[entity-attach] non-ok", res.status, detail);
        setUploadError(`Upload failed (${res.status}). Please try again.`);
        return;
      }
      const att: EntityAttachment = await res.json();
      setAttachments((prev) => [...prev, att]);
      setLabel("");
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err) {
      console.error("[entity-attach] threw:", err);
      setUploadError("Network error — could not reach the server.");
    } finally {
      setUploading(false);
    }
  }

  // ==================================================
  // VIEW
  // ==================================================

  async function handleView(a: EntityAttachment) {
    setViewLoading(a.id);
    try {
      const res = await apiFetch(
        `/api/v1/accounts/${accountId}/entity-attachments/${a.id}/download`
      );
      if (!res.ok) {
        console.error("[entity-attach-view] non-ok", res.status);
        return;
      }
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      setViewing({ url: objectUrl, filename: a.filename, contentType: blob.type || a.content_type });
    } catch (err) {
      console.error("[entity-attach-view] threw:", err);
    } finally {
      setViewLoading(null);
    }
  }

  function handleViewClose() {
    if (viewing) URL.revokeObjectURL(viewing.url);
    setViewing(null);
  }

  // ==================================================
  // DELETE
  // ==================================================

  async function handleDelete(attId: string) {
    if (!window.confirm("Delete this attachment? This cannot be undone.")) return;
    await apiFetch(
      `/api/v1/accounts/${accountId}/entity-attachments/${attId}`,
      { method: "DELETE" }
    );
    setAttachments((prev) => prev.filter((a) => a.id !== attId));
  }

  // ==================================================
  // RENDER
  // ==================================================

  const toggleLabel = open
    ? "Hide files"
    : loaded
    ? `Files (${attachments.length})`
    : "Files";

  return (
    <>
      <div className="eat-panel">
        <button className="eat-toggle" onClick={toggle}>
          {toggleLabel}
        </button>

        {open && (
          <div className="eat-body">
            {/* Upload form */}
            <div className="eat-form">
              <input
                className="eat-label-input sov-field__control"
                type="text"
                placeholder="LABEL"
                value={label}
                onChange={(e) => setLabel(e.target.value.toUpperCase())}
                disabled={uploading}
              />
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.pdf,.heic"
                className="eat-file-input"
                disabled={uploading}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <button
                className="eat-upload-btn rec-btn rec-btn--primary"
                onClick={handleUpload}
                disabled={uploading || !file}
              >
                {uploading ? "Uploading…" : "Upload"}
              </button>
            </div>

            {uploadError && <p className="eat-error">{uploadError}</p>}

            {/* File list */}
            {loading ? (
              <p className="eat-status">Loading…</p>
            ) : attachments.length === 0 ? (
              <p className="eat-status">No files attached yet.</p>
            ) : (
              <ul className="eat-list">
                {attachments.map((a) => (
                  <li key={a.id} className="eat-item">
                    <span className="eat-item__name">{a.label || a.filename}</span>
                    <span className="eat-item__size">{formatBytes(a.size_bytes)}</span>
                    <button
                      className="eat-item__view"
                      onClick={() => handleView(a)}
                      disabled={viewLoading === a.id}
                    >
                      {viewLoading === a.id ? "…" : "View"}
                    </button>
                    <button
                      className="eat-item__delete"
                      onClick={() => handleDelete(a.id)}
                    >
                      Delete
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {viewing && (
        <DocViewerModal
          viewUrl={viewing.url}
          filename={viewing.filename}
          contentType={viewing.contentType}
          onClose={handleViewClose}
        />
      )}
    </>
  );
}
