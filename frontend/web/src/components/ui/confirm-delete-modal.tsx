// ============================================================
// frontend/web/src/components/ui/confirm-delete-modal.tsx
// ============================================================
//
// Purpose:
//   Shared in-app confirmation modal that gates a destructive
//   action behind typed confirmation. The user must type the
//   exact confirm word (default: "DELETE") before the action
//   button is enabled.
//
//   Replaces all window.confirm usage across the application.
//   CSS lives in globals.css under the del-modal-* namespace.
//
//   Rendered via createPortal into document.body so position:fixed
//   always covers the full viewport regardless of parent transforms
//   or stacking contexts in the layout tree.
//
// Consumed by:
//   - All pages with delete / destructive-action confirmation flows.
// ============================================================

"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export interface ConfirmDeleteModalProps {
  open: boolean;
  title: string;
  body?: string;
  confirmWord?: string;
  confirming?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDeleteModal({
  open,
  title,
  body,
  confirmWord = "DELETE",
  confirming = false,
  error = null,
  onConfirm,
  onCancel,
}: ConfirmDeleteModalProps) {
  const [typed, setTyped] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => { if (open) setTyped(""); }, [open]);

  if (!open || !mounted) return null;

  const verb = confirmWord.charAt(0) + confirmWord.slice(1).toLowerCase();
  const btnLabel = confirming ? `${verb}ing…` : verb;

  return createPortal(
    <div className="del-modal-backdrop" onClick={onCancel}>
      <div className="del-modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="del-modal-title">{title}</h3>
        {body && <p className="del-modal-body">{body}</p>}
        <p className="del-modal-caution">
          This action is permanent and cannot be undone.
        </p>
        <input
          type="text"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={`Type ${confirmWord} to confirm`}
          className="del-modal-input"
          autoFocus
          disabled={confirming}
        />
        {error && <p className="del-modal-error">{error}</p>}
        <div className="del-modal-actions">
          <button
            onClick={onCancel}
            className="rec-btn rec-btn--ghost-sm"
            disabled={confirming}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={typed !== confirmWord || confirming}
            className="rec-btn rec-btn--danger-sm"
          >
            {btnLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
