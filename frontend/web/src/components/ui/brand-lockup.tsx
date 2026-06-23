// ============================================================
// frontend/web/src/components/ui/brand-lockup.tsx
// ============================================================
//
// Purpose:
//   The brand mark used in the navbar and footer: 3D cube logo
//   plus the wordmark "SoVCorE | Auto" with a bidirectional
//   gradient underline spanning the full wordmark width.
//
// Origin:
//   Copied verbatim from SovCorE QR src/components/ui/brand-lockup.tsx.
//   The only change is the default subtitle: "Auto" in place
//   of "QR". All animation timings and styles are identical.
//
// Design:
//   Wordmark:   chrome shimmer sweep left to right (5 s cycle).
//   Underline:  gradient line ping-pongs continuously — draws
//               left-to-right, retracts right-to-left, draws
//               right-to-left, retracts left-to-right, loops.
//
// Consumed by:
//   - src/components/layout/navbar.tsx (size="md")
// ============================================================

"use client";

import { useEffect, useRef } from "react";

import { BRAND_NAME } from "@/src/lib/constants/brand";

import { Logo } from "./logo";

// ==================================================
// TYPES
// ==================================================

interface BrandLockupProps {
  subtitle?: string;
  // sm = 28 px logo, md = 36 px logo, lg = 64 px logo.
  size?: "sm" | "md" | "lg";
}

// ==================================================
// BRAND LOCKUP
// ==================================================

export function BrandLockup({ subtitle = "Auto", size = "md" }: BrandLockupProps) {
  const logoSize = size === "sm" ? 28 : size === "lg" ? 64 : 36;
  const nameSize = size === "sm" ? 13 : size === "lg" ? 22 : 15;
  const gap = size === "sm" ? 8 : size === "lg" ? 0 : 11;

  const underlineRef = useRef<HTMLDivElement>(null);

  // Bidirectional underline animation. Same four-phase pattern as QR.
  useEffect(() => {
    if (!underlineRef.current) return;

    const el = underlineRef.current;
    const duration = 800;
    const pause = 400;
    let timeoutId: ReturnType<typeof setTimeout>;
    let cancelled = false;

    function drawLTR() {
      if (cancelled) return;
      el.style.transition = `transform ${duration}ms ease-in-out`;
      el.style.transformOrigin = "left";
      el.style.transform = "scaleX(1)";
      timeoutId = setTimeout(retractRTL, duration + pause);
    }
    function retractRTL() {
      if (cancelled) return;
      el.style.transition = `transform ${duration}ms ease-in-out`;
      el.style.transformOrigin = "right";
      el.style.transform = "scaleX(0)";
      timeoutId = setTimeout(drawRTL, duration + pause);
    }
    function drawRTL() {
      if (cancelled) return;
      el.style.transition = `transform ${duration}ms ease-in-out`;
      el.style.transformOrigin = "right";
      el.style.transform = "scaleX(1)";
      timeoutId = setTimeout(retractLTR, duration + pause);
    }
    function retractLTR() {
      if (cancelled) return;
      el.style.transition = `transform ${duration}ms ease-in-out`;
      el.style.transformOrigin = "left";
      el.style.transform = "scaleX(0)";
      timeoutId = setTimeout(drawLTR, duration + pause);
    }

    timeoutId = setTimeout(drawLTR, 500);
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, []);

  // ==================================================
  // RENDER
  // ==================================================

  return (
    <div
      style={{
        display: "flex",
        flexDirection: size === "lg" ? "column" : "row",
        alignItems: "center",
        gap,
      }}
    >
      {/* ---------- Logo mark ---------- */}
      <Logo size={logoSize} />

      {/* ---------- Wordmark + underline ---------- */}
      <div style={{ position: "relative", display: "inline-block" }}>
        {/* ---------- "SoVCorE | Auto" on one line ---------- */}
        <div
          style={{
            fontSize: nameSize,
            fontWeight: 600,
            letterSpacing: size === "lg" ? "-0.5px" : "-0.4px",
            backgroundImage: "var(--brand-shimmer-gradient)",
            backgroundSize: "200% 100%",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
            animation: "brandShimmer 5s linear infinite",
            whiteSpace: "nowrap",
            lineHeight: 1,
          }}
        >
          {BRAND_NAME}
          {subtitle && (
            <>
              {/* CSS-drawn separator — avoids font-serif endings on the | glyph. */}
              <span
                aria-hidden="true"
                style={{
                  display: "inline-block",
                  width: 1,
                  height: "0.75em",
                  background: "rgba(157, 151, 255, 0.6)",
                  borderRadius: 1,
                  margin: "0 0.45em",
                  verticalAlign: "middle",
                  WebkitTextFillColor: "transparent",
                }}
              />
              {subtitle}
            </>
          )}
        </div>

        {/* ---------- Full-width animated underline ---------- */}
        {subtitle && (
          <div
            ref={underlineRef}
            aria-hidden="true"
            style={{
              position: "absolute",
              bottom: -3,
              left: 0,
              right: 0,
              height: 1,
              borderRadius: 0.5,
              background: "var(--brand-underline-gradient)",
              transform: "scaleX(0)",
              transformOrigin: "left",
            }}
          />
        )}
      </div>

      {/* ---------- Theme-aware CSS variables + keyframe ---------- */}
      <style>{BRAND_STYLES}</style>
    </div>
  );
}

// ==================================================
// BRAND STYLES
// ==================================================

const BRAND_STYLES = `
  :root {
    --brand-shimmer-gradient: linear-gradient(90deg, #9990ff, #9990ff, #ffffff, #9990ff, #9990ff);
    --brand-underline-gradient: linear-gradient(90deg, #6c63ff, #00d4ff);
  }
  .light {
    --brand-shimmer-gradient: linear-gradient(90deg, #222222, #222222, #8880ff, #222222, #222222);
    --brand-underline-gradient: linear-gradient(90deg, #5548e0, #0090c0);
  }
  @keyframes brandShimmer {
    0% { background-position: -200% center; }
    100% { background-position: 200% center; }
  }
`;
