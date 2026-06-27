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
import { TextField, WholeNumberField } from "@/src/components/ui/input";
import { apiFetch, getAccountId } from "@/src/lib/api/fetch";
import { toAllCaps, toTitleCase } from "@/src/lib/text";

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
    if (!accountId) {
      setError("Session expired. Please sign out and sign back in.");
      return;
    }

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

    try {
      const res = await apiFetch(`/api/v1/accounts/${accountId}/vehicles`, {
        method: "POST",
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.detail ?? "Failed to add vehicle. Please try again.");
        return;
      }

      const created = await res.json();
      router.push(`/dashboard/vehicles/${created.id}`);
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
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

            <TextField
              label="Registration"
              value={form.registration}
              onChange={(e) => set("registration", toAllCaps(e.target.value))}
              placeholder="e.g. AB12 CDE"
              maxLength={8}
              autoFocus
              disabled={saving}
            />

            <TextField
              label="Make"
              value={form.make}
              onChange={(e) => set("make", toTitleCase(e.target.value))}
              placeholder="e.g. Volkswagen"
              maxLength={100}
              disabled={saving}
            />

            <TextField
              label="Model"
              value={form.model}
              onChange={(e) => set("model", toTitleCase(e.target.value))}
              placeholder="e.g. Golf"
              maxLength={100}
              disabled={saving}
            />

            <TextField
              label="Variant / trim"
              value={form.variant}
              onChange={(e) => set("variant", toTitleCase(e.target.value))}
              placeholder="e.g. GTI DSG"
              maxLength={100}
              disabled={saving}
            />

            <WholeNumberField
              label="Year"
              value={form.year}
              onChange={(v) => set("year", v)}
              placeholder="e.g. 2021"
              maxLength={4}
              disabled={saving}
            />

            <TextField
              label="Colour"
              value={form.colour}
              onChange={(e) => set("colour", toTitleCase(e.target.value))}
              placeholder="e.g. Moonstone Grey"
              maxLength={50}
              disabled={saving}
            />

            {/* ~~~~~~~~~ Body type select ~~~~~~~~~ */}
            <div className="sov-field">
              <label htmlFor="nv-body-type" className="sov-field__label">Body type</label>
              <div className="sov-input-wrap">
                <select
                  id="nv-body-type"
                  className="sov-field__control"
                  value={form.body_type}
                  onChange={(e) => set("body_type", e.target.value)}
                  disabled={saving}
                >
                  {BODY_TYPES.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* ~~~~~~~~~ Fuel type select ~~~~~~~~~ */}
            <div className="sov-field">
              <label htmlFor="nv-fuel-type" className="sov-field__label">Fuel type</label>
              <div className="sov-input-wrap">
                <select
                  id="nv-fuel-type"
                  className="sov-field__control"
                  value={form.fuel_type}
                  onChange={(e) => set("fuel_type", e.target.value)}
                  disabled={saving}
                >
                  {FUEL_TYPES.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* ~~~~~~~~~ Transmission select ~~~~~~~~~ */}
            <div className="sov-field">
              <label htmlFor="nv-transmission" className="sov-field__label">Transmission</label>
              <div className="sov-input-wrap">
                <select
                  id="nv-transmission"
                  className="sov-field__control"
                  value={form.transmission}
                  onChange={(e) => set("transmission", e.target.value)}
                  disabled={saving}
                >
                  {TRANSMISSION_TYPES.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <TextField
              label="Engine"
              value={form.engine}
              onChange={(e) => set("engine", toTitleCase(e.target.value))}
              placeholder="e.g. 2.0 TDI"
              maxLength={50}
              disabled={saving}
            />

            <WholeNumberField
              label="Current odometer"
              value={form.mileage}
              onChange={(v) => set("mileage", v)}
              placeholder="e.g. 34500"
              disabled={saving}
              maxLength={7}
            />

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
  .nv-shell { display: flex; flex-direction: column; gap: var(--space-6); max-width: 860px; margin: 0 auto; width: 100%; }
  .nv-head { margin-bottom: var(--space-2); }
  .nv-title { font-size: var(--text-2xl); letter-spacing: var(--tracking-tight); margin-bottom: 6px; }
  .nv-sub { color: var(--colour-text-muted); font-size: var(--text-sm); max-width: 560px; line-height: var(--leading-normal); }

  .nv-section { font-size: var(--text-md); margin-bottom: var(--space-5); letter-spacing: normal; }

  .nv-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: var(--space-4);
  }

  .nv-error { font-size: var(--text-sm); color: var(--colour-error); }

  .nv-actions { display: flex; gap: var(--space-3); margin-top: var(--space-6); }
  .nv-btn {
    position: relative; display: inline-flex; align-items: center; justify-content: center;
    padding: 9px 22px; border-radius: var(--radius-sm); font-size: var(--text-sm);
    font-family: var(--font-sans); font-weight: var(--weight-medium);
    border: 1px solid transparent; overflow: hidden; isolation: isolate; cursor: none;
    transition: transform var(--duration-normal) var(--ease-smooth), box-shadow var(--duration-normal) var(--ease-smooth), background var(--duration-normal) var(--ease-smooth), border-color var(--duration-normal) var(--ease-smooth);
  }
  .nv-btn--primary { background: linear-gradient(135deg, var(--colour-accent) 0%, var(--colour-accent-dim) 100%); color: #fff; box-shadow: var(--glow-accent); }
  .nv-btn--primary:hover:not(:disabled) { transform: translateY(-1px); box-shadow: var(--glow-accent-strong); }
  .nv-btn--primary::after { content: ""; position: absolute; top: 0; left: -120%; width: 60%; height: 100%; background: linear-gradient(90deg, transparent, rgba(255,255,255,0.25), transparent); transform: skewX(-20deg); pointer-events: none; }
  .nv-btn--primary:hover::after { animation: shineSweep 0.9s var(--ease-smooth); }
  .nv-btn--primary:disabled { opacity: 0.55; }
  .nv-btn--ghost { background: var(--colour-bg-2); border-color: var(--colour-border); color: var(--colour-text-muted); }
  .nv-btn--ghost:hover:not(:disabled) { border-color: var(--colour-border-active); background: var(--colour-bg-3); transform: translateY(-1px); color: var(--colour-text); }

  @media (max-width: 639px) {
    .nv-grid { grid-template-columns: 1fr; }
  }
`;
