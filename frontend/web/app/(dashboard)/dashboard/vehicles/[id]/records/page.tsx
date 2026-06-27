// ============================================================
// frontend/web/app/(dashboard)/dashboard/vehicles/[id]/records/page.tsx
// ============================================================
//
// Purpose:
//   Vehicle records page. Lists all records for a vehicle and
//   provides an inline form to add a new record.
//
// Design:
//   Records are the heart of the platform — every action (MOT,
//   fuel fill, maintenance job, parking charge, PCN) lands here.
//   The list shows type badge, date, cost, and supplier/garage.
//   Clicking a row expands it to show full detail and an edit form.
//
//   The add-record form is type-aware: choosing maintenance or repair
//   reveals the maintenance taxonomy fields (category, item, part
//   number, labour cost, parts cost). Choosing fuel reveals the fuel
//   fields (litres, price per litre, station, full tank flag). All
//   other types show only the shared fields.
//
//   Mirrors SovCorE QR page structure exactly — same card shells,
//   same CSS class convention, same inline-style approach.
//
// Consumed by:
//   - Routed at /dashboard/vehicles/[id]/records
// ============================================================

"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Card } from "@/src/components/ui/card";
import { ConfirmDeleteModal } from "@/src/components/ui/confirm-delete-modal";
import { WholeNumberInput } from "@/src/components/ui/input";
import { RecordTypeBadge } from "@/src/components/records/record-type-badge";
import { DocViewerModal } from "@/src/components/vehicle/DocViewerModal";
import { apiFetch, apiUpload, getAccountId } from "@/src/lib/api/fetch";
import { toAllCaps, toSentenceCase, toTitleCase } from "@/src/lib/text";
import { formatDate, formatGBP } from "@/src/lib/format";

// ==================================================
// TYPES
// ==================================================

interface RecordListItem {
  id: string;
  vehicle_id: string;
  type: string;
  label: string | null;
  date: string;
  mileage: number | null;
  cost: number | null;
  currency: string;
  supplier: string | null;
  garage: string | null;
  notes: string | null;
  created_at: string;
}

interface RecordDetail extends RecordListItem {
  account_id: string;
  reminder_date: string | null;
  warranty_expiry: string | null;
  next_due_mileage: number | null;
  next_due_date: string | null;
  created_by: string | null;
  updated_by: string | null;
  updated_at: string;
  attachments: { id: string; kind: string; filename: string; size_bytes: number }[];
  tags: string[];
  maintenance: {
    category: string;
    item: string | null;
    part_number: string | null;
    labour_cost: number | null;
    parts_cost: number | null;
  } | null;
  fuel: {
    litres: number;
    price_per_litre: number;
    station: string | null;
    full_tank: boolean;
  } | null;
  diagnostic: {
    inspection_type: string;
    findings: string | null;
    labour_cost: number | null;
    parts_cost: number | null;
  } | null;
  diagnostic_fault_codes: {
    id: string;
    code: string | null;
    description: string;
    notes: string | null;
    severity: string;
    trigger_date: string | null;
    trigger_mileage: number | null;
    resolved_at: string | null;
    sort_order: number;
  }[];
}

interface RecordPage {
  items: RecordListItem[];
  total: number;
  page: number;
  page_size: number;
}

// Lightweight shapes for the three dedicated module tables
interface PcnListItem {
  id: string;
  date: string;
  amount: number;
  status: string;
  reference: string | null;
  authority: string | null;
}

interface DamageListItem {
  id: string;
  date: string;
  kind: string;
  repair_cost: number | null;
  description: string | null;
}

interface WarrantyListItem {
  id: string;
  component: string;
  supplier: string | null;
  expiry_date: string | null;
  labour_cost: number | null;
  parts_cost: number | null;
  created_at: string;
}

type AnyEvent =
  | { _kind: "record";   _date: string; data: RecordListItem }
  | { _kind: "pcn";      _date: string; data: PcnListItem }
  | { _kind: "damage";   _date: string; data: DamageListItem }
  | { _kind: "warranty"; _date: string; data: WarrantyListItem };

type RecordTypeValue =
  | "maintenance" | "repair" | "fuel" | "mot" | "tax" | "insurance"
  | "parking" | "pcn" | "cleaning" | "accessories" | "warranty"
  | "diagnostics" | "damage" | "roadside" | "custom" | "odometer";

// ==================================================
// CONSTANTS
// ==================================================

const RECORD_TYPES: { value: RecordTypeValue; label: string }[] = [
  // Measurement — first so it sits directly after "All"
  { value: "odometer",     label: "Odometer" },
  // Workshop
  { value: "maintenance",  label: "Maintenance" },
  { value: "repair",       label: "Repair" },
  { value: "damage",       label: "Damage" },
  { value: "diagnostics",  label: "Diagnostics" },
  // Coverage
  { value: "insurance",    label: "Insurance" },
  { value: "warranty",     label: "Warranty" },
  { value: "roadside",     label: "Roadside" },
  // Regulatory
  { value: "mot",          label: "MOT" },
  { value: "tax",          label: "Tax" },
  { value: "fuel",         label: "Fuel" },
  // Other
  { value: "parking",      label: "Parking" },
  { value: "pcn",          label: "PCN" },
  { value: "cleaning",     label: "Cleaning" },
  { value: "accessories",  label: "Accessories" },
  { value: "custom",       label: "Miscellaneous" },
];

const SHOW_GARAGE   = new Set<RecordTypeValue>(["maintenance", "repair", "mot", "diagnostics", "custom"]);
const SHOW_SUPPLIER = new Set<RecordTypeValue>(["maintenance", "repair", "insurance", "cleaning", "accessories", "warranty", "roadside", "custom"]);

const MAINTENANCE_CATEGORIES = [
  { value: "engine",        label: "Engine" },
  { value: "transmission",  label: "Transmission" },
  { value: "brakes",        label: "Brakes" },
  { value: "suspension",    label: "Suspension" },
  { value: "steering",      label: "Steering" },
  { value: "wheels",        label: "Wheels and tyres" },
  { value: "cooling",       label: "Cooling system" },
  { value: "electrical",    label: "Electrical" },
  { value: "hvac",          label: "HVAC / Climate" },
  { value: "exhaust",       label: "Exhaust" },
  { value: "miscellaneous", label: "Miscellaneous" },
];

// ==================================================
// HELPERS
// ==================================================

function locationText(supplier: string | null, garage: string | null): string {
  return garage || supplier || "-";
}

// ==================================================
// EMPTY FORM STATE
// ==================================================

interface AddForm {
  type: RecordTypeValue;
  label: string;
  date: string;
  mileage: string;
  cost: string;
  supplier: string;
  garage: string;
  notes: string;
  // Maintenance fields
  maint_category: string;
  maint_item: string;
  maint_part_number: string;
  maint_labour_cost: string;
  maint_parts_cost: string;
  // Fuel fields
  fuel_litres: string;
  fuel_price_per_litre: string;
  fuel_station: string;
  fuel_full_tank: boolean;
  // Diagnostic fields
  diag_inspection_type: "self" | "garage";
  diag_findings: string;
  diag_labour_cost: string;
  diag_parts_cost: string;
}

interface FaultCodeDraft {
  code: string;
  description: string;
  notes: string;
  severity: "advisory" | "amber" | "red";
  trigger_date: string;
  trigger_mileage: string;
}

const EMPTY_FC: FaultCodeDraft = {
  code: "", description: "", notes: "", severity: "advisory", trigger_date: "", trigger_mileage: "",
};

