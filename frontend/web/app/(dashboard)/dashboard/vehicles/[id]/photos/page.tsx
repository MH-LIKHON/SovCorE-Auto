// ============================================================
// frontend/web/app/(dashboard)/dashboard/vehicles/[id]/photos/page.tsx
// ============================================================
//
// Purpose:
//   Media photos page for a vehicle. Two sections:
//     Cover photo  — the single image stored in vehicle.image_key.
//     Vehicle media — all-round gallery photos (unlimited).
//
//   Damage before/after photos are managed inline on the Damage
//   page (Analytics > Damage) not here, to keep evidence with its
//   record.
//
// Design:
//   All images are served via signed GET URLs (cover_url, url).
//   The R2 bucket is private; no public URL is ever used.
//
//   Vehicle media gallery: photos + "Add photo" tile sit in the
//   same grid so Add and Remove are always at the same level.
//
// Consumed by:
//   - Routed at /dashboard/vehicles/[id]/photos
// ============================================================

"use client";

import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Card } from "@/src/components/ui/card";
import { ConfirmDeleteModal } from "@/src/components/ui/confirm-delete-modal";
import { BodyTypeIcon } from "@/src/components/vehicles/body-type-icon";
import { apiFetch, apiUpload, getAccountId } from "@/src/lib/api/fetch";

// ==================================================
// TYPES
// ==================================================

interface VehicleSummary {
  id: string;
  make: string | null;
  model: string | null;
  registration: string | null;
  body_type: string | null;
  image_key: string | null;
  cover_url: string | null;
}

interface MediaItem {
  id: string;
  r2_key: string;
  url: string | null;
  display_order: number;
}

interface MediaPage {
  items: MediaItem[];
  total: number;
}

// ==================================================
// HELPERS
// ==================================================

const ACCEPTED_IMAGE = "image/jpeg,image/png,image/webp";

// ==================================================
// PAGE
// ==================================================

