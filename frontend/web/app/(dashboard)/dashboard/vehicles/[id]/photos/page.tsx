// ============================================================
// frontend/web/app/(dashboard)/dashboard/vehicles/[id]/photos/page.tsx
// ============================================================
//
// Purpose:
//   Photos gallery for a vehicle. Three sections:
//     Cover photo  — the single image stored in vehicle.image_key.
//     Vehicle media — all-round gallery photos (unlimited). The
//       "Add photo" tile lives inside the grid next to Remove buttons.
//     Damage photos — before/after galleries per damage entry, each
//       slot holding multiple photos. Gated by damage status:
//       active entries allow add but block delete; resolved entries
//       allow delete with a typed DELETE confirmation modal.
//
// Design:
//   All images are served via signed GET URLs returned by the API
//   (cover_url, before_photos[].url, after_photos[].url, url). The
//   R2 bucket is private; no public URL is ever used.
//
//   Vehicle media gallery: photos + "Add photo" tile sit in the same
//   grid so Add and Remove are always at the same visual level.
//
//   Damage photo delete requires the entry status to be "resolved"
//   and the user to type DELETE (all caps) in a confirmation modal.
//   Active entries (urgent/in_progress/deferred) block deletion to
//   preserve photographic evidence.
//
// Consumed by:
//   - Routed at /dashboard/vehicles/[id]/photos
// ============================================================

"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Card } from "@/src/components/ui/card";
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

type DamageStatus = "urgent" | "in_progress" | "deferred" | "resolved";
type DamageKind = "scratch" | "dent" | "paintwork" | "accident" | "glass" | "stone_chip";

interface DamagePhotoItem {
  id: string;
  r2_key: string;
  url: string | null;
  display_order: number;
}

interface DamageItem {
  id: string;
  kind: DamageKind;
  date: string;
  description: string | null;
  status: DamageStatus;
  before_photos: DamagePhotoItem[];
  after_photos: DamagePhotoItem[];
}

interface DamagePage {
  items: DamageItem[];
  total: number;
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

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

const KIND_LABELS: Record<DamageKind, string> = {
  scratch:    "Scratch",
  dent:       "Dent",
  paintwork:  "Paintwork",
  accident:   "Accident",
  glass:      "Glass",
  stone_chip: "Stone chip",
};

const STATUS_LABELS: Record<DamageStatus, string> = {
  urgent:      "Urgent",
  in_progress: "In Progress",
  deferred:    "Deferred",
  resolved:    "Resolved",
};

const STATUS_CLASS: Record<DamageStatus, string> = {
  urgent:      "ph-status ph-status--urgent",
  in_progress: "ph-status ph-status--in-progress",
  deferred:    "ph-status ph-status--deferred",
  resolved:    "ph-status ph-status--resolved",
};

const ACCEPTED_IMAGE = "image/jpeg,image/png,image/webp";

// ==================================================
// TYPED DELETE MODAL
// ==================================================

function TypedDeleteModal({
  open,
  warning,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  warning: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [typed, setTyped] = useState("");

  // Reset typed value whenever modal opens.
  useEffect(() => { if (open) setTyped(""); }, [open]);

  if (!open) return null;

  return (
    <div className="ph-modal-backdrop" onClick={onCancel}>
      <div className="ph-modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="ph-modal-title">Delete photo</h3>
        <p className="ph-modal-body">{warning}</p>
        <p className="ph-modal-caution">
          This action is permanent. The photo will be deleted from storage and the record cannot be recovered.
        </p>
        <input
          type="text"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder="Type DELETE to confirm"
          className="ph-modal-input"
          autoFocus
        />
        <div className="ph-modal-actions">
          <button onClick={onCancel} className="rec-btn rec-btn--secondary">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={typed !== "DELETE"}
            className="rec-btn rec-btn--danger"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ==================================================
// DAMAGE PHOTO SLOT
// ==================================================

function DamagePhotoSlot({
  slot,
  photos,
  entry,
  vehicleId,
  accountId,
  onAdded,
  onRequestDelete,
}: {
  slot: "before" | "after";
  photos: DamagePhotoItem[];
  entry: DamageItem;
  vehicleId: string;
  accountId: string;
  onAdded: (updated: DamageItem) => void;
  onRequestDelete: (entry: DamageItem, photo: DamagePhotoItem, slot: "before" | "after") => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canDelete = entry.status === "resolved";

  async function handleUpload(file: File) {
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("slot", slot);
      const res = await apiUpload(
        `/api/v1/accounts/${accountId}/vehicles/${vehicleId}/damage/${entry.id}/photo/upload`,
        form,
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.detail ?? "Upload failed. Please try again.");
        return;
      }
      onAdded(await res.json());
    } catch {
      setError("An unexpected error occurred.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="ph-slot">
      <p className="ph-slot__label">{slot === "before" ? "Before" : "After"}</p>
      <div className="ph-slot__row">
        {photos.map((photo) => (
          <div key={photo.id} className="ph-slot__item">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo.url ?? ""} alt={`${slot} damage`} className="ph-slot__img" />
            {canDelete && (
              <button
                className="rec-btn rec-btn--danger-sm"
                onClick={() => onRequestDelete(entry, photo, slot)}
              >
                Remove
              </button>
            )}
          </div>
        ))}
        <button
          className="ph-slot__add"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? "Uploading…" : `Add ${slot}`}
        </button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_IMAGE}
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleUpload(f);
          e.target.value = "";
        }}
      />
      {error && <p className="ph-err">{error}</p>}
    </div>
  );
}

