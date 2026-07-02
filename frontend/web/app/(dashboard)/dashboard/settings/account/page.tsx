// ============================================================
// frontend/web/app/(dashboard)/dashboard/settings/account/page.tsx
// ============================================================
//
// Purpose:
//   Account settings page. Displays the account name and type
//   with an inline edit form, shows the current user's profile
//   (email, 2FA status, member since), provides session security
//   controls (idle timeout preference), lists and manages trusted
//   browsers, and contains a danger zone for account deletion.
//
// Design:
//   Each section is a Card. The account and session cards toggle
//   to inline edit forms; the trusted browsers card is always
//   expanded showing the device list with per-row remove buttons.
//
//   Session card:
//     Idle timeout is stored per-user via PATCH /auth/me/preferences.
//     On save it also updates "sva_idle_timeout" in sessionStorage
//     so the running idle timer in the dashboard layout picks up
//     the new value without a page reload.
//
//   Trusted browsers card:
//     Lists all non-expired trusted devices from GET /auth/trusted-devices.
//     Each row shows the browser label (e.g. "Chrome on Windows"),
//     the expiry date, and a Remove button. Capped at 5 devices.
//
// Consumed by:
//   - Routed at /dashboard/settings/account
// ============================================================

"use client";

import { useEffect, useState } from "react";

import { Badge } from "@/src/components/ui/badge";
import { Card } from "@/src/components/ui/card";
import { TextField } from "@/src/components/ui/input";
import { apiFetch } from "@/src/lib/api/fetch";
import { toTitleCase } from "@/src/lib/text";

// ==================================================
// CONSTANTS
// ==================================================

const IDLE_OPTIONS = [5, 10, 15, 20, 25, 30] as const;
const MAX_TRUSTED_DEVICES = 5;

// ==================================================
// TYPES
// ==================================================

interface AccountData {
  id: string;
  name: string;
  type: "personal" | "family" | "business" | "fleet";
  created_at: string;
}

interface UserMe {
  id: string;
  email: string;
  full_name: string;
  is_email_verified: boolean;
  totp_enabled: boolean;
  idle_timeout_minutes: number;
  created_at: string;
}

interface TrustedDeviceData {
  id: string;
  label: string;
  created_at: string;
  expires_at: string;
}

// ==================================================
// HELPERS
// ==================================================

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  personal: "Personal",
  family: "Family",
  business: "Business",
  fleet: "Fleet",
};

function formatIdleLabel(minutes: number): string {
  return `${minutes} minutes`;
}