export default function VehiclePhotosPage() {
  const { id } = useParams<{ id: string }>();
  const accountId = getAccountId() ?? "";

  const [vehicle, setVehicle] = useState<VehicleSummary | null>(null);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Cover photo
  const coverInputRef = useRef<HTMLInputElement | null>(null);
  const [coverUploading, setCoverUploading] = useState(false);
  const [coverError, setCoverError] = useState<string | null>(null);

  // Vehicle media upload
  const mediaInputRef = useRef<HTMLInputElement | null>(null);
  const [mediaUploading, setMediaUploading] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);

  // Delete modal
  const [deleteTarget, setDeleteTarget] = useState<{ kind: "cover" } | { kind: "media"; item: MediaItem } | null>(null);
  const [deleteDeleting, setDeleteDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // ==================================================
  // DATA LOADING
  // ==================================================

  async function load() {
    if (!accountId || !id) return;
    setLoading(true);
    const [vRes, mRes] = await Promise.all([
      apiFetch(`/api/v1/accounts/${accountId}/vehicles/${id}`),
      apiFetch(`/api/v1/accounts/${accountId}/vehicles/${id}/media`),
    ]);
    if (vRes.ok) setVehicle(await vRes.json());
    if (mRes.ok) {
      const m: MediaPage = await mRes.json();
      setMedia(m.items);
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ==================================================
  // COVER PHOTO
  // ==================================================

  async function handleCoverUpload(file: File) {
    if (!accountId || !vehicle) return;
    setCoverUploading(true);
    setCoverError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await apiUpload(
        `/api/v1/accounts/${accountId}/vehicles/${vehicle.id}/photo/upload`,
        form,
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setCoverError(data.detail ?? "Upload failed. Please try again.");
        return;
      }
      const updated = await res.json();
      setVehicle((v) => v ? { ...v, image_key: updated.image_key, cover_url: updated.cover_url } : v);
    } catch {
      setCoverError("An unexpected error occurred.");
    } finally {
      setCoverUploading(false);
    }
  }

  function handleCoverDelete() {
    setDeleteError(null);
    setDeleteTarget({ kind: "cover" });
  }

  // ==================================================
  // VEHICLE MEDIA
  // ==================================================

  async function handleMediaUpload(file: File) {
    if (!accountId || !vehicle) return;
    setMediaUploading(true);
    setMediaError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await apiUpload(
        `/api/v1/accounts/${accountId}/vehicles/${vehicle.id}/media/upload`,
        form,
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setMediaError(data.detail ?? "Upload failed. Please try again.");
        return;
      }
      const newItem: MediaItem = await res.json();
      setMedia((prev) => [...prev, newItem]);
    } catch {
      setMediaError("An unexpected error occurred.");
    } finally {
      setMediaUploading(false);
    }
  }

  function handleMediaDelete(item: MediaItem) {
    setDeleteError(null);
    setDeleteTarget({ kind: "media", item });
  }

  async function confirmDelete() {
    if (!deleteTarget || !accountId || !vehicle) return;
    setDeleteDeleting(true);
    setDeleteError(null);
    try {
      if (deleteTarget.kind === "cover") {
        const res = await apiFetch(
          `/api/v1/accounts/${accountId}/vehicles/${vehicle.id}/photo`,
          { method: "DELETE" },
        );
        if (!res.ok) { setDeleteError("Could not remove cover photo."); setDeleteDeleting(false); return; }
        setVehicle((v) => v ? { ...v, image_key: null, cover_url: null } : v);
      } else {
        const res = await apiFetch(
          `/api/v1/accounts/${accountId}/vehicles/${vehicle.id}/media/${deleteTarget.item.id}`,
          { method: "DELETE" },
        );
        if (!res.ok) { setDeleteDeleting(false); return; }
        setMedia((prev) => prev.filter((m) => m.id !== (deleteTarget as { kind: "media"; item: MediaItem }).item.id));
      }
      setDeleteTarget(null);
    } catch {
      setDeleteError("An unexpected error occurred.");
    }
    setDeleteDeleting(false);
  }

  // ==================================================
  // RENDER
  // ==================================================

  const title = vehicle ? [vehicle.make, vehicle.model].filter(Boolean).join(" ") || "Vehicle" : "Vehicle";
  const coverUrl = vehicle?.cover_url ?? null;

  return (
    <div className="ph-shell">
      <header className="ph-head">
        <h1 className="ph-title">Photos</h1>
        <p className="ph-sub">Cover photo and all-round media for {title}.</p>
      </header>

      {loading ? (
        <div className="ph-skeleton" />
      ) : (
        <>
          {/* ==================================================
              COVER PHOTO
          ================================================== */}
          <Card>
            <h2 className="ph-section-title">Cover photo</h2>
            <div className="ph-cover-row">
              <div className="ph-cover-preview">
                {coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={coverUrl} alt={title} className="ph-cover-img" />
                ) : (
                  <div className="ph-cover-fallback">
                    <BodyTypeIcon
                      bodyType={vehicle?.body_type as Parameters<typeof BodyTypeIcon>[0]["bodyType"]}
                      size={64}
                      className="ph-cover-icon"
                    />
                    <p className="ph-cover-hint">No cover photo</p>
                  </div>
                )}
              </div>
              <div className="ph-cover-actions">
                <button
                  className="rec-btn rec-btn--primary"
                  onClick={() => { setCoverError(null); coverInputRef.current?.click(); }}
                  disabled={coverUploading}
                >
                  {coverUploading ? "Uploading…" : coverUrl ? "Replace cover photo" : "Upload cover photo"}
                </button>
                {coverUrl && (
                  <button
                    className="rec-btn rec-btn--danger-sm"
                    onClick={handleCoverDelete}
                    disabled={coverUploading}
                  >
                    Remove cover photo
                  </button>
                )}
                {coverError && <p className="ph-err">{coverError}</p>}
                <input
                  ref={coverInputRef}
                  type="file"
                  accept={ACCEPTED_IMAGE}
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleCoverUpload(f);
                    e.target.value = "";
                  }}
                />
              </div>
            </div>
          </Card>

          {/* ==================================================
              VEHICLE MEDIA GALLERY
              Add photo tile is the last item in the grid so it
              sits at the same level as the Remove buttons.
          ================================================== */}
          <Card>
            <h2 className="ph-section-title">Vehicle media</h2>
            {mediaError && <p className="ph-err ph-media-err">{mediaError}</p>}
            <div className="ph-gallery">
              {media.map((item) => (
                <div key={item.id} className="ph-gallery-item">
                  {item.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.url} alt="Vehicle media" className="ph-gallery-img" />
                  ) : (
                    <div className="ph-gallery-fallback" />
                  )}
                  <button
                    className="rec-btn rec-btn--danger-sm"
                    onClick={() => handleMediaDelete(item)}
                  >
                    Remove
                  </button>
                </div>
              ))}
              {/* Add photo tile — always last in grid */}
              <div className="ph-gallery-item">
                <button
                  className="ph-gallery-add"
                  onClick={() => { setMediaError(null); mediaInputRef.current?.click(); }}
                  disabled={mediaUploading}
                >
                  {mediaUploading ? "Uploading…" : "+ Add photo"}
                </button>
              </div>
            </div>
            <input
              ref={mediaInputRef}
              type="file"
              accept={ACCEPTED_IMAGE}
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleMediaUpload(f);
                e.target.value = "";
              }}
            />
          </Card>
        </>
      )}

      <style>{PH_STYLES}</style>

      <ConfirmDeleteModal
        open={deleteTarget !== null}
        title={deleteTarget?.kind === "cover" ? "Remove cover photo" : "Remove photo"}
        body={
          deleteTarget?.kind === "cover"
            ? "The cover photo will be permanently deleted from storage."
            : "This photo will be permanently deleted from storage."
        }
        confirming={deleteDeleting}
        error={deleteError}
        onConfirm={confirmDelete}
        onCancel={() => { setDeleteTarget(null); setDeleteError(null); }}
      />
    </div>
  );
}

