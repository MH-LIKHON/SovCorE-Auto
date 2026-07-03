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

import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { Card } from "@/src/components/ui/card";
import { ConfirmDeleteModal } from "@/src/components/ui/confirm-delete-modal";
import { TextField, WholeNumberField } from "@/src/components/ui/input";
import { BodyTypeIcon } from "@/src/components/vehicles/body-type-icon";
import { apiFetch, apiUpload, getAccountId } from "@/src/lib/api/fetch";
import { toAllCaps, toSentenceCase, toTitleCase } from "@/src/lib/text";
import { daysUntil, formatDate, formatGBP } from "@/src/lib/format";

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
  cover_url: string | null;
  lifecycle_state: "active" | "sold" | "scrapped" | "archived";
  created_at: string;
  updated_at: string;
  // ~~~~~~~~~ V5C fields ~~~~~~~~~
  v5c_reference_number: string | null;
  type_designation: string | null;
  version: string | null;
  date_first_registered: string | null;
  date_first_registered_uk: string | null;
  wheelplan: string | null;
  suspension_type: string | null;
  engine_number: string | null;
  standing_places: number | null;
  is_automated_vehicle: boolean | null;
  max_net_power_kw: number | null;
  power_to_weight_ratio: number | null;
  taxation_class: string | null;
  vehicle_category: string | null;
  type_approval_number: string | null;
  euro_status: string | null;
  real_driving_emissions: string | null;
  co2_emissions: number | null;
  exhaust_co: number | null;
  exhaust_hc: number | null;
  exhaust_nox: number | null;
  exhaust_hc_nox: number | null;
  exhaust_particulates: number | null;
  kerb_weight: number | null;
  max_permissible_mass: number | null;
  revenue_weight: number | null;
  max_towable_mass_braked: number | null;
  max_towable_mass_unbraked: number | null;
  sound_level_stationary: number | null;
  sound_level_engine_speed: number | null;
  sound_level_drive_by: number | null;
  number_of_previous_keepers: number | null;
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

type Tab = "overview" | "info" | "ownership";

// ==================================================
// STATUS TYPES
// ==================================================

interface ReminderSummary {
  id: string;
  type: string;
  label: string | null;
  due_date: string;
  active: boolean;
}

interface AlertCondition {
  type: "date" | "recurring" | "mileage" | "mileage_recurring";
  on?: string;
  next_due?: string;
  at?: number;
  fired?: boolean;
  next_due_mileage?: number;
}

interface AlertSummary {
  id: string;
  name: string;
  conditions: AlertCondition[];
  active: boolean;
  is_system_default: boolean;
}

// A normalised status row for the Summary panel
interface StatusRow {
  id: string;
  label: string;
  kind: "date" | "mileage";
  source: "reminder" | "alert";
  date?: string;          // ISO date string for date-kind rows
  mileage?: number;       // absolute mileage for mileage-kind rows
  overdue: boolean;
  urgency: number;        // 0 = overdue/red, 1 = amber, 2 = green — for sort
}

// ==================================================
// HELPERS
// ==================================================

