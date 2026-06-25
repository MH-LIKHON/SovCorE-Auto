// ============================================================
// frontend/web/app/(dashboard)/dashboard/settings/users/page.tsx
// ============================================================
//
// Purpose:
//   Member management page. Lists all members of the active
//   account with their roles. Allows admins and owners to
//   invite new members by email, change roles, remove members,
//   and transfer account ownership.
//
// Design:
//   Members table has horizontal-scroll wrapper for small
//   screens; name and member-since columns hide on mobile.
//   Invite and transfer-ownership sections are gated behind
//   role checks done client-side for UX (enforced server-side).
//
// Consumed by:
//   - Routed at /dashboard/settings/users
// ============================================================

"use client";

import { useEffect, useState } from "react";

import { Badge } from "@/src/components/ui/badge";
import { Card } from "@/src/components/ui/card";
import { TextField } from "@/src/components/ui/input";
import { apiFetch } from "@/src/lib/api/fetch";

// ==================================================
// TYPES
// ==================================================

interface Member {
  id: string;
  user_id: string;
  email: string;
  full_name: string;
  role: "owner" | "admin" | "editor" | "viewer";
  created_at: string;
}

// ==================================================
// HELPERS
// ==================================================

const ROLE_BADGE_TONE: Record<string, "info" | "accent" | "success" | "muted"> = {
  owner: "info",
  admin: "accent",
  editor: "success",
  viewer: "muted",
};

const ASSIGNABLE_ROLES: Member["role"][] = ["admin", "editor", "viewer"];

// ==================================================
// PAGE
// ==================================================