// ==================================================
// PAGE
// ==================================================

export default function VehiclePhotosPage() {
  const { id } = useParams<{ id: string }>();
  const accountId = getAccountId() ?? "";

  const [vehicle, setVehicle] = useState<VehicleSummary | null>(null);
  const [damage, setDamage] = useState<DamageItem[]>([]);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Cover photo
  const coverInputRef = useRef<HTMLInputElement | null>(null);
  const [coverUploading, setCoverUploading] = useState(false);
  const [coverDeleting, setCoverDeleting] = useState(false);
  const [coverError, setCoverError] = useState<string | null>(null);

  // Vehicle media upload
  const mediaInputRef = useRef<HTMLInputElement | null>(null);
  const [mediaUploading, setMediaUploading] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);

  // Damage photo delete modal
  const [deleteModal, setDeleteModal] = useState<{
    entry: DamageItem;
    photo: DamagePhotoItem;
    slot: "before" | "after";
    deleting: boolean;
  } | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // ==================================================
  // DATA LOADING
  // ==================================================

  async function load() {
    if (!accountId || !id) return;
    setLoading(true);
    const [vRes, dRes, mRes] = await Promise.all([
      apiFetch(`/api/v1/accounts/${accountId}/vehicles/${id}`),
      apiFetch(`/api/v1/accounts/${accountId}/vehicles/${id}/damage?page=1&page_size=200`),
      apiFetch(`/api/v1/accounts/${accountId}/vehicles/${id}/media`),
    ]);
    if (vRes.ok) setVehicle(await vRes.json());
    if (dRes.ok) {
      const d: DamagePage = await dRes.json();
      setDamage(d.items);
    }
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

  async function handleCoverDelete() {
    if (!accountId || !vehicle) return;
    if (!window.confirm("Remove cover photo?")) return;
    setCoverDeleting(true);
    setCoverError(null);
    try {
      const res = await apiFetch(
        `/api/v1/accounts/${accountId}/vehicles/${vehicle.id}/photo`,
        { method: "DELETE" },
      );
      if (!res.ok) { setCoverError("Could not remove cover photo."); return; }
      setVehicle((v) => v ? { ...v, image_key: null, cover_url: null } : v);
    } catch {
      setCoverError("An unexpected error occurred.");
    } finally {
      setCoverDeleting(false);
    }
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

  async function handleMediaDelete(item: MediaItem) {
    if (!accountId || !vehicle) return;
    if (!window.confirm("Remove this photo?")) return;
    try {
      const res = await apiFetch(
        `/api/v1/accounts/${accountId}/vehicles/${vehicle.id}/media/${item.id}`,
        { method: "DELETE" },
      );
      if (!res.ok) return;
      setMedia((prev) => prev.filter((m) => m.id !== item.id));
    } catch {
      // silent — user can refresh
    }
  }

  // ==================================================
  // DAMAGE PHOTO
  // ==================================================

  function handleDamageUpdated(updated: DamageItem) {
    setDamage((prev) => prev.map((e) => e.id === updated.id ? updated : e));
  }

  function openDeleteModal(entry: DamageItem, photo: DamagePhotoItem, slot: "before" | "after") {
    setDeleteError(null);
    setDeleteModal({ entry, photo, slot, deleting: false });
  }

  async function confirmDamageDelete() {
    if (!deleteModal || !accountId) return;
    setDeleteModal((m) => m ? { ...m, deleting: true } : null);
    setDeleteError(null);
    const { entry, photo, slot } = deleteModal;
    try {
      const res = await apiFetch(
        `/api/v1/accounts/${accountId}/damage/${entry.id}/photos/${photo.id}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setDeleteError(data.detail ?? "Could not delete photo.");
        setDeleteModal((m) => m ? { ...m, deleting: false } : null);
        return;
      }
      setDamage((prev) =>
        prev.map((e) =>
          e.id === entry.id
            ? {
                ...e,
                before_photos: slot === "before" ? e.before_photos.filter((p) => p.id !== photo.id) : e.before_photos,
                after_photos:  slot === "after"  ? e.after_photos.filter((p)  => p.id !== photo.id) : e.after_photos,
              }
            : e,
        ),
      );
      setDeleteModal(null);
    } catch {
      setDeleteError("An unexpected error occurred.");
      setDeleteModal((m) => m ? { ...m, deleting: false } : null);
    }
  }

  // ==================================================
  // RENDER
  // ==================================================

  const title = vehicle ? [vehicle.make, vehicle.model].filter(Boolean).join(" ") || "Vehicle" : "Vehicle";
  const coverUrl = vehicle?.cover_url ?? null;

  return (
    <div className="ph-shell">
      {/* ---- Header ---- */}
      <header className="ph-head">
        <h1 className="ph-title">Photos</h1>
        <p className="ph-sub">Cover photo, media gallery, and damage images for {title}.</p>
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
                  disabled={coverUploading || coverDeleting}
                >
                  {coverUploading ? "Uploading…" : coverUrl ? "Replace cover photo" : "Upload cover photo"}
                </button>
                {coverUrl && (
                  <button
                    className="rec-btn rec-btn--danger-sm"
                    onClick={handleCoverDelete}
                    disabled={coverUploading || coverDeleting}
                  >
                    {coverDeleting ? "Removing…" : "Remove cover photo"}
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
              Add photo tile lives inside the grid so it sits
              at the same level as the Remove buttons.
          ================================================== */}
          <Card>
            <div className="ph-section-head">
              <h2 className="ph-section-title">Vehicle media</h2>
            </div>
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

          {/* ==================================================
              DAMAGE PHOTOS
          ================================================== */}
          <Card>
            <div className="ph-section-head">
              <h2 className="ph-section-title">Damage photos</h2>
              <Link href={`/dashboard/vehicles/${id}/damage`} className="ph-section-link sov-link">
                Manage damage entries →
              </Link>
            </div>

            {damage.length === 0 ? (
              <p className="ph-empty">No damage entries recorded. Add an entry on the damage page to attach before and after photos.</p>
            ) : (
              <div className="ph-damage-list">
                {damage.map((entry) => (
                  <div key={entry.id} className="ph-damage-row">
                    <div className="ph-damage-meta">
                      <span className="ph-damage-kind">{KIND_LABELS[entry.kind]}</span>
                      <span className={STATUS_CLASS[entry.status]}>{STATUS_LABELS[entry.status]}</span>
                      <span className="ph-damage-date">{formatDate(entry.date)}</span>
                      {entry.description && (
                        <span className="ph-damage-desc">{entry.description}</span>
                      )}
                    </div>
                    {entry.status !== "resolved" && (
                      <p className="ph-damage-note">
                        Photos can only be removed once this entry is marked Resolved.
                      </p>
                    )}
                    <div className="ph-damage-slots">
                      <DamagePhotoSlot
                        slot="before"
                        photos={entry.before_photos}
                        entry={entry}
                        vehicleId={id ?? ""}
                        accountId={accountId}
                        onAdded={handleDamageUpdated}
                        onRequestDelete={openDeleteModal}
                      />
                      <DamagePhotoSlot
                        slot="after"
                        photos={entry.after_photos}
                        entry={entry}
                        vehicleId={id ?? ""}
                        accountId={accountId}
                        onAdded={handleDamageUpdated}
                        onRequestDelete={openDeleteModal}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}

      {/* ==================================================
          DAMAGE PHOTO TYPED DELETE MODAL
      ================================================== */}
      {deleteModal && (
        <>
          <TypedDeleteModal
            open={!deleteModal.deleting}
            warning={`You are about to permanently delete a ${deleteModal.slot} photo from damage entry "${KIND_LABELS[deleteModal.entry.kind]}" (${formatDate(deleteModal.entry.date)}).`}
            onConfirm={confirmDamageDelete}
            onCancel={() => setDeleteModal(null)}
          />
          {deleteError && <p className="ph-modal-outer-err">{deleteError}</p>}
        </>
      )}

      <style>{PH_STYLES}</style>
    </div>
  );
}

// ==================================================
// STYLES
// ==================================================

const PH_STYLES = `
  .ph-shell { display: flex; flex-direction: column; gap: var(--space-6); max-width: 900px; margin: 0 auto; width: 100%; }

  /* Header */
  .ph-head { display: flex; flex-direction: column; gap: 0; }
  .ph-title { font-size: var(--text-2xl); letter-spacing: var(--tracking-tight); margin: 0 0 4px; }
  .ph-sub { font-size: var(--text-sm); color: var(--colour-text-muted); margin: 0; }

  /* Section */
  .ph-section-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-5); }
  .ph-section-title { font-size: var(--text-md); font-weight: var(--weight-medium); margin-bottom: var(--space-5); letter-spacing: normal; }
  .ph-section-head .ph-section-title { margin-bottom: 0; }
  .ph-section-link { font-size: var(--text-sm); color: var(--colour-accent); text-decoration: none; }
  .ph-section-link:hover { text-decoration: underline; }

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
  /* Add photo tile — same size as gallery images, lives in grid */
  .ph-gallery-add {
    width: 100%; aspect-ratio: 4/3; border: 1px dashed var(--colour-border);
    border-radius: var(--radius-md); background: rgba(255,255,255,0.02);
    font-size: var(--text-xs); color: var(--colour-text-muted); cursor: none;
    transition: border-color 0.2s, color 0.2s;
  }
  .ph-gallery-add:hover:not(:disabled) { border-color: var(--colour-accent); color: var(--colour-text); }
  .ph-gallery-add:disabled { opacity: 0.5; }

  /* Damage list */
  .ph-damage-list { display: flex; flex-direction: column; gap: var(--space-5); }
  .ph-damage-row { border-bottom: 0.5px solid var(--colour-border); padding-bottom: var(--space-5); }
  .ph-damage-row:last-child { border-bottom: none; padding-bottom: 0; }
  .ph-damage-meta { display: flex; align-items: center; gap: var(--space-3); margin-bottom: var(--space-2); flex-wrap: wrap; }
  .ph-damage-kind {
    font-size: var(--text-xs); padding: 2px 8px;
    border-radius: var(--radius-full, 999px); border: 1px solid var(--colour-border);
    background: rgba(255,255,255,0.04); color: var(--colour-text-muted); white-space: nowrap;
  }
  .ph-damage-date { font-size: var(--text-sm); color: var(--colour-text-muted); }
  .ph-damage-desc { font-size: var(--text-sm); color: var(--colour-text); }
  .ph-damage-note { font-size: var(--text-xs); color: var(--colour-text-muted); margin: 0 0 var(--space-3); font-style: italic; }
  .ph-damage-slots { display: flex; gap: var(--space-6); flex-wrap: wrap; }

  /* Damage status badges */
  .ph-status {
    font-size: var(--text-xs); padding: 2px 8px; border-radius: var(--radius-full, 999px);
    font-weight: var(--weight-medium); white-space: nowrap; border: 1px solid;
  }
  .ph-status--urgent      { color: #f87171; border-color: rgba(248,113,113,0.35); background: rgba(248,113,113,0.08); }
  .ph-status--in-progress { color: #fbbf24; border-color: rgba(251,191,36,0.35);  background: rgba(251,191,36,0.08); }
  .ph-status--deferred    { color: #60a5fa; border-color: rgba(96,165,250,0.35);   background: rgba(96,165,250,0.08); }
  .ph-status--resolved    { color: #4ade80; border-color: rgba(74,222,128,0.35);   background: rgba(74,222,128,0.08); }

  /* Damage photo slot — multi-photo row per slot */
  .ph-slot { display: flex; flex-direction: column; gap: 6px; }
  .ph-slot__label { font-size: var(--text-xs); color: var(--colour-text-muted); text-transform: uppercase; letter-spacing: 0.06em; margin: 0; }
  .ph-slot__row { display: flex; gap: var(--space-3); flex-wrap: wrap; align-items: flex-start; }
  .ph-slot__item { display: flex; flex-direction: column; gap: 4px; }
  .ph-slot__img {
    width: 140px; height: 96px; object-fit: cover;
    border-radius: var(--radius-md); border: 0.5px solid var(--colour-border); display: block;
  }
  .ph-slot__add {
    width: 140px; height: 96px; border: 1px dashed var(--colour-border);
    border-radius: var(--radius-md); background: rgba(255,255,255,0.02);
    font-size: var(--text-xs); color: var(--colour-text-muted); cursor: none;
    transition: border-color 0.2s, color 0.2s;
    flex-shrink: 0;
  }
  .ph-slot__add:hover:not(:disabled) { border-color: var(--colour-accent); color: var(--colour-text); }
  .ph-slot__add:disabled { opacity: 0.5; }

  /* Typed delete modal */
  .ph-modal-backdrop {
    position: fixed; inset: 0; background: rgba(0,0,0,0.65); z-index: 200;
    display: flex; align-items: center; justify-content: center; padding: var(--space-4);
  }
  .ph-modal {
    background: var(--colour-surface, #1a1a2e); border: 0.5px solid var(--colour-border);
    border-radius: var(--radius-lg); padding: var(--space-6); max-width: 420px; width: 100%;
    display: flex; flex-direction: column; gap: var(--space-4);
  }
  .ph-modal-title { font-size: var(--text-lg); font-weight: var(--weight-semibold); margin: 0; }
  .ph-modal-body { font-size: var(--text-sm); color: var(--colour-text); margin: 0; }
  .ph-modal-caution {
    font-size: var(--text-sm); color: var(--colour-error); margin: 0;
    padding: var(--space-3); background: rgba(248,113,113,0.08);
    border: 1px solid rgba(248,113,113,0.25); border-radius: var(--radius-md);
  }
  .ph-modal-input {
    width: 100%; padding: 8px 12px; font-size: var(--text-sm);
    background: rgba(255,255,255,0.04); border: 1px solid var(--colour-border);
    border-radius: var(--radius-md); color: var(--colour-text); outline: none;
    font-family: inherit;
  }
  .ph-modal-input:focus { border-color: var(--colour-accent); }
  .ph-modal-actions { display: flex; gap: var(--space-3); justify-content: flex-end; }
  .ph-modal-outer-err { font-size: var(--text-xs); color: var(--colour-error); }

  /* Danger button (full-size variant for the modal confirm) */
  .rec-btn--danger {
    background: rgba(239,68,68,0.12); border-color: rgba(239,68,68,0.45); color: #f87171;
    transition: background 0.2s, border-color 0.2s, color 0.2s, transform 0.15s;
  }
  .rec-btn--danger:hover:not(:disabled) { background: rgba(239,68,68,0.22); border-color: #f87171; color: #fff; transform: translateY(-1px); }
  .rec-btn--danger:disabled { opacity: 0.35; }

  /* Misc */
  .ph-empty { font-size: var(--text-sm); color: var(--colour-text-muted); max-width: 480px; line-height: var(--leading-normal); }
  .ph-err { font-size: var(--text-xs); color: var(--colour-error); margin: 0; }
  .ph-skeleton { height: 200px; background: rgba(255,255,255,0.04); border-radius: var(--radius-lg); animation: shimmer 1.6s infinite; }
  @keyframes shimmer { 0% { opacity: 0.6; } 50% { opacity: 1; } 100% { opacity: 0.6; } }

  @media (max-width: 767px) {
    .ph-cover-row { flex-direction: column; }
    .ph-cover-img, .ph-cover-fallback { width: 100%; height: 180px; }
    .ph-damage-slots { flex-direction: column; }
    .ph-gallery { grid-template-columns: repeat(2, 1fr); }
  }
`;