function formatDateLong(d: string | null): string {
  if (!d) return "Not set";
  return new Date(d).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function ragFromDays(days: number): { colour: string; urgency: number } {
  if (days <= 0)  return { colour: "var(--colour-error)",  urgency: 0 };
  if (days <= 30) return { colour: "var(--colour-error)",  urgency: 0 };
  if (days <= 90) return { colour: "var(--colour-amber)",  urgency: 1 };
  return           { colour: "var(--colour-teal)",   urgency: 2 };
}

function ragFromMiles(remaining: number): { colour: string; urgency: number } {
  if (remaining <= 0)    return { colour: "var(--colour-error)",  urgency: 0 };
  if (remaining <= 500)  return { colour: "var(--colour-error)",  urgency: 0 };
  if (remaining <= 2000) return { colour: "var(--colour-amber)",  urgency: 1 };
  return                  { colour: "var(--colour-teal)",   urgency: 2 };
}

const REMINDER_TYPE_LABEL: Record<string, string> = {
  mot: "MOT", tax: "Tax", insurance: "Insurance", service: "Service",
  tyres: "Tyres", brake_fluid: "Brake fluid", battery: "Battery",
  warranty: "Warranty", finance: "Finance", breakdown_cover: "Breakdown cover",
};

function buildStatusRows(
  reminders: ReminderSummary[],
  alerts: AlertSummary[],
  currentMileage: number | null,
): StatusRow[] {
  const rows: StatusRow[] = [];

  for (const r of reminders) {
    if (!r.active) continue;
    const days = daysUntil(r.due_date) ?? 0;
    const { urgency } = ragFromDays(days);
    rows.push({
      id: `rem-${r.id}`,
      label: r.type === "custom" && r.label ? r.label : (REMINDER_TYPE_LABEL[r.type] ?? r.type),
      kind: "date",
      source: "reminder",
      date: r.due_date,
      overdue: days <= 0,
      urgency,
    });
  }

  for (const a of alerts) {
    if (!a.active || a.is_system_default) continue;
    for (const c of a.conditions) {
      if (c.type === "date" && c.on) {
        const days = daysUntil(c.on) ?? 0;
        const { urgency } = ragFromDays(days);
        rows.push({ id: `alt-${a.id}-date`, label: a.name, kind: "date", source: "alert", date: c.on, overdue: days <= 0, urgency });
      } else if (c.type === "recurring" && c.next_due) {
        const days = daysUntil(c.next_due) ?? 0;
        const { urgency } = ragFromDays(days);
        rows.push({ id: `alt-${a.id}-rec`, label: a.name, kind: "date", source: "alert", date: c.next_due, overdue: days <= 0, urgency });
      } else if (c.type === "mileage" && c.at != null && !c.fired) {
        const remaining = currentMileage != null ? c.at - currentMileage : c.at;
        const { urgency } = ragFromMiles(remaining);
        rows.push({ id: `alt-${a.id}-mi`, label: a.name, kind: "mileage", source: "alert", mileage: c.at, overdue: remaining <= 0, urgency });
      } else if (c.type === "mileage_recurring" && c.next_due_mileage != null) {
        const remaining = currentMileage != null ? c.next_due_mileage - currentMileage : c.next_due_mileage;
        const { urgency } = ragFromMiles(remaining);
        rows.push({ id: `alt-${a.id}-mirec`, label: a.name, kind: "mileage", source: "alert", mileage: c.next_due_mileage, overdue: remaining <= 0, urgency });
      }
    }
  }

  // Sort: overdue first, then by urgency asc, then by date/mileage
  rows.sort((a, b) => {
    if (a.urgency !== b.urgency) return a.urgency - b.urgency;
    if (a.kind === "date" && b.kind === "date") return new Date(a.date!).getTime() - new Date(b.date!).getTime();
    return 0;
  });

  return rows;
}

// ==================================================
// VEHICLE DETAILS FIELD CONFIG
// ==================================================
// Drives both the read-only accordion and the edit-mode form on the Details
// tab. Categories mirror the UK V5C (Registration Certificate) grouping so
// the 42-field panel stays navigable instead of one long list.

type FieldKind = "text" | "allcaps" | "number" | "float" | "bool" | "date";

interface FieldDef {
  key: keyof VehicleDetail;
  label: string;
  kind: FieldKind;
  unit?: string;
  // false for fields shown in the read-only view but without an edit control
  // (e.g. body_type, which needs a select rather than free text).
  editable?: boolean;
}

interface DetailCategory {
  title: string;
  fields: FieldDef[];
}

const DETAIL_CATEGORIES: DetailCategory[] = [
  {
    title: "Identity & Registration",
    fields: [
      { key: "registration", label: "Registration", kind: "allcaps" },
      { key: "vin", label: "VIN / Chassis number", kind: "allcaps" },
      { key: "v5c_reference_number", label: "V5C document reference number", kind: "allcaps" },
      { key: "make", label: "Make", kind: "text" },
      { key: "model", label: "Model", kind: "text" },
      { key: "variant", label: "Variant", kind: "text" },
      { key: "type_designation", label: "Type", kind: "text" },
      { key: "version", label: "Version", kind: "text" },
      { key: "date_first_registered", label: "Date of first registration", kind: "date" },
      { key: "date_first_registered_uk", label: "Date of first registration in the UK", kind: "date" },
      { key: "year", label: "Year of manufacture", kind: "number" },
    ],
  },
  {
    title: "Specification",
    fields: [
      { key: "colour", label: "Colour", kind: "text" },
      { key: "body_type", label: "Body type", kind: "text", editable: false },
      { key: "wheelplan", label: "Wheelplan", kind: "text" },
      { key: "suspension_type", label: "Suspension type", kind: "text" },
      { key: "fuel_type", label: "Fuel type", kind: "text" },
      { key: "transmission", label: "Transmission", kind: "text" },
      { key: "engine", label: "Engine capacity", kind: "text" },
      { key: "engine_number", label: "Engine number", kind: "allcaps" },
      { key: "doors", label: "Doors", kind: "number" },
      { key: "seats", label: "Seats", kind: "number" },
      { key: "standing_places", label: "Number of standing places", kind: "number" },
      { key: "is_automated_vehicle", label: "Automated vehicle (AV)", kind: "bool" },
    ],
  },
  {
    title: "Performance",
    fields: [
      { key: "horsepower", label: "Horsepower", kind: "number", unit: "bhp" },
      { key: "max_net_power_kw", label: "Max net power", kind: "number", unit: "kW" },
      { key: "torque", label: "Torque", kind: "number", unit: "Nm" },
      { key: "power_to_weight_ratio", label: "Power/weight ratio (motorcycles only)", kind: "float", unit: "kW/kg" },
    ],
  },
  {
    title: "Emissions & Tax",
    fields: [
      { key: "taxation_class", label: "Taxation class", kind: "text" },
      { key: "vehicle_category", label: "Vehicle category", kind: "allcaps" },
      { key: "type_approval_number", label: "Type approval number", kind: "allcaps" },
      { key: "emission_class", label: "Emission class", kind: "text" },
      { key: "euro_status", label: "Euro status", kind: "text" },
      { key: "real_driving_emissions", label: "Real driving emissions", kind: "text" },
      { key: "co2_emissions", label: "CO2 emissions", kind: "number", unit: "g/km" },
      { key: "exhaust_co", label: "Exhaust CO", kind: "float", unit: "g/km or g/kWh" },
      { key: "exhaust_hc", label: "Exhaust HC", kind: "float", unit: "g/km or g/kWh" },
      { key: "exhaust_nox", label: "Exhaust NOx", kind: "float", unit: "g/km or g/kWh" },
      { key: "exhaust_hc_nox", label: "Exhaust HC+NOx", kind: "float", unit: "g/km" },
      { key: "exhaust_particulates", label: "Exhaust particulates", kind: "float", unit: "g/km or g/kWh" },
    ],
  },
  {
    title: "Weights & Towing",
    fields: [
      { key: "kerb_weight", label: "Mass in service (kerb weight)", kind: "number", unit: "kg" },
      { key: "max_permissible_mass", label: "Max permissible mass, excl. motorcycle", kind: "number", unit: "kg" },
      { key: "revenue_weight", label: "Revenue weight", kind: "number", unit: "kg" },
      { key: "max_towable_mass_braked", label: "Max towable trailer mass, braked", kind: "number", unit: "kg" },
      { key: "max_towable_mass_unbraked", label: "Max towable trailer mass, unbraked", kind: "number", unit: "kg" },
    ],
  },
  {
    title: "Wheels & Tyres",
    fields: [
      { key: "tyre_sizes", label: "Tyre sizes", kind: "text" },
      { key: "wheel_sizes", label: "Wheel sizes", kind: "text" },
      { key: "battery_size", label: "Battery size", kind: "text" },
    ],
  },
  {
    title: "Sound Level",
    fields: [
      { key: "sound_level_stationary", label: "Stationary", kind: "number", unit: "dB(A)" },
      { key: "sound_level_engine_speed", label: "Engine speed", kind: "number", unit: "min⁻¹" },
      { key: "sound_level_drive_by", label: "Drive-by", kind: "number", unit: "dB(A)" },
    ],
  },
  {
    title: "Usage",
    fields: [
      { key: "mileage", label: "Mileage", kind: "number", unit: "mi" },
      { key: "number_of_previous_keepers", label: "Number of previous keepers", kind: "number" },
    ],
  },
];

const ALL_DETAIL_FIELD_KEYS = DETAIL_CATEGORIES.flatMap((c) => c.fields.map((f) => f.key));

function formatFieldValue(field: FieldDef, value: unknown): string {
  if (value === null || value === undefined || value === "") return "-";
  switch (field.kind) {
    case "bool":
      return value ? "Yes" : "No";
    case "date":
      return formatDateLong(value as string);
    case "number":
      return field.unit ? `${(value as number).toLocaleString("en-GB")} ${field.unit}` : (value as number).toLocaleString("en-GB");
    case "float":
      return field.unit ? `${value} ${field.unit}` : String(value);
    default:
      return String(value);
  }
}

// ------------------------------ Accordion section ---------------------------
// Independent open/closed state per section — not exclusive, so more than one
// category can be expanded at once. defaultOpen controls the initial state
// (only the first category opens by default).

function AccordionSection({
  title,
  defaultOpen,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <div className="vd-accordion">
      <button
        type="button"
        className="vd-accordion__head"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span>{title}</span>
        <span className={open ? "vd-accordion__chevron vd-accordion__chevron--open" : "vd-accordion__chevron"}>
          ▾
        </span>
      </button>
      {open && <div className="vd-accordion__body">{children}</div>}
    </div>
  );
}

// ==================================================
// PAGE
// ==================================================

export default function VehicleProfilePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const accountId = getAccountId() ?? "";

  const [tab, setTab] = useState<Tab>("overview");
  const [vehicle, setVehicle] = useState<VehicleDetail | null>(null);
  const [ownership, setOwnership] = useState<Ownership | null>(null);
  const [reminders, setReminders] = useState<ReminderSummary[]>([]);
  const [alerts, setAlerts] = useState<AlertSummary[]>([]);
  const [loading, setLoading] = useState(true);

  // Edit mode for basic info and ownership
  const [editingInfo, setEditingInfo] = useState(false);
  const [editingOwnership, setEditingOwnership] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Cover photo upload
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

  // Lifecycle change
  const [lifecycleState, setLifecycleState] = useState<string>("");
  const [settingLifecycle, setSettingLifecycle] = useState(false);

  // Delete vehicle
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [vehicleDeleting, setVehicleDeleting] = useState(false);

  async function load() {
    if (!accountId || !id) return;
    setLoading(true);
    const [vRes, oRes, remRes, altRes] = await Promise.all([
      apiFetch(`/api/v1/accounts/${accountId}/vehicles/${id}`),
      apiFetch(`/api/v1/accounts/${accountId}/vehicles/${id}/ownership`),
      apiFetch(`/api/v1/accounts/${accountId}/vehicles/${id}/reminders?page=1&page_size=100`),
      apiFetch(`/api/v1/accounts/${accountId}/vehicles/${id}/alerts?page=1&page_size=100`),
    ]);
    const v = vRes.ok ? await vRes.json() : null;
    const o = oRes.ok ? await oRes.json() : null;
    const rem = remRes.ok ? await remRes.json() : null;
    const alt = altRes.ok ? await altRes.json() : null;
    setVehicle(v);
    setOwnership(o);
    if (rem) setReminders(rem.items ?? []);
    if (alt) setAlerts(alt.items ?? []);
    if (v) setLifecycleState(v.lifecycle_state);
    setLoading(false);
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ------------------------------ Info patch ---------------------------------
  const [infoForm, setInfoForm] = useState<Partial<VehicleDetail>>({});
  const [infoMileageError, setInfoMileageError] = useState<string | null>(null);

  function startEditInfo() {
    setInfoForm({ ...vehicle });
    setEditingInfo(true);
    setSaveError(null);
    setInfoMileageError(null);
  }

  function handleInfoMileageBlur() {
    if (infoForm.mileage == null || vehicle?.mileage == null) { setInfoMileageError(null); return; }
    if (infoForm.mileage < vehicle.mileage) {
      setInfoMileageError(`Current odometer is ${vehicle.mileage.toLocaleString()} mi. Please enter ${vehicle.mileage.toLocaleString()} or higher.`);
    } else {
      setInfoMileageError(null);
    }
  }

  function setInfoField(key: keyof VehicleDetail, value: unknown) {
    setInfoForm((form) => ({ ...form, [key]: value } as Partial<VehicleDetail>));
  }

  // Renders the edit control for a single field, keyed by kind. Falls back
  // to the odometer's dedicated validation UI for the mileage field so the
  // "no reading below current" check keeps working inside the accordion.
  function renderEditField(f: FieldDef) {
    if (f.editable === false) return null;
    if (f.key === "mileage") {
      return (
        <WholeNumberField
          key={f.key}
          label="Odometer"
          placeholder="e.g. 52000"
          value={infoForm.mileage ?? ""}
          onChange={(v) => { setInfoField("mileage", v ? parseInt(v, 10) : null); setInfoMileageError(null); }}
          onBlur={handleInfoMileageBlur}
          error={infoMileageError ?? undefined}
          disabled={saving}
          maxLength={7}
        />
      );
    }
    const label = f.unit ? `${f.label} (${f.unit})` : f.label;
    if (f.kind === "number") {
      return (
        <WholeNumberField
          key={f.key}
          label={label}
          value={(infoForm[f.key] as number | null) ?? ""}
          onChange={(v) => setInfoField(f.key, v ? parseInt(v, 10) : null)}
          disabled={saving}
        />
      );
    }
    if (f.kind === "float") {
      return (
        <TextField
          key={f.key}
          label={label}
          inputMode="decimal"
          value={(infoForm[f.key] as number | null) ?? ""}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === "") { setInfoField(f.key, null); return; }
            const parsed = parseFloat(raw);
            if (!Number.isNaN(parsed)) setInfoField(f.key, parsed);
          }}
          disabled={saving}
        />
      );
    }
    if (f.kind === "bool") {
      const value = infoForm[f.key] as boolean | null | undefined;
      return (
        <div className="sov-field" key={f.key}>
          <label className="sov-field__label">{f.label}</label>
          <div className="sov-input-wrap">
            <select
              className="sov-field__control"
              value={value === true ? "yes" : value === false ? "no" : ""}
              onChange={(e) => setInfoField(f.key, e.target.value === "yes" ? true : e.target.value === "no" ? false : null)}
              disabled={saving}
            >
              <option value="">Unknown</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </div>
        </div>
      );
    }
    if (f.kind === "date") {
      return (
        <TextField
          key={f.key}
          label={f.label}
          type="date"
          value={(infoForm[f.key] as string | null) ?? ""}
          onChange={(e) => setInfoField(f.key, e.target.value || null)}
          disabled={saving}
        />
      );
    }
    // "text" and "allcaps"
    return (
      <TextField
        key={f.key}
        label={f.label}
        value={(infoForm[f.key] as string | null) ?? ""}
        onChange={(e) => setInfoField(f.key, (f.kind === "allcaps" ? toAllCaps(e.target.value) : toTitleCase(e.target.value)) || null)}
        disabled={saving}
      />
    );
  }

  async function saveInfo() {
    if (!accountId || !vehicle) return;
    if (infoMileageError) { setSaveError("Please correct the odometer reading before saving."); return; }
    setSaving(true);
    setSaveError(null);
    const body: Record<string, unknown> = {};
    for (const key of ALL_DETAIL_FIELD_KEYS) {
      body[key] = (infoForm as Record<string, unknown>)[key] ?? null;
    }
    const res = await apiFetch(`/api/v1/accounts/${accountId}/vehicles/${vehicle.id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
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
    setInfoMileageError(null);
  }

  // ------------------------------ Ownership patch -----------------------------
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

  // ------------------------------ Lifecycle -----------------------------------
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

  // ------------------------------ Delete -------------------------------------
  function handleDelete() {
    if (!accountId || !vehicle) return;
    setDeleteOpen(true);
  }

  async function confirmDelete() {
    if (!accountId || !vehicle) return;
    setVehicleDeleting(true);
    await apiFetch(`/api/v1/accounts/${accountId}/vehicles/${vehicle.id}`, { method: "DELETE" });
    setVehicleDeleting(false);
    router.push("/dashboard/vehicles");
  }

  // ------------------------------ Cover photo upload -------------------------
  async function handlePhotoUpload(file: File) {
    if (!accountId || !vehicle) return;
    setPhotoUploading(true);
    setPhotoError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await apiUpload(
        `/api/v1/accounts/${accountId}/vehicles/${vehicle.id}/photo/upload`,
        form,
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setPhotoError(data.detail ?? "Upload failed. Please try again.");
        return;
      }
      const updated = await res.json();
      setVehicle(updated);
    } catch {
      setPhotoError("An unexpected error occurred.");
    } finally {
      setPhotoUploading(false);
    }
  }

  const title = vehicle
    ? [vehicle.make, vehicle.model].filter(Boolean).join(" ") || "Vehicle"
    : "Vehicle";

  const imageUrl = vehicle?.cover_url ?? null;

  if (loading) {
    return (
      <div className="vd-shell">
        <div className="vd-skeleton-body" />
        <style>{`
          .vd-shell { display: flex; flex-direction: column; gap: var(--space-6); }
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
      </div>
    );
  }

  return (
    <div className="vd-shell">
      {/* ~~~~~~~~~ Secondary sub-tabs (Summary / Details / Ownership) ~~~~~~~~~ */}
      <nav className="vd-tabs" aria-label="Vehicle overview sections">
        {(["overview", "info", "ownership"] as Tab[]).map((t) => (
          <button
            key={t}
            className={t === tab ? "vd-tab vd-tab--active" : "vd-tab"}
            onClick={() => { setTab(t); setEditingInfo(false); setEditingOwnership(false); setSaveError(null); setInfoMileageError(null); }}
          >
            {t === "overview" ? "Summary" : t === "info" ? "Details" : "Ownership"}
          </button>
        ))}
      </nav>

      {/* ==================================================
          OVERVIEW TAB
      ================================================== */}
      {tab === "overview" && (
        <div className="vd-content">
          {/* Vehicle photo */}
          <div className="vd-photo-row">
            <div className="vd-photo-wrap">
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
              <button
                className="vd-photo-btn"
                onClick={() => photoInputRef.current?.click()}
                disabled={photoUploading}
                title="Change cover photo"
              >
                {photoUploading ? "…" : imageUrl ? "Change" : "Add photo"}
              </button>
              <input
                ref={photoInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handlePhotoUpload(f);
                  e.target.value = "";
                }}
              />
            </div>
            {photoError && <p className="vd-photo-error">{photoError}</p>}
          </div>

          {/* Status panel — live from Reminders + Alerts */}
          {(() => {
            const rows = buildStatusRows(reminders, alerts, vehicle.mileage);
            if (rows.length === 0) return null;

            const overdue  = rows.filter((r) => r.overdue);
            const dueSoon  = rows.filter((r) => !r.overdue && r.urgency === 0);
            const upcoming = rows.filter((r) => !r.overdue && r.urgency === 1);
            const future   = rows.filter((r) => !r.overdue && r.urgency === 2);

            function StatusCard({ row }: { row: StatusRow }) {
              const rag = row.kind === "date"
                ? ragFromDays(daysUntil(row.date!) ?? 0)
                : ragFromMiles(vehicle!.mileage != null && row.mileage != null ? row.mileage - vehicle!.mileage : row.mileage ?? 0);

              const badge = row.kind === "date"
                ? (() => {
                    const d = daysUntil(row.date!) ?? 0;
                    return d <= 0 ? `${Math.abs(d)}d overdue` : `${d} day${d !== 1 ? "s" : ""}`;
                  })()
                : (() => {
                    const rem = vehicle!.mileage != null && row.mileage != null ? row.mileage - vehicle!.mileage : null;
                    return rem != null ? (rem <= 0 ? "Overdue" : `${rem.toLocaleString("en-GB")} mi`) : "Due";
                  })();

              const sub = row.kind === "date"
                ? formatDate(row.date!)
                : `at ${row.mileage!.toLocaleString("en-GB")} mi`;

              const href = `/dashboard/vehicles/${id}/${row.source === "reminder" ? "reminders" : "alerts"}`;

              return (
                <Card
                  clickable
                  hoverEffect="glow"
                  padding="12px 14px"
                  onClick={() => router.push(href)}
                  style={{ borderTop: `2px solid ${rag.colour}`, borderRadius: 12 }}
                >
                  <span className="vd-sc__name">{row.label}</span>
                  <span className="vd-sc__badge" style={{ color: rag.colour, borderColor: `${rag.colour}44`, background: `${rag.colour}11` }}>{badge}</span>
                  <span className="vd-sc__sub">{sub}</span>
                </Card>
              );
            }

            function Group({ title, colour, rows: gr }: { title: string; colour: string; rows: StatusRow[] }) {
              if (gr.length === 0) return null;
              return (
                <div className="vd-sg">
                  <div className="vd-sg__head">
                    <span className="vd-sg__dot" style={{ background: colour }} />
                    <span className="vd-sg__title" style={{ color: colour }}>{title}</span>
                    <span className="vd-sg__count">{gr.length}</span>
                  </div>
                  <div className="vd-sg__grid">
                    {gr.map((r) => <StatusCard key={r.id} row={r} />)}
                  </div>
                </div>
              );
            }

            return (
              <Card>
                <h2 className="vd-card-title">Status</h2>
                <div className="vd-status-groups">
                  <Group title="Overdue"   colour="var(--colour-error)" rows={overdue} />
                  <Group title="Due soon"  colour="var(--colour-error)" rows={dueSoon} />
                  <Group title="Upcoming"  colour="var(--colour-amber)" rows={upcoming} />
                  <Group title="All clear" colour="var(--colour-teal)"  rows={future} />
                </div>
              </Card>
            );
          })()}

          {/* Key facts */}
          <Card>
            <h2 className="vd-card-title">Key facts</h2>
            <dl className="vd-dl">
              <div><dt>Year</dt><dd>{vehicle.year ?? "-"}</dd></div>
              <div><dt>Fuel type</dt><dd>{vehicle.fuel_type ?? "-"}</dd></div>
              <div><dt>Transmission</dt><dd>{vehicle.transmission ?? "-"}</dd></div>
              <div><dt>Engine</dt><dd>{vehicle.engine ?? "-"}</dd></div>
              <div><dt>Colour</dt><dd>{vehicle.colour ?? "-"}</dd></div>
              <div><dt>Mileage</dt><dd>{vehicle.mileage !== null ? vehicle.mileage.toLocaleString("en-GB") + " mi" : "-"}</dd></div>
              <div><dt>VIN</dt><dd>{vehicle.vin ?? "-"}</dd></div>
            </dl>
          </Card>

          {/* Lifecycle */}
          <Card>
            <h2 className="vd-card-title">Lifecycle</h2>
            <div className="vd-lifecycle">
              <div className="sov-input-wrap vd-lifecycle-select-wrap">
                <select
                  id="vd-lifecycle"
                  className="sov-field__control"
                  value={lifecycleState}
                  onChange={(e) => setLifecycleState(e.target.value)}
                >
                  <option value="active">Active</option>
                  <option value="sold">Sold</option>
                  <option value="scrapped">Scrapped</option>
                  <option value="archived">Archived</option>
                </select>
              </div>
              <button
                className="rec-btn rec-btn--primary"
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
            <button className="rec-btn rec-btn--danger" onClick={handleDelete} style={{ borderColor: "var(--colour-error)", color: "var(--colour-error)" }}>
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
            <h2 className="vd-card-title">Vehicle details</h2>
            {!editingInfo && (
              <button className="vd-edit-btn" onClick={startEditInfo}>Edit</button>
            )}
          </div>

          {editingInfo ? (
            <div className="vd-accordions" key="edit">
              {DETAIL_CATEGORIES.map((cat, i) => (
                <AccordionSection key={cat.title} title={cat.title} defaultOpen={i === 0}>
                  <div className="vd-form">
                    {cat.fields.map((f) => renderEditField(f))}
                  </div>
                </AccordionSection>
              ))}
              {saveError && <p className="vd-error">{saveError}</p>}
              <div className="vd-form-actions">
                <button className="rec-btn rec-btn--primary" onClick={saveInfo} disabled={saving}>
                  {saving ? "Saving…" : "Save"}
                </button>
                <button className="rec-btn rec-btn--danger" onClick={() => { setEditingInfo(false); setInfoMileageError(null); }}>Cancel</button>
              </div>
            </div>
          ) : (
            <div className="vd-accordions" key="view">
              {DETAIL_CATEGORIES.map((cat, i) => (
                <AccordionSection key={cat.title} title={cat.title} defaultOpen={i === 0}>
                  <dl className="vd-dl">
                    {cat.fields.map((f) => (
                      <div key={f.key}><dt>{f.label}</dt><dd>{formatFieldValue(f, vehicle[f.key])}</dd></div>
                    ))}
                  </dl>
                </AccordionSection>
              ))}
            </div>
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
                <TextField
                  key={field}
                  label={label}
                  value={(ownershipForm[field] as string | number | null) ?? ""}
                  onChange={(e) => setOwnershipForm((f) => ({ ...f, [field]: field === "notes" ? toSentenceCase(e.target.value) || null : toTitleCase(e.target.value) || null }))}
                  disabled={saving}
                />
              ))}
              {saveError && <p className="vd-error">{saveError}</p>}
              <div className="vd-form-actions">
                <button className="rec-btn rec-btn--primary" onClick={saveOwnership} disabled={saving}>
                  {saving ? "Saving…" : "Save"}
                </button>
                <button className="rec-btn rec-btn--danger" onClick={() => setEditingOwnership(false)}>Cancel</button>
              </div>
            </div>
          ) : (
            <dl className="vd-dl">
              <div><dt>Current owner</dt><dd>{ownership?.current_owner ?? "-"}</dd></div>
              <div><dt>Registered keeper</dt><dd>{ownership?.registered_keeper ?? "-"}</dd></div>
              <div><dt>Purchase date</dt><dd>{formatDateLong(ownership?.purchase_date ?? null)}</dd></div>
              <div><dt>Purchase price</dt><dd>{formatGBP(ownership?.purchase_price ?? null)}</dd></div>
              <div><dt>Seller</dt><dd>{ownership?.seller ?? "-"}</dd></div>
              <div><dt>Dealer</dt><dd>{ownership?.dealer ?? "-"}</dd></div>
              <div><dt>Finance company</dt><dd>{ownership?.finance_company ?? "-"}</dd></div>
              <div><dt>Finance status</dt><dd>{ownership?.finance_status ?? "-"}</dd></div>
              <div><dt>Notes</dt><dd>{ownership?.notes ?? "-"}</dd></div>
            </dl>
          )}
        </Card>
      )}

      <style>{VD_STYLES}</style>

      <ConfirmDeleteModal
        open={deleteOpen}
        title="Delete vehicle"
        body={`All records, photos, tasks, reminders, alerts, and documents for ${vehicle?.registration ?? "this vehicle"} will be permanently removed.`}
        confirming={vehicleDeleting}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteOpen(false)}
      />
    </div>
  );
}

