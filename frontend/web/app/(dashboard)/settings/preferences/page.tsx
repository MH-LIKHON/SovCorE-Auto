// ============================================================
// frontend/web/app/(dashboard)/settings/preferences/page.tsx
// ============================================================
//
// Purpose:
//   Account preferences page. Lets editors, admins and owners
//   choose the units used throughout the dashboard — distance
//   (miles or kilometres), volume (litres or gallons), fuel
//   economy (mpg or l/100km), and currency.
//
// Design:
//   Each selector saves immediately on change (no save button
//   needed — selections are unambiguous). An inline "Saved"
//   confirmation appears next to the changed field for 2 s.
//
// Consumed by:
//   - Routed at /dashboard/settings/preferences
// ============================================================

"use client";

import { useEffect, useState } from "react";

import { Card } from "@/src/components/ui/card";

// ==================================================
// TYPES
// ==================================================

interface Preferences {
  distance_unit: "miles" | "kilometres";
  volume_unit: "litres" | "gallons";
  economy_unit: "mpg" | "l_per_100km";
  currency: string;
}

// ==================================================
// HELPERS
// ==================================================

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

async function apiFetch(path: string, opts: RequestInit = {}) {
  const token = sessionStorage.getItem("sva_access");
  return fetch(`${API}${path}`, {
    ...opts,
    credentials: "include",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...opts.headers },
  });
}

// ==================================================
// PAGE
// ==================================================

