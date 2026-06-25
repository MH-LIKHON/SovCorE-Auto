// ============================================================
// frontend/web/src/hooks/use-cursor.ts
// ============================================================
//
// Purpose:
//   Drives the dual-layer custom cursor: a dot that snaps
//   to the mouse and a ring that follows with a smooth lag.
//   Tracks interactive elements and exposes expanded/clicked
//   states so CustomCursor can swap the dot+ring for the
//   spinning icon affordance.
//
// Origin:
//   Copied verbatim from SovCorE QR src/hooks/use-cursor.ts,
//   which mirrors the upstream SovCorE platform use-cursor hook.
//
// Design:
//   A requestAnimationFrame loop lerps the ring position toward
//   the mouse position at factor 0.13 per frame — this gives
//   the characteristic SovCorE lag without a spring library.
//   Positions are held in refs (not state) to avoid triggering
//   React re-renders on every frame; setRingStyle is called
//   inside the RAF so the DOM update is batched correctly.
//
// Consumed by:
//   - src/components/ui/custom-cursor.tsx
// ============================================================

"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
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
  dotRef: RefObject<HTMLDivElement | null>;
  ringRef: RefObject<HTMLDivElement | null>;
  dotStyle: CSSProperties;
  ringStyle: CSSProperties;
  isExpanded: boolean;
  isClicked: boolean;
}

// ==================================================
// HOOK
// ==================================================

export function useCursor(): UseCursorResult {
  const dotRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);

  // Park cursor off-screen at (-100, -100) so a hard refresh
  // with the mouse over the URL bar does not show the dot stuck
  // at (0,0) until the user moves the pointer back into the page.
  const mouseX = useRef(-100);
  const mouseY = useRef(-100);
  const ringX = useRef(-100);
  const ringY = useRef(-100);
  const rafId = useRef<number>(0);
  const vx = useRef(0);
  const vy = useRef(0);

  const [isExpanded, setIsExpanded] = useState(false);
  const [isClicked, setIsClicked] = useState(false);

  const [dotStyle, setDotStyle] = useState<CSSProperties>({
    transform: "translate(-50%, -50%)",
    left: "-100px",
    top: "-100px",
  });

  const [ringStyle, setRingStyle] = useState<CSSProperties>({
    transform: "translate(-50%, -50%)",
    left: "-100px",
    top: "-100px",
  });

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

    const deform = `translate(-50%, -50%) rotate(${angle.toFixed(1)}deg) scaleX(${stretch.toFixed(3)}) scaleY(${squash.toFixed(3)})`;

    setRingStyle({
      transform: deform,
      left: `${ringX.current}px`,
      top: `${ringY.current}px`,
    });

    rafId.current = requestAnimationFrame(animate);
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    mouseX.current = e.clientX;
    mouseY.current = e.clientY;

    setDotStyle({
      transform: "translate(-50%, -50%)",
      left: `${e.clientX}px`,
      top: `${e.clientY}px`,
    });
  }, []);

  const handleMouseDown = useCallback(() => setIsClicked(true), []);
  const handleMouseUp = useCallback(() => setIsClicked(false), []);

  const handleMouseOver = useCallback((e: MouseEvent) => {
    const target = e.target as Element;
    if (target.closest(INTERACTIVE_SELECTORS)) {
      setIsExpanded(true);
    }
  }, []);

  const handleMouseOut = useCallback((e: MouseEvent) => {
    const target = e.relatedTarget as Element | null;
    if (!target || !target.closest(INTERACTIVE_SELECTORS)) {
      setIsExpanded(false);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    rafId.current = requestAnimationFrame(animate);

    document.addEventListener("mousemove", handleMouseMove, { passive: true });
    document.addEventListener("mousedown", handleMouseDown, { passive: true });
    document.addEventListener("mouseup", handleMouseUp, { passive: true });
    document.addEventListener("mouseover", handleMouseOver, { passive: true });
    document.addEventListener("mouseout", handleMouseOut, { passive: true });

    return () => {
      cancelAnimationFrame(rafId.current);
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("mouseup", handleMouseUp);
      document.removeEventListener("mouseover", handleMouseOver);
      document.removeEventListener("mouseout", handleMouseOut);
    };
  }, [animate, handleMouseMove, handleMouseDown, handleMouseUp, handleMouseOver, handleMouseOut]);

  return { dotRef, ringRef, dotStyle, ringStyle, isExpanded, isClicked };
}
