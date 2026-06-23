// ============================================================
// frontend/web/src/hooks/use-breakpoint.ts
// ============================================================
//
// Purpose:
//   Returns the current viewport breakpoint and convenience
//   boolean flags. Used by any component that needs responsive
//   layout decisions in JavaScript (CSS media queries handle
//   most cases; this hook handles the rest).
//
// Origin:
//   Copied verbatim from SovCorE QR src/hooks/use-breakpoint.ts,
//   which mirrors the upstream SovCorE platform hook.
//
// Breakpoints (match globals.css media queries):
//   mobileS  0..480 px
//   mobileL  481..767 px
//   tablet   768..1024 px
//   desktop  1025..1439 px
//   wide     1440+ px
//
// Consumed by:
//   - any component that needs JS-driven responsive layout
// ============================================================

"use client";

import { useEffect, useState } from "react";

// ==================================================
// TYPES
// ==================================================

export type Breakpoint = "mobileS" | "mobileL" | "tablet" | "desktop" | "wide";

export interface BreakpointResult {
  breakpoint: Breakpoint;
  isMobile: boolean;
  isMobileS: boolean;
  isMobileL: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  isWide: boolean;
  isMobileOrTablet: boolean;
  mounted: boolean;
}

// ==================================================
// BREAKPOINT BOUNDARIES
// ==================================================

export const BREAKPOINTS = {
  mobileS: { min: 0, max: 480 },
  mobileL: { min: 481, max: 767 },
  tablet: { min: 768, max: 1024 },
  desktop: { min: 1025, max: 1439 },
  wide: { min: 1440, max: Infinity },
} as const;

function getBreakpoint(width: number): Breakpoint {
  if (width <= BREAKPOINTS.mobileS.max) return "mobileS";
  if (width <= BREAKPOINTS.mobileL.max) return "mobileL";
  if (width <= BREAKPOINTS.tablet.max) return "tablet";
  if (width <= BREAKPOINTS.desktop.max) return "desktop";
  return "wide";
}

// ==================================================
// HOOK
// ==================================================

export function useBreakpoint(): BreakpointResult {
  // Default to desktop during SSR; minimises layout flash on hydration.
  const [breakpoint, setBreakpoint] = useState<Breakpoint>("desktop");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setBreakpoint(getBreakpoint(window.innerWidth));

    const handleResize = () => setBreakpoint(getBreakpoint(window.innerWidth));

    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(handleResize);
      observer.observe(document.body);
      return () => observer.disconnect();
    }
    window.addEventListener("resize", handleResize, { passive: true });
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const isMobileS = breakpoint === "mobileS";
  const isMobileL = breakpoint === "mobileL";
  const isMobile = isMobileS || isMobileL;
  const isTablet = breakpoint === "tablet";
  const isDesktop = breakpoint === "desktop" || breakpoint === "wide";
  const isWide = breakpoint === "wide";
  const isMobileOrTablet = isMobile || isTablet;

  return {
    breakpoint,
    isMobile,
    isMobileS,
    isMobileL,
    isTablet,
    isDesktop,
    isWide,
    isMobileOrTablet,
    mounted,
  };
}