// ==================================================
// STYLES — mirror of SovCorE QR panel and form styles
// ==================================================

const VD_STYLES = `
  .vd-shell { display: flex; flex-direction: column; gap: var(--space-6); max-width: 900px; margin: 0 auto; width: 100%; }

  /* ---- Photo row (in overview content) ---- */
  .vd-photo-row { display: flex; align-items: center; justify-content: center; gap: var(--space-3); }
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

  .vd-photo-wrap { display: flex; flex-direction: column; align-items: center; gap: 6px; }
  .vd-photo-btn {
    font-size: var(--text-xs);
    color: var(--colour-text-muted);
    background: none;
    border: none;
    padding: 0;
    cursor: none;
    text-decoration: underline;
    text-underline-offset: 2px;
    transition: color var(--duration-normal) var(--ease-smooth);
  }
  .vd-photo-btn:hover { color: var(--colour-accent2); }
  .vd-photo-btn:disabled { opacity: 0.5; }
  .vd-photo-error { font-size: var(--text-xs); color: var(--colour-error); margin: 0; }

  /* ---- Tabs ---- */
  .vd-tabs {
    display: flex;
    gap: 2px;
    border-bottom: 1px solid var(--colour-border);
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    justify-content: center;
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

  .vd-card-title { font-size: var(--text-md); font-weight: var(--weight-medium); margin-bottom: var(--space-5); letter-spacing: normal; }

  /* ---- Status panel ---- */
  .vd-status-groups { display: flex; flex-direction: column; gap: var(--space-5); }

  /* Group header */
  .vd-sg__head { display: flex; align-items: center; gap: var(--space-2); margin-bottom: var(--space-3); }
  .vd-sg__dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
  .vd-sg__title { font-size: var(--text-xs); font-weight: var(--weight-semibold); text-transform: uppercase; letter-spacing: 0.08em; }
  .vd-sg__count { font-size: var(--text-xs); color: var(--colour-text-muted); margin-left: 2px; }

  /* Card grid within a group */
  .vd-sg__grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: var(--space-3);
  }

  /* Individual status card content (Card component handles hover/glow) */
  .vd-sc__name { font-size: var(--text-sm); color: var(--colour-text); font-weight: var(--weight-medium); line-height: 1.3; }
  .vd-sc__badge {
    display: inline-block; align-self: flex-start;
    font-size: 10px; font-weight: var(--weight-semibold);
    padding: 1px 7px; border-radius: var(--radius-full, 999px);
    border: 1px solid; margin-top: 4px;
  }
  .vd-sc__sub { font-size: var(--text-xs); color: var(--colour-text-muted); margin-top: 4px; }

  /* ---- Key facts dl ---- */
  .vd-dl { display: flex; flex-direction: column; gap: var(--space-3); }
  .vd-dl > div { display: grid; grid-template-columns: 200px 1fr; gap: var(--space-4); align-items: baseline; }
  .vd-dl dt { font-size: var(--text-sm); color: var(--colour-text-muted); margin: 0; }
  .vd-dl dd { font-size: var(--text-sm); color: var(--colour-text); margin: 0; }

  /* ---- Lifecycle ---- */
  .vd-lifecycle { display: flex; align-items: center; gap: var(--space-3); margin-bottom: var(--space-3); }
  .vd-lifecycle-select-wrap { max-width: 180px; }
  .vd-lifecycle-hint { font-size: var(--text-xs); color: var(--colour-text-muted); max-width: 440px; line-height: var(--leading-normal); }
  .vd-danger-copy { font-size: var(--text-sm); color: var(--colour-text-muted); max-width: 480px; line-height: var(--leading-normal); margin-bottom: var(--space-4); }

  /* ---- Section head ---- */
  .vd-section-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-5); }
  .vd-edit-btn { background: none; border: 1px solid var(--colour-border); border-radius: var(--radius-sm); padding: 4px 14px; font-size: var(--text-sm); color: var(--colour-text-muted); cursor: none; transition: border-color 0.2s, color 0.2s; }
  .vd-edit-btn:hover { border-color: var(--colour-accent); color: var(--colour-text); }

  /* ---- Form ---- */
  .vd-form { display: flex; flex-direction: column; gap: var(--space-4); }
  .vd-form .sov-field { max-width: 480px; }
  .vd-error { font-size: var(--text-sm); color: var(--colour-error); }
  .vd-form-actions { display: flex; gap: var(--space-3); }

  /* ---- Accordion (Vehicle details categories) ---- */
  .vd-accordions { display: flex; flex-direction: column; gap: var(--space-3); }
  .vd-accordion { border: 1px solid var(--colour-border); border-radius: var(--radius-md); overflow: hidden; }
  .vd-accordion__head {
    width: 100%; display: flex; align-items: center; justify-content: space-between;
    padding: 12px 16px; background: none; border: none; cursor: none;
    font-size: var(--text-sm); font-weight: var(--weight-medium); color: var(--colour-text);
    text-align: left; transition: background var(--duration-normal) var(--ease-smooth);
  }
  .vd-accordion__head:hover { background: rgba(255,255,255,0.03); }
  .vd-accordion__chevron { color: var(--colour-text-muted); transition: transform var(--duration-normal) var(--ease-smooth); }
  .vd-accordion__chevron--open { transform: rotate(180deg); }
  .vd-accordion__body { padding: 4px 16px 16px; border-top: 1px solid var(--colour-border); }

  /* ---- Responsive ---- */
  @media (max-width: 767px) {
    .vd-rag-grid { grid-template-columns: 1fr; }
    .vd-dl > div { grid-template-columns: 1fr; gap: 3px; }
  }
`;
