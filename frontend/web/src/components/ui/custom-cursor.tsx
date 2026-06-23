// ============================================================
// frontend/web/src/components/ui/custom-cursor.tsx
// ============================================================
//
// Purpose:
//   Renders the dual-layer custom cursor that replaces the
//   native OS cursor site-wide. This is the signature SovCorE
//   interaction and is mirrored exactly from QR.
//
// Origin:
//   Copied verbatim from SovCorE QR src/components/ui/custom-cursor.tsx.
//
// Design:
//   Three layers, only two visible at a time:
//
//   Dot   8 px filled cyan circle. Snaps instantly to mouse.
//         Hidden when hovering an interactive element.
//
//   Ring  36 px hollow purple circle with smooth lag.
//         Hidden when hovering an interactive element.
//
//   Icon  Shown only on interactive hover. A 44 px SVG with
//         three purple-to-cyan gradient arc segments that spin
//         continuously at 3.5 s/rev, with a 3 px solid cyan
//         centre dot. Springs in with cubic-bezier overshoot;
//         squishes on click. Glows via drop-shadow filter.
//
//   The native cursor is hidden in globals.css (cursor: none
//   !important). This component does not hide it.
//
// Consumed by:
//   - app/layout.tsx (rendered once at the root)
// ============================================================

"use client";

import { useCursor } from "@/src/hooks/use-cursor";

// ==================================================
// CUSTOM CURSOR
// ==================================================

export function CustomCursor() {
  const { dotRef, ringRef, dotStyle, ringStyle, isExpanded, isClicked } = useCursor();

  return (
    <>
      {/* ~~~~~~~~~ Dot ~~~~~~~~~ */}
      <div
        ref={dotRef}
        aria-hidden="true"
        style={{
          ...dotStyle,
          position: "fixed",
          width: isClicked ? "6px" : "8px",
          height: isClicked ? "6px" : "8px",
          borderRadius: "50%",
          background: "#00d4ff",
          pointerEvents: "none",
          zIndex: 99999,
          opacity: isExpanded ? 0 : 1,
          transition: "width 0.2s, height 0.2s, opacity 0.15s",
        }}
      />

      {/* ~~~~~~~~~ Ring ~~~~~~~~~ */}
      <div
        ref={ringRef}
        aria-hidden="true"
        style={{
          ...ringStyle,
          position: "fixed",
          width: isClicked ? "28px" : "36px",
          height: isClicked ? "28px" : "36px",
          borderRadius: "50%",
          border: "1.5px solid rgba(108, 99, 255, 0.7)",
          pointerEvents: "none",
          zIndex: 99999,
          opacity: isExpanded ? 0 : 1,
          transition:
            "width 0.25s cubic-bezier(0.34,1.56,0.64,1), height 0.25s cubic-bezier(0.34,1.56,0.64,1), opacity 0.15s",
        }}
      />

      {/* ~~~~~~~~~ Hover icon ~~~~~~~~~
          Tracks the ring position. Both dot and ring are gone;
          this replaces them over every interactive element. */}
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          left: ringStyle.left,
          top: ringStyle.top,
          width: "44px",
          height: "44px",
          pointerEvents: "none",
          zIndex: 99999,
          opacity: isExpanded ? 1 : 0,
          transform: `translate(-50%, -50%) scale(${
            isExpanded ? (isClicked ? 0.82 : 1) : 0.5
          })`,
          transition:
            "opacity 0.18s, transform 0.28s cubic-bezier(0.34,1.56,0.64,1)",
        }}
      >
        {/* Inner div handles rotation so the outer transform is not clobbered. */}
        <div
          style={{
            width: "100%",
            height: "100%",
            filter:
              "drop-shadow(0 0 7px rgba(108,99,255,0.55)) drop-shadow(0 0 3px rgba(0,212,255,0.35))",
            animation: "cursorSpin 3.5s linear infinite",
          }}
        >
          <svg
            width="44"
            height="44"
            viewBox="0 0 44 44"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              <linearGradient
                id="cursorGrad"
                x1="0"
                y1="0"
                x2="44"
                y2="44"
                gradientUnits="userSpaceOnUse"
              >
                <stop offset="0%" stopColor="#6c63ff" />
                <stop offset="100%" stopColor="#00d4ff" />
              </linearGradient>
            </defs>
            <circle
              cx="22"
              cy="22"
              r="19"
              stroke="url(#cursorGrad)"
              strokeWidth="1.5"
              strokeDasharray="30 9.8"
              strokeLinecap="round"
            />
            <circle cx="22" cy="22" r="3" fill="#00d4ff" opacity="0.95" />
          </svg>
        </div>
      </div>

      <style>{`@keyframes cursorSpin { to { transform: rotate(360deg); } }`}</style>
    </>
  );
}
