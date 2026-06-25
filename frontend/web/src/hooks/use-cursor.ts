// ============================================================
// frontend/web/src/hooks/use-cursor.ts
// ============================================================
//
// Purpose:
//   Drives the dual-layer custom cursor: a dot that snaps
//   to the mouse and a ring that follows with smooth lag.
//   Tracks interactive elements and applies expanded/clicked
//   states so CustomCursor can swap the dot+ring for the
//   spinning icon affordance.
//
// Origin:
//   Copied verbatim from SovCorE QR src/hooks/use-cursor.ts,
//   with one architectural upgrade: all per-frame and per-event
//   updates are applied via direct DOM ref manipulation instead
//   of React setState. This eliminates React reconciliation from
//   the animation hot path, removing the main-thread contention
//   that caused cursor lag on pages with concurrent animations
//   (e.g. LoginCard 3D tilt + LoginBackground particles).
//
// Design:
//   A requestAnimationFrame loop lerps the ring toward the mouse
//   at factor 0.18/frame. Velocity is tracked each frame to apply
//   squash-and-stretch deformation: the ring elongates along the
//   direction of travel and rounds out as the cursor slows.
//
//   All position/opacity/size changes are written directly to
//   ref.current.style — React never re-renders this component
//   during normal use (only once on mount when isDesktop resolves).
//
// Consumed by:
//   - src/components/ui/custom-cursor.tsx
// ============================================================

"use client";

import {
  useCallback,
  useEffect,
  useRef,
  type RefObject,
} from "react";

// ==================================================
// CONSTANTS
// ==================================================

const LERP_FACTOR = 0.18;

const INTERACTIVE_SELECTORS = [
  "a",
  "button",
  '[role="button"]',
  "input",
  "select",
  "textarea",
  "label[for]",
].join(", ");

// ==================================================
// TYPES
// ==================================================

export interface UseCursorResult {
  dotRef:  RefObject<HTMLDivElement | null>;
  ringRef: RefObject<HTMLDivElement | null>;
  iconRef: RefObject<HTMLDivElement | null>;
}

// ==================================================
// HOOK
// ==================================================

export function useCursor(): UseCursorResult {
  const dotRef  = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const iconRef = useRef<HTMLDivElement>(null);

  // Park off-screen until first mousemove.
  const mouseX = useRef(-200);
  const mouseY = useRef(-200);
  const ringX  = useRef(-200);
  const ringY  = useRef(-200);
  const rafId  = useRef<number>(0);
  const vx     = useRef(0);
  const vy     = useRef(0);

  // Interaction state as refs — no React setState in the hot path.
  const isExpanded = useRef(false);
  const isClicked  = useRef(false);

  // ------------------------------ DOM helpers ---------------------------------

  const _applyDot = useCallback(() => {
    const el = dotRef.current;
    if (!el) return;
    el.style.opacity = isExpanded.current ? "0" : "1";
    el.style.width   = isClicked.current  ? "6px" : "8px";
    el.style.height  = isClicked.current  ? "6px" : "8px";
  }, []);

  const _applyRing = useCallback(() => {
    const el = ringRef.current;
    if (!el) return;
    el.style.opacity = isExpanded.current ? "0" : "1";
    el.style.width   = isClicked.current  ? "28px" : "36px";
    el.style.height  = isClicked.current  ? "28px" : "36px";
  }, []);

  const _applyIcon = useCallback(() => {
    const el = iconRef.current;
    if (!el) return;
    const scale = isExpanded.current ? (isClicked.current ? 0.82 : 1) : 0.5;
    el.style.opacity   = isExpanded.current ? "1" : "0";
    el.style.transform = `translate(-50%, -50%) scale(${scale})`;
  }, []);

  // ------------------------------ RAF loop ------------------------------------

  const animate = useCallback(() => {
    const dx = mouseX.current - ringX.current;
    const dy = mouseY.current - ringY.current;

    vx.current = dx * LERP_FACTOR;
    vy.current = dy * LERP_FACTOR;

    ringX.current += vx.current;
    ringY.current += vy.current;

    const speed   = Math.sqrt(vx.current * vx.current + vy.current * vy.current);
    const angle   = speed > 0.5 ? Math.atan2(vy.current, vx.current) * (180 / Math.PI) : 0;
    const stretch = 1 + Math.min(speed * 0.055, 0.32);
    const squash  = 1 / Math.sqrt(stretch);

    const ring = ringRef.current;
    if (ring) {
      ring.style.transform =
        `translate(${ringX.current}px, ${ringY.current}px)` +
        ` translate(-50%, -50%)` +
        ` rotate(${angle.toFixed(1)}deg)` +
        ` scaleX(${stretch.toFixed(3)}) scaleY(${squash.toFixed(3)})`;
    }

    const icon = iconRef.current;
    if (icon) {
      icon.style.left = `${ringX.current}px`;
      icon.style.top  = `${ringY.current}px`;
    }

    rafId.current = requestAnimationFrame(animate);
  }, []);

  // ------------------------------ Event handlers ------------------------------

  const handleMouseMove = useCallback((e: MouseEvent) => {
    mouseX.current = e.clientX;
    mouseY.current = e.clientY;

    const dot = dotRef.current;
    if (dot) {
      dot.style.transform =
        `translate(${e.clientX}px, ${e.clientY}px) translate(-50%, -50%)`;
    }
  }, []);

  const handleMouseDown = useCallback(() => {
    isClicked.current = true;
    _applyDot(); _applyRing(); _applyIcon();
  }, [_applyDot, _applyRing, _applyIcon]);

  const handleMouseUp = useCallback(() => {
    isClicked.current = false;
    _applyDot(); _applyRing(); _applyIcon();
  }, [_applyDot, _applyRing, _applyIcon]);

  const handleMouseOver = useCallback((e: MouseEvent) => {
    const target = e.target as Element;
    if (target.closest(INTERACTIVE_SELECTORS)) {
      isExpanded.current = true;
      _applyDot(); _applyRing(); _applyIcon();
    }
  }, [_applyDot, _applyRing, _applyIcon]);

  const handleMouseOut = useCallback((e: MouseEvent) => {
    const related = e.relatedTarget as Element | null;
    if (!related || !related.closest(INTERACTIVE_SELECTORS)) {
      isExpanded.current = false;
      _applyDot(); _applyRing(); _applyIcon();
    }
  }, [_applyDot, _applyRing, _applyIcon]);

  // ------------------------------ Mount / unmount ----------------------------

  useEffect(() => {
    if (typeof window === "undefined") return;

    rafId.current = requestAnimationFrame(animate);

    document.addEventListener("mousemove", handleMouseMove,  { passive: true });
    document.addEventListener("mousedown", handleMouseDown,  { passive: true });
    document.addEventListener("mouseup",   handleMouseUp,    { passive: true });
    document.addEventListener("mouseover", handleMouseOver,  { passive: true });
    document.addEventListener("mouseout",  handleMouseOut,   { passive: true });

    return () => {
      cancelAnimationFrame(rafId.current);
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("mouseup",   handleMouseUp);
      document.removeEventListener("mouseover", handleMouseOver);
      document.removeEventListener("mouseout",  handleMouseOut);
    };
  }, [animate, handleMouseMove, handleMouseDown, handleMouseUp, handleMouseOver, handleMouseOut]);

  return { dotRef, ringRef, iconRef };
}
