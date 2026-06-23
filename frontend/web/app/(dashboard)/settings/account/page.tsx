// ============================================================
// frontend/web/app/(dashboard)/settings/account/page.tsx
// ============================================================
//
// Purpose:
//   Account settings page. Displays the account name and type
//   with an inline edit form, shows the current user's profile
//   (email, 2FA status, member since), and provides the UK GDPR
//   right-to-erasure danger zone with a two-step confirmation.
//
// Design:
//   Erasure flow has two steps:
//   Step 1 — POST /erasure: creates the erasure_request row.
//   Step 2 — POST /erasure/confirm: caller types exactly
//   "DELETE MY ACCOUNT" to confirm. The backend validates the
//   phrase, purges all database rows and R2 objects, and returns
//   a summary. After completion the session is cleared and the
//   user is redirected to /login.
//
// Consumed by:
//   - Routed at /dashboard/settings/account
// ============================================================

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Badge } from "@/src/components/ui/badge";
import { Card } from "@/src/components/ui/card";

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
  created_at: string;
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

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  personal: "Personal",
  family: "Family",
  business: "Business",
  fleet: "Fleet",
};

// ==================================================
// PAGE
// ==================================================

export default function AccountSettingsPage() {
  const router = useRouter();
  const [account, setAccount] = useState<AccountData | null>(null);
  const [me, setMe] = useState<UserMe | null>(null);
  const [editing, setEditing] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [typeInput, setTypeInput] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Erasure state
  const [erasureStep, setErasureStep] = useState<"idle" | "requested" | "confirming">("idle");
  const [erasurePhrase, setErasurePhrase] = useState("");
  const [erasureLoading, setErasureLoading] = useState(false);
  const [erasureError, setErasureError] = useState<string | null>(null);

  useEffect(() => {
    const accountId = sessionStorage.getItem("sva_account_id");
    if (!accountId) return;

    Promise.all([
      apiFetch(`/api/v1/accounts/${accountId}`).then((r) => r.json()),
      apiFetch("/api/v1/auth/me").then((r) => r.json()),
    ]).then(([acct, user]) => {
      setAccount(acct);
      setMe(user);
      setNameInput(acct.name ?? "");
      setTypeInput(acct.type ?? "personal");
    });
  }, []);

  async function handleSave() {
    if (!account) return;
    setSaving(true);
    setSaveError(null);
    const res = await apiFetch(`/api/v1/accounts/${account.id}`, {
      method: "PATCH",
      body: JSON.stringify({ name: nameInput, type: typeInput }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setSaveError(data.detail ?? "Failed to save. Please try again.");
      return;
    }
    const updated = await res.json();
    setAccount(updated);
    setEditing(false);
  }

  const memberSince = me
    ? new Date(me.created_at).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  async function handleRequestErasure() {
    if (!account) return;
    setErasureLoading(true);
    setErasureError(null);
    const res = await apiFetch(`/api/v1/accounts/${account.id}/erasure`, { method: "POST" });
    setErasureLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setErasureError(data.detail ?? "Failed to submit request. Please try again.");
      return;
    }
    setErasureStep("requested");
  }

  async function handleConfirmErasure() {
    if (!account || erasurePhrase.trim() !== "DELETE MY ACCOUNT") {
      setErasureError("You must type exactly: DELETE MY ACCOUNT");
      return;
    }
    setErasureLoading(true);
    setErasureError(null);
    const res = await apiFetch(`/api/v1/accounts/${account.id}/erasure/confirm`, {
      method: "POST",
      body: JSON.stringify({ confirmation: erasurePhrase.trim() }),
    });
    setErasureLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setErasureError(data.detail ?? "Confirmation failed. Please try again.");
      return;
    }
    // Account deleted — clear session and redirect.
    if (typeof window !== "undefined") {
      sessionStorage.clear();
    }
    router.push("/login");
  }

  return (
    <div className="set-shell">
      <header className="set-head">
        <h1 className="set-title">Settings</h1>
        <p className="set-sub">Account, profile, security, and danger zone.</p>
      </header>

      {/* ---------- Account ---------- */}
      <Card>
        <div className="set-section-head">
          <h2 className="set-section">Account</h2>
          {!editing && (
            <button className="set-edit-btn" onClick={() => setEditing(true)}>
              Edit
            </button>
          )}
        </div>

        {editing ? (
          <div className="set-form">
            <label className="set-label">
              <span className="set-label__text">Account name</span>
              <input
                className="set-input"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                maxLength={200}
                autoFocus
              />
            </label>
            <label className="set-label">
              <span className="set-label__text">Account type</span>
              <select
                className="set-input"
                value={typeInput}
                onChange={(e) => setTypeInput(e.target.value)}
              >
                <option value="personal">Personal</option>
                <option value="family">Family</option>
                <option value="business">Business</option>
                <option value="fleet">Fleet</option>
              </select>
            </label>
            {saveError && <p className="set-error">{saveError}</p>}
            <div className="set-form-actions">
              <button className="set-btn set-btn--primary" onClick={handleSave} disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </button>
              <button
                className="set-btn set-btn--ghost"
                onClick={() => { setEditing(false); setSaveError(null); }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <dl className="set-list">
            <div>
              <dt>Name</dt>
              <dd>{account?.name ?? "—"}</dd>
            </div>
            <div>
              <dt>Type</dt>
              <dd>{account ? ACCOUNT_TYPE_LABELS[account.type] : "—"}</dd>
            </div>
          </dl>
        )}
      </Card>

      {/* ---------- Profile ---------- */}
      <Card>
        <h2 className="set-section">Profile</h2>
        <dl className="set-list">
          <div>
            <dt>Email</dt>
            <dd>{me?.email ?? "—"}</dd>
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
                  {me.is_email_verified ? "Verified" : "Not verified"}
                </Badge>
              ) : "—"}
            </dd>
          </div>
          <div>
            <dt>Member since</dt>
            <dd>{memberSince ?? "—"}</dd>
          </div>
        </dl>
      </Card>

      {/* ---------- Security ---------- */}
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
                  {me.totp_enabled ? "Enabled" : "Not set up"}
                </Badge>
              ) : "—"}
            </dd>
          </div>
          <div>
            <dt>Set up or change 2FA</dt>
            <dd>
              <a href="/dashboard/settings/security" className="set-link">
                Two-factor authentication settings
              </a>
            </dd>
          </div>
        </dl>
      </Card>

      {/* ---------- Danger zone (UK GDPR right to erasure) ---------- */}
      <Card>
        <h2 className="set-section" style={{ color: "var(--colour-error)" }}>
          Danger zone
        </h2>

        {erasureStep === "idle" && (
          <>
            <p className="set-danger-copy">
              Deleting your account permanently removes all vehicles, records, documents,
              tasks, reminders, and expenses associated with this account. All members will
              lose access. This cannot be undone.
            </p>
            <p className="set-danger-copy" style={{ marginTop: 8 }}>
              Your right to erasure under the UK General Data Protection Regulation (UK GDPR,
              Article 17) is fulfilled in full. A deletion receipt is retained by the system
              to record that the erasure occurred; it contains no personal data.
            </p>
            {erasureError && (
              <p className="set-error" style={{ marginTop: 12 }}>{erasureError}</p>
            )}
            <div style={{ marginTop: "var(--space-4)" }}>
              <button
                className="set-btn set-btn--ghost"
                onClick={handleRequestErasure}
                disabled={erasureLoading}
                style={{ borderColor: "var(--colour-error)", color: "var(--colour-error)" }}
              >
                {erasureLoading ? "Submitting…" : "Request account deletion"}
              </button>
            </div>
          </>
        )}

        {erasureStep === "requested" && (
          <>
            <p className="set-danger-copy">
              Your deletion request has been received. To proceed, type exactly
              <strong style={{ color: "var(--colour-error)" }}> DELETE MY ACCOUNT</strong> in
              the field below and confirm. All data will be permanently deleted immediately.
            </p>
            {erasureError && (
              <p className="set-error" style={{ marginTop: 8 }}>{erasureError}</p>
            )}
            <div className="set-form" style={{ marginTop: "var(--space-4)" }}>
              <label className="set-label">
                <span className="set-label__text" style={{ color: "var(--colour-error)" }}>
                  Type: DELETE MY ACCOUNT
                </span>
                <input
                  className="set-input"
                  style={{ borderColor: "var(--colour-error)" }}
                  value={erasurePhrase}
                  onChange={(e) => { setErasurePhrase(e.target.value); setErasureError(null); }}
                  placeholder="DELETE MY ACCOUNT"
                  autoFocus
                />
              </label>
              <div className="set-form-actions">
                <button
                  className="set-btn set-btn--ghost"
                  onClick={handleConfirmErasure}
                  disabled={erasureLoading || erasurePhrase.trim() !== "DELETE MY ACCOUNT"}
                  style={{ borderColor: "var(--colour-error)", color: "var(--colour-error)" }}
                >
                  {erasureLoading ? "Deleting…" : "Permanently delete my account"}
                </button>
                <button
                  className="set-btn set-btn--ghost"
                  onClick={() => { setErasureStep("idle"); setErasureError(null); setErasurePhrase(""); }}
                  disabled={erasureLoading}
                >
                  Cancel
                </button>
              </div>
            </div>
          </>
        )}
      </Card>

      <style>{SET_STYLES}</style>
    </div>
  );
}

