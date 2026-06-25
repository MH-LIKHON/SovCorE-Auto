// ============================================================
// frontend/web/app/(dashboard)/dashboard/vehicles/[id]/photos/page.tsx
// ============================================================
//
// Purpose:
//   Photos gallery for a vehicle. Shows the cover photo (with
//   upload and replace controls) and damage photos (before and
//   after images from all damage entries).
//
// Design:
//   Three sections:
//     Cover photo — the image stored in vehicle.image_key.
//       Clicking "Change" triggers the presigned upload flow and
//       PATCHes the vehicle with the new key.
//     Damage photos — before/after images across all damage entries.
//       Each entry is a row with both photo slots shown inline.
//       Uploading calls the damage photo sign endpoint; removing
//       calls DELETE .../damage/{id}/photo/{slot}.
//     Attachments — record attachments where kind = "photo" are
//       listed here as a reference but are managed from the records
//       page; no upload is provided from this view.
//
//   All images are served from the public R2 URL (NEXT_PUBLIC_R2_PUBLIC_URL).
//   Upload uses the same PhotoSlot component pattern used on the
//   damage page (inlined here to keep the page self-contained).
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
import { apiFetch, getAccountId } from "@/src/lib/api/fetch";

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
}

type DamageKind = "scratch" | "dent" | "paintwork" | "accident" | "glass" | "stone_chip";

interface DamageItem {
  id: string;
  kind: DamageKind;
  date: string;
  description: string | null;
  before_key: string | null;
  after_key: string | null;
}

interface DamagePage {
  items: DamageItem[];
  total: number;
}

// ==================================================
// HELPERS
// ==================================================

const R2_PUBLIC = process.env.NEXT_PUBLIC_R2_PUBLIC_URL ?? "";

function imgUrl(key: string | null): string | null {
  if (!key || !R2_PUBLIC) return null;
  return `${R2_PUBLIC}/${key}`;
}

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

const ACCEPTED_IMAGE = "image/jpeg,image/png,image/webp";

// ==================================================
// PHOTO SLOT COMPONENT (damage before/after)
// ==================================================

