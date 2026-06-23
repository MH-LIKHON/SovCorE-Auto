// ============================================================
// frontend/web/app/(dashboard)/dashboard/vehicles/[id]/page.tsx
// ============================================================
//
// Purpose:
//   Vehicle profile page. Shows overview, basic information,
//   ownership details, renewal dates, and a documents link.
//   Uses a tab row to switch between sections.
//
// Design:
//   Tab row mirrors SovCorE QR's panel-switcher pattern — a
//   horizontal pill strip with an active underline. Each tab
//   shows a different Card panel below. No page navigation;
//   the tab state is local.
//
//   The overview tab shows the vehicle card at large scale, the
//   lifecycle state, and the four RAG indicators with expiry
//   dates. The basic info tab is an editable form. The ownership
//   tab shows purchase, keeper and finance details.
//
//   Lifecycle state transitions are exposed via a dropdown in
//   the overview tab.
//
// Consumed by:
//   - Routed at /dashboard/vehicles/[id]
// ============================================================

"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Badge } from "@/src/components/ui/badge";
import { Card } from "@/src/components/ui/card";
import { BodyTypeIcon } from "@/src/components/vehicles/body-type-icon";
import { apiFetch, getAccountId } from "@/src/lib/api/fetch";

// ==================================================
// TYPES
// ==================================================

interface VehicleDetail {
  id: string;
  account_id: string;
  registration: string | null;
  vin: string | null;
  make: string | null;
  model: string | null;
  variant: string | null;
  year: number | null;
  engine: string | null;
  fuel_type: string | null;
  transmission: string | null;
  body_type: string | null;
  colour: string | null;
  doors: number | null;
  seats: number | null;
  horsepower: number | null;
  torque: number | null;
  emission_class: string | null;
  tyre_sizes: string | null;
  battery_size: string | null;
  wheel_sizes: string | null;
  mileage: number | null;
  image_key: string | null;
  lifecycle_state: "active" | "sold" | "scrapped" | "archived";
  created_at: string;
  updated_at: string;
}

interface Renewal {
  mot_expiry: string | null;
  tax_due_date: string | null;
  insurance_expiry: string | null;
  service_due_date: string | null;
  service_due_mileage: number | null;
}

interface Ownership {
  current_owner: string | null;
  registered_keeper: string | null;
  purchase_date: string | null;
  purchase_price: number | null;
  seller: string | null;
  dealer: string | null;
  finance_company: string | null;
  finance_status: string | null;
  notes: string | null;
}

type Tab = "overview" | "info" | "ownership" | "renewals";

// ==================================================
// HELPERS
// ==================================================

const R2_PUBLIC = process.env.NEXT_PUBLIC_R2_PUBLIC_URL ?? "";

function formatDate(d: string | null): string {
  if (!d) return "Not set";
  return new Date(d).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatGBP(pence: number | null): string {
  if (pence === null) return "Not set";
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(pence / 100);
}

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const diff = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(diff / 86_400_000);
}

function ragColour(dateStr: string | null): string {
  const days = daysUntil(dateStr);
  if (days === null) return "var(--colour-text-muted)";
  if (days <= 30) return "var(--colour-error)";
  if (days <= 90) return "var(--colour-amber)";
  return "var(--colour-teal)";
}

const LIFECYCLE_LABELS: Record<string, string> = {
  active: "Active",
  sold: "Sold",
  scrapped: "Scrapped",
  archived: "Archived",
};

const LIFECYCLE_BADGE_TONE: Record<string, "success" | "muted" | "info"> = {
  active: "success",
  sold: "muted",
  scrapped: "muted",
  archived: "info",
};

// ==================================================
// PAGE
// ==================================================

