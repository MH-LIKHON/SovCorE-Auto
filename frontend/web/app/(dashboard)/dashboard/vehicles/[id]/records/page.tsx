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
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Card } from "@/src/components/ui/card";
import { RecordTypeBadge } from "@/src/components/records/record-type-badge";
import { apiFetch, getAccountId } from "@/src/lib/api/fetch";

// ==================================================
// TYPES
// ==================================================

interface RecordListItem {
  id: string;
  vehicle_id: string;
  type: string;
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
}

interface RecordPage {
  items: RecordListItem[];
  total: number;
  page: number;
  page_size: number;
}

type RecordTypeValue =
  | "maintenance" | "repair" | "fuel" | "mot" | "tax" | "insurance"
  | "parking" | "pcn" | "cleaning" | "accessories" | "warranty"
  | "diagnostics" | "damage" | "custom";

// ==================================================
// CONSTANTS
// ==================================================

const RECORD_TYPES: { value: RecordTypeValue; label: string }[] = [
  { value: "maintenance",  label: "Maintenance" },
  { value: "repair",       label: "Repair" },
  { value: "fuel",         label: "Fuel" },
  { value: "mot",          label: "MOT" },
  { value: "tax",          label: "Tax" },
  { value: "insurance",    label: "Insurance" },
  { value: "parking",      label: "Parking" },
  { value: "pcn",          label: "PCN" },
  { value: "cleaning",     label: "Cleaning" },
  { value: "accessories",  label: "Accessories" },
  { value: "warranty",     label: "Warranty" },
  { value: "diagnostics",  label: "Diagnostics" },
  { value: "damage",       label: "Damage" },
  { value: "custom",       label: "Custom" },
];

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

function formatDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function formatGBP(pence: number | null): string {
  if (pence === null) return "—";
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(pence / 100);
}

function locationText(supplier: string | null, garage: string | null): string {
  return garage || supplier || "—";
}

// ==================================================
// EMPTY FORM STATE
// ==================================================

interface AddForm {
  type: RecordTypeValue;
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
}

const EMPTY_FORM: AddForm = {
  type:                "maintenance",
  date:                new Date().toISOString().split("T")[0],
  mileage:             "",
  cost:                "",
  supplier:            "",
  garage:              "",
  notes:               "",
  maint_category:      "engine",
  maint_item:          "",
  maint_part_number:   "",
  maint_labour_cost:   "",
  maint_parts_cost:    "",
  fuel_litres:         "",
  fuel_price_per_litre:"",
  fuel_station:        "",
  fuel_full_tank:      true,
};

// ==================================================
// PAGE
// ==================================================