// ==================================================
// STYLES
// ==================================================

const PH_STYLES = `
  .ph-shell { display: flex; flex-direction: column; gap: var(--space-6); max-width: 900px; margin: 0 auto; width: 100%; }

  .ph-head { display: flex; flex-direction: column; gap: 0; }
  .ph-title { font-size: var(--text-2xl); letter-spacing: var(--tracking-tight); margin: 0 0 4px; }
  .ph-sub   { font-size: var(--text-sm); color: var(--colour-text-muted); margin: 0; }

  .ph-section-title { font-size: var(--text-md); font-weight: var(--weight-medium); margin-bottom: var(--space-5); letter-spacing: normal; }

  /* Cover photo */
  .ph-cover-row { display: flex; gap: var(--space-6); align-items: flex-start; flex-wrap: wrap; }
  .ph-cover-preview { flex-shrink: 0; }
  .ph-cover-img {
    width: 220px; height: 148px; object-fit: cover;
    border-radius: var(--radius-md); border: 0.5px solid var(--colour-border); display: block;
  }
  .ph-cover-fallback {
    width: 220px; height: 148px; border-radius: var(--radius-md);
    border: 0.5px dashed var(--colour-border); background: rgba(108,99,255,0.04);
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--space-2);
  }
  .ph-cover-icon { color: rgba(136,136,170,0.4); }
  .ph-cover-hint { font-size: var(--text-xs); color: var(--colour-text-muted); }
  .ph-cover-actions { display: flex; flex-direction: column; gap: var(--space-3); padding-top: 4px; }

  /* Vehicle media gallery */
  .ph-media-err { margin-bottom: var(--space-4); }
  .ph-gallery {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: var(--space-4);
  }
  .ph-gallery-item { display: flex; flex-direction: column; gap: 4px; }
  .ph-gallery-img {
    width: 100%; aspect-ratio: 4/3; object-fit: cover;
    border-radius: var(--radius-md); border: 0.5px solid var(--colour-border); display: block;
  }
  .ph-gallery-fallback {
    width: 100%; aspect-ratio: 4/3;
    background: rgba(255,255,255,0.04); border-radius: var(--radius-md);
    border: 0.5px dashed var(--colour-border);
  }
  .ph-gallery-add {
    width: 100%; aspect-ratio: 4/3; border: 1px dashed var(--colour-border);
    border-radius: var(--radius-md); background: rgba(255,255,255,0.02);
    font-size: var(--text-xs); color: var(--colour-text-muted); cursor: none;
    transition: border-color 0.2s, color 0.2s;
  }
  .ph-gallery-add:hover:not(:disabled) { border-color: var(--colour-accent); color: var(--colour-text); }
  .ph-gallery-add:disabled { opacity: 0.5; }

  /* Misc */
  .ph-err { font-size: var(--text-xs); color: var(--colour-error); margin: 0; }
  .ph-skeleton { height: 200px; background: rgba(255,255,255,0.04); border-radius: var(--radius-lg); animation: shimmer 1.6s infinite; }
  @keyframes shimmer { 0% { opacity: 0.6; } 50% { opacity: 1; } 100% { opacity: 0.6; } }

  @media (max-width: 767px) {
    .ph-cover-row { flex-direction: column; }
    .ph-cover-img, .ph-cover-fallback { width: 100%; height: 180px; }
    .ph-gallery { grid-template-columns: repeat(2, 1fr); }
  }
`;