// ==================================================
// STYLES — mirror of SovCorE QR settings styles
// ==================================================

const SET_STYLES = `
  .set-shell { display: flex; flex-direction: column; gap: var(--space-5); }
  .set-head { margin-bottom: var(--space-3); }
  .set-title { font-size: var(--text-2xl); letter-spacing: var(--tracking-tight); margin-bottom: 6px; }
  .set-sub { color: var(--colour-text-muted); }

  .set-section-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-4); }
  .set-section { font-size: var(--text-md); margin-bottom: var(--space-4); }

  .set-list { display: flex; flex-direction: column; gap: var(--space-3); }
  .set-list > div { display: grid; grid-template-columns: 200px 1fr; gap: var(--space-4); align-items: center; }
  .set-list dt { font-size: var(--text-sm); color: var(--colour-text-muted); margin: 0; }
  .set-list dd { font-size: var(--text-sm); color: var(--colour-text); margin: 0; }

  .set-edit-btn { background: none; border: 1px solid var(--colour-border); border-radius: var(--radius-sm); padding: 4px 14px; font-size: var(--text-sm); color: var(--colour-text-muted); cursor: none; transition: border-color 0.2s, color 0.2s; }
  .set-edit-btn:hover { border-color: var(--colour-accent); color: var(--colour-text); }

  .set-form { display: flex; flex-direction: column; gap: var(--space-4); }
  .set-label { display: flex; flex-direction: column; gap: 6px; }
  .set-label__text { font-size: var(--text-sm); color: var(--colour-text-muted); }
  .set-input { background: var(--colour-bg); border: 1px solid var(--colour-border); border-radius: var(--radius-sm); padding: 8px 12px; font-size: var(--text-sm); color: var(--colour-text); outline: none; transition: border-color 0.2s; max-width: 400px; }
  .set-input:focus { border-color: var(--colour-accent); }
  .set-error { font-size: var(--text-sm); color: var(--colour-error); }
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

  @media (max-width: 640px) {
    .set-list > div { grid-template-columns: 1fr; gap: 4px; }
  }
`;
