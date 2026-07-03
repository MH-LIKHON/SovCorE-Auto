// ============================================================
// frontend/web/app/(dashboard)/dashboard/settings/account/page.tsx
// ============================================================
//
// Purpose:
//   Account settings page. Displays the account name and type
//   with an inline edit form, shows the current user's profile
//   (email, 2FA status, member since), provides session security
//   controls (idle timeout preference), lists and manages trusted
//   browsers, controls password authentication, and contains a
//   danger zone for account deletion.
//
// Design:
//   Each section is a Card. The account, session, and password
//   cards toggle to inline edit forms; the trusted browsers card
//   is always expanded showing the device list with per-row
//   remove buttons.
//
//   2FA badge:
//     Uses the "error" Badge tone (red) when 2FA is not set up,
//     making it visually prominent that it should be enabled.
//
//   Password card:
//     Users can set a password as an alternative sign-in method
//     alongside email OTP. Setting a password does not replace
//     the passwordless flow — both work simultaneously.
//     ISO 27001 / NIST 800-63B: min 12 chars, common-password
//     check enforced on the backend.
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
  has_password: boolean;
  password_updated_at: string | null;
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

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
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

  // ------------------------------ Password state ---------------------------
  const [passwordMode, setPasswordMode] = useState<"view" | "set" | "change" | "remove">("view");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [showNewPw, setShowNewPw] = useState(false);
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

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

  // ------------------------------ Password operations ----------------------
  function _resetPasswordForm() {
    setNewPassword("");
    setConfirmPassword("");
    setCurrentPassword("");
    setShowNewPw(false);
    setShowCurrentPw(false);
    setPasswordError(null);
    setPasswordMode("view");
  }

  async function handleSetPassword() {
    if (newPassword !== confirmPassword) {
      setPasswordError("Passwords do not match.");
      return;
    }
    setSavingPassword(true);
    setPasswordError(null);
    const res = await apiFetch("/api/v1/auth/password/set", {
      method: "POST",
      body: JSON.stringify({ password: newPassword }),
    });
    setSavingPassword(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setPasswordError((data as { detail?: string }).detail ?? "Failed to set password.");
      return;
    }
    // Re-fetch /me to update has_password + password_updated_at
    apiFetch("/api/v1/auth/me").then((r) => r.json()).then((user: UserMe) => setMe(user));
    _resetPasswordForm();
  }

  async function handleChangePassword() {
    if (newPassword !== confirmPassword) {
      setPasswordError("Passwords do not match.");
      return;
    }
    setSavingPassword(true);
    setPasswordError(null);
    const res = await apiFetch("/api/v1/auth/password/change", {
      method: "POST",
      body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
    });
    setSavingPassword(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setPasswordError((data as { detail?: string }).detail ?? "Failed to change password.");
      return;
    }
    apiFetch("/api/v1/auth/me").then((r) => r.json()).then((user: UserMe) => setMe(user));
    _resetPasswordForm();
  }

  async function handleRemovePassword() {
    setSavingPassword(true);
    setPasswordError(null);
    const res = await apiFetch("/api/v1/auth/password/remove", {
      method: "POST",
      body: JSON.stringify({ current_password: currentPassword }),
    });
    setSavingPassword(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setPasswordError((data as { detail?: string }).detail ?? "Failed to remove password.");
      return;
    }
    apiFetch("/api/v1/auth/me").then((r) => r.json()).then((user: UserMe) => setMe(user));
    _resetPasswordForm();
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
                <Badge tone={me.totp_enabled ? "success" : "error"}>
                  {me.totp_enabled ? "ENABLED" : "DEFAULT OFF"}
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

      {/* ========== Password ========== */}
      <Card>
        <div className="set-section-head">
          <h2 className="set-section">Password</h2>
          {passwordMode === "view" && me?.has_password && (
            <div style={{ display: "flex", gap: "var(--space-2)" }}>
              <button className="set-edit-btn" onClick={() => setPasswordMode("change")}>
                Change
              </button>
              <button className="set-edit-btn set-edit-btn--danger" onClick={() => setPasswordMode("remove")}>
                Remove
              </button>
            </div>
          )}
          {passwordMode === "view" && !me?.has_password && (
            <button className="set-edit-btn" onClick={() => setPasswordMode("set")}>
              Set password
            </button>
          )}
        </div>

        {passwordMode === "view" && (
          <>
            {me?.has_password ? (
              <dl className="set-list">
                <div>
                  <dt>Status</dt>
                  <dd><Badge tone="success">SET</Badge></dd>
                </div>
                <div>
                  <dt>Last updated</dt>
                  <dd>{me.password_updated_at ? formatDate(me.password_updated_at) : "-"}</dd>
                </div>
                <div>
                  <dt>Use</dt>
                  <dd>Sign in with email and password at login</dd>
                </div>
              </dl>
            ) : (
              <>
                <dl className="set-list">
                  <div>
                    <dt>Status</dt>
                    <dd><Badge tone="muted">NOT SET</Badge></dd>
                  </div>
                </dl>
                <p className="set-hint" style={{ marginTop: "var(--space-3)" }}>
                  Add a password as an alternative to the email code. Both methods work at the
                  same time. Min 12 characters, common passwords are blocked.
                </p>
              </>
            )}
          </>
        )}

        {passwordMode === "set" && (
          <div className="set-form">
            <div className="set-pw-field">
              <div className="sov-field">
                <label className="sov-field__label">New password</label>
                <div className="sov-input-wrap set-pw-wrap">
                  <input
                    type={showNewPw ? "text" : "password"}
                    className="sov-field__control"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Min 12 characters"
                    autoComplete="new-password"
                    autoFocus
                  />
                  <button type="button" className="set-pw-toggle" onClick={() => setShowNewPw((v) => !v)}>
                    {showNewPw ? "Hide" : "Show"}
                  </button>
                </div>
              </div>
              <div className="sov-field">
                <label className="sov-field__label">Confirm password</label>
                <div className="sov-input-wrap">
                  <input
                    type={showNewPw ? "text" : "password"}
                    className="sov-field__control"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repeat password"
                    autoComplete="new-password"
                  />
                </div>
              </div>
            </div>
            {passwordError && <p className="set-error">{passwordError}</p>}
            <div className="set-form-actions">
              <button className="set-btn set-btn--primary" onClick={handleSetPassword} disabled={savingPassword || !newPassword}>
                {savingPassword ? "Saving..." : "Set password"}
              </button>
              <button className="set-btn set-btn--ghost" onClick={_resetPasswordForm}>Cancel</button>
            </div>
          </div>
        )}

        {passwordMode === "change" && (
          <div className="set-form">
            <div className="set-pw-field">
              <div className="sov-field">
                <label className="sov-field__label">Current password</label>
                <div className="sov-input-wrap set-pw-wrap">
                  <input
                    type={showCurrentPw ? "text" : "password"}
                    className="sov-field__control"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Enter current password"
                    autoComplete="current-password"
                    autoFocus
                  />
                  <button type="button" className="set-pw-toggle" onClick={() => setShowCurrentPw((v) => !v)}>
                    {showCurrentPw ? "Hide" : "Show"}
                  </button>
                </div>
              </div>
              <div className="sov-field">
                <label className="sov-field__label">New password</label>
                <div className="sov-input-wrap set-pw-wrap">
                  <input
                    type={showNewPw ? "text" : "password"}
                    className="sov-field__control"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Min 12 characters"
                    autoComplete="new-password"
                  />
                  <button type="button" className="set-pw-toggle" onClick={() => setShowNewPw((v) => !v)}>
                    {showNewPw ? "Hide" : "Show"}
                  </button>
                </div>
              </div>
              <div className="sov-field">
                <label className="sov-field__label">Confirm new password</label>
                <div className="sov-input-wrap">
                  <input
                    type={showNewPw ? "text" : "password"}
                    className="sov-field__control"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repeat new password"
                    autoComplete="new-password"
                  />
                </div>
              </div>
            </div>
            {passwordError && <p className="set-error">{passwordError}</p>}
            <div className="set-form-actions">
              <button className="set-btn set-btn--primary" onClick={handleChangePassword} disabled={savingPassword || !currentPassword || !newPassword}>
                {savingPassword ? "Saving..." : "Change password"}
              </button>
              <button className="set-btn set-btn--ghost" onClick={_resetPasswordForm}>Cancel</button>
            </div>
          </div>
        )}

        {passwordMode === "remove" && (
          <div className="set-form">
            <p className="set-hint">
              Confirm your current password to remove it. After removal, only email code and SSO sign-in will work.
            </p>
            <div className="sov-field" style={{ maxWidth: 400 }}>
              <label className="sov-field__label">Current password</label>
              <div className="sov-input-wrap set-pw-wrap">
                <input
                  type={showCurrentPw ? "text" : "password"}
                  className="sov-field__control"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter current password"
                  autoComplete="current-password"
                  autoFocus
                />
                <button type="button" className="set-pw-toggle" onClick={() => setShowCurrentPw((v) => !v)}>
                  {showCurrentPw ? "Hide" : "Show"}
                </button>
              </div>
            </div>
            {passwordError && <p className="set-error">{passwordError}</p>}
            <div className="set-form-actions">
              <button
                className="set-btn set-btn--danger"
                onClick={handleRemovePassword}
                disabled={savingPassword || !currentPassword}
              >
                {savingPassword ? "Removing..." : "Remove password"}
              </button>
              <button className="set-btn set-btn--ghost" onClick={_resetPasswordForm}>Cancel</button>
            </div>
          </div>
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
  .set-edit-btn--danger { color: var(--colour-error); }
  .set-edit-btn--danger:hover { border-color: var(--colour-error); color: var(--colour-error); }

  .set-form { display: flex; flex-direction: column; gap: var(--space-4); }
  .set-form .sov-field { max-width: 400px; }
  .set-error { font-size: var(--text-sm); color: var(--colour-error); }
  .set-hint { font-size: var(--text-xs); color: var(--colour-text-muted); line-height: var(--leading-normal); max-width: 480px; }
  .set-form-actions { display: flex; gap: var(--space-3); flex-wrap: wrap; }
  .set-btn { padding: 8px 20px; border-radius: var(--radius-sm); font-size: var(--text-sm); cursor: none; transition: background 0.2s, color 0.2s, opacity 0.2s; border: none; }
  .set-btn--primary { background: var(--colour-accent); color: #fff; }
  .set-btn--primary:disabled { opacity: 0.55; }
  .set-btn--ghost { background: none; border: 1px solid var(--colour-border); color: var(--colour-text-muted); }
  .set-btn--ghost:hover { color: var(--colour-text); border-color: var(--colour-text-muted); }
  .set-btn--danger { background: none; border: 1px solid rgba(255,80,80,0.35); color: var(--colour-error); }
  .set-btn--danger:hover { border-color: var(--colour-error); }
  .set-btn--danger:disabled { opacity: 0.55; }

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

  /* Password card */
  .set-pw-field { display: flex; flex-direction: column; gap: var(--space-3); }
  .set-pw-wrap { position: relative; }
  .set-pw-toggle { position: absolute; right: 12px; top: 50%; transform: translateY(-50%); background: none; border: none; font-size: var(--text-xs); color: var(--colour-text-muted); cursor: none; padding: 4px; transition: color 0.2s; }
  .set-pw-toggle:hover { color: var(--colour-text); }

  @media (max-width: 640px) {
    .set-list > div { grid-template-columns: 1fr; gap: 4px; }
    .set-form .sov-field { max-width: 100%; }
    .set-td-row { flex-direction: column; align-items: flex-start; gap: var(--space-3); }
    .set-pw-field .sov-field { max-width: 100% !important; }
  }
`;
