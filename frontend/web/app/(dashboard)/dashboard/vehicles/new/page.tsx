// ============================================================
// frontend/web/app/(dashboard)/dashboard/vehicles/new/page.tsx
// ============================================================
//
// Purpose:
//   Add a vehicle form. Collects basic information (registration,
//   make, model, year, fuel type, body type, colour, mileage)
//   and POSTs to the vehicles API. On success, redirects to the
//   new vehicle's profile page.
//
// Design:
//   Mirrors SovCorE QR settings form style — inputs in a grid,
//   Card wrappers, same input and label CSS class names. Only
//   the required fields (registration or make+model) are
//   validated; all other fields are optional so the user can
//   add details incrementally on the profile page.
//
// Consumed by:
//   - Routed at /dashboard/vehicles/new
// ============================================================

"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Card } from "@/src/components/ui/card";
import { apiFetch, getAccountId } from "@/src/lib/api/fetch";

// ==================================================
// CONSTANTS
// ==================================================

const BODY_TYPES = [
  { value: "", label: "Select body type…" },
  { value: "hatchback", label: "Hatchback" },
  { value: "saloon", label: "Saloon" },
  { value: "estate", label: "Estate" },
  { value: "suv", label: "SUV" },
  { value: "convertible", label: "Convertible" },
  { value: "van", label: "Van" },
  { value: "mpv", label: "MPV" },
];

const FUEL_TYPES = [
  { value: "", label: "Select fuel type…" },
  { value: "petrol", label: "Petrol" },
  { value: "diesel", label: "Diesel" },
  { value: "electric", label: "Electric" },
  { value: "hybrid", label: "Full hybrid" },
  { value: "phev", label: "Plug-in hybrid (PHEV)" },
  { value: "mild_hybrid", label: "Mild hybrid" },
  { value: "hydrogen", label: "Hydrogen" },
];

const TRANSMISSION_TYPES = [
  { value: "", label: "Select transmission…" },
  { value: "manual", label: "Manual" },
  { value: "automatic", label: "Automatic" },
  { value: "semi_automatic", label: "Semi-automatic" },
  { value: "cvt", label: "CVT" },
];

// ==================================================
// PAGE
// ==================================================

interface FormState {
  registration: string;
  make: string;
  model: string;
  variant: string;
  year: string;
  colour: string;
  body_type: string;
  fuel_type: string;
  transmission: string;
  mileage: string;
  engine: string;
}