export default function PreferencesPage() {
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [saved, setSaved] = useState<keyof Preferences | null>(null);
  const [error, setError] = useState<string | null>(null);

  const accountId = typeof window !== "undefined" ? sessionStorage.getItem("sva_account_id") : null;

  useEffect(() => {
    if (!accountId) return;
    apiFetch(`/api/v1/accounts/${accountId}/preferences`)
      .then((r) => r.json())
      .then((data) => setPrefs(data));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function save(field: keyof Preferences, value: string) {
    if (!accountId || !prefs) return;
    setError(null);
    const res = await apiFetch(`/api/v1/accounts/${accountId}/preferences`, {
      method: "PATCH",
      body: JSON.stringify({ [field]: value }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.detail ?? "Failed to save.");
      return;
    }
    const updated = await res.json();
    setPrefs(updated);
    setSaved(field);
    setTimeout(() => setSaved(null), 2000);
  }

  return (
    <div className="set-shell">
      <header className="set-head">
        <h1 className="set-title">Preferences</h1>
        <p className="set-sub">Choose the units and currency shown across the dashboard.</p>
      </header>

      <Card>
        <h2 className="set-section">Display units</h2>

        {!prefs ? (
          <p className="set-muted">Loading…</p>
        ) : (
          <div className="pref-list">

            {/* ---------- Distance ---------- */}
            <div className="pref-row">
              <div className="pref-meta">
                <span className="pref-label">Distance</span>
                <span className="pref-desc">Used for mileage entries and trip records.</span>
              </div>
              <div className="pref-control">
                <select
                  className="pref-select"
                  value={prefs.distance_unit}
                  onChange={(e) => save("distance_unit", e.target.value)}
                >
                  <option value="miles">Miles</option>
                  <option value="kilometres">Kilometres</option>
                </select>
                {saved === "distance_unit" && <span className="pref-saved">Saved</span>}
              </div>
            </div>

            {/* ---------- Volume ---------- */}
            <div className="pref-row">
              <div className="pref-meta">
                <span className="pref-label">Volume</span>
                <span className="pref-desc">Used for fuel quantities.</span>
              </div>
              <div className="pref-control">
                <select
                  className="pref-select"
                  value={prefs.volume_unit}
                  onChange={(e) => save("volume_unit", e.target.value)}
                >
                  <option value="litres">Litres</option>
                  <option value="gallons">Gallons</option>
                </select>
                {saved === "volume_unit" && <span className="pref-saved">Saved</span>}
              </div>
            </div>

            {/* ---------- Economy ---------- */}
            <div className="pref-row">
              <div className="pref-meta">
                <span className="pref-label">Fuel economy</span>
                <span className="pref-desc">Used in fuel analytics and cost-per-mile reports.</span>
              </div>
              <div className="pref-control">
                <select
                  className="pref-select"
                  value={prefs.economy_unit}
                  onChange={(e) => save("economy_unit", e.target.value)}
                >
                  <option value="mpg">MPG (miles per gallon)</option>
                  <option value="l_per_100km">l/100 km</option>
                </select>
                {saved === "economy_unit" && <span className="pref-saved">Saved</span>}
              </div>
            </div>

            {/* ---------- Currency ---------- */}
            <div className="pref-row">
              <div className="pref-meta">
                <span className="pref-label">Currency</span>
                <span className="pref-desc">ISO 4217 code — used for expense and cost displays.</span>
              </div>
              <div className="pref-control">
                <select
                  className="pref-select"
                  value={prefs.currency}
                  onChange={(e) => save("currency", e.target.value)}
                >
                  <option value="GBP">GBP — British Pound</option>
                  <option value="EUR">EUR — Euro</option>
                  <option value="USD">USD — US Dollar</option>
                  <option value="CAD">CAD — Canadian Dollar</option>
                  <option value="AUD">AUD — Australian Dollar</option>
                  <option value="NZD">NZD — New Zealand Dollar</option>
                  <option value="CHF">CHF — Swiss Franc</option>
                  <option value="SEK">SEK — Swedish Krona</option>
                  <option value="NOK">NOK — Norwegian Krone</option>
                  <option value="DKK">DKK — Danish Krone</option>
                  <option value="PLN">PLN — Polish Zloty</option>
                  <option value="CZK">CZK — Czech Koruna</option>
                  <option value="HUF">HUF — Hungarian Forint</option>
                  <option value="RON">RON — Romanian Leu</option>
                </select>
                {saved === "currency" && <span className="pref-saved">Saved</span>}
              </div>
            </div>

          </div>
        )}

        {error && <p className="set-error" style={{ marginTop: "var(--space-4)" }}>{error}</p>}
      </Card>

      <style>{SET_STYLES}</style>
    </div>
  );
}

// ==================================================
// STYLES
// ==================================================

const SET_STYLES = `
  .set-shell { display: flex; flex-direction: column; gap: var(--space-5); }
  .set-head { margin-bottom: var(--space-3); }
  .set-title { font-size: var(--text-2xl); letter-spacing: var(--tracking-tight); margin-bottom: 6px; }
  .set-sub { color: var(--colour-text-muted); }
  .set-section { font-size: var(--text-md); margin-bottom: var(--space-5); }
  .set-muted { color: var(--colour-text-muted); font-size: var(--text-sm); }
  .set-error { font-size: var(--text-sm); color: var(--colour-error); }

  .pref-list { display: flex; flex-direction: column; gap: 0; }
  .pref-row {
    display: grid;
    grid-template-columns: 1fr 260px;
    gap: var(--space-6);
    align-items: center;
    padding: var(--space-4) 0;
    border-bottom: 1px solid var(--colour-border);
  }
  .pref-row:last-child { border-bottom: none; }
  .pref-meta { display: flex; flex-direction: column; gap: 3px; }
  .pref-label { font-size: var(--text-sm); color: var(--colour-text); font-weight: 500; }
  .pref-desc { font-size: var(--text-xs); color: var(--colour-text-muted); }
  .pref-control { display: flex; align-items: center; gap: var(--space-3); }
  .pref-select {
    flex: 1;
    background: var(--colour-bg);
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-sm);
    padding: 8px 12px;
    font-size: var(--text-sm);
    color: var(--colour-text);
    outline: none;
    cursor: none;
    transition: border-color 0.2s;
  }
  .pref-select:focus { border-color: var(--colour-accent); }
  .pref-saved { font-size: var(--text-xs); color: var(--colour-accent2); white-space: nowrap; }

  @media (max-width: 640px) {
    .pref-row { grid-template-columns: 1fr; gap: var(--space-2); }
  }
`;
