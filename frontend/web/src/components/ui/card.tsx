// ============================================================
// frontend/web/src/components/ui/card.tsx
// ============================================================
//
// Purpose:
//   Reusable card container with glass-morphism styling.
//   Used for vehicle cards, dashboard panels, and every
//   content section that needs a raised surface.
//
// Origin:
//   Copied verbatim from SovCorE QR src/components/ui/card.tsx,
//   which mirrors the SovCorE console card primitive exactly.
//
// Design:
//   Two orthogonal concerns are expressed as props:
//
//     clickable      boolean. Adds pointer cursor, wires onClick,
//                    and renders the centre-out gradient line at
//                    the bottom edge (the click signature).
//
//     hoverEffect    "none" | "glow" | "tilt"
//                    Visual treatment independent of click intent.
//
//   Three hover modes:
//     none   static card
//     glow   pop-lift + continuous top-edge glow sweep + radial back glow
//     tilt   3D perspective rotation following the cursor
//
// Consumed by:
//   - app/(public)/page.tsx (feature grid)
//   - app/(app)/dashboard/page.tsx (vehicle cards, stats panels)
//   - any layout section requiring a raised surface
// ============================================================

"use client";

import { useRef, type CSSProperties, type ReactNode } from "react";

// ==================================================
// TYPES
// ==================================================

type HoverEffect = "none" | "glow" | "tilt";

interface CardProps {
  children: ReactNode;
  clickable?: boolean;
  onClick?: () => void;
  hoverEffect?: HoverEffect;
  padding?: string;
  className?: string;
  style?: CSSProperties;
  fillHeight?: boolean;
}

// ==================================================
// CARD
// ==================================================