const EMPTY_FORM: AddForm = {
  type:                    "odometer",
  label:                   "",
  date:                    new Date().toISOString().slice(0, 10),
  mileage:                 "",
  cost:                    "",
  supplier:                "",
  garage:                  "",
  notes:                   "",
  maint_category:          "engine",
  maint_item:              "",
  maint_part_number:       "",
  maint_labour_cost:       "",
  maint_parts_cost:        "",
  fuel_litres:             "",
  fuel_price_per_litre:    "",
  fuel_station:            "",
  fuel_full_tank:          true,
  diag_inspection_type:    "self",
  diag_findings:           "",
  diag_labour_cost:        "",
  diag_parts_cost:         "",
};

// ==================================================
// PAGE
// ==================================================

export default function VehicleRecordsPage() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const accountId = getAccountId() ?? "";

  // Pre-select type from URL param (e.g. ?type=odometer from the mileage page link).
  const rawTypeParam = searchParams.get("type") ?? "";
  const validTypes = new Set<RecordTypeValue>([
    "maintenance", "repair", "fuel", "mot", "tax", "insurance",
    "parking", "pcn", "cleaning", "accessories", "warranty",
    "diagnostics", "damage", "roadside", "custom", "odometer",
  ]);
  const initialType: RecordTypeValue = validTypes.has(rawTypeParam as RecordTypeValue)
    ? (rawTypeParam as RecordTypeValue)
    : "odometer";

  const [records, setRecords] = useState<RecordListItem[]>([]);
  const [, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedDetail, setExpandedDetail] = useState<RecordDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Auto-open the form and pre-select the type if ?type= is in the URL.
  const [showForm, setShowForm] = useState(rawTypeParam !== "");
  const [form, setForm] = useState<AddForm>({ ...EMPTY_FORM, type: initialType });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<
    | { kind: "record"; id: string }
    | { kind: "attachment"; id: string }
    | null
  >(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Diagnostic fault code builder state (for the add record form)
  const [diagFaultCodes, setDiagFaultCodes] = useState<FaultCodeDraft[]>([]);
  const [diagFaultCodeForm, setDiagFaultCodeForm] = useState<FaultCodeDraft>({ ...EMPTY_FC });
  const [showFaultCodeForm, setShowFaultCodeForm] = useState(false);

  // Inline field errors for odometer validation (blur-triggered)
  const [mileageError, setMileageError] = useState<string | null>(null);
  const [triggerMileageError, setTriggerMileageError] = useState<string | null>(null);

  // Index of the draft fault code being edited (null = adding new)
  const [editingFcIndex, setEditingFcIndex] = useState<number | null>(null);

  // Attachment upload (existing record detail panel)
  const attachInputRef = useRef<HTMLInputElement | null>(null);
  const [attachUploading, setAttachUploading] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [attachKind, setAttachKind] = useState("");
  const [showAttachForm, setShowAttachForm] = useState(false);

  // Attachment on new record form
  const newAttachInputRef = useRef<HTMLInputElement | null>(null);
  const [newAttachFiles, setNewAttachFiles] = useState<{ label: string; file: File }[]>([]);
  const [newAttachLabel, setNewAttachLabel] = useState("");
  const [newAttachError, setNewAttachError] = useState<string | null>(null);

  // Attachment viewer
  const [viewLoadingAttach, setViewLoadingAttach] = useState<string | null>(null);
  const [viewingAttach, setViewingAttach] = useState<{ url: string; filename: string; contentType: string } | null>(null);

  // Dedicated module data (pcns, damage, warranty)
  const [pcns, setPcns] = useState<PcnListItem[]>([]);
  const [damages, setDamages] = useState<DamageListItem[]>([]);
  const [warranties, setWarranties] = useState<WarrantyListItem[]>([]);
  const [moduleLoading, setModuleLoading] = useState(true);

  // Vehicle current odometer — used to reject backwards readings
  const [vehicleMileage, setVehicleMileage] = useState<number | null>(null);

  // ==================================================
  // DATA LOADING
  // ==================================================

  async function loadRecords(filterType = typeFilter) {
    if (!accountId || !id) return;
    // pcn / damage / warranty come from their own tables — the records API has nothing for them.
    if (["pcn", "damage", "warranty"].includes(filterType)) {
      setRecords([]);
      setTotal(0);
      setLoading(false);
      return;
    }
    setLoading(true);
    const typeParam = filterType !== "all" ? `&type=${filterType}` : "";
    const res = await apiFetch(
      `/api/v1/accounts/${accountId}/vehicles/${id}/records?page=1&page_size=100${typeParam}`
    );
    if (res.ok) {
      const data: RecordPage = await res.json();
      setRecords(data.items);
      setTotal(data.total);
    }
    setLoading(false);
  }

  useEffect(() => { loadRecords().catch(() => {}); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Load PCN, damage, and warranty data once on mount.
  useEffect(() => {
    if (!accountId || !id) return;
    (async () => {
      setModuleLoading(true);
      const [pcnRes, dmgRes, warRes, vehRes] = await Promise.all([
        apiFetch(`/api/v1/accounts/${accountId}/vehicles/${id}/pcns?page=1&page_size=100`),
        apiFetch(`/api/v1/accounts/${accountId}/vehicles/${id}/damage?page=1&page_size=100`),
        apiFetch(`/api/v1/accounts/${accountId}/vehicles/${id}/warranties?page=1&page_size=50`),
        apiFetch(`/api/v1/accounts/${accountId}/vehicles/${id}`),
      ]);
      if (pcnRes.ok) setPcns((await pcnRes.json()).items ?? []);
      if (dmgRes.ok) setDamages((await dmgRes.json()).items ?? []);
      if (warRes.ok) setWarranties((await warRes.json()).items ?? []);
      if (vehRes.ok) { const v = await vehRes.json(); setVehicleMileage(v.mileage ?? null); }
      setModuleLoading(false);
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadDetail(recordId: string) {
    if (!accountId) return;
    setDetailLoading(true);
    const res = await apiFetch(`/api/v1/accounts/${accountId}/records/${recordId}`);
    if (res.ok) {
      const data: RecordDetail = await res.json();
      setExpandedDetail(data);
    }
    setDetailLoading(false);
  }

  function handleRowClick(recordId: string) {
    setShowAttachForm(false);
    setAttachError(null);
    if (expandedId === recordId) {
      setExpandedId(null);
      setExpandedDetail(null);
    } else {
      setExpandedId(recordId);
      setExpandedDetail(null);
      loadDetail(recordId);
    }
  }

  // ==================================================
  // TYPE FILTER
  // ==================================================

  function handleFilterChange(t: string) {
    setTypeFilter(t);
    setExpandedId(null);
    setExpandedDetail(null);
    loadRecords(t);
  }

  // Merge all event sources and sort newest-first.
  const visibleEvents: AnyEvent[] = (() => {
    const evts: AnyEvent[] = [];
    if (typeFilter === "all" || !["pcn", "damage", "warranty"].includes(typeFilter)) {
      records.forEach((r) => evts.push({ _kind: "record", _date: r.date, data: r }));
    }
    if (typeFilter === "all" || typeFilter === "pcn") {
      pcns.forEach((p) => evts.push({ _kind: "pcn", _date: p.date, data: p }));
    }
    if (typeFilter === "all" || typeFilter === "damage") {
      damages.forEach((d) => evts.push({ _kind: "damage", _date: d.date, data: d }));
    }
    if (typeFilter === "all" || typeFilter === "warranty") {
      warranties.forEach((w) =>
        evts.push({ _kind: "warranty", _date: w.expiry_date ?? w.created_at, data: w })
      );
    }
    return evts.sort((a, b) => (b._date > a._date ? 1 : b._date < a._date ? -1 : 0));
  })();

  // ==================================================
  // ADD RECORD FORM
  // ==================================================

  function handleFormChange<K extends keyof AddForm>(field: K, value: AddForm[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setSaveError(null);
    if (field === "mileage") setMileageError(null);
  }

  function handleMileageBlur() {
    if (!form.mileage || vehicleMileage === null) { setMileageError(null); return; }
    const entered = parseInt(form.mileage, 10);
    if (!isNaN(entered) && entered < vehicleMileage) {
      setMileageError(`Last recorded odometer is ${vehicleMileage.toLocaleString()} mi. Please enter ${vehicleMileage.toLocaleString()} or higher.`);
    } else {
      setMileageError(null);
    }
  }

  function handleTriggerMileageBlur() {
    if (!diagFaultCodeForm.trigger_mileage || vehicleMileage === null) { setTriggerMileageError(null); return; }
    const entered = parseInt(diagFaultCodeForm.trigger_mileage, 10);
    if (!isNaN(entered) && entered < vehicleMileage) {
      setTriggerMileageError(`Last recorded odometer is ${vehicleMileage.toLocaleString()} mi. Please enter ${vehicleMileage.toLocaleString()} or higher.`);
    } else {
      setTriggerMileageError(null);
    }
  }

  function buildPayload() {
    const isMaint = form.type === "maintenance" || form.type === "repair";
    const isFuel  = form.type === "fuel";
    const isDiag  = form.type === "diagnostics";

    const body: Record<string, unknown> = {
      type:     form.type,
      label:    form.type === "custom" ? form.label.trim() || null : null,
      date:     form.date,
      mileage:  form.mileage ? parseInt(form.mileage, 10) : null,
      // Cost is entered in pounds; convert to pence for the API.
      cost:     form.cost ? Math.round(parseFloat(form.cost) * 100) : null,
      supplier: form.supplier || null,
      garage:   form.garage || null,
      notes:    form.notes || null,
    };

    if (isMaint) {
      body.maintenance = {
        category:    form.maint_category,
        item:        form.maint_item || null,
        part_number: form.maint_part_number || null,
        labour_cost: form.maint_labour_cost ? Math.round(parseFloat(form.maint_labour_cost) * 100) : null,
        parts_cost:  form.maint_parts_cost  ? Math.round(parseFloat(form.maint_parts_cost)  * 100) : null,
      };
    }

    if (isFuel) {
      body.fuel = {
        litres:          parseFloat(form.fuel_litres),
        // Price per litre entered in pence (e.g. 147.9p); store directly.
        price_per_litre: form.fuel_price_per_litre ? Math.round(parseFloat(form.fuel_price_per_litre)) : 0,
        station:         form.fuel_station || null,
        full_tank:       form.fuel_full_tank,
      };
    }

    if (isDiag) {
      body.diagnostic = {
        inspection_type: form.diag_inspection_type,
        findings:        form.diag_findings || null,
        labour_cost:     form.diag_labour_cost ? Math.round(parseFloat(form.diag_labour_cost) * 100) : null,
        parts_cost:      form.diag_parts_cost  ? Math.round(parseFloat(form.diag_parts_cost)  * 100) : null,
        fault_codes: diagFaultCodes.map((fc, i) => ({
          code:            fc.code || null,
          description:     fc.description,
          notes:           fc.notes || null,
          severity:        fc.severity,
          trigger_date:    fc.trigger_date || null,
          trigger_mileage: fc.trigger_mileage ? parseInt(fc.trigger_mileage, 10) : null,
          resolved_at:     null,
          sort_order:      i,
        })),
      };
    }

    return body;
  }

  async function handleAddRecord() {
    if (!form.date) { setSaveError("Date is required."); return; }
    if (form.type === "fuel" && !form.fuel_litres) { setSaveError("Litres is required for a fuel record."); return; }
    if (form.type === "odometer" && !form.mileage) { setSaveError("Odometer reading is required."); return; }
    if (mileageError) { setSaveError("Please correct the odometer reading before saving."); return; }
    setSaving(true);
    setSaveError(null);
    try {
      const res = await apiFetch(
        `/api/v1/accounts/${accountId}/vehicles/${id}/records`,
        { method: "POST", body: JSON.stringify(buildPayload()) }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setSaveError(err.detail ?? "Could not save the record.");
        return;
      }
      const saved = await res.json();
      for (const a of newAttachFiles) {
        const fd = new FormData();
        fd.append("file", a.file);
        fd.append("kind", a.label);
        fd.append("filename", a.file.name);
        await apiUpload(
          `/api/v1/accounts/${accountId}/vehicles/${id}/records/${saved.id}/attachments/upload`,
          fd
        );
      }
      setShowForm(false);
      setForm(EMPTY_FORM);
      setDiagFaultCodes([]);
      setDiagFaultCodeForm({ ...EMPTY_FC });
      setShowFaultCodeForm(false);
      setEditingFcIndex(null);
      setMileageError(null);
      setTriggerMileageError(null);
      setNewAttachFiles([]);
      setNewAttachLabel("");
      if (form.mileage) {
        const entered = parseInt(form.mileage, 10);
        if (!isNaN(entered) && (vehicleMileage === null || entered > vehicleMileage)) {
          setVehicleMileage(entered);
        }
      }
      await loadRecords();
    } catch {
      setSaveError("An unexpected error occurred.");
    } finally {
      setSaving(false);
    }
  }

  // ==================================================
  // DELETE
  // ==================================================

  function handleDelete(recordId: string) {
    setDeleteError(null);
    setDeleteTarget({ kind: "record", id: recordId });
  }

  // ==================================================
  // ATTACHMENT UPLOAD / DELETE
  // ==================================================

  async function handleAttachUpload(file: File) {
    if (!expandedDetail || !accountId) return;
    setAttachUploading(true);
    setAttachError(null);
    setShowAttachForm(false);
    setAttachKind("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("kind", attachKind.trim());
      fd.append("filename", file.name);
      const res = await apiUpload(
        `/api/v1/accounts/${accountId}/vehicles/${id}/records/${expandedDetail.id}/attachments/upload`,
        fd
      );
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        let msg = `Upload failed (${res.status}).`;
        try {
          const body = JSON.parse(text);
          if (typeof body?.detail === "string") msg = body.detail;
          else if (Array.isArray(body?.detail) && body.detail[0]?.msg) msg = body.detail[0].msg;
        } catch { /* non-JSON error body */ }
        console.error("[attach-upload] failed", res.status, text);
        setAttachError(msg);
        return;
      }
      await loadDetail(expandedDetail.id);
    } catch (err) {
      console.error("[attach-upload] exception:", err);
      setAttachError(err instanceof Error ? `Upload error: ${err.message}` : "An unexpected error occurred.");
    } finally {
      setAttachUploading(false);
    }
  }

  function handleAttachDelete(attachmentId: string) {
    setDeleteError(null);
    setDeleteTarget({ kind: "attachment", id: attachmentId });
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    if (deleteTarget.kind === "record") {
      await apiFetch(
        `/api/v1/accounts/${accountId}/records/${deleteTarget.id}?vehicle_id=${id}`,
        { method: "DELETE" }
      );
      setExpandedId(null);
      setExpandedDetail(null);
      setRecords((prev) => prev.filter((r) => r.id !== (deleteTarget as { kind: "record"; id: string }).id));
      setTotal((prev) => prev - 1);
      setDeleteTarget(null);
    } else {
      const res = await apiFetch(
        `/api/v1/accounts/${accountId}/attachments/${deleteTarget.id}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        setDeleteError("Could not delete attachment.");
        setDeleting(false);
        return;
      }
      if (expandedDetail) await loadDetail(expandedDetail.id);
      setDeleteTarget(null);
    }
    setDeleting(false);
  }

  async function handleAttachView(attachmentId: string, filename: string) {
    setViewLoadingAttach(attachmentId);
    setAttachError(null);
    try {
      const res = await apiFetch(`/api/v1/accounts/${accountId}/attachments/${attachmentId}/download`);
      if (!res.ok) { setAttachError("Could not load file. It may have been removed from storage."); return; }
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      setViewingAttach({ url: objectUrl, filename, contentType: blob.type || "application/octet-stream" });
    } catch {
      setAttachError("Could not load file.");
    } finally {
      setViewLoadingAttach(null);
    }
  }

  function handleAttachViewClose() {
    if (viewingAttach) URL.revokeObjectURL(viewingAttach.url);
    setViewingAttach(null);
  }

  // ==================================================
  // RENDER HELPERS
  // ==================================================

  const isMaintForm       = form.type === "maintenance" || form.type === "repair";
  const isFuelForm        = form.type === "fuel";
  const isDamageForm      = form.type === "damage";
  const isOdometerForm    = form.type === "odometer";
  const isDiagnosticsForm = form.type === "diagnostics";

  // ==================================================
  // RENDER
  // ==================================================

  return (
    <div className="rec-shell">
      {/* ---- Header ---- */}
      <header className="rec-head">
        <div className="rec-head__row">
          <div>
            <h1 className="rec-title">Records</h1>
            <p className="rec-sub">Every action taken on this vehicle, all in one place.</p>
          </div>
          {showForm ? (
            <button className="rec-btn--danger-sm" onClick={() => { setShowForm(false); setSaveError(null); }}>Cancel</button>
          ) : (
            <button className="rec-btn rec-btn--primary rec-btn--icon" title="Add record" onClick={() => { setShowForm(true); setSaveError(null); }}>+</button>
          )}
        </div>
      </header>

      {/* ---- Add record form ---- */}
      {showForm && (
        <Card>
          <h2 className="rec-section-title">New record</h2>
          <div className="rec-form">

            {/* Type + Date row */}
            <div className="rec-form-row">
              <label className="rec-label">
                <span className="rec-label__text">Type</span>
                <select className="rec-select" value={form.type} onChange={(e) => { handleFormChange("type", e.target.value as RecordTypeValue); if (e.target.value !== "custom") handleFormChange("label", ""); }} disabled={saving}>
                  <optgroup label="Measurement">
                    <option value="odometer">Odometer</option>
                  </optgroup>
                  <optgroup label="Workshop">
                    <option value="maintenance">Maintenance</option>
                    <option value="repair">Repair</option>
                    <option value="damage">Damage</option>
                    <option value="diagnostics">Diagnostics</option>
                  </optgroup>
                  <optgroup label="Coverage">
                    <option value="insurance">Insurance</option>
                    <option value="warranty">Warranty</option>
                    <option value="roadside">Roadside</option>
                  </optgroup>
                  <optgroup label="Regulatory">
                    <option value="mot">MOT</option>
                    <option value="tax">Tax</option>
                    <option value="fuel">Fuel</option>
                  </optgroup>
                  <optgroup label="Other">
                    <option value="parking">Parking</option>
                    <option value="pcn">PCN</option>
                    <option value="cleaning">Cleaning</option>
                    <option value="accessories">Accessories</option>
                    <option value="custom">Miscellaneous</option>
                  </optgroup>
                </select>
              </label>
              {form.type === "custom" && (
                <label className="rec-label">
                  <span className="rec-label__text">Label</span>
                  <input
                    className="rec-input"
                    type="text"
                    placeholder="e.g. Dash cam fitting"
                    value={form.label}
                    onChange={(e) => handleFormChange("label", toTitleCase(e.target.value))}
                    disabled={saving}
                  />
                </label>
              )}
              <label className="rec-label">
                <span className="rec-label__text">Date</span>
                <input className="rec-input" type="date" value={form.date} onChange={(e) => handleFormChange("date", e.target.value)} disabled={saving} />
              </label>
              <label className="rec-label">
                <span className="rec-label__text">
                  {isOdometerForm ? "Odometer reading *" : "Odometer"}
                </span>
                <WholeNumberInput
                  className={`rec-input${mileageError ? " rec-input--error" : ""}`}
                  placeholder={isOdometerForm ? "e.g. 52400" : "e.g. 52000"}
                  value={form.mileage}
                  onChange={(v) => handleFormChange("mileage", v)}
                  onBlur={handleMileageBlur}
                  disabled={saving}
                  required={isOdometerForm}
                  maxLength={7}
                />
                {mileageError && <span className="rec-field-error">{mileageError}</span>}
              </label>
              {!isOdometerForm && (
                <label className="rec-label">
                  <span className="rec-label__text">Total cost (£)</span>
                  <input className="rec-input" type="number" step="0.01" placeholder="e.g. 149.99" value={form.cost} onChange={(e) => handleFormChange("cost", e.target.value)} disabled={saving} />
                </label>
              )}
            </div>

            {/* Odometer info strip */}
            {isOdometerForm && (
              <p style={{ fontSize: "var(--text-xs)", color: "var(--colour-text-muted)", margin: 0, lineHeight: "var(--leading-normal)" }}>
                Log your current odometer reading. This updates the vehicle mileage and feeds mileage-based service reminders and alerts.
              </p>
            )}

            {/* Garage / Supplier — only shown for types where they are meaningful (not odometer) */}
            {!isOdometerForm && (SHOW_GARAGE.has(form.type) || SHOW_SUPPLIER.has(form.type)) && (
              <div className="rec-form-row">
                {SHOW_GARAGE.has(form.type) && (
                  <label className="rec-label rec-label--wide">
                    <span className="rec-label__text">Garage</span>
                    <input className="rec-input" type="text" placeholder="e.g. Kwik Fit" value={form.garage} onChange={(e) => handleFormChange("garage", toTitleCase(e.target.value))} disabled={saving} />
                  </label>
                )}
                {SHOW_SUPPLIER.has(form.type) && (
                  <label className="rec-label rec-label--wide">
                    <span className="rec-label__text">
                      {form.type === "insurance" || form.type === "warranty" ? "Provider" : "Supplier"}
                    </span>
                    <input className="rec-input" type="text" placeholder="e.g. Amazon" value={form.supplier} onChange={(e) => handleFormChange("supplier", toTitleCase(e.target.value))} disabled={saving} />
                  </label>
                )}
              </div>
            )}

            {/* Notes */}
            <label className="rec-label rec-label--full">
              <span className="rec-label__text">Notes</span>
              <textarea className="rec-textarea" rows={2} placeholder="Any additional notes…" value={form.notes} onChange={(e) => handleFormChange("notes", toSentenceCase(e.target.value))} disabled={saving} />
            </label>

            {/* ---- Maintenance / repair detail fields ---- */}
            {isMaintForm && (
              <div className="rec-detail-block">
                <p className="rec-detail-heading">Maintenance detail</p>
                <div className="rec-form-row">
                  <label className="rec-label">
                    <span className="rec-label__text">Category</span>
                    <select className="rec-select" value={form.maint_category} onChange={(e) => handleFormChange("maint_category", e.target.value)} disabled={saving}>
                      {MAINTENANCE_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                  </label>
                  <label className="rec-label rec-label--wide">
                    <span className="rec-label__text">Item description</span>
                    <input className="rec-input" type="text" placeholder="e.g. Front Brake Pads" value={form.maint_item} onChange={(e) => handleFormChange("maint_item", toTitleCase(e.target.value))} disabled={saving} />
                  </label>
                  <label className="rec-label">
                    <span className="rec-label__text">Part number</span>
                    <input className="rec-input" type="text" placeholder="PART NUMBER" value={form.maint_part_number} onChange={(e) => handleFormChange("maint_part_number", toAllCaps(e.target.value))} disabled={saving} />
                  </label>
                </div>
                <div className="rec-form-row">
                  <label className="rec-label">
                    <span className="rec-label__text">Labour cost (£)</span>
                    <input className="rec-input" type="number" step="0.01" placeholder="e.g. 80.00" value={form.maint_labour_cost} onChange={(e) => handleFormChange("maint_labour_cost", e.target.value)} disabled={saving} />
                  </label>
                  <label className="rec-label">
                    <span className="rec-label__text">Parts cost (£)</span>
                    <input className="rec-input" type="number" step="0.01" placeholder="e.g. 45.00" value={form.maint_parts_cost} onChange={(e) => handleFormChange("maint_parts_cost", e.target.value)} disabled={saving} />
                  </label>
                </div>
              </div>
            )}

            {/* ---- Fuel detail fields ---- */}
            {isFuelForm && (
              <div className="rec-detail-block">
                <p className="rec-detail-heading">Fuel detail</p>
                <div className="rec-form-row">
                  <label className="rec-label">
                    <span className="rec-label__text">Litres</span>
                    <input className="rec-input" type="number" step="0.001" placeholder="e.g. 45.250" value={form.fuel_litres} onChange={(e) => handleFormChange("fuel_litres", e.target.value)} disabled={saving} />
                  </label>
                  <label className="rec-label">
                    <span className="rec-label__text">Price per litre (p)</span>
                    <input className="rec-input" type="number" step="0.1" placeholder="e.g. 147.9" value={form.fuel_price_per_litre} onChange={(e) => handleFormChange("fuel_price_per_litre", e.target.value)} disabled={saving} />
                  </label>
                  <label className="rec-label rec-label--wide">
                    <span className="rec-label__text">Station</span>
                    <input className="rec-input" type="text" placeholder="e.g. Shell" value={form.fuel_station} onChange={(e) => handleFormChange("fuel_station", toTitleCase(e.target.value))} disabled={saving} />
                  </label>
                  <label className="rec-label rec-label--check">
                    <span className="rec-label__text">Full tank</span>
                    <input type="checkbox" checked={form.fuel_full_tank} onChange={(e) => handleFormChange("fuel_full_tank", e.target.checked)} disabled={saving} />
                  </label>
                </div>
              </div>
            )}

            {/* ---- Damage cost fields ---- */}
            {isDamageForm && (
              <div className="rec-detail-block">
                <p className="rec-detail-heading">Damage costs</p>
                <div className="rec-form-row">
                  <label className="rec-label">
                    <span className="rec-label__text">Labour cost (£)</span>
                    <input className="rec-input" type="number" step="0.01" placeholder="e.g. 80.00" value={form.maint_labour_cost} onChange={(e) => handleFormChange("maint_labour_cost", e.target.value)} disabled={saving} />
                  </label>
                  <label className="rec-label">
                    <span className="rec-label__text">Parts cost (£)</span>
                    <input className="rec-input" type="number" step="0.01" placeholder="e.g. 45.00" value={form.maint_parts_cost} onChange={(e) => handleFormChange("maint_parts_cost", e.target.value)} disabled={saving} />
                  </label>
                </div>
              </div>
            )}

            {/* ---- Diagnostic detail fields ---- */}
            {isDiagnosticsForm && (
              <div className="rec-detail-block">
                <p className="rec-detail-heading">Diagnostic detail</p>
                <div className="rec-form-row">
                  <label className="rec-label">
                    <span className="rec-label__text">Inspection type</span>
                    <select
                      className="rec-select"
                      value={form.diag_inspection_type}
                      onChange={(e) => handleFormChange("diag_inspection_type", e.target.value as "self" | "garage")}
                      disabled={saving}
                    >
                      <option value="self">Self</option>
                      <option value="garage">Garage</option>
                    </select>
                  </label>
                  <label className="rec-label">
                    <span className="rec-label__text">Labour cost (£)</span>
                    <input className="rec-input" type="number" step="0.01" placeholder="e.g. 80.00" value={form.diag_labour_cost} onChange={(e) => handleFormChange("diag_labour_cost", e.target.value)} disabled={saving} />
                  </label>
                  <label className="rec-label">
                    <span className="rec-label__text">Parts cost (£)</span>
                    <input className="rec-input" type="number" step="0.01" placeholder="e.g. 45.00" value={form.diag_parts_cost} onChange={(e) => handleFormChange("diag_parts_cost", e.target.value)} disabled={saving} />
                  </label>
                </div>
                <label className="rec-label rec-label--full">
                  <span className="rec-label__text">Findings</span>
                  <textarea
                    className="rec-textarea"
                    rows={2}
                    placeholder="Visual or audio findings..."
                    value={form.diag_findings}
                    onChange={(e) => handleFormChange("diag_findings", toSentenceCase(e.target.value))}
                    disabled={saving}
                  />
                </label>

                {/* ---- Fault code builder ---- */}
                <p className="rec-detail-heading" style={{ marginTop: "var(--space-4)" }}>Fault codes</p>
                {diagFaultCodes.length > 0 && (
                  <div className="diag-fc-draft-list">
                    {diagFaultCodes.map((fc, i) => (
                      <div key={i} className="diag-fc-draft-row">
                        <span className={`diag-sev-sm diag-sev-sm--${fc.severity}`}>{fc.severity === "amber" ? "Warning" : fc.severity === "red" ? "Urgent" : fc.severity}</span>
                        <span className="diag-fc-draft-code">{fc.code || "—"}</span>
                        <span className="diag-fc-draft-desc">{fc.description}</span>
                        <button
                          type="button"
                          className="sov-action-btn sov-action-btn--view"
                          onClick={() => {
                            setDiagFaultCodeForm({ ...fc });
                            setEditingFcIndex(i);
                            setShowFaultCodeForm(true);
                          }}
                          disabled={saving}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="sov-action-btn sov-action-btn--delete"
                          onClick={() => setDiagFaultCodes((prev) => prev.filter((_, idx) => idx !== i))}
                          disabled={saving}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {showFaultCodeForm && (
                  <div className="diag-fc-mini-form">
                    <div className="rec-form-row">
                      <label className="rec-label">
                        <span className="rec-label__text">Code</span>
                        <input
                          className="rec-input"
                          type="text"
                          placeholder="P0300"
                          value={diagFaultCodeForm.code}
                          onChange={(e) => setDiagFaultCodeForm((p) => ({ ...p, code: toAllCaps(e.target.value) }))}
                        />
                      </label>
                      <label className="rec-label rec-label--wide">
                        <span className="rec-label__text">Description *</span>
                        <input
                          className="rec-input"
                          type="text"
                          placeholder="e.g. Random misfire detected"
                          value={diagFaultCodeForm.description}
                          onChange={(e) => setDiagFaultCodeForm((p) => ({ ...p, description: toSentenceCase(e.target.value) }))}
                        />
                      </label>
                      <label className="rec-label">
                        <span className="rec-label__text">Severity</span>
                        <select
                          className="rec-select"
                          value={diagFaultCodeForm.severity}
                          onChange={(e) => setDiagFaultCodeForm((p) => ({ ...p, severity: e.target.value as FaultCodeDraft["severity"] }))}
                        >
                          <option value="advisory">Advisory</option>
                          <option value="amber">Warning</option>
                          <option value="red">Urgent</option>
                        </select>
                      </label>
                    </div>
                    <div className="rec-form-row">
                      <label className="rec-label rec-label--wide">
                        <span className="rec-label__text">Notes</span>
                        <input
                          className="rec-input"
                          type="text"
                          placeholder="Additional notes"
                          value={diagFaultCodeForm.notes}
                          onChange={(e) => setDiagFaultCodeForm((p) => ({ ...p, notes: toSentenceCase(e.target.value) }))}
                        />
                      </label>
                      <label className="rec-label">
                        <span className="rec-label__text">Trigger date</span>
                        <input
                          className="rec-input"
                          type="date"
                          value={diagFaultCodeForm.trigger_date}
                          onChange={(e) => setDiagFaultCodeForm((p) => ({ ...p, trigger_date: e.target.value }))}
                        />
                      </label>
                      <label className="rec-label">
                        <span className="rec-label__text">Trigger odometer</span>
                        <WholeNumberInput
                          className={`rec-input${triggerMileageError ? " rec-input--error" : ""}`}
                          placeholder="e.g. 60000"
                          value={diagFaultCodeForm.trigger_mileage}
                          onChange={(v) => { setDiagFaultCodeForm((p) => ({ ...p, trigger_mileage: v })); setTriggerMileageError(null); }}
                          onBlur={handleTriggerMileageBlur}
                          maxLength={7}
                        />
                        {triggerMileageError && <span className="rec-field-error">{triggerMileageError}</span>}
                      </label>
                    </div>
                    <div style={{ display: "flex", gap: "var(--space-2)", marginTop: "var(--space-2)" }}>
                      <button
                        type="button"
                        className="rec-btn rec-btn--ghost rec-btn--sm"
                        onClick={() => {
                          if (!diagFaultCodeForm.description.trim()) return;
                          if (editingFcIndex !== null) {
                            setDiagFaultCodes((prev) => prev.map((item, i) => i === editingFcIndex ? { ...diagFaultCodeForm } : item));
                            setEditingFcIndex(null);
                          } else {
                            setDiagFaultCodes((prev) => [...prev, { ...diagFaultCodeForm }]);
                          }
                          setDiagFaultCodeForm({ ...EMPTY_FC });
                          setTriggerMileageError(null);
                          setShowFaultCodeForm(false);
                        }}
                      >
                        {editingFcIndex !== null ? "Update" : "Add"}
                      </button>
                      <button
                        type="button"
                        className="rec-btn--danger-sm"
                        onClick={() => { setShowFaultCodeForm(false); setDiagFaultCodeForm({ ...EMPTY_FC }); setEditingFcIndex(null); setTriggerMileageError(null); }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {!showFaultCodeForm && (
                  <button
                    type="button"
                    className="rec-btn rec-btn--ghost rec-btn--sm"
                    style={{ marginTop: "var(--space-2)" }}
                    onClick={() => setShowFaultCodeForm(true)}
                    disabled={saving}
                  >
                    + Add fault code
                  </button>
                )}
              </div>
            )}

            {/* Optional file attachments — supports multiple */}
            <div className="rec-form-attach-row" style={{ alignItems: "flex-start" }}>
              <span className="rec-label__text" style={{ paddingTop: "5px", whiteSpace: "nowrap" }}>Attach files</span>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "8px" }}>
                {newAttachFiles.length > 0 && (
                  <div className="rec-attach-list">
                    {newAttachFiles.map((a, i) => (
                      <div key={i} className="rec-attach-row">
                        <span className="rec-attach-kind">{a.label}</span>
                        <span className="rec-attach-name">{a.file.name}</span>
                        <button
                          type="button"
                          className="sov-action-btn sov-action-btn--delete"
                          onClick={() => setNewAttachFiles((prev) => prev.filter((_, idx) => idx !== i))}
                          disabled={saving}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="rec-form-attach-controls">
                  <input
                    type="text"
                    className="rec-attach-kind-input"
                    placeholder="Label"
                    value={newAttachLabel}
                    onChange={(e) => { setNewAttachLabel(toTitleCase(e.target.value)); setNewAttachError(null); }}
                    disabled={saving}
                    maxLength={32}
                  />
                  <button
                    type="button"
                    className="rec-btn rec-btn--ghost rec-btn--sm"
                    onClick={() => {
                      if (!newAttachLabel.trim()) { setNewAttachError("Enter a label first."); return; }
                      setNewAttachError(null);
                      newAttachInputRef.current?.click();
                    }}
                    disabled={saving}
                  >
                    Choose file
                  </button>
                  <input
                    ref={newAttachInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/heic,.pdf"
                    style={{ display: "none" }}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) {
                        setNewAttachFiles((prev) => [...prev, { label: newAttachLabel.trim(), file: f }]);
                        setNewAttachLabel("");
                      }
                      e.target.value = "";
                    }}
                  />
                </div>
                {newAttachError && <p className="rec-error" style={{ marginTop: "2px" }}>{newAttachError}</p>}
              </div>
            </div>

            {/* Actions */}
            {saveError && <p className="rec-error">{saveError}</p>}
            <div className="rec-form-actions">
              <button className="rec-btn rec-btn--primary" onClick={handleAddRecord} disabled={saving}>
                {saving ? "Saving…" : "Save record"}
              </button>
              <button className="rec-btn--danger-sm" onClick={() => { setShowForm(false); setForm(EMPTY_FORM); setSaveError(null); setMileageError(null); setTriggerMileageError(null); setNewAttachFiles([]); setNewAttachLabel(""); setDiagFaultCodes([]); setDiagFaultCodeForm({ ...EMPTY_FC }); setShowFaultCodeForm(false); setEditingFcIndex(null); }} disabled={saving}>
                Cancel
              </button>
            </div>
          </div>
        </Card>
      )}

      {/* ---- Type filter ---- */}
      <div className="rec-filter-row">
        <span className="rec-filter-label">Show:</span>
        <div className="rec-filter-chips">
          <button className={typeFilter === "all" ? "rec-chip rec-chip--active" : "rec-chip"} onClick={() => handleFilterChange("all")}>All</button>
          {RECORD_TYPES.map((t) => (
            <button
              key={t.value}
              className={typeFilter === t.value ? "rec-chip rec-chip--active" : "rec-chip"}
              onClick={() => handleFilterChange(t.value)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ---- Records list ---- */}
      <Card>
        <div className="rec-list-head">
          <span className="rec-count">{visibleEvents.length} event{visibleEvents.length !== 1 ? "s" : ""}</span>
        </div>

        {(loading || moduleLoading) ? (
          <div className="rec-skeleton" />
        ) : visibleEvents.length === 0 ? (
          <div className="rec-empty">
            <p>No records yet.</p>
            <button className="rec-btn rec-btn--primary" onClick={() => setShowForm(true)}>Add your first record</button>
          </div>
        ) : (
          <div className="rec-rows">
            {visibleEvents.map((evt) => {
              if (evt._kind === "pcn") {
                return (
                  <div key={`pcn-${evt.data.id}`} className="rec-row rec-row--module">
                    <div className="rec-row__left">
                      <RecordTypeBadge type="pcn" />
                      <span className="rec-row__date">{formatDate(evt.data.date)}</span>
                      {evt.data.authority && <span className="rec-row__location">{evt.data.authority}</span>}
                      {evt.data.reference && <span className="rec-row__location">{evt.data.reference}</span>}
                    </div>
                    <div className="rec-row__right">
                      <span className="rec-row__cost">{formatGBP(evt.data.amount)}</span>
                      <span className="rec-row__module-tag">{evt.data.status}</span>
                      <Link href={`/dashboard/vehicles/${id}/pcns`} className="rec-row__module-link">View ↗</Link>
                    </div>
                  </div>
                );
              }
              if (evt._kind === "damage") {
                return (
                  <div key={`damage-${evt.data.id}`} className="rec-row rec-row--module">
                    <div className="rec-row__left">
                      <RecordTypeBadge type="damage" />
                      <span className="rec-row__date">{formatDate(evt.data.date)}</span>
                      <span className="rec-row__location">{evt.data.kind.replace("_", " ")}</span>
                      {evt.data.description && <span className="rec-row__location">{evt.data.description}</span>}
                    </div>
                    <div className="rec-row__right">
                      {evt.data.repair_cost !== null && <span className="rec-row__cost">{formatGBP(evt.data.repair_cost)}</span>}
                      <Link href={`/dashboard/vehicles/${id}/damage`} className="rec-row__module-link">View ↗</Link>
                    </div>
                  </div>
                );
              }
              if (evt._kind === "warranty") {
                return (
                  <div key={`warranty-${evt.data.id}`} className="rec-row rec-row--module">
                    <div className="rec-row__left">
                      <RecordTypeBadge type="warranty" />
                      <span className="rec-row__date">{evt.data.expiry_date ? `Expires ${formatDate(evt.data.expiry_date)}` : formatDate(evt.data.created_at)}</span>
                      <span className="rec-row__location">{evt.data.component}</span>
                      {evt.data.supplier && <span className="rec-row__location">{evt.data.supplier}</span>}
                    </div>
                    <div className="rec-row__right">
                      {(evt.data.labour_cost !== null || evt.data.parts_cost !== null) && (
                        <span className="rec-row__cost">{formatGBP((evt.data.labour_cost ?? 0) + (evt.data.parts_cost ?? 0))}</span>
                      )}
                      <Link href={`/dashboard/vehicles/${id}/warranty`} className="rec-row__module-link">View ↗</Link>
                    </div>
                  </div>
                );
              }
              // evt._kind === "record"
              const rec = evt.data;
              return (
                <div key={rec.id}>
                  {/* ---- Summary row ---- */}
                  <button
                    className="rec-row"
                    onClick={() => handleRowClick(rec.id)}
                    aria-expanded={expandedId === rec.id}
                  >
                    <div className="rec-row__left">
                      <RecordTypeBadge type={rec.type} />
                      {rec.type === "custom" && rec.label && (
                        <span className="rec-row__label">{rec.label}</span>
                      )}
                      <span className="rec-row__date">{formatDate(rec.date)}</span>
                      <span className="rec-row__location">{locationText(rec.supplier, rec.garage)}</span>
                    </div>
                    <div className="rec-row__right">
                      {rec.cost !== null && <span className="rec-row__cost">{formatGBP(rec.cost)}</span>}
                      <span className="rec-row__chevron" aria-hidden="true">{expandedId === rec.id ? "▲" : "▼"}</span>
                    </div>
                  </button>

                  {/* ---- Expanded detail ---- */}
                  {expandedId === rec.id && (
                    <div className="rec-detail">
                      {detailLoading || !expandedDetail ? (
                        <div className="rec-detail-skeleton" />
                      ) : (
                        <>
                          {/* Core fields */}
                          <dl className="rec-dl">
                            <div><dt>Date</dt><dd>{formatDate(expandedDetail.date)}</dd></div>
                            {expandedDetail.type === "custom" && expandedDetail.label && <div><dt>Label</dt><dd>{expandedDetail.label}</dd></div>}
                            {expandedDetail.mileage !== null && <div><dt>Mileage</dt><dd>{expandedDetail.mileage.toLocaleString("en-GB")} mi</dd></div>}
                            {expandedDetail.cost !== null && <div><dt>Total cost</dt><dd>{formatGBP(expandedDetail.cost)}</dd></div>}
                            {expandedDetail.garage && <div><dt>Garage</dt><dd>{expandedDetail.garage}</dd></div>}
                            {expandedDetail.supplier && <div><dt>Supplier</dt><dd>{expandedDetail.supplier}</dd></div>}
                            {expandedDetail.notes && <div><dt>Notes</dt><dd>{expandedDetail.notes}</dd></div>}
                            {expandedDetail.next_due_date && <div><dt>Next due</dt><dd>{formatDate(expandedDetail.next_due_date)}</dd></div>}
                            {expandedDetail.next_due_mileage !== null && <div><dt>Next due mileage</dt><dd>{expandedDetail.next_due_mileage.toLocaleString("en-GB")} mi</dd></div>}
                            {expandedDetail.warranty_expiry && <div><dt>Warranty expiry</dt><dd>{formatDate(expandedDetail.warranty_expiry)}</dd></div>}
                          </dl>

                          {/* Maintenance detail */}
                          {expandedDetail.maintenance && (
                            <div className="rec-detail-sub">
                              <p className="rec-detail-heading">Maintenance detail</p>
                              <dl className="rec-dl">
                                <div><dt>Category</dt><dd>{expandedDetail.maintenance.category}</dd></div>
                                {expandedDetail.maintenance.item && <div><dt>Item</dt><dd>{expandedDetail.maintenance.item}</dd></div>}
                                {expandedDetail.maintenance.part_number && <div><dt>Part number</dt><dd>{expandedDetail.maintenance.part_number}</dd></div>}
                                {expandedDetail.maintenance.labour_cost !== null && <div><dt>Labour</dt><dd>{formatGBP(expandedDetail.maintenance.labour_cost)}</dd></div>}
                                {expandedDetail.maintenance.parts_cost !== null && <div><dt>Parts</dt><dd>{formatGBP(expandedDetail.maintenance.parts_cost)}</dd></div>}
                              </dl>
                            </div>
                          )}

                          {/* Fuel detail */}
                          {expandedDetail.fuel && (
                            <div className="rec-detail-sub">
                              <p className="rec-detail-heading">Fuel detail</p>
                              <dl className="rec-dl">
                                <div><dt>Litres</dt><dd>{Number(expandedDetail.fuel.litres).toFixed(3)} L</dd></div>
                                <div><dt>Price per litre</dt><dd>{expandedDetail.fuel.price_per_litre}p</dd></div>
                                {expandedDetail.fuel.station && <div><dt>Station</dt><dd>{expandedDetail.fuel.station}</dd></div>}
                                <div><dt>Full tank</dt><dd>{expandedDetail.fuel.full_tank ? "Yes" : "No"}</dd></div>
                              </dl>
                            </div>
                          )}

                          {/* Diagnostic detail */}
                          {expandedDetail.diagnostic && (
                            <div className="rec-detail-sub">
                              <p className="rec-detail-heading">Diagnostic detail</p>
                              <dl className="rec-dl">
                                <div><dt>Inspection</dt><dd>{expandedDetail.diagnostic.inspection_type === "self" ? "Self" : "Garage"}</dd></div>
                                {expandedDetail.diagnostic.findings && <div><dt>Findings</dt><dd>{expandedDetail.diagnostic.findings}</dd></div>}
                                {expandedDetail.diagnostic.labour_cost !== null && <div><dt>Labour</dt><dd>{formatGBP(expandedDetail.diagnostic.labour_cost)}</dd></div>}
                                {expandedDetail.diagnostic.parts_cost !== null && <div><dt>Parts</dt><dd>{formatGBP(expandedDetail.diagnostic.parts_cost)}</dd></div>}
                              </dl>
                            </div>
                          )}

                          {/* Diagnostic fault codes */}
                          {expandedDetail.diagnostic_fault_codes && expandedDetail.diagnostic_fault_codes.length > 0 && (
                            <div className="rec-detail-sub">
                              <p className="rec-detail-heading">Fault codes</p>
                              <div className="diag-fc-draft-list">
                                {expandedDetail.diagnostic_fault_codes
                                  .slice()
                                  .sort((a, b) => a.sort_order - b.sort_order)
                                  .map((fc) => (
                                    <div key={fc.id} className="diag-fc-detail-row">
                                      <span className={`diag-sev-sm diag-sev-sm--${fc.severity}`}>{fc.severity === "amber" ? "Warning" : fc.severity === "red" ? "Urgent" : fc.severity}</span>
                                      <span className="diag-fc-draft-code">{fc.code ?? "—"}</span>
                                      <span className="diag-fc-draft-desc">{fc.description}</span>
                                      {fc.notes && <span className="diag-fc-draft-notes">{fc.notes}</span>}
                                      {fc.resolved_at && <span className="diag-fc-draft-resolved">Resolved {formatDate(fc.resolved_at)}</span>}
                                    </div>
                                  ))}
                              </div>
                            </div>
                          )}

                          {/* Tags */}
                          {expandedDetail.tags.length > 0 && (
                            <div className="rec-detail-sub">
                              <p className="rec-detail-heading">Tags</p>
                              <div className="rec-tags">
                                {expandedDetail.tags.map((tag) => (
                                  <span key={tag} className="rec-tag">{tag}</span>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* ~~~~~~~~~ Attachments ~~~~~~~~~ */}
                          <div className="rec-detail-sub">
                            <div className="rec-attach-head">
                              <p className="rec-detail-heading">Attachments</p>
                              {!showAttachForm && (
                                <button
                                  className="rec-attach-add"
                                  onClick={() => { setAttachError(null); setShowAttachForm(true); }}
                                  disabled={attachUploading}
                                >
                                  {attachUploading ? "Uploading…" : "+ Add file"}
                                </button>
                              )}
                            </div>
                            {showAttachForm && (
                              <div className="rec-attach-form">
                                <input
                                  type="text"
                                  className="rec-attach-kind-input"
                                  value={attachKind}
                                  onChange={(e) => setAttachKind(toTitleCase(e.target.value))}
                                  placeholder="Label"
                                  maxLength={32}
                                />
                                <button
                                  className="rec-attach-add"
                                  onClick={() => {
                                    if (!attachKind.trim()) { setAttachError("Enter a label first."); return; }
                                    setAttachError(null);
                                    attachInputRef.current?.click();
                                  }}
                                >
                                  Choose file
                                </button>
                                <button
                                  className="rec-attach-cancel"
                                  onClick={() => { setShowAttachForm(false); setAttachKind(""); }}
                                >
                                  Cancel
                                </button>
                              </div>
                            )}
                            <input
                              ref={attachInputRef}
                              type="file"
                              accept="image/jpeg,image/png,image/webp,image/heic,.pdf"
                              style={{ display: "none" }}
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) handleAttachUpload(f);
                                e.target.value = "";
                              }}
                            />
                            {attachError && <p className="rec-error" style={{ marginTop: "6px" }}>{attachError}</p>}
                            {expandedDetail.attachments.length === 0 && !attachUploading ? (
                              <p className="rec-attach-empty">No attachments. Upload invoices, photos or documents.</p>
                            ) : (
                              <div className="rec-attach-list">
                                {expandedDetail.attachments.map((a) => (
                                  <div key={a.id} className="rec-attach-row">
                                    <span className="rec-attach-kind">{a.kind}</span>
                                    <span className="rec-attach-name">{a.filename}</span>
                                    <span className="rec-attach-size">{(a.size_bytes / 1024).toFixed(0)} KB</span>
                                    <button
                                      className="sov-action-btn sov-action-btn--view"
                                      onClick={() => handleAttachView(a.id, a.filename)}
                                      disabled={viewLoadingAttach === a.id}
                                    >
                                      {viewLoadingAttach === a.id ? "…" : "View"}
                                    </button>
                                    <button
                                      className="sov-action-btn sov-action-btn--delete"
                                      onClick={() => handleAttachDelete(a.id)}
                                    >
                                      Delete
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Actions */}
                          <div className="rec-detail-actions">
                            <button
                              className="rec-btn rec-btn--danger-sm"
                              onClick={() => handleDelete(expandedDetail.id)}
                            >
                              Delete record
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <style>{REC_STYLES}</style>

      <ConfirmDeleteModal
        open={deleteTarget !== null}
        title={deleteTarget?.kind === "attachment" ? "Delete attachment" : "Delete record"}
        body={
          deleteTarget?.kind === "attachment"
            ? "This attachment will be permanently deleted from storage."
            : "This record and all its attached data will be permanently removed."
        }
        confirming={deleting}
        error={deleteError}
        onConfirm={confirmDelete}
        onCancel={() => { setDeleteTarget(null); setDeleteError(null); }}
      />

      {viewingAttach && (
        <DocViewerModal
          viewUrl={viewingAttach.url}
          filename={viewingAttach.filename}
          contentType={viewingAttach.contentType}
          onClose={handleAttachViewClose}
        />
      )}
    </div>
  );
}

// ==================================================
// STYLES — mirrors SovCorE QR card and list patterns
// ==================================================

const REC_STYLES = `
  .rec-shell { display: flex; flex-direction: column; gap: var(--space-5); max-width: 960px; }

  /* Header */
  .rec-head { display: flex; flex-direction: column; gap: var(--space-2); }
  .rec-head__row { display: flex; align-items: center; justify-content: space-between; gap: var(--space-4); }
  .rec-title { font-size: var(--text-2xl); letter-spacing: var(--tracking-tight); margin: 0; }
  .rec-sub { font-size: var(--text-sm); color: var(--colour-text-muted); max-width: 480px; margin: 4px 0 0; }

  /* Form */
  .rec-section-title { font-size: var(--text-md); font-weight: var(--weight-medium); margin-bottom: var(--space-5); }
  .rec-form { display: flex; flex-direction: column; gap: var(--space-4); }
  .rec-form-row { display: flex; gap: var(--space-4); flex-wrap: wrap; align-items: flex-end; }
  .rec-label { display: flex; flex-direction: column; gap: 6px; min-width: 140px; }
  /* Diagnostic fault code builder (add form) */
  .diag-fc-draft-list { display: flex; flex-direction: column; gap: 6px; margin-bottom: var(--space-2); }
  .diag-fc-draft-row { display: flex; align-items: center; gap: var(--space-3); padding: 6px 0; border-bottom: 0.5px solid var(--colour-border); }
  .diag-fc-draft-row:last-child { border-bottom: none; }
  .diag-fc-draft-code { font-size: var(--text-xs); font-family: monospace; color: var(--colour-text-muted); min-width: 60px; }
  .diag-fc-draft-desc { font-size: var(--text-sm); color: var(--colour-text); flex: 1; }
  .diag-fc-draft-notes { font-size: var(--text-xs); color: var(--colour-text-muted); }
  .diag-fc-draft-resolved { font-size: var(--text-xs); color: var(--colour-text-muted); }
  .diag-fc-mini-form { border: 0.5px solid var(--colour-border); border-radius: var(--radius-md); padding: var(--space-3); display: flex; flex-direction: column; gap: var(--space-3); margin-top: var(--space-2); background: rgba(255,255,255,0.02); }
  .diag-fc-detail-row { display: flex; align-items: baseline; gap: var(--space-3); padding: 4px 0; flex-wrap: wrap; }

  /* Inline field validation */
  .rec-field-error { font-size: var(--text-xs); color: var(--colour-error); margin-top: 2px; display: block; }
  .rec-input--error { border-color: var(--colour-error) !important; }

  /* Diagnostic severity small badges */
  .diag-sev-sm { font-size: 10px; font-weight: var(--weight-medium); border-radius: 99px; padding: 1px 7px; white-space: nowrap; border: 1px solid transparent; }
  .diag-sev-sm--advisory { background: rgba(255,255,255,0.06); color: var(--colour-text-muted); border-color: rgba(255,255,255,0.1); }
  .diag-sev-sm--amber { background: rgba(245,158,11,0.12); color: #f59e0b; border-color: rgba(245,158,11,0.25); }
  .diag-sev-sm--red { background: rgba(239,68,68,0.12); color: #ef4444; border-color: rgba(239,68,68,0.25); }
  .diag-sev-sm--resolved { background: rgba(255,255,255,0.04); color: var(--colour-text-muted); border-color: rgba(255,255,255,0.08); opacity: 0.6; }

  /* Responsive */
  @media (max-width: 767px) {
    .rec-head__row { flex-direction: column; align-items: flex-start; }
    .rec-form-row { flex-direction: column; }
    .rec-label, .rec-label--wide { width: 100%; min-width: unset; }
    .rec-dl > div { grid-template-columns: 1fr; gap: 2px; }
    .rec-row__location { max-width: 120px; }
  }
`;