function DamagePhotoSlot({
  slot,
  entry,
  vehicleId,
  accountId,
  onUpdated,
}: {
  slot: "before" | "after";
  entry: DamageItem;
  vehicleId: string;
  accountId: string;
  onUpdated: (e: DamageItem) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const r2Key = slot === "before" ? entry.before_key : entry.after_key;
  const url = imgUrl(r2Key);

  async function handleUpload(file: File) {
    setUploading(true);
    setError(null);
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
    try {
      const signRes = await apiFetch(
        `/api/v1/accounts/${accountId}/vehicles/${vehicleId}/damage/${entry.id}/photo/sign`,
        { method: "POST", body: JSON.stringify({ slot, ext }) }
      );
      if (!signRes.ok) { setError("Could not generate upload URL."); return; }
      const { upload_url, key } = await signRes.json();
      const putRes = await fetch(upload_url, {
        method: "PUT",
        headers: { "Content-Type": file.type || "image/jpeg" },
        body: file,
      });
      if (!putRes.ok) { setError("Upload to storage failed."); return; }
      const patchRes = await apiFetch(
        `/api/v1/accounts/${accountId}/damage/${entry.id}`,
        {
          method: "PATCH",
          body: JSON.stringify(slot === "before" ? { before_key: key } : { after_key: key }),
        }
      );
      if (!patchRes.ok) { setError("Could not save photo key."); return; }
      onUpdated(await patchRes.json());
    } catch {
      setError("An unexpected error occurred.");
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm(`Remove ${slot} photo?`)) return;
    setUploading(true);
    setError(null);
    try {
      const res = await apiFetch(
        `/api/v1/accounts/${accountId}/damage/${entry.id}/photo/${slot}`,
        { method: "DELETE" }
      );
      if (!res.ok) { setError("Could not remove photo."); return; }
      onUpdated({ ...entry, [slot === "before" ? "before_key" : "after_key"]: null });
    } catch {
      setError("An unexpected error occurred.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="ph-slot">
      <p className="ph-slot__label">{slot === "before" ? "Before" : "After"}</p>
      {url ? (
        <div className="ph-slot__preview">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={`${slot} damage`} className="ph-slot__img" />
          <button className="ph-slot__remove" onClick={handleDelete} disabled={uploading}>
            {uploading ? "…" : "Remove"}
          </button>
        </div>
      ) : (
        <button
          className="ph-slot__add"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? "Uploading…" : `Add ${slot}`}
        </button>
      )}
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
  const [loading, setLoading] = useState(true);

  // Cover photo upload
  const coverInputRef = useRef<HTMLInputElement | null>(null);
  const [coverUploading, setCoverUploading] = useState(false);
  const [coverError, setCoverError] = useState<string | null>(null);

  // ==================================================
  // DATA LOADING
  // ==================================================

  async function load() {
    if (!accountId || !id) return;
    setLoading(true);
    const [vRes, dRes] = await Promise.all([
      apiFetch(`/api/v1/accounts/${accountId}/vehicles/${id}`),
      apiFetch(`/api/v1/accounts/${accountId}/vehicles/${id}/damage?page=1&page_size=200`),
    ]);
    if (vRes.ok) setVehicle(await vRes.json());
    if (dRes.ok) {
      const d: DamagePage = await dRes.json();
      setDamage(d.items);
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ==================================================
  // COVER PHOTO UPLOAD
  // ==================================================

  async function handleCoverUpload(file: File) {
    if (!accountId || !vehicle) return;
    setCoverUploading(true);
    setCoverError(null);
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
    try {
      const signRes = await apiFetch(
        `/api/v1/accounts/${accountId}/vehicles/${vehicle.id}/photo/sign`,
        { method: "POST", body: JSON.stringify({ ext }) }
      );
      if (!signRes.ok) { setCoverError("Could not generate upload URL."); return; }
      const { upload_url, key } = await signRes.json();
      const putRes = await fetch(upload_url, {
        method: "PUT",
        headers: { "Content-Type": file.type || "image/jpeg" },
        body: file,
      });
      if (!putRes.ok) { setCoverError("Upload to storage failed."); return; }
      const patchRes = await apiFetch(
        `/api/v1/accounts/${accountId}/vehicles/${vehicle.id}`,
        { method: "PATCH", body: JSON.stringify({ image_key: key }) }
      );
      if (!patchRes.ok) { setCoverError("Could not save photo."); return; }
      const updated = await patchRes.json();
      setVehicle((v) => v ? { ...v, image_key: updated.image_key } : v);
    } catch {
      setCoverError("An unexpected error occurred.");
    } finally {
      setCoverUploading(false);
    }
  }

  // ==================================================
  // DAMAGE UPDATE CALLBACK
  // ==================================================

  function handleDamageUpdated(updated: DamageItem) {
    setDamage((prev) => prev.map((e) => e.id === updated.id ? updated : e));
  }

  // ==================================================
  // RENDER
  // ==================================================

  const title = vehicle ? [vehicle.make, vehicle.model].filter(Boolean).join(" ") || "Vehicle" : "Vehicle";
  const coverUrl = imgUrl(vehicle?.image_key ?? null);
  const damageWithPhotos = damage.filter((e) => e.before_key || e.after_key);

  return (
    <div className="ph-shell">
      {/* ---- Header ---- */}
      <header className="ph-head">
        <Link href={`/dashboard/vehicles/${id}`} className="ph-back">← Vehicle</Link>
        <h1 className="ph-title">Photos</h1>
        <p className="ph-sub">Cover photo and damage images for {title}.</p>
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
                  className="ph-upload-btn"
                  onClick={() => { setCoverError(null); coverInputRef.current?.click(); }}
                  disabled={coverUploading}
                >
                  {coverUploading ? "Uploading…" : coverUrl ? "Replace cover photo" : "Upload cover photo"}
                </button>
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
              DAMAGE PHOTOS
          ================================================== */}
          <Card>
            <div className="ph-section-head">
              <h2 className="ph-section-title">Damage photos</h2>
              <Link href={`/dashboard/vehicles/${id}/damage`} className="ph-section-link">
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
                      <span className="ph-damage-date">{formatDate(entry.date)}</span>
                      {entry.description && (
                        <span className="ph-damage-desc">{entry.description}</span>
                      )}
                    </div>
                    <div className="ph-damage-slots">
                      <DamagePhotoSlot
                        slot="before"
                        entry={entry}
                        vehicleId={id ?? ""}
                        accountId={accountId}
                        onUpdated={handleDamageUpdated}
                      />
                      <DamagePhotoSlot
                        slot="after"
                        entry={entry}
                        vehicleId={id ?? ""}
                        accountId={accountId}
                        onUpdated={handleDamageUpdated}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* ==================================================
              SUMMARY STAT
          ================================================== */}
          {damageWithPhotos.length > 0 && (
            <p className="ph-stat">
              {damageWithPhotos.length} of {damage.length} damage {damage.length !== 1 ? "entries" : "entry"} {damageWithPhotos.length !== 1 ? "have" : "has"} photos.
            </p>
          )}
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
  .ph-back { font-size: var(--text-sm); color: var(--colour-text-muted); text-decoration: none; margin-bottom: var(--space-2); }
  .ph-back:hover { color: #00d4ff; }
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
    width: 220px;
    height: 148px;
    object-fit: cover;
    border-radius: var(--radius-md);
    border: 0.5px solid var(--colour-border);
    display: block;
  }
  .ph-cover-fallback {
    width: 220px;
    height: 148px;
    border-radius: var(--radius-md);
    border: 0.5px dashed var(--colour-border);
    background: rgba(108,99,255,0.04);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
  }
  .ph-cover-icon { color: rgba(136,136,170,0.4); }
  .ph-cover-hint { font-size: var(--text-xs); color: var(--colour-text-muted); }
  .ph-cover-actions { display: flex; flex-direction: column; gap: var(--space-3); padding-top: 4px; }

  .ph-upload-btn {
    padding: 8px 18px;
    border-radius: var(--radius-sm);
    background: var(--colour-accent);
    color: #fff;
    font-size: var(--text-sm);
    border: none;
    cursor: none;
    transition: opacity 0.2s;
  }
  .ph-upload-btn:disabled { opacity: 0.55; }

  /* Damage list */
  .ph-damage-list { display: flex; flex-direction: column; gap: var(--space-5); }
  .ph-damage-row { border-bottom: 0.5px solid var(--colour-border); padding-bottom: var(--space-5); }
  .ph-damage-row:last-child { border-bottom: none; padding-bottom: 0; }
  .ph-damage-meta { display: flex; align-items: center; gap: var(--space-3); margin-bottom: var(--space-3); flex-wrap: wrap; }
  .ph-damage-kind {
    font-size: var(--text-xs);
    padding: 2px 8px;
    border-radius: var(--radius-full, 999px);
    border: 1px solid var(--colour-border);
    background: rgba(255,255,255,0.04);
    color: var(--colour-text-muted);
    white-space: nowrap;
  }
  .ph-damage-date { font-size: var(--text-sm); color: var(--colour-text-muted); }
  .ph-damage-desc { font-size: var(--text-sm); color: var(--colour-text); }
  .ph-damage-slots { display: flex; gap: var(--space-4); flex-wrap: wrap; }

  /* Shared photo slot */
  .ph-slot { display: flex; flex-direction: column; gap: 6px; }
  .ph-slot__label { font-size: var(--text-xs); color: var(--colour-text-muted); text-transform: uppercase; letter-spacing: 0.06em; margin: 0; }
  .ph-slot__preview { display: flex; flex-direction: column; gap: 4px; }
  .ph-slot__img {
    width: 140px;
    height: 96px;
    object-fit: cover;
    border-radius: var(--radius-md);
    border: 0.5px solid var(--colour-border);
    display: block;
  }
  .ph-slot__remove {
    font-size: var(--text-xs);
    color: var(--colour-error);
    background: none;
    border: none;
    padding: 0;
    cursor: none;
    text-decoration: underline;
    text-underline-offset: 2px;
    text-align: left;
  }
  .ph-slot__add {
    width: 140px;
    height: 96px;
    border: 1px dashed var(--colour-border);
    border-radius: var(--radius-md);
    background: rgba(255,255,255,0.02);
    font-size: var(--text-xs);
    color: var(--colour-text-muted);
    cursor: none;
    transition: border-color 0.2s, color 0.2s;
  }
  .ph-slot__add:hover { border-color: var(--colour-accent); color: var(--colour-text); }
  .ph-slot__add:disabled { opacity: 0.5; }

  /* Misc */
  .ph-empty { font-size: var(--text-sm); color: var(--colour-text-muted); max-width: 480px; line-height: var(--leading-normal); }
  .ph-err { font-size: var(--text-xs); color: var(--colour-error); margin: 0; }
  .ph-stat { font-size: var(--text-sm); color: var(--colour-text-muted); }
  .ph-skeleton { height: 200px; background: rgba(255,255,255,0.04); border-radius: var(--radius-lg); animation: shimmer 1.6s infinite; }
  @keyframes shimmer { 0% { opacity: 0.6; } 50% { opacity: 1; } 100% { opacity: 0.6; } }

  @media (max-width: 767px) {
    .ph-cover-row { flex-direction: column; }
    .ph-cover-img, .ph-cover-fallback { width: 100%; height: 180px; }
    .ph-damage-slots { flex-direction: column; }
  }
`;