export default function VehicleProfilePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const accountId = getAccountId() ?? "";

  const [tab, setTab] = useState<Tab>("overview");
  const [vehicle, setVehicle] = useState<VehicleDetail | null>(null);
  const [renewal, setRenewal] = useState<Renewal | null>(null);
  const [ownership, setOwnership] = useState<Ownership | null>(null);
  const [loading, setLoading] = useState(true);

  // Edit mode for basic info and ownership
  const [editingInfo, setEditingInfo] = useState(false);
  const [editingOwnership, setEditingOwnership] = useState(false);
  const [editingRenewals, setEditingRenewals] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Lifecycle change
  const [lifecycleState, setLifecycleState] = useState<string>("");
  const [settingLifecycle, setSettingLifecycle] = useState(false);

  async function load() {
    if (!accountId || !id) return;
    setLoading(true);
    const [vRes, rRes, oRes] = await Promise.all([
      apiFetch(`/api/v1/accounts/${accountId}/vehicles/${id}`),
      apiFetch(`/api/v1/accounts/${accountId}/vehicles/${id}/renewals`),
      apiFetch(`/api/v1/accounts/${accountId}/vehicles/${id}/ownership`),
    ]);
    const v = vRes.ok ? await vRes.json() : null;
    const r = rRes.ok ? await rRes.json() : null;
    const o = oRes.ok ? await oRes.json() : null;
    setVehicle(v);
    setRenewal(r);
    setOwnership(o);
    if (v) setLifecycleState(v.lifecycle_state);
    setLoading(false);
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Info patch ----
  const [infoForm, setInfoForm] = useState<Partial<VehicleDetail>>({});
  function startEditInfo() {
    setInfoForm({ ...vehicle });
    setEditingInfo(true);
    setSaveError(null);
  }
  async function saveInfo() {
    if (!accountId || !vehicle) return;
    setSaving(true);
    setSaveError(null);
    const res = await apiFetch(`/api/v1/accounts/${accountId}/vehicles/${vehicle.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        registration: infoForm.registration ?? null,
        make: infoForm.make ?? null,
        model: infoForm.model ?? null,
        variant: infoForm.variant ?? null,
        year: infoForm.year ?? null,
        colour: infoForm.colour ?? null,
        fuel_type: infoForm.fuel_type ?? null,
        transmission: infoForm.transmission ?? null,
        engine: infoForm.engine ?? null,
        body_type: infoForm.body_type ?? null,
        mileage: infoForm.mileage ?? null,
        doors: infoForm.doors ?? null,
        seats: infoForm.seats ?? null,
        horsepower: infoForm.horsepower ?? null,
        torque: infoForm.torque ?? null,
        emission_class: infoForm.emission_class ?? null,
        tyre_sizes: infoForm.tyre_sizes ?? null,
        battery_size: infoForm.battery_size ?? null,
        wheel_sizes: infoForm.wheel_sizes ?? null,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setSaveError(d.detail ?? "Save failed.");
      return;
    }
    const updated = await res.json();
    setVehicle(updated);
    setEditingInfo(false);
  }

  // ---- Ownership patch ----
  const [ownershipForm, setOwnershipForm] = useState<Partial<Ownership>>({});
  function startEditOwnership() {
    setOwnershipForm({ ...ownership });
    setEditingOwnership(true);
    setSaveError(null);
  }
  async function saveOwnership() {
    if (!accountId || !vehicle) return;
    setSaving(true);
    setSaveError(null);
    const res = await apiFetch(`/api/v1/accounts/${accountId}/vehicles/${vehicle.id}/ownership`, {
      method: "PATCH",
      body: JSON.stringify(ownershipForm),
    });
    setSaving(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setSaveError(d.detail ?? "Save failed.");
      return;
    }
    const updated = await res.json();
    setOwnership(updated);
    setEditingOwnership(false);
  }

  // ---- Renewals put ----
  const [renewalForm, setRenewalForm] = useState<Partial<Renewal>>({});
  function startEditRenewals() {
    setRenewalForm({ ...renewal });
    setEditingRenewals(true);
    setSaveError(null);
  }
  async function saveRenewals() {
    if (!accountId || !vehicle) return;
    setSaving(true);
    setSaveError(null);
    const res = await apiFetch(`/api/v1/accounts/${accountId}/vehicles/${vehicle.id}/renewals`, {
      method: "PUT",
      body: JSON.stringify(renewalForm),
    });
    setSaving(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setSaveError(d.detail ?? "Save failed.");
      return;
    }
    const updated = await res.json();
    setRenewal(updated);
    setEditingRenewals(false);
  }

  // ---- Lifecycle ----
  async function applyLifecycle() {
    if (!accountId || !vehicle || lifecycleState === vehicle.lifecycle_state) return;
    setSettingLifecycle(true);
    const res = await apiFetch(`/api/v1/accounts/${accountId}/vehicles/${vehicle.id}/lifecycle`, {
      method: "POST",
      body: JSON.stringify({ state: lifecycleState }),
    });
    setSettingLifecycle(false);
    if (res.ok) {
      const updated = await res.json();
      setVehicle(updated);
    }
  }

  // ---- Delete ----
  async function handleDelete() {
    if (!accountId || !vehicle) return;
    if (!window.confirm(`Delete ${vehicle.registration ?? "this vehicle"} and all its data? This cannot be undone.`)) return;
    await apiFetch(`/api/v1/accounts/${accountId}/vehicles/${vehicle.id}`, { method: "DELETE" });
    router.push("/dashboard/vehicles");
  }

  const title = vehicle
    ? [vehicle.make, vehicle.model].filter(Boolean).join(" ") || "Vehicle"
    : "Vehicle";

  const imageUrl = vehicle?.image_key && R2_PUBLIC ? `${R2_PUBLIC}/${vehicle.image_key}` : null;

  if (loading) {
    return (
      <div className="vd-shell">
        <div className="vd-skeleton-head" />
        <div className="vd-skeleton-body" />
        <style>{`
          .vd-shell { display: flex; flex-direction: column; gap: var(--space-6); }
          .vd-skeleton-head { height: 60px; background: rgba(255,255,255,0.04); border-radius: var(--radius-lg); animation: shimmer 1.6s infinite; }
          .vd-skeleton-body { height: 320px; background: rgba(255,255,255,0.04); border-radius: var(--radius-lg); animation: shimmer 1.6s infinite; }
          @keyframes shimmer { 0% { opacity: 0.6; } 50% { opacity: 1; } 100% { opacity: 0.6; } }
        `}</style>
      </div>
    );
  }

  if (!vehicle) {
    return (
      <div className="vd-shell">
        <p style={{ color: "var(--colour-error)" }}>Vehicle not found.</p>
        <Link href="/dashboard/vehicles" className="vd-back">Back to vehicles</Link>
      </div>
    );
  }

  return (
    <div className="vd-shell">
      {/* ---------- Header ---------- */}
      <header className="vd-head">
        <div className="vd-head__left">
          <Link href="/dashboard/vehicles" className="vd-back">← Vehicles</Link>
          <h1 className="vd-title">{title}</h1>
          <div className="vd-head__meta">
            {vehicle.registration && (
              <span className="vd-plate">{vehicle.registration}</span>
            )}
            <Badge tone={LIFECYCLE_BADGE_TONE[vehicle.lifecycle_state]}>
              {LIFECYCLE_LABELS[vehicle.lifecycle_state]}
            </Badge>
          </div>
        </div>
        <div className="vd-head__media">
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt={title} className="vd-thumb" />
          ) : (
            <div className="vd-thumb vd-thumb--fallback">
              <BodyTypeIcon
                bodyType={vehicle.body_type as Parameters<typeof BodyTypeIcon>[0]["bodyType"]}
                size={56}
                className="vd-thumb__icon"
              />
            </div>
          )}
        </div>
      </header>

      {/* ---------- Tabs ---------- */}
      <nav className="vd-tabs" aria-label="Vehicle sections">
        {(["overview", "info", "ownership", "renewals"] as Tab[]).map((t) => (
          <button
            key={t}
            className={t === tab ? "vd-tab vd-tab--active" : "vd-tab"}
            onClick={() => { setTab(t); setEditingInfo(false); setEditingOwnership(false); setEditingRenewals(false); setSaveError(null); }}
          >
            {t === "overview" ? "Overview" : t === "info" ? "Details" : t === "ownership" ? "Ownership" : "Renewals"}
          </button>
        ))}
        <Link href={`/dashboard/vehicles/${vehicle.id}/documents`} className="vd-tab">
          Documents
        </Link>
        <Link href={`/dashboard/vehicles/${vehicle.id}/records`} className="vd-tab">
          Records
        </Link>
        <Link href={`/dashboard/vehicles/${vehicle.id}/fuel`} className="vd-tab">
          Fuel
        </Link>
        <Link href={`/dashboard/vehicles/${vehicle.id}/expenses`} className="vd-tab">
          Expenses
        </Link>
        <Link href={`/dashboard/vehicles/${vehicle.id}/pcns`} className="vd-tab">
          PCNs
        </Link>
        <Link href={`/dashboard/vehicles/${vehicle.id}/damage`} className="vd-tab">
          Damage
        </Link>
        <Link href={`/dashboard/vehicles/${vehicle.id}/warranty`} className="vd-tab">
          Warranty
        </Link>
        <Link href={`/dashboard/vehicles/${vehicle.id}/tasks`} className="vd-tab">
          Tasks
        </Link>
        <Link href={`/dashboard/vehicles/${vehicle.id}/reminders`} className="vd-tab">
          Reminders
        </Link>
        <Link href={`/dashboard/vehicles/${vehicle.id}/timeline`} className="vd-tab">
          Timeline
        </Link>
        <Link href={`/dashboard/vehicles/${vehicle.id}/audit`} className="vd-tab">
          Audit
        </Link>
      </nav>

      {/* ==================================================
          OVERVIEW TAB
      ================================================== */}
      {tab === "overview" && (
        <div className="vd-content">
          {/* Renewal RAG panel */}
          <Card>
            <h2 className="vd-card-title">Renewal status</h2>
            <div className="vd-rag-grid">
              {([
                { key: "mot_expiry", label: "MOT" },
                { key: "tax_due_date", label: "Tax" },
                { key: "insurance_expiry", label: "Insurance" },
                { key: "service_due_date", label: "Service" },
              ] as const).map(({ key, label }) => {
                const dateStr = renewal ? renewal[key] : null;
                const colour = ragColour(dateStr);
                const days = daysUntil(dateStr);
                return (
                  <div key={key} className="vd-rag-item">
                    <div className="vd-rag-dot" style={{ background: colour }} />
                    <div>
                      <p className="vd-rag-label">{label}</p>
                      <p className="vd-rag-date" style={{ color: colour }}>
                        {formatDate(dateStr)}
                      </p>
                      {days !== null && (
                        <p className="vd-rag-days" style={{ color: colour }}>
                          {days <= 0
                            ? `${Math.abs(days)} day${Math.abs(days) !== 1 ? "s" : ""} overdue`
                            : `${days} day${days !== 1 ? "s" : ""} remaining`}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Key facts */}
          <Card>
            <h2 className="vd-card-title">Key facts</h2>
            <dl className="vd-dl">
              <div><dt>Year</dt><dd>{vehicle.year ?? "—"}</dd></div>
              <div><dt>Fuel type</dt><dd>{vehicle.fuel_type ?? "—"}</dd></div>
              <div><dt>Transmission</dt><dd>{vehicle.transmission ?? "—"}</dd></div>
              <div><dt>Engine</dt><dd>{vehicle.engine ?? "—"}</dd></div>
              <div><dt>Colour</dt><dd>{vehicle.colour ?? "—"}</dd></div>
              <div><dt>Mileage</dt><dd>{vehicle.mileage !== null ? vehicle.mileage.toLocaleString("en-GB") + " mi" : "—"}</dd></div>
              <div><dt>VIN</dt><dd>{vehicle.vin ?? "—"}</dd></div>
            </dl>
          </Card>

          {/* Lifecycle */}
          <Card>
            <h2 className="vd-card-title">Lifecycle</h2>
            <div className="vd-lifecycle">
              <select
                className="vd-select"
                value={lifecycleState}
                onChange={(e) => setLifecycleState(e.target.value)}
              >
                <option value="active">Active</option>
                <option value="sold">Sold</option>
                <option value="scrapped">Scrapped</option>
                <option value="archived">Archived</option>
              </select>
              <button
                className="vd-btn vd-btn--primary"
                onClick={applyLifecycle}
                disabled={settingLifecycle || lifecycleState === vehicle.lifecycle_state}
              >
                {settingLifecycle ? "Saving…" : "Apply"}
              </button>
            </div>
            <p className="vd-lifecycle-hint">
              Setting to sold, scrapped or archived keeps all records and documents but removes
              this vehicle from the active view.
            </p>
          </Card>

          {/* Danger zone */}
          <Card>
            <h2 className="vd-card-title" style={{ color: "var(--colour-error)" }}>Danger zone</h2>
            <p className="vd-danger-copy">
              Deleting a vehicle removes all records, documents, expenses and timeline entries.
              Consider setting the lifecycle to sold or archived instead.
            </p>
            <button className="vd-btn vd-btn--danger" onClick={handleDelete}>
              Delete vehicle
            </button>
          </Card>
        </div>
      )}

      {/* ==================================================
          DETAILS TAB
      ================================================== */}
      {tab === "info" && (
        <Card>
          <div className="vd-section-head">
            <h2 className="vd-card-title">Basic information</h2>
            {!editingInfo && (
              <button className="vd-edit-btn" onClick={startEditInfo}>Edit</button>
            )}
          </div>

          {editingInfo ? (
            <div className="vd-form">
              {([
                ["registration", "Registration"],
                ["make", "Make"],
                ["model", "Model"],
                ["variant", "Variant"],
                ["year", "Year"],
                ["colour", "Colour"],
                ["fuel_type", "Fuel type"],
                ["transmission", "Transmission"],
                ["engine", "Engine"],
                ["mileage", "Mileage"],
                ["doors", "Doors"],
                ["seats", "Seats"],
                ["horsepower", "Horsepower (bhp)"],
                ["torque", "Torque (Nm)"],
                ["emission_class", "Emission class"],
                ["tyre_sizes", "Tyre sizes"],
                ["battery_size", "Battery size"],
                ["wheel_sizes", "Wheel sizes"],
                ["vin", "VIN"],
              ] as [keyof VehicleDetail, string][]).map(([field, label]) => (
                <label key={field} className="vd-label">
                  <span className="vd-label__text">{label}</span>
                  <input
                    className="vd-input"
                    value={(infoForm[field] as string | number | null) ?? ""}
                    onChange={(e) => setInfoForm((f) => ({ ...f, [field]: e.target.value || null }))}
                  />
                </label>
              ))}
              {saveError && <p className="vd-error">{saveError}</p>}
              <div className="vd-form-actions">
                <button className="vd-btn vd-btn--primary" onClick={saveInfo} disabled={saving}>
                  {saving ? "Saving…" : "Save"}
                </button>
                <button className="vd-btn vd-btn--ghost" onClick={() => setEditingInfo(false)}>Cancel</button>
              </div>
            </div>
          ) : (
            <dl className="vd-dl">
              <div><dt>Registration</dt><dd>{vehicle.registration ?? "—"}</dd></div>
              <div><dt>VIN</dt><dd>{vehicle.vin ?? "—"}</dd></div>
              <div><dt>Make</dt><dd>{vehicle.make ?? "—"}</dd></div>
              <div><dt>Model</dt><dd>{vehicle.model ?? "—"}</dd></div>
              <div><dt>Variant</dt><dd>{vehicle.variant ?? "—"}</dd></div>
              <div><dt>Year</dt><dd>{vehicle.year ?? "—"}</dd></div>
              <div><dt>Colour</dt><dd>{vehicle.colour ?? "—"}</dd></div>
              <div><dt>Body type</dt><dd>{vehicle.body_type ?? "—"}</dd></div>
              <div><dt>Fuel type</dt><dd>{vehicle.fuel_type ?? "—"}</dd></div>
              <div><dt>Transmission</dt><dd>{vehicle.transmission ?? "—"}</dd></div>
              <div><dt>Engine</dt><dd>{vehicle.engine ?? "—"}</dd></div>
              <div><dt>Mileage</dt><dd>{vehicle.mileage !== null ? vehicle.mileage.toLocaleString("en-GB") + " mi" : "—"}</dd></div>
              <div><dt>Doors</dt><dd>{vehicle.doors ?? "—"}</dd></div>
              <div><dt>Seats</dt><dd>{vehicle.seats ?? "—"}</dd></div>
              <div><dt>Horsepower</dt><dd>{vehicle.horsepower !== null ? vehicle.horsepower + " bhp" : "—"}</dd></div>
              <div><dt>Torque</dt><dd>{vehicle.torque !== null ? vehicle.torque + " Nm" : "—"}</dd></div>
              <div><dt>Emission class</dt><dd>{vehicle.emission_class ?? "—"}</dd></div>
              <div><dt>Tyre sizes</dt><dd>{vehicle.tyre_sizes ?? "—"}</dd></div>
              <div><dt>Battery size</dt><dd>{vehicle.battery_size ?? "—"}</dd></div>
              <div><dt>Wheel sizes</dt><dd>{vehicle.wheel_sizes ?? "—"}</dd></div>
            </dl>
          )}
        </Card>
      )}

      {/* ==================================================
          OWNERSHIP TAB
      ================================================== */}
      {tab === "ownership" && (
        <Card>
          <div className="vd-section-head">
            <h2 className="vd-card-title">Ownership</h2>
            {!editingOwnership && (
              <button className="vd-edit-btn" onClick={startEditOwnership}>Edit</button>
            )}
          </div>

          {editingOwnership ? (
            <div className="vd-form">
              {([
                ["current_owner", "Current owner"],
                ["registered_keeper", "Registered keeper"],
                ["purchase_date", "Purchase date"],
                ["purchase_price", "Purchase price (pence)"],
                ["seller", "Seller"],
                ["dealer", "Dealer"],
                ["finance_company", "Finance company"],
                ["finance_status", "Finance status"],
                ["notes", "Notes"],
              ] as [keyof Ownership, string][]).map(([field, label]) => (
                <label key={field} className="vd-label">
                  <span className="vd-label__text">{label}</span>
                  <input
                    className="vd-input"
                    value={(ownershipForm[field] as string | number | null) ?? ""}
                    onChange={(e) => setOwnershipForm((f) => ({ ...f, [field]: e.target.value || null }))}
                  />
                </label>
              ))}
              {saveError && <p className="vd-error">{saveError}</p>}
              <div className="vd-form-actions">
                <button className="vd-btn vd-btn--primary" onClick={saveOwnership} disabled={saving}>
                  {saving ? "Saving…" : "Save"}
                </button>
                <button className="vd-btn vd-btn--ghost" onClick={() => setEditingOwnership(false)}>Cancel</button>
              </div>
            </div>
          ) : (
            <dl className="vd-dl">
              <div><dt>Current owner</dt><dd>{ownership?.current_owner ?? "—"}</dd></div>
              <div><dt>Registered keeper</dt><dd>{ownership?.registered_keeper ?? "—"}</dd></div>
              <div><dt>Purchase date</dt><dd>{formatDate(ownership?.purchase_date ?? null)}</dd></div>
              <div><dt>Purchase price</dt><dd>{formatGBP(ownership?.purchase_price ?? null)}</dd></div>
              <div><dt>Seller</dt><dd>{ownership?.seller ?? "—"}</dd></div>
              <div><dt>Dealer</dt><dd>{ownership?.dealer ?? "—"}</dd></div>
              <div><dt>Finance company</dt><dd>{ownership?.finance_company ?? "—"}</dd></div>
              <div><dt>Finance status</dt><dd>{ownership?.finance_status ?? "—"}</dd></div>
              <div><dt>Notes</dt><dd>{ownership?.notes ?? "—"}</dd></div>
            </dl>
          )}
        </Card>
      )}

      {/* ==================================================
          RENEWALS TAB
      ================================================== */}
      {tab === "renewals" && (
        <Card>
          <div className="vd-section-head">
            <h2 className="vd-card-title">Renewal dates</h2>
            {!editingRenewals && (
              <button className="vd-edit-btn" onClick={startEditRenewals}>Edit</button>
            )}
          </div>

          {editingRenewals ? (
            <div className="vd-form">
              {([
                ["mot_expiry", "MOT expiry"],
                ["tax_due_date", "Tax due date"],
                ["insurance_expiry", "Insurance expiry"],
                ["service_due_date", "Service due date"],
              ] as [keyof Renewal, string][]).map(([field, label]) => (
                <label key={field} className="vd-label">
                  <span className="vd-label__text">{label}</span>
                  <input
                    className="vd-input"
                    type="date"
                    value={(renewalForm[field] as string | null) ?? ""}
                    onChange={(e) => setRenewalForm((f) => ({ ...f, [field]: e.target.value || null }))}
                  />
                </label>
              ))}
              <label className="vd-label">
                <span className="vd-label__text">Service due mileage</span>
                <input
                  className="vd-input"
                  type="number"
                  value={renewalForm.service_due_mileage ?? ""}
                  onChange={(e) => setRenewalForm((f) => ({ ...f, service_due_mileage: e.target.value ? parseInt(e.target.value, 10) : null }))}
                  placeholder="e.g. 50000"
                />
              </label>
              {saveError && <p className="vd-error">{saveError}</p>}
              <div className="vd-form-actions">
                <button className="vd-btn vd-btn--primary" onClick={saveRenewals} disabled={saving}>
                  {saving ? "Saving…" : "Save"}
                </button>
                <button className="vd-btn vd-btn--ghost" onClick={() => setEditingRenewals(false)}>Cancel</button>
              </div>
            </div>
          ) : (
            <dl className="vd-dl">
              <div><dt>MOT expiry</dt><dd style={{ color: ragColour(renewal?.mot_expiry ?? null) }}>{formatDate(renewal?.mot_expiry ?? null)}</dd></div>
              <div><dt>Tax due date</dt><dd style={{ color: ragColour(renewal?.tax_due_date ?? null) }}>{formatDate(renewal?.tax_due_date ?? null)}</dd></div>
              <div><dt>Insurance expiry</dt><dd style={{ color: ragColour(renewal?.insurance_expiry ?? null) }}>{formatDate(renewal?.insurance_expiry ?? null)}</dd></div>
              <div><dt>Service due date</dt><dd style={{ color: ragColour(renewal?.service_due_date ?? null) }}>{formatDate(renewal?.service_due_date ?? null)}</dd></div>
              <div><dt>Service due mileage</dt><dd>{renewal?.service_due_mileage !== null && renewal?.service_due_mileage !== undefined ? renewal.service_due_mileage.toLocaleString("en-GB") + " mi" : "—"}</dd></div>
            </dl>
          )}
        </Card>
      )}

      <style>{VD_STYLES}</style>
    </div>
  );
}

// ==================================================
// STYLES — mirror of SovCorE QR panel and form styles
// ==================================================

const VD_STYLES = `
  .vd-shell { display: flex; flex-direction: column; gap: var(--space-6); max-width: 900px; }

  /* ---- Header ---- */
  .vd-head { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--space-4); }
  .vd-head__left { display: flex; flex-direction: column; gap: var(--space-2); }
  .vd-back { font-size: var(--text-sm); color: var(--colour-text-muted); text-decoration: none; }
  .vd-back:hover { color: var(--colour-text); }
  .vd-title { font-size: var(--text-2xl); letter-spacing: var(--tracking-tight); margin: 0; }
  .vd-head__meta { display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap; }

  /* Registration plate badge */
  .vd-plate {
    display: inline-block;
    font-size: var(--text-sm);
    font-weight: var(--weight-semibold);
    letter-spacing: 0.1em;
    background: #f0c30f;
    color: #1a1a1a;
    padding: 2px 10px;
    border-radius: 4px;
    text-transform: uppercase;
  }

  .vd-head__media { flex-shrink: 0; }
  .vd-thumb {
    width: 80px;
    height: 56px;
    border-radius: var(--radius-md);
    object-fit: cover;
    border: 0.5px solid var(--colour-border);
  }
  .vd-thumb--fallback {
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(108,99,255,0.06);
  }
  .vd-thumb__icon { color: rgba(136,136,170,0.5); }

  /* ---- Tabs ---- */
  .vd-tabs {
    display: flex;
    gap: 2px;
    border-bottom: 1px solid var(--colour-border);
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }
  .vd-tab {
    padding: 9px 16px;
    font-size: var(--text-sm);
    color: var(--colour-text-muted);
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    cursor: none;
    white-space: nowrap;
    text-decoration: none;
    transition: color 0.2s, border-color 0.2s;
  }
  .vd-tab:hover { color: var(--colour-text); }
  .vd-tab--active { color: var(--colour-text); border-bottom-color: var(--colour-accent); }

  /* ---- Content ---- */
  .vd-content { display: flex; flex-direction: column; gap: var(--space-5); }

  .vd-card-title { font-size: var(--text-md); font-weight: var(--weight-medium); margin-bottom: var(--space-5); }

  /* ---- Renewal RAG grid ---- */
  .vd-rag-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--space-5); }
  .vd-rag-item { display: flex; align-items: flex-start; gap: var(--space-3); }
  .vd-rag-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; margin-top: 5px; }
  .vd-rag-label { font-size: var(--text-xs); color: var(--colour-text-muted); text-transform: uppercase; letter-spacing: 0.06em; margin: 0 0 2px; }
  .vd-rag-date { font-size: var(--text-sm); font-weight: var(--weight-medium); margin: 0 0 2px; }
  .vd-rag-days { font-size: var(--text-xs); margin: 0; }

  /* ---- Key facts dl ---- */
  .vd-dl { display: flex; flex-direction: column; gap: var(--space-3); }
  .vd-dl > div { display: grid; grid-template-columns: 200px 1fr; gap: var(--space-4); align-items: baseline; }
  .vd-dl dt { font-size: var(--text-sm); color: var(--colour-text-muted); margin: 0; }
  .vd-dl dd { font-size: var(--text-sm); color: var(--colour-text); margin: 0; }

  /* ---- Lifecycle ---- */
  .vd-lifecycle { display: flex; align-items: center; gap: var(--space-3); margin-bottom: var(--space-3); }
  .vd-select { background: var(--colour-bg); border: 1px solid var(--colour-border); border-radius: var(--radius-sm); padding: 8px 12px; font-size: var(--text-sm); color: var(--colour-text); outline: none; cursor: none; }
  .vd-lifecycle-hint { font-size: var(--text-xs); color: var(--colour-text-muted); max-width: 440px; line-height: var(--leading-normal); }
  .vd-danger-copy { font-size: var(--text-sm); color: var(--colour-text-muted); max-width: 480px; line-height: var(--leading-normal); margin-bottom: var(--space-4); }

  /* ---- Section head ---- */
  .vd-section-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-5); }
  .vd-edit-btn { background: none; border: 1px solid var(--colour-border); border-radius: var(--radius-sm); padding: 4px 14px; font-size: var(--text-sm); color: var(--colour-text-muted); cursor: none; transition: border-color 0.2s, color 0.2s; }
  .vd-edit-btn:hover { border-color: var(--colour-accent); color: var(--colour-text); }

  /* ---- Form ---- */
  .vd-form { display: flex; flex-direction: column; gap: var(--space-4); }
  .vd-label { display: flex; flex-direction: column; gap: 6px; max-width: 480px; }
  .vd-label__text { font-size: var(--text-sm); color: var(--colour-text-muted); }
  .vd-input { background: var(--colour-bg); border: 1px solid var(--colour-border); border-radius: var(--radius-sm); padding: 8px 12px; font-size: var(--text-sm); color: var(--colour-text); outline: none; transition: border-color 0.2s; }
  .vd-input:focus { border-color: var(--colour-accent); }
  .vd-error { font-size: var(--text-sm); color: var(--colour-error); }
  .vd-form-actions { display: flex; gap: var(--space-3); }

  /* ---- Buttons ---- */
  .vd-btn { padding: 8px 18px; border-radius: var(--radius-sm); font-size: var(--text-sm); cursor: none; border: none; transition: opacity 0.2s, background 0.2s, color 0.2s; }
  .vd-btn--primary { background: var(--colour-accent); color: #fff; }
  .vd-btn--primary:disabled { opacity: 0.55; }
  .vd-btn--ghost { background: none; border: 1px solid var(--colour-border); color: var(--colour-text-muted); }
  .vd-btn--ghost:hover { color: var(--colour-text); }
  .vd-btn--danger { background: none; border: 1px solid var(--colour-error); color: var(--colour-error); }
  .vd-btn--danger:hover { background: rgba(239,68,68,0.1); }

  /* ---- Responsive ---- */
  @media (max-width: 767px) {
    .vd-rag-grid { grid-template-columns: 1fr; }
    .vd-dl > div { grid-template-columns: 1fr; gap: 3px; }
    .vd-head { flex-direction: column-reverse; }
  }
`;