export default function VehicleRecordsPage() {
  const { id } = useParams<{ id: string }>();
  const accountId = getAccountId() ?? "";

  const [records, setRecords] = useState<RecordListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedDetail, setExpandedDetail] = useState<RecordDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<AddForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Attachment upload
  const attachInputRef = useRef<HTMLInputElement | null>(null);
  const [attachUploading, setAttachUploading] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [deletingAttachId, setDeletingAttachId] = useState<string | null>(null);

  // ==================================================
  // DATA LOADING
  // ==================================================

  async function loadRecords(filterType = typeFilter) {
    if (!accountId || !id) return;
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

  useEffect(() => { loadRecords(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  // ==================================================
  // ADD RECORD FORM
  // ==================================================

  function handleFormChange<K extends keyof AddForm>(field: K, value: AddForm[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setSaveError(null);
  }

  function buildPayload() {
    const isMaint = form.type === "maintenance" || form.type === "repair";
    const isFuel  = form.type === "fuel";

    const body: Record<string, unknown> = {
      type:     form.type,
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

    return body;
  }

  async function handleAddRecord() {
    if (!form.date) { setSaveError("Date is required."); return; }
    if (form.type === "fuel" && !form.fuel_litres) { setSaveError("Litres is required for a fuel record."); return; }
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
      setShowForm(false);
      setForm(EMPTY_FORM);
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

  async function handleDelete(recordId: string) {
    if (!window.confirm("Delete this record? This cannot be undone.")) return;
    setDeletingId(recordId);
    await apiFetch(
      `/api/v1/accounts/${accountId}/records/${recordId}?vehicle_id=${id}`,
      { method: "DELETE" }
    );
    setDeletingId(null);
    setExpandedId(null);
    setExpandedDetail(null);
    setRecords((prev) => prev.filter((r) => r.id !== recordId));
    setTotal((prev) => prev - 1);
  }

  // ==================================================
  // ATTACHMENT UPLOAD / DELETE
  // ==================================================

  function kindFromFile(file: File): string {
    if (file.type.startsWith("image/")) return "photo";
    if (file.type === "application/pdf") return "invoice";
    return "document";
  }

  async function handleAttachUpload(file: File) {
    if (!expandedDetail || !accountId) return;
    setAttachUploading(true);
    setAttachError(null);
    const kind = kindFromFile(file);
    try {
      const signRes = await apiFetch(
        `/api/v1/accounts/${accountId}/vehicles/${id}/records/${expandedDetail.id}/attachments/sign`,
        {
          method: "POST",
          body: JSON.stringify({ kind, filename: file.name, content_type: file.type, size_bytes: file.size }),
        }
      );
      if (!signRes.ok) { setAttachError("Could not generate upload URL."); return; }
      const { upload_url, key } = await signRes.json();
      const putRes = await fetch(upload_url, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!putRes.ok) { setAttachError("Upload to storage failed."); return; }
      const createRes = await apiFetch(
        `/api/v1/accounts/${accountId}/vehicles/${id}/records/${expandedDetail.id}/attachments`,
        {
          method: "POST",
          body: JSON.stringify({ kind, r2_key: key, filename: file.name, content_type: file.type, size_bytes: file.size }),
        }
      );
      if (!createRes.ok) { setAttachError("Could not register attachment."); return; }
      await loadDetail(expandedDetail.id);
    } catch {
      setAttachError("An unexpected error occurred.");
    } finally {
      setAttachUploading(false);
    }
  }

  async function handleAttachDelete(attachmentId: string) {
    if (!window.confirm("Delete this attachment? This cannot be undone.")) return;
    setDeletingAttachId(attachmentId);
    const res = await apiFetch(
      `/api/v1/accounts/${accountId}/attachments/${attachmentId}`,
      { method: "DELETE" }
    );
    setDeletingAttachId(null);
    if (res.ok && expandedDetail) {
      await loadDetail(expandedDetail.id);
    }
  }

  // ==================================================
  // RENDER HELPERS
  // ==================================================

  const isMaintForm = form.type === "maintenance" || form.type === "repair";
  const isFuelForm  = form.type === "fuel";

  // ==================================================
  // RENDER
  // ==================================================

  return (
    <div className="rec-shell">
      {/* ---- Header ---- */}
      <header className="rec-head">
        <Link href={`/dashboard/vehicles/${id}`} className="rec-back">← Vehicle</Link>
        <div className="rec-head__row">
          <div>
            <h1 className="rec-title">Records</h1>
            <p className="rec-sub">Every action taken on this vehicle, all in one place.</p>
          </div>
          <button className="rec-btn rec-btn--primary" onClick={() => { setShowForm(!showForm); setSaveError(null); }}>
            {showForm ? "Cancel" : "Add record"}
          </button>
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
                <select className="rec-select" value={form.type} onChange={(e) => handleFormChange("type", e.target.value as RecordTypeValue)} disabled={saving}>
                  {RECORD_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </label>
              <label className="rec-label">
                <span className="rec-label__text">Date</span>
                <input className="rec-input" type="date" value={form.date} onChange={(e) => handleFormChange("date", e.target.value)} disabled={saving} />
              </label>
              <label className="rec-label">
                <span className="rec-label__text">Mileage</span>
                <input className="rec-input" type="number" placeholder="e.g. 52000" value={form.mileage} onChange={(e) => handleFormChange("mileage", e.target.value)} disabled={saving} />
              </label>
              <label className="rec-label">
                <span className="rec-label__text">Total cost (£)</span>
                <input className="rec-input" type="number" step="0.01" placeholder="e.g. 149.99" value={form.cost} onChange={(e) => handleFormChange("cost", e.target.value)} disabled={saving} />
              </label>
            </div>

            {/* Location row */}
            <div className="rec-form-row">
              <label className="rec-label rec-label--wide">
                <span className="rec-label__text">Garage</span>
                <input className="rec-input" type="text" placeholder="e.g. Kwik Fit" value={form.garage} onChange={(e) => handleFormChange("garage", e.target.value)} disabled={saving} />
              </label>
              <label className="rec-label rec-label--wide">
                <span className="rec-label__text">Supplier</span>
                <input className="rec-input" type="text" placeholder="e.g. Halfords" value={form.supplier} onChange={(e) => handleFormChange("supplier", e.target.value)} disabled={saving} />
              </label>
            </div>

            {/* Notes */}
            <label className="rec-label rec-label--full">
              <span className="rec-label__text">Notes</span>
              <textarea className="rec-textarea" rows={2} placeholder="Any additional notes…" value={form.notes} onChange={(e) => handleFormChange("notes", e.target.value)} disabled={saving} />
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
                    <input className="rec-input" type="text" placeholder="e.g. Front brake pads" value={form.maint_item} onChange={(e) => handleFormChange("maint_item", e.target.value)} disabled={saving} />
                  </label>
                  <label className="rec-label">
                    <span className="rec-label__text">Part number</span>
                    <input className="rec-input" type="text" placeholder="Optional" value={form.maint_part_number} onChange={(e) => handleFormChange("maint_part_number", e.target.value)} disabled={saving} />
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
                    <input className="rec-input" type="text" placeholder="e.g. Shell Motorway Services" value={form.fuel_station} onChange={(e) => handleFormChange("fuel_station", e.target.value)} disabled={saving} />
                  </label>
                  <label className="rec-label rec-label--check">
                    <span className="rec-label__text">Full tank</span>
                    <input type="checkbox" checked={form.fuel_full_tank} onChange={(e) => handleFormChange("fuel_full_tank", e.target.checked)} disabled={saving} />
                  </label>
                </div>
              </div>
            )}

            {/* Actions */}
            {saveError && <p className="rec-error">{saveError}</p>}
            <div className="rec-form-actions">
              <button className="rec-btn rec-btn--primary" onClick={handleAddRecord} disabled={saving}>
                {saving ? "Saving…" : "Save record"}
              </button>
              <button className="rec-btn rec-btn--ghost" onClick={() => { setShowForm(false); setForm(EMPTY_FORM); setSaveError(null); }} disabled={saving}>
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
          <span className="rec-count">{total} record{total !== 1 ? "s" : ""}</span>
        </div>

        {loading ? (
          <div className="rec-skeleton" />
        ) : records.length === 0 ? (
          <div className="rec-empty">
            <p>No records yet.</p>
            <button className="rec-btn rec-btn--primary" onClick={() => setShowForm(true)}>Add your first record</button>
          </div>
        ) : (
          <div className="rec-rows">
            {records.map((rec) => (
              <div key={rec.id}>
                {/* ---- Summary row ---- */}
                <button
                  className="rec-row"
                  onClick={() => handleRowClick(rec.id)}
                  aria-expanded={expandedId === rec.id}
                >
                  <div className="rec-row__left">
                    <RecordTypeBadge type={rec.type} />
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
                            <button
                              className="rec-attach-add"
                              onClick={() => { setAttachError(null); attachInputRef.current?.click(); }}
                              disabled={attachUploading}
                            >
                              {attachUploading ? "Uploading…" : "+ Add file"}
                            </button>
                          </div>
                          <input
                            ref={attachInputRef}
                            type="file"
                            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
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
                                    className="rec-btn rec-btn--danger-sm"
                                    onClick={() => handleAttachDelete(a.id)}
                                    disabled={deletingAttachId === a.id}
                                  >
                                    {deletingAttachId === a.id ? "…" : "Delete"}
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
                            disabled={deletingId === expandedDetail.id}
                          >
                            {deletingId === expandedDetail.id ? "Deleting…" : "Delete record"}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      <style>{REC_STYLES}</style>
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
  .rec-back { font-size: var(--text-sm); color: var(--colour-text-muted); text-decoration: none; }
  .rec-back:hover { color: var(--colour-text); }
  .rec-head__row { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--space-4); flex-wrap: wrap; }
  .rec-title { font-size: var(--text-2xl); letter-spacing: var(--tracking-tight); margin: 0; }
  .rec-sub { font-size: var(--text-sm); color: var(--colour-text-muted); max-width: 480px; margin: 4px 0 0; }

  /* Form */
  .rec-section-title { font-size: var(--text-md); font-weight: var(--weight-medium); margin-bottom: var(--space-5); }
  .rec-form { display: flex; flex-direction: column; gap: var(--space-4); }
  .rec-form-row { display: flex; gap: var(--space-4); flex-wrap: wrap; align-items: flex-end; }
  .rec-label { display: flex; flex-direction: column; gap: 6px; min-width: 140px; }
  .rec-label--wide { flex: 1; min-width: 200px; }
  .rec-label--full { width: 100%; }
  .rec-label--check { min-width: auto; flex-direction: row; align-items: center; gap: var(--space-2); padding-bottom: 8px; }
  .rec-label__text { font-size: var(--text-sm); color: var(--colour-text-muted); }
  .rec-input, .rec-select, .rec-textarea {
    background: var(--colour-bg);
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-sm);
    padding: 8px 12px;
    font-size: var(--text-sm);
    color: var(--colour-text);
    outline: none;
    transition: border-color 0.2s;
    cursor: none;
  }
  .rec-input:focus, .rec-select:focus, .rec-textarea:focus { border-color: var(--colour-accent); }
  .rec-textarea { resize: vertical; width: 100%; }
  .rec-detail-block { border: 0.5px solid var(--colour-border); border-radius: var(--radius-md); padding: var(--space-4); display: flex; flex-direction: column; gap: var(--space-4); }
  .rec-detail-heading { font-size: var(--text-xs); font-weight: var(--weight-medium); color: var(--colour-text-muted); text-transform: uppercase; letter-spacing: 0.07em; margin: 0 0 var(--space-2); }
  .rec-form-actions { display: flex; gap: var(--space-3); margin-top: var(--space-2); }
  .rec-error { font-size: var(--text-sm); color: var(--colour-error); }

  /* Filter chips */
  .rec-filter-row { display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap; }
  .rec-filter-label { font-size: var(--text-sm); color: var(--colour-text-muted); white-space: nowrap; }
  .rec-filter-chips { display: flex; gap: var(--space-2); flex-wrap: wrap; }
  .rec-chip {
    padding: 4px 12px;
    border-radius: var(--radius-full, 999px);
    font-size: var(--text-xs);
    border: 1px solid var(--colour-border);
    background: none;
    color: var(--colour-text-muted);
    cursor: none;
    transition: background 0.2s, color 0.2s, border-color 0.2s;
  }
  .rec-chip:hover { color: var(--colour-text); border-color: var(--colour-accent); }
  .rec-chip--active { background: rgba(108,99,255,0.12); color: var(--colour-text); border-color: var(--colour-accent); }

  /* List */
  .rec-list-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-4); }
  .rec-count { font-size: var(--text-sm); color: var(--colour-text-muted); }
  .rec-rows { display: flex; flex-direction: column; }
  .rec-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    border-bottom: 0.5px solid var(--colour-border);
    background: none;
    border-left: none;
    border-right: none;
    border-top: none;
    width: 100%;
    text-align: left;
    cursor: none;
    transition: background 0.15s;
  }
  .rec-row:last-of-type { border-bottom: none; }
  .rec-row:hover { background: rgba(108,99,255,0.04); }
  .rec-row__left { display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap; min-width: 0; }
  .rec-row__right { display: flex; align-items: center; gap: var(--space-3); flex-shrink: 0; }
  .rec-row__date { font-size: var(--text-sm); color: var(--colour-text-muted); white-space: nowrap; }
  .rec-row__location { font-size: var(--text-sm); color: var(--colour-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 200px; }
  .rec-row__cost { font-size: var(--text-sm); font-weight: var(--weight-medium); color: var(--colour-text); white-space: nowrap; }
  .rec-row__chevron { font-size: 10px; color: var(--colour-text-muted); }

  /* Expanded detail */
  .rec-detail {
    padding: var(--space-4) var(--space-5);
    background: rgba(108,99,255,0.03);
    border-bottom: 0.5px solid var(--colour-border);
  }
  .rec-detail-skeleton { height: 80px; background: rgba(255,255,255,0.04); border-radius: var(--radius-md); animation: shimmer 1.6s infinite; }
  @keyframes shimmer { 0% { opacity: 0.6; } 50% { opacity: 1; } 100% { opacity: 0.6; } }

  .rec-dl { display: flex; flex-direction: column; gap: var(--space-2); margin: 0; }
  .rec-dl > div { display: grid; grid-template-columns: 180px 1fr; gap: var(--space-3); }
  .rec-dl dt { font-size: var(--text-sm); color: var(--colour-text-muted); }
  .rec-dl dd { font-size: var(--text-sm); color: var(--colour-text); margin: 0; }
  .rec-detail-sub { margin-top: var(--space-4); padding-top: var(--space-4); border-top: 0.5px solid var(--colour-border); }

  .rec-tags { display: flex; flex-wrap: wrap; gap: var(--space-2); }
  .rec-tag { padding: 2px 10px; border-radius: var(--radius-full, 999px); font-size: var(--text-xs); background: rgba(255,255,255,0.06); color: var(--colour-text-muted); border: 1px solid var(--colour-border); }

  .rec-detail-actions { margin-top: var(--space-4); display: flex; gap: var(--space-3); }

  /* Attachments */
  .rec-attach-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-3); }
  .rec-attach-add {
    font-size: var(--text-xs);
    color: var(--colour-accent);
    background: none;
    border: none;
    padding: 0;
    cursor: none;
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  .rec-attach-add:disabled { opacity: 0.5; }
  .rec-attach-empty { font-size: var(--text-sm); color: var(--colour-text-muted); margin: 0; }
  .rec-attach-list { display: flex; flex-direction: column; gap: 6px; }
  .rec-attach-row {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: 6px 0;
    border-bottom: 0.5px solid var(--colour-border);
    flex-wrap: wrap;
  }
  .rec-attach-row:last-child { border-bottom: none; }
  .rec-attach-kind {
    font-size: var(--text-xs);
    color: var(--colour-text-muted);
    background: rgba(255,255,255,0.04);
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-full, 999px);
    padding: 1px 8px;
    text-transform: capitalize;
    white-space: nowrap;
  }
  .rec-attach-name { font-size: var(--text-sm); color: var(--colour-text); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .rec-attach-size { font-size: var(--text-xs); color: var(--colour-text-muted); white-space: nowrap; }

  /* Buttons */
  .rec-btn { padding: 8px 18px; border-radius: var(--radius-sm); font-size: var(--text-sm); cursor: none; border: none; transition: opacity 0.2s, background 0.2s, color 0.2s; }
  .rec-btn--primary { background: var(--colour-accent); color: #fff; }
  .rec-btn--primary:disabled { opacity: 0.55; }
  .rec-btn--ghost { background: none; border: 1px solid var(--colour-border); color: var(--colour-text-muted); }
  .rec-btn--ghost:hover { color: var(--colour-text); }
  .rec-btn--danger-sm { background: none; border: 1px solid var(--colour-error); color: var(--colour-error); padding: 5px 14px; font-size: var(--text-xs); border-radius: var(--radius-sm); cursor: none; transition: background 0.2s; }
  .rec-btn--danger-sm:hover { background: rgba(239,68,68,0.1); }
  .rec-btn--danger-sm:disabled { opacity: 0.55; }

  /* Empty state */
  .rec-empty { display: flex; flex-direction: column; align-items: center; gap: var(--space-4); padding: var(--space-8) 0; }
  .rec-empty p { font-size: var(--text-sm); color: var(--colour-text-muted); }

  /* Skeleton */
  .rec-skeleton { height: 160px; background: rgba(255,255,255,0.04); border-radius: var(--radius-md); animation: shimmer 1.6s infinite; }

  /* Responsive */
  @media (max-width: 767px) {
    .rec-head__row { flex-direction: column; align-items: flex-start; }
    .rec-form-row { flex-direction: column; }
    .rec-label, .rec-label--wide { width: 100%; min-width: unset; }
    .rec-dl > div { grid-template-columns: 1fr; gap: 2px; }
    .rec-row__location { max-width: 120px; }
  }
`;