function formatExpiry(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// ==================================================
// PAGE
// ==================================================

export default function AccountSettingsPage() {
  const [account, setAccount] = useState<AccountData | null>(null);
  const [me, setMe] = useState<UserMe | null>(null);

  // ------------------------------ Account edit state -----------------------
  const [editingAccount, setEditingAccount] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [typeInput, setTypeInput] = useState<string>("");
  const [savingAccount, setSavingAccount] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);

  // ------------------------------ Session edit state -----------------------
  const [editingSession, setEditingSession] = useState(false);
  const [idleInput, setIdleInput] = useState<number>(15);
  const [savingSession, setSavingSession] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);

  // ------------------------------ Trusted devices --------------------------
  const [trustedDevices, setTrustedDevices] = useState<TrustedDeviceData[]>([]);
  const [tdLoading, setTdLoading] = useState(true);
  const [removingDeviceIds, setRemovingDeviceIds] = useState<Set<string>>(new Set());

  // ------------------------------ Data load --------------------------------
  useEffect(() => {
    const accountId = sessionStorage.getItem("sva_account_id");
    if (!accountId) return;

    Promise.all([
      apiFetch(`/api/v1/accounts/${accountId}`).then((r) => r.json()),
      apiFetch("/api/v1/auth/me").then((r) => r.json()),
    ]).then(([acct, user]: [AccountData, UserMe]) => {
      setAccount(acct);
      setMe(user);
      setNameInput(acct.name ?? "");
      setTypeInput(acct.type ?? "personal");
      setIdleInput(user.idle_timeout_minutes ?? 15);
    });

    apiFetch("/api/v1/auth/trusted-devices")
      .then((r) => r.json())
      .then((devices: TrustedDeviceData[]) => {
        setTrustedDevices(devices);
        setTdLoading(false);
      })
      .catch(() => setTdLoading(false));
  }, []);

  // ------------------------------ Account save -----------------------------
  async function handleAccountSave() {
    if (!account) return;
    setSavingAccount(true);
    setAccountError(null);
    const res = await apiFetch(`/api/v1/accounts/${account.id}`, {
      method: "PATCH",
      body: JSON.stringify({ name: nameInput, type: typeInput }),
    });
    setSavingAccount(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setAccountError((data as { detail?: string }).detail ?? "Failed to save. Please try again.");
      return;
    }
    const updated: AccountData = await res.json();
    setAccount(updated);
    setEditingAccount(false);
  }

  // ------------------------------ Session save -----------------------------
  async function handleSessionSave() {
    setSavingSession(true);
    setSessionError(null);
    const res = await apiFetch("/api/v1/auth/me/preferences", {
      method: "PATCH",
      body: JSON.stringify({ idle_timeout_minutes: idleInput }),
    });
    setSavingSession(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setSessionError((data as { detail?: string }).detail ?? "Failed to save. Please try again.");
      return;
    }
    const updated: UserMe = await res.json();
    setMe(updated);
    sessionStorage.setItem("sva_idle_timeout", String(updated.idle_timeout_minutes));
    setEditingSession(false);
  }

  // ------------------------------ Remove trusted device --------------------
  async function handleRemoveDevice(deviceId: string) {
    setRemovingDeviceIds((prev) => new Set(prev).add(deviceId));
    const res = await apiFetch(`/api/v1/auth/trusted-devices/${deviceId}`, {
      method: "DELETE",
    });
    if (res.ok) {
      setTrustedDevices((prev) => prev.filter((d) => d.id !== deviceId));
    }
    setRemovingDeviceIds((prev) => {
      const next = new Set(prev);
      next.delete(deviceId);
      return next;
    });
  }

  const memberSince = me
    ? new Date(me.created_at).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  return (
    <div className="set-shell">
      <header className="set-head">
        <h1 className="set-title">Settings</h1>
        <p className="set-sub">Account, profile, security, and danger zone.</p>
      </header>

      {/* ========== Account ========== */}
      <Card>
        <div className="set-section-head">
          <h2 className="set-section">Account</h2>
          {!editingAccount && (
            <button className="set-edit-btn" onClick={() => setEditingAccount(true)}>
              Edit
            </button>
          )}
        </div>

        {editingAccount ? (
          <div className="set-form">
            <TextField
              label="Account name"
              value={nameInput}
              onChange={(e) => setNameInput(toTitleCase(e.target.value))}
              maxLength={200}
              autoFocus
            />
            <div className="sov-field">
              <label htmlFor="set-acct-type" className="sov-field__label">Account type</label>
              <div className="sov-input-wrap">
                <select
                  id="set-acct-type"
                  className="sov-field__control"
                  value={typeInput}
                  onChange={(e) => setTypeInput(e.target.value)}
                >
                  <option value="personal">Personal</option>
                  <option value="family">Family</option>
                  <option value="business">Business</option>
                  <option value="fleet">Fleet</option>
                </select>
              </div>
            </div>
            {accountError && <p className="set-error">{accountError}</p>}
            <div className="set-form-actions">
              <button className="set-btn set-btn--primary" onClick={handleAccountSave} disabled={savingAccount}>
                {savingAccount ? "Saving..." : "Save"}
              </button>
              <button
                className="set-btn set-btn--ghost"
                onClick={() => { setEditingAccount(false); setAccountError(null); }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <dl className="set-list">
            <div>
              <dt>Name</dt>
              <dd>{account?.name ?? "-"}</dd>
            </div>
            <div>
              <dt>Type</dt>
              <dd>{account ? ACCOUNT_TYPE_LABELS[account.type] : "-"}</dd>
            </div>
          </dl>
        )}
      </Card>

      {/* ========== Profile ========== */}
      <Card>
        <h2 className="set-section">Profile</h2>
        <dl className="set-list">
          <div>
            <dt>Email</dt>
            <dd>{me?.email ?? "-"}</dd>
          </div>
          <div>
            <dt>Full name</dt>
            <dd>{me?.full_name || "Not set"}</dd>
          </div>
          <div>
            <dt>Email verified</dt>
            <dd>
              {me ? (
                <Badge tone={me.is_email_verified ? "success" : "muted"}>
                  {me.is_email_verified ? "VERIFIED" : "NOT VERIFIED"}
                </Badge>
              ) : "-"}
            </dd>
          </div>
          <div>
            <dt>Member since</dt>
            <dd>{memberSince ?? "-"}</dd>
          </div>
        </dl>
      </Card>

      {/* ========== Security ========== */}
      <Card>
        <h2 className="set-section">Security</h2>
        <dl className="set-list">
          <div>
            <dt>Sign-in method</dt>
            <dd>Passwordless email code</dd>
          </div>
          <div>
            <dt>Two-factor authentication</dt>
            <dd>
              {me ? (
                <Badge tone={me.totp_enabled ? "success" : "muted"}>
                  {me.totp_enabled ? "ENABLED" : "NOT SET UP"}
                </Badge>
              ) : "-"}
            </dd>
          </div>
        </dl>
      </Card>

      {/* ========== Session ========== */}
      <Card>
        <div className="set-section-head">
          <h2 className="set-section">Session</h2>
          {!editingSession && (
            <button className="set-edit-btn" onClick={() => setEditingSession(true)}>
              Edit
            </button>
          )}
        </div>

        {editingSession ? (
          <div className="set-form">
            <div className="sov-field" style={{ maxWidth: 260 }}>
              <label htmlFor="set-idle-timeout" className="sov-field__label">
                Idle sign-out after
              </label>
              <div className="sov-input-wrap">
                <select
                  id="set-idle-timeout"
                  className="sov-field__control"
                  value={idleInput}
                  onChange={(e) => setIdleInput(Number(e.target.value))}
                >
                  {IDLE_OPTIONS.map((m) => (
                    <option key={m} value={m}>{formatIdleLabel(m)}</option>
                  ))}
                </select>
              </div>
            </div>
            <p className="set-hint">
              You will be signed out automatically after this period of inactivity on any device.
            </p>
            {sessionError && <p className="set-error">{sessionError}</p>}
            <div className="set-form-actions">
              <button className="set-btn set-btn--primary" onClick={handleSessionSave} disabled={savingSession}>
                {savingSession ? "Saving..." : "Save"}
              </button>
              <button
                className="set-btn set-btn--ghost"
                onClick={() => { setEditingSession(false); setSessionError(null); setIdleInput(me?.idle_timeout_minutes ?? 15); }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <dl className="set-list">
            <div>
              <dt>Idle sign-out</dt>
              <dd>{me ? formatIdleLabel(me.idle_timeout_minutes) : "-"}</dd>
            </div>
            <div>
              <dt>Active sessions</dt>
              <dd>One session allowed at a time</dd>
            </div>
          </dl>
        )}
      </Card>

      {/* ========== Trusted browsers ========== */}
      <Card>
        <div className="set-section-head">
          <h2 className="set-section">Trusted browsers</h2>
          <span className="set-td-cap">Up to {MAX_TRUSTED_DEVICES} saved</span>
        </div>
        <p className="set-hint set-td-desc">
          Browsers where you completed 2FA verification. These skip the authenticator step for 15 days.
        </p>

        {tdLoading ? (
          <p className="set-hint">Loading...</p>
        ) : trustedDevices.length === 0 ? (
          <p className="set-hint">
            No trusted browsers saved. Your 2FA code will be required on every sign-in.
          </p>
        ) : (
          <ul className="set-td-list">
            {trustedDevices.map((device) => (
              <li key={device.id} className="set-td-row">
                <div className="set-td-info">
                  <span className="set-td-label">{device.label || "Unknown browser"}</span>
                  <span className="set-td-meta">Expires {formatExpiry(device.expires_at)}</span>
                </div>
                <button
                  className="set-td-remove"
                  onClick={() => handleRemoveDevice(device.id)}
                  disabled={removingDeviceIds.has(device.id)}
                >
                  {removingDeviceIds.has(device.id) ? "Removing..." : "Remove"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* ========== Danger zone ========== */}
      <Card>
        <h2 className="set-section" style={{ color: "var(--colour-error)" }}>
          Danger zone
        </h2>
        <p className="set-danger-copy">
          Deleting your account wipes all vehicles, records, documents, and expenses from this
          account. This cannot be undone. If you are the account owner, all members will lose
          access.
        </p>
        <p style={{ marginTop: 12 }}>
          <a
            href="mailto:support@sovcore.com?subject=Delete my SovCorE Auto account"
            className="set-link set-link--error"
          >
            Email support@sovcore.com to request deletion.
          </a>
        </p>
      </Card>

      <style>{SET_STYLES}</style>
    </div>
  );
}

// ==================================================
// STYLES
// ==================================================

const SET_STYLES = `
  .set-shell { display: flex; flex-direction: column; gap: var(--space-5); max-width: 860px; margin: 0 auto; width: 100%; }
  .set-head { margin-bottom: var(--space-3); }
  .set-title { font-size: var(--text-2xl); letter-spacing: var(--tracking-tight); margin-bottom: 6px; }
  .set-sub { color: var(--colour-text-muted); }

  .set-section-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-4); }
  .set-section { font-size: var(--text-md); margin-bottom: var(--space-4); letter-spacing: normal; }

  .set-list { display: flex; flex-direction: column; gap: var(--space-3); }
  .set-list > div { display: grid; grid-template-columns: 200px 1fr; gap: var(--space-4); align-items: center; }
  .set-list dt { font-size: var(--text-sm); color: var(--colour-text-muted); margin: 0; }
  .set-list dd { font-size: var(--text-sm); color: var(--colour-text); margin: 0; }

  .set-edit-btn { background: none; border: 1px solid var(--colour-border); border-radius: var(--radius-sm); padding: 4px 14px; font-size: var(--text-sm); color: var(--colour-text-muted); cursor: none; transition: border-color 0.2s, color 0.2s; }
  .set-edit-btn:hover { border-color: var(--colour-accent); color: var(--colour-text); }

  .set-form { display: flex; flex-direction: column; gap: var(--space-4); }
  .set-form .sov-field { max-width: 400px; }
  .set-error { font-size: var(--text-sm); color: var(--colour-error); }
  .set-hint { font-size: var(--text-xs); color: var(--colour-text-muted); line-height: var(--leading-normal); max-width: 480px; }
  .set-form-actions { display: flex; gap: var(--space-3); }
  .set-btn { padding: 8px 20px; border-radius: var(--radius-sm); font-size: var(--text-sm); cursor: none; transition: background 0.2s, color 0.2s, opacity 0.2s; border: none; }
  .set-btn--primary { background: var(--colour-accent); color: #fff; }
  .set-btn--primary:disabled { opacity: 0.55; }
  .set-btn--ghost { background: none; border: 1px solid var(--colour-border); color: var(--colour-text-muted); }
  .set-btn--ghost:hover { color: var(--colour-text); border-color: var(--colour-text-muted); }

  .set-link { color: var(--colour-accent2); text-decoration: none; font-size: var(--text-sm); }
  .set-link:hover { color: var(--colour-accent); }
  .set-link--error { color: var(--colour-error); }
  .set-link--error:hover { color: var(--colour-error); text-decoration: underline; }
  .set-danger-copy { color: var(--colour-text-muted); font-size: var(--text-sm); max-width: 560px; line-height: var(--leading-normal); }

  /* Trusted browsers card */
  .set-td-cap { font-size: var(--text-xs); color: var(--colour-text-muted); }
  .set-td-desc { margin-bottom: var(--space-4); }
  .set-td-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: var(--space-2); }
  .set-td-row { display: flex; align-items: center; justify-content: space-between; padding: var(--space-3) var(--space-4); background: rgba(255,255,255,0.025); border: 0.5px solid var(--colour-border); border-radius: var(--radius-sm); gap: var(--space-4); }
  .set-td-info { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
  .set-td-label { font-size: var(--text-sm); color: var(--colour-text); }
  .set-td-meta { font-size: var(--text-xs); color: var(--colour-text-muted); }
  .set-td-remove { flex-shrink: 0; background: none; border: 1px solid var(--colour-border); border-radius: var(--radius-sm); padding: 4px 12px; font-size: var(--text-sm); color: var(--colour-error); cursor: none; transition: border-color 0.2s, opacity 0.2s; }
  .set-td-remove:hover:not(:disabled) { border-color: var(--colour-error); }
  .set-td-remove:disabled { opacity: 0.5; }

  @media (max-width: 640px) {
    .set-list > div { grid-template-columns: 1fr; gap: 4px; }
    .set-form .sov-field { max-width: 100%; }
    .set-td-row { flex-direction: column; align-items: flex-start; gap: var(--space-3); }
  }
`;