export default function NewVehiclePage() {
  const router = useRouter();
  const [form, setForm] = useState<FormState>({
    registration: "",
    make: "",
    model: "",
    variant: "",
    year: "",
    colour: "",
    body_type: "",
    fuel_type: "",
    transmission: "",
    mileage: "",
    engine: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set(field: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const accountId = getAccountId();
    if (!accountId) return;

    if (!form.registration.trim() && !(form.make.trim() && form.model.trim())) {
      setError("Enter a registration number, or at least the make and model.");
      return;
    }

    setSaving(true);
    setError(null);

    const payload: Record<string, string | number | null> = {
      registration: form.registration.trim().toUpperCase() || null,
      make: form.make.trim() || null,
      model: form.model.trim() || null,
      variant: form.variant.trim() || null,
      year: form.year ? parseInt(form.year, 10) : null,
      colour: form.colour.trim() || null,
      body_type: form.body_type || null,
      fuel_type: form.fuel_type || null,
      transmission: form.transmission || null,
      mileage: form.mileage ? parseInt(form.mileage, 10) : null,
      engine: form.engine.trim() || null,
    };

    const res = await apiFetch(`/api/v1/accounts/${accountId}/vehicles`, {
      method: "POST",
      body: JSON.stringify(payload),
    });

    setSaving(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.detail ?? "Failed to add vehicle. Please try again.");
      return;
    }

    const created = await res.json();
    router.push(`/dashboard/vehicles/${created.id}`);
  }

  return (
    <div className="nv-shell">
      <header className="nv-head">
        <h1 className="nv-title">Add a vehicle</h1>
        <p className="nv-sub">
          Enter the details you have. Every field is optional except a
          registration number or at least the make and model.
        </p>
      </header>

      <form onSubmit={handleSubmit} noValidate>
        {/* ~~~~~~~~~ Basic information ~~~~~~~~~ */}
        <Card>
          <h2 className="nv-section">Basic information</h2>
          <div className="nv-grid">

            <label className="nv-label">
              <span className="nv-label__text">Registration</span>
              <input
                className="nv-input"
                value={form.registration}
                onChange={(e) => set("registration", e.target.value)}
                placeholder="e.g. AB12 CDE"
                maxLength={8}
                autoFocus
              />
            </label>

            <label className="nv-label">
              <span className="nv-label__text">Make</span>
              <input
                className="nv-input"
                value={form.make}
                onChange={(e) => set("make", e.target.value)}
                placeholder="e.g. Volkswagen"
                maxLength={100}
              />
            </label>

            <label className="nv-label">
              <span className="nv-label__text">Model</span>
              <input
                className="nv-input"
                value={form.model}
                onChange={(e) => set("model", e.target.value)}
                placeholder="e.g. Golf"
                maxLength={100}
              />
            </label>

            <label className="nv-label">
              <span className="nv-label__text">Variant / trim</span>
              <input
                className="nv-input"
                value={form.variant}
                onChange={(e) => set("variant", e.target.value)}
                placeholder="e.g. GTI DSG"
                maxLength={100}
              />
            </label>

            <label className="nv-label">
              <span className="nv-label__text">Year</span>
              <input
                className="nv-input"
                type="number"
                value={form.year}
                onChange={(e) => set("year", e.target.value)}
                placeholder="e.g. 2021"
                min="1900"
                max={new Date().getFullYear() + 2}
              />
            </label>

            <label className="nv-label">
              <span className="nv-label__text">Colour</span>
              <input
                className="nv-input"
                value={form.colour}
                onChange={(e) => set("colour", e.target.value)}
                placeholder="e.g. Moonstone Grey"
                maxLength={50}
              />
            </label>

            <label className="nv-label">
              <span className="nv-label__text">Body type</span>
              <select
                className="nv-input"
                value={form.body_type}
                onChange={(e) => set("body_type", e.target.value)}
              >
                {BODY_TYPES.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>

            <label className="nv-label">
              <span className="nv-label__text">Fuel type</span>
              <select
                className="nv-input"
                value={form.fuel_type}
                onChange={(e) => set("fuel_type", e.target.value)}
              >
                {FUEL_TYPES.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>

            <label className="nv-label">
              <span className="nv-label__text">Transmission</span>
              <select
                className="nv-input"
                value={form.transmission}
                onChange={(e) => set("transmission", e.target.value)}
              >
                {TRANSMISSION_TYPES.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>

            <label className="nv-label">
              <span className="nv-label__text">Engine</span>
              <input
                className="nv-input"
                value={form.engine}
                onChange={(e) => set("engine", e.target.value)}
                placeholder="e.g. 2.0 TDI"
                maxLength={50}
              />
            </label>

            <label className="nv-label">
              <span className="nv-label__text">Current mileage</span>
              <input
                className="nv-input"
                type="number"
                value={form.mileage}
                onChange={(e) => set("mileage", e.target.value)}
                placeholder="e.g. 34500"
                min="0"
              />
            </label>

          </div>
        </Card>

        {/* ~~~~~~~~~ Actions ~~~~~~~~~ */}
        {error && <p className="nv-error">{error}</p>}
        <div className="nv-actions">
          <button type="submit" className="nv-btn nv-btn--primary" disabled={saving}>
            {saving ? "Adding…" : "Add vehicle"}
          </button>
          <button
            type="button"
            className="nv-btn nv-btn--ghost"
            onClick={() => router.push("/dashboard/vehicles")}
          >
            Cancel
          </button>
        </div>
      </form>

      <style>{NV_STYLES}</style>
    </div>
  );
}

// ==================================================
// STYLES
// ==================================================

const NV_STYLES = `
  .nv-shell { display: flex; flex-direction: column; gap: var(--space-6); max-width: 860px; }
  .nv-head { margin-bottom: var(--space-2); }
  .nv-title { font-size: var(--text-2xl); letter-spacing: var(--tracking-tight); margin-bottom: 6px; }
  .nv-sub { color: var(--colour-text-muted); font-size: var(--text-sm); max-width: 560px; line-height: var(--leading-normal); }

  .nv-section { font-size: var(--text-md); margin-bottom: var(--space-5); }

  .nv-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: var(--space-4);
  }

  .nv-label { display: flex; flex-direction: column; gap: 6px; }
  .nv-label__text { font-size: var(--text-sm); color: var(--colour-text-muted); }
  .nv-input {
    background: var(--colour-bg);
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-sm);
    padding: 8px 12px;
    font-size: var(--text-sm);
    color: var(--colour-text);
    outline: none;
    transition: border-color 0.2s;
    width: 100%;
  }
  .nv-input:focus { border-color: var(--colour-accent); }

  .nv-error { font-size: var(--text-sm); color: var(--colour-error); }

  .nv-actions { display: flex; gap: var(--space-3); }
  .nv-btn { padding: 9px 22px; border-radius: var(--radius-sm); font-size: var(--text-sm); cursor: none; border: none; transition: opacity 0.2s, background 0.2s; }
  .nv-btn--primary { background: var(--colour-accent); color: #fff; }
  .nv-btn--primary:disabled { opacity: 0.55; }
  .nv-btn--ghost { background: none; border: 1px solid var(--colour-border); color: var(--colour-text-muted); }
  .nv-btn--ghost:hover { color: var(--colour-text); border-color: var(--colour-text-muted); }

  @media (max-width: 639px) {
    .nv-grid { grid-template-columns: 1fr; }
  }
`;