export default function UsersPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [myRole, setMyRole] = useState<Member["role"] | null>(null);

  // Invite form
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Member["role"]>("viewer");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState(false);

  // Transfer ownership
  const [transferTarget, setTransferTarget] = useState<string>("");
  const [transferring, setTransferring] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);

  const accountId = typeof window !== "undefined" ? sessionStorage.getItem("sva_account_id") : null;

  async function load() {
    if (!accountId) return;
    setLoading(true);

    const [meRes, membersRes] = await Promise.all([
      apiFetch("/api/v1/auth/me"),
      apiFetch(`/api/v1/accounts/${accountId}/members`),
    ]);
    const me = meRes.ok ? await meRes.json() : null;
    const list: Member[] = membersRes.ok ? await membersRes.json() : [];

    setMyUserId(me?.id ?? null);
    setMembers(list);
    const mine = list.find((m) => m.user_id === me?.id);
    setMyRole(mine?.role ?? null);
    setLoading(false);
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleInvite() {
    if (!accountId || !inviteEmail.trim()) return;
    setInviting(true);
    setInviteError(null);
    setInviteSuccess(false);
    const res = await apiFetch(`/api/v1/accounts/${accountId}/members`, {
      method: "POST",
      body: JSON.stringify({ email: inviteEmail.trim().toLowerCase(), role: inviteRole }),
    });
    setInviting(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setInviteError(data.detail ?? "Failed to invite. Please try again.");
      return;
    }
    setInviteEmail("");
    setInviteRole("viewer");
    setInviteSuccess(true);
    await load();
  }

  async function handleRoleChange(member: Member, newRole: Member["role"]) {
    if (!accountId) return;
    const res = await apiFetch(`/api/v1/accounts/${accountId}/members/${member.id}`, {
      method: "PATCH",
      body: JSON.stringify({ role: newRole }),
    });
    if (res.ok) await load();
  }

  async function handleRemove(member: Member) {
    if (!accountId) return;
    if (!window.confirm(`Remove ${member.email} from this account?`)) return;
    const res = await apiFetch(`/api/v1/accounts/${accountId}/members/${member.id}`, {
      method: "DELETE",
    });
    if (res.ok) await load();
  }

  async function handleTransferOwnership() {
    if (!accountId || !transferTarget) return;
    setTransferring(true);
    setTransferError(null);
    const res = await apiFetch(`/api/v1/accounts/${accountId}/transfer-ownership`, {
      method: "POST",
      body: JSON.stringify({ new_owner_user_id: transferTarget }),
    });
    setTransferring(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setTransferError(data.detail ?? "Transfer failed.");
      return;
    }
    setTransferTarget("");
    await load();
  }

  const isOwnerOrAdmin = myRole === "owner" || myRole === "admin";
  const isOwner = myRole === "owner";
  const otherMembers = members.filter((m) => m.user_id !== myUserId);

  return (
    <div className="set-shell">
      <header className="set-head">
        <h1 className="set-title">Members</h1>
        <p className="set-sub">Manage who has access to this account.</p>
      </header>

      {/* ---------- Member list ---------- */}
      <Card>
        <h2 className="set-section">Account members</h2>

        {loading ? (
          <p className="set-muted">Loading…</p>
        ) : members.length === 0 ? (
          <p className="set-muted">No members found.</p>
        ) : (
          <div className="mem-table-wrap">
            <table className="mem-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th className="mem-col--name">Name</th>
                  <th>Role</th>
                  <th className="mem-col--since">Member since</th>
                  {isOwnerOrAdmin && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {members.map((m) => {
                  const isMe = m.user_id === myUserId;
                  const joinedDate = new Date(m.created_at).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  });
                  return (
                    <tr key={m.id} className={isMe ? "mem-row mem-row--me" : "mem-row"}>
                      <td>{m.email}{isMe && <span className="mem-you"> (you)</span>}</td>
                      <td className="mem-col--name">{m.full_name || <span className="set-muted">—</span>}</td>
                      <td>
                        <Badge tone={ROLE_BADGE_TONE[m.role]}>{m.role}</Badge>
                      </td>
                      <td className="mem-col--since set-muted">{joinedDate}</td>
                      {isOwnerOrAdmin && (
                        <td>
                          {!isMe && m.role !== "owner" && (
                            <div className="mem-actions">
                              <select
                                className="mem-role-select"
                                value={m.role}
                                onChange={(e) => handleRoleChange(m, e.target.value as Member["role"])}
                              >
                                {ASSIGNABLE_ROLES.map((r) => (
                                  <option key={r} value={r}>{r}</option>
                                ))}
                              </select>
                              <button className="mem-remove-btn" onClick={() => handleRemove(m)}>
                                Remove
                              </button>
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ---------- Invite ---------- */}
      {isOwnerOrAdmin && (
        <Card>
          <h2 className="set-section">Invite a member</h2>
          <div className="set-form">
            <TextField
              label="Email address"
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="colleague@example.com"
            />
            <div className="sov-field">
              <label htmlFor="usr-inv-role" className="sov-field__label">Role</label>
              <div className="sov-input-wrap">
                <select
                  id="usr-inv-role"
                  className="sov-field__control"
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as Member["role"])}
                >
                  {ASSIGNABLE_ROLES.map((r) => (
                    <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                  ))}
                </select>
              </div>
            </div>
            {inviteError && <p className="set-error">{inviteError}</p>}
            {inviteSuccess && <p className="set-success">Invitation added. They can sign in with their email.</p>}
            <div className="set-form-actions">
              <button
                className="set-btn set-btn--primary"
                onClick={handleInvite}
                disabled={inviting || !inviteEmail.trim()}
              >
                {inviting ? "Adding…" : "Add member"}
              </button>
            </div>
          </div>
        </Card>
      )}

      {/* ---------- Transfer ownership ---------- */}
      {isOwner && otherMembers.length > 0 && (
        <Card>
          <h2 className="set-section" style={{ color: "var(--colour-error)" }}>
            Transfer ownership
          </h2>
          <p className="set-danger-copy">
            Transferring ownership demotes you to Admin and makes the selected member the new
            Owner. This cannot be undone without the new owner&apos;s cooperation.
          </p>
          <div className="set-form" style={{ marginTop: "var(--space-4)" }}>
            <div className="sov-field">
              <label htmlFor="usr-transfer-sel" className="sov-field__label">New owner</label>
              <div className="sov-input-wrap">
                <select
                  id="usr-transfer-sel"
                  className="sov-field__control"
                  value={transferTarget}
                  onChange={(e) => setTransferTarget(e.target.value)}
                >
                  <option value="">Select a member…</option>
                  {otherMembers.map((m) => (
                    <option key={m.user_id} value={m.user_id}>
                      {m.email}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {transferError && <p className="set-error">{transferError}</p>}
            <div className="set-form-actions">
              <button
                className="set-btn set-btn--ghost"
                onClick={handleTransferOwnership}
                disabled={transferring || !transferTarget}
                style={{ borderColor: "var(--colour-error)", color: "var(--colour-error)" }}
              >
                {transferring ? "Transferring…" : "Transfer ownership"}
              </button>
            </div>
          </div>
        </Card>
      )}

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
  .set-section { font-size: var(--text-md); margin-bottom: var(--space-4); letter-spacing: normal; }
  .set-muted { color: var(--colour-text-muted); font-size: var(--text-sm); margin: 0; }
  .set-error { font-size: var(--text-sm); color: var(--colour-error); }
  .set-success { font-size: var(--text-sm); color: var(--colour-success, #22c55e); }
  .set-danger-copy { color: var(--colour-text-muted); font-size: var(--text-sm); max-width: 560px; line-height: var(--leading-normal); }

  .set-form { display: flex; flex-direction: column; gap: var(--space-4); }
  .set-form .sov-field { max-width: 400px; }
  .set-form-actions { display: flex; gap: var(--space-3); }
  .set-btn { padding: 8px 20px; border-radius: var(--radius-sm); font-size: var(--text-sm); cursor: none; transition: background 0.2s, color 0.2s, opacity 0.2s; border: none; }
  .set-btn--primary { background: var(--colour-accent); color: #fff; }
  .set-btn--primary:disabled { opacity: 0.55; }
  .set-btn--ghost { background: none; border: 1px solid var(--colour-border); color: var(--colour-text-muted); }
  .set-btn--ghost:disabled { opacity: 0.55; }

  .mem-table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
  .mem-table { width: 100%; border-collapse: collapse; font-size: var(--text-sm); }
  .mem-table th { text-align: left; color: var(--colour-text-muted); font-weight: 500; padding: 0 12px 10px 0; border-bottom: 1px solid var(--colour-border); white-space: nowrap; }
  .mem-row td { padding: 10px 12px 10px 0; border-bottom: 1px solid var(--colour-border); color: var(--colour-text); vertical-align: middle; }
  .mem-row:last-child td { border-bottom: none; }
  .mem-row--me { background: rgba(108,99,255,0.04); }
  .mem-you { color: var(--colour-text-muted); font-size: var(--text-xs); margin-left: 4px; }

  .mem-actions { display: flex; align-items: center; gap: 8px; }
  .mem-role-select { background: var(--colour-bg); border: 1px solid var(--colour-border); border-radius: var(--radius-sm); padding: 4px 8px; font-size: var(--text-xs); color: var(--colour-text); cursor: none; }
  .mem-remove-btn { background: none; border: none; color: var(--colour-error); font-size: var(--text-xs); cursor: none; padding: 4px 6px; border-radius: var(--radius-sm); transition: background 0.2s; }
  .mem-remove-btn:hover { background: rgba(239,68,68,0.1); }

  @media (max-width: 640px) {
    .mem-col--name { display: none; }
    .mem-col--since { display: none; }
  }
`;
