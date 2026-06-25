// ============================================================
// frontend/web/src/components/vehicle/DocViewerModal.tsx
// ============================================================
//
// Purpose:
//   Full-screen modal that previews a document or attachment.
//   Supports inline PDF rendering (via iframe), image display,
//   and a print + download action bar.
//
// Design:
//   viewUrl must be a same-origin URL — either a blob: URL
//   created from an apiFetch response, or a same-origin API
//   path. Same-origin is required so:
//     - iframe can render without CORS rejection
//     - contentWindow.print() is accessible for PDF print
//     - <a download> attribute is honoured by the browser
//
//   HEIC and unknown types show a fallback download prompt.
//
//   Escape key and backdrop click both close the modal.
//   Body scroll is locked while the modal is open.
//
//   Styles live in globals.css under the dvm-* namespace.
//
// Consumed by:
//   - EntityAttachmentPanel.tsx
//   - documents/page.tsx
// ============================================================

"use client";

import { useEffect, useRef } from "react";

// ==================================================
// COMPONENT
// ==================================================

export function DocViewerModal({
  viewUrl,
  filename,
  contentType,
  onClose,
}: {
  viewUrl: string;
  filename: string;
  contentType: string;
  onClose: () => void;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const isPdf    = contentType === "application/pdf";
  const isImage  = contentType.startsWith("image/") && contentType !== "image/heic";
  const canPrint = isPdf || isImage;

  // ==================================================
  // KEYBOARD + SCROLL LOCK
  // ==================================================

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  // ==================================================
  // PRINT
  // ==================================================

  function handlePrint() {
    if (isPdf) {
      iframeRef.current?.contentWindow?.print();
    } else if (isImage) {
      const w = window.open("", "_blank");
      if (w) {
        w.document.write(
          `<html><body style="margin:0;background:#000;display:flex;` +
          `align-items:center;justify-content:center;min-height:100vh">` +
          // eslint-disable-next-line @next/next/no-img-element
          `<img src="${viewUrl}" style="max-width:100%;max-height:100vh;object-fit:contain"/>` +
          `</body></html>`
        );
        w.document.close();
        setTimeout(() => { w.focus(); w.print(); }, 400);
      }
    }
  }

  // ==================================================
  // RENDER
  // ==================================================

  return (
    <div className="dvm-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label={`Viewing ${filename}`}>
      <div className="dvm-modal" onClick={(e) => e.stopPropagation()}>

        {/* ---- Header ---- */}
        <header className="dvm-header">
          <span className="dvm-filename" title={filename}>{filename}</span>
          <div className="dvm-actions">
            {canPrint && (
              <button className="dvm-btn" onClick={handlePrint}>
                Print
              </button>
            )}
            <a className="dvm-btn" href={viewUrl} download={filename}>
              Download
            </a>
            <button className="dvm-btn dvm-btn--close" onClick={onClose} aria-label="Close viewer">
              ✕
            </button>
          </div>
        </header>

        {/* ---- Body ---- */}
        <div className="dvm-body">
          {isPdf ? (
            <iframe
              ref={iframeRef}
              src={viewUrl}
              className="dvm-frame"
              title={filename}
            />
          ) : isImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={viewUrl} alt={filename} className="dvm-image" />
          ) : (
            <div className="dvm-unsupported">
              <p className="dvm-unsupported__msg">
                Preview is not available for this file type.
              </p>
              <a className="dvm-dl-btn" href={viewUrl} download={filename}>
                Download {filename}
              </a>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
