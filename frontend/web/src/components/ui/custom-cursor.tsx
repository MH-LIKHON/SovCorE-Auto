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
//         Squash-stretches along direction of travel.
//         Hidden when hovering an interactive element.
//
//   Icon  Shown only on interactive hover. A 44 px SVG with
//         three purple-to-cyan gradient arc segments that spin
//         continuously at 3.5 s/rev, with a 3 px solid cyan
//         centre dot. Springs in with cubic-bezier overshoot;
//         squishes on click. Glows via drop-shadow filter.
//
//   All per-frame position updates bypass React state and are
//   applied directly via DOM refs. React re-renders this
//   component at most once (on initial desktop check).
//
//   The native cursor is hidden in globals.css (cursor: none
//   !important). This component does not hide it.
//
// Consumed by:
//   - app/layout.tsx (rendered once at the root)
// ============================================================

"use client";

import { useEffect, useState } from "react";

import { useCursor } from "@/src/hooks/use-cursor";

// ==================================================
// CUSTOM CURSOR
// ==================================================

export function CustomCursor() {
  const { dotRef, ringRef, iconRef } = useCursor();

  // Only render on pointer-capable desktop screens (>1023 px, hover supported).
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const check = () => {
      setIsDesktop(
        window.innerWidth > 1023 &&
          window.matchMedia("(hover: hover)").matches,
      );
    };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  if (!isDesktop) return null;

  return (
    <>
      {/* ~~~~~~~~~ Dot ~~~~~~~~~
          Position and opacity are set by the hook via direct DOM ref.
          Initial transform parks it off-screen until first mousemove. */}
      <div
        ref={dotRef}
        aria-hidden="true"
        style={{
          position: "fixed",
          left: 0,
          top: 0,
          width: "8px",
          height: "8px",
          borderRadius: "50%",
          background: "#00d4ff",
          pointerEvents: "none",
          zIndex: 99999,
          opacity: 1,
          transform: "translate(-200px, -200px) translate(-50%, -50%)",
          transition: "width 0.2s, height 0.2s, opacity 0.15s",
          willChange: "transform",
        }}
      />

      {/* ~~~~~~~~~ Ring ~~~~~~~~~
          Transform is updated directly by the RAF loop (squash-stretch).
          Width, height and opacity are updated on hover/click state change. */}
      <div
        ref={ringRef}
        aria-hidden="true"
        style={{
          position: "fixed",
          left: 0,
          top: 0,
          width: "36px",
          height: "36px",
          borderRadius: "50%",
          border: "1.5px solid rgba(108, 99, 255, 0.7)",
          pointerEvents: "none",
          zIndex: 99999,
          opacity: 1,
          transform: "translate(-200px, -200px) translate(-50%, -50%)",
          transition:
            "width 0.25s cubic-bezier(0.34,1.56,0.64,1), height 0.25s cubic-bezier(0.34,1.56,0.64,1), opacity 0.15s",
          willChange: "transform",
        }}
      />

      {/* ~~~~~~~~~ Hover icon ~~~~~~~~~
          Tracks ring position via left/top set by RAF loop on iconRef.
          Opacity and scale managed directly on expand/click state change. */}
      <div
        ref={iconRef}
        aria-hidden="true"
        style={{
          position: "fixed",
          left: "-200px",
          top: "-200px",
          width: "44px",
          height: "44px",
          pointerEvents: "none",
          zIndex: 99999,
          opacity: 0,
          transform: "translate(-50%, -50%) scale(0.5)",
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