export function Card({
  children,
  clickable = false,
  onClick,
  hoverEffect,
  padding = "24px 26px",
  className,
  style,
  fillHeight = false,
}: CardProps) {
  // ---- Resolve effective hover effect ----
  // Explicit prop wins; all cards get glow by default (none can be opted in explicitly).
  const effectiveHover: HoverEffect = hoverEffect
    ? hoverEffect
    : clickable
      ? "glow"
      : "glow";

  const cardRef = useRef<HTMLDivElement>(null);
  const shimmerRef = useRef<HTMLDivElement>(null);
  const tiltGlowLineRef = useRef<HTMLDivElement>(null);
  const sweepRef = useRef<HTMLDivElement>(null);
  const backGlowRef = useRef<HTMLDivElement>(null);
  const clickLineRef = useRef<HTMLDivElement>(null);

  // ==================================================
  // HOVER HANDLERS
  // ==================================================

  function handleMouseMove(e: React.MouseEvent) {
    if (effectiveHover !== "tilt") return;
    const card = cardRef.current;
    const shimmer = shimmerRef.current;
    if (!card) return;

    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const dx = (x - rect.width / 2) / (rect.width / 2);
    const dy = (y - rect.height / 2) / (rect.height / 2);

    card.style.transform = `perspective(800px) rotateX(${-dy * 3}deg) rotateY(${dx * 3}deg) scale(1.008)`;
    card.style.boxShadow = `0 ${Math.round(8 + dy * 4)}px ${Math.round(24 + dy * 8)}px rgba(0,0,0,0.2), 0 0 ${Math.round(16 + Math.abs(dx) * 8)}px rgba(108,99,255,${(0.03 + Math.abs(dx) * 0.04).toFixed(2)})`;
    card.style.borderColor = "rgba(108,99,255,0.2)";

    if (shimmer) {
      shimmer.style.background = `radial-gradient(circle at ${x}px ${y}px, rgba(108,99,255,0.05) 0%, transparent 55%)`;
      shimmer.style.opacity = "1";
    }
  }

  function handleMouseEnter() {
    const card = cardRef.current;

    if (effectiveHover === "tilt") {
      if (card) card.style.transition = "none";
      if (tiltGlowLineRef.current) tiltGlowLineRef.current.style.opacity = "1";
    }

    if (effectiveHover === "glow") {
      applyGlowEnter(card, sweepRef.current, backGlowRef.current);
      if (clickable && clickLineRef.current) {
        clickLineRef.current.style.width = "calc(100% - 32px)";
      }
    }
  }

  function handleMouseLeave() {
    const card = cardRef.current;

    if (effectiveHover === "tilt") {
      if (card) {
        card.style.transform = "";
        card.style.boxShadow = "";
        card.style.borderColor = "";
        card.style.transition =
          "transform 0.5s cubic-bezier(0.4,0,0.2,1), box-shadow 0.5s, border-color 0.4s";
        setTimeout(() => {
          if (card) card.style.transition = "";
        }, 500);
      }
      if (shimmerRef.current) shimmerRef.current.style.opacity = "0";
      if (tiltGlowLineRef.current) tiltGlowLineRef.current.style.opacity = "0";
    }

    if (effectiveHover === "glow") {
      applyGlowLeave(card, sweepRef.current, backGlowRef.current);
      if (clickable && clickLineRef.current) {
        clickLineRef.current.style.width = "0";
      }
    }
  }

  // ==================================================
  // RENDER
  // ==================================================

  return (
    <div
      ref={cardRef}
      className={className}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={clickable ? onClick : undefined}
      style={{
        borderRadius: 18,
        padding,
        background: "var(--colour-bg-card)",
        border: "0.5px solid var(--colour-border)",
        position: "relative",
        overflow: "hidden",
        height: fillHeight ? "100%" : undefined,
        display: "flex",
        flexDirection: "column",
        transformStyle: effectiveHover === "tilt" ? ("preserve-3d" as const) : undefined,
        cursor: clickable ? "pointer" : "default",
        transition:
          "transform 0.3s cubic-bezier(0.4,0,0.2,1), box-shadow 0.35s cubic-bezier(0.4,0,0.2,1), border-color 0.4s, background 0.4s",
        ...style,
      }}
    >
      {/* ~~~~~~~~~ Tilt top glow line ~~~~~~~~~ */}
      {effectiveHover === "tilt" && (
        <div
          ref={tiltGlowLineRef}
          aria-hidden="true"
          style={{
            position: "absolute",
            top: -1,
            left: 0,
            right: 0,
            height: 1,
            background:
              "linear-gradient(90deg, transparent, rgba(108,99,255,0.5), rgba(0,212,255,0.3), transparent)",
            opacity: 0,
            transition: "opacity 0.4s",
            pointerEvents: "none",
          }}
        />
      )}

      {/* ~~~~~~~~~ Glow top sweep (continuous while hovered) ~~~~~~~~~ */}
      {effectiveHover === "glow" && (
        <div
          ref={sweepRef}
          aria-hidden="true"
          style={{
            position: "absolute",
            top: -1,
            left: 0,
            width: "400%",
            height: 3,
            background:
              "linear-gradient(90deg, transparent 0%, rgba(108,99,255,0.85) 10%, rgba(0,212,255,0.65) 18%, rgba(93,202,165,0.5) 26%, transparent 36%, transparent 50%, rgba(108,99,255,0.85) 60%, rgba(0,212,255,0.65) 68%, rgba(93,202,165,0.5) 76%, transparent 86%, transparent 100%)",
            opacity: 0,
            animation: "cardGlowSweep 4s linear infinite",
            pointerEvents: "none",
            transition: "opacity 0.3s",
          }}
        />
      )}

      {/* ~~~~~~~~~ Glow back glow ~~~~~~~~~ */}
      {effectiveHover === "glow" && (
        <div
          ref={backGlowRef}
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: 18,
            background:
              "radial-gradient(ellipse at 50% -20%, rgba(108,99,255,0.07) 0%, rgba(0,212,255,0.03) 30%, transparent 60%)",
            opacity: 0,
            pointerEvents: "none",
            transition: "opacity 0.4s",
          }}
        />
      )}

      {/* ~~~~~~~~~ Tilt cursor shimmer ~~~~~~~~~ */}
      {effectiveHover === "tilt" && (
        <div
          ref={shimmerRef}
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: 18,
            pointerEvents: "none",
            opacity: 0,
            transition: "opacity 0.4s",
          }}
        />
      )}

      {/* ~~~~~~~~~ Content ~~~~~~~~~ */}
      <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", flex: 1 }}>
        {children}
      </div>

      {/* ~~~~~~~~~ Clickable centre-out gradient line ~~~~~~~~~ */}
      {clickable && (
        <div
          ref={clickLineRef}
          aria-hidden="true"
          style={{
            position: "absolute",
            bottom: 0,
            left: "50%",
            width: 0,
            height: 2,
            borderRadius: 1,
            background:
              "linear-gradient(90deg, rgba(108,99,255,0) 0%, rgba(108,99,255,0.9) 50%, rgba(108,99,255,0) 100%)",
            transform: "translateX(-50%)",
            transition: "width 0.35s ease",
            pointerEvents: "none",
          }}
        />
      )}
    </div>
  );
}

// ==================================================
// GLOW HELPERS (INTERNAL)
// ==================================================

function applyGlowEnter(
  card: HTMLDivElement | null,
  sweep: HTMLDivElement | null,
  backGlow: HTMLDivElement | null,
) {
  if (!card) return;
  card.style.transform = "translateY(-4px) scale(1.008)";
  card.style.boxShadow =
    "0 12px 32px rgba(0,0,0,0.1), 0 4px 16px rgba(108,99,255,0.1), 0 -2px 20px rgba(108,99,255,0.04)";
  if (sweep) sweep.style.opacity = "1";
  if (backGlow) backGlow.style.opacity = "1";
}

function applyGlowLeave(
  card: HTMLDivElement | null,
  sweep: HTMLDivElement | null,
  backGlow: HTMLDivElement | null,
) {
  if (!card) return;
  card.style.transform = "translateY(0) scale(1)";
  card.style.boxShadow = "";
  if (sweep) sweep.style.opacity = "0";
  if (backGlow) backGlow.style.opacity = "0";
}
