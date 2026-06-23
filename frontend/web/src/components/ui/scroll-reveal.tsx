// ============================================================
// frontend/web/src/components/ui/scroll-reveal.tsx
// ============================================================
//
// Purpose:
//   Wrapper component that applies a fade-up entrance animation
//   when the wrapped content enters the viewport. Abstracts
//   useScrollReveal so callers do not wire the hook themselves.
//
// Origin:
//   Copied verbatim from SovCorE QR src/components/ui/scroll-reveal.tsx.
//
// Consumed by:
//   - any page section that needs a scroll-triggered entrance
// ============================================================

"use client";

import { useEffect, useState } from "react";
import { useScrollReveal } from "@/src/hooks/use-scroll-reveal";
import type { CSSProperties, ReactNode } from "react";

// ==================================================
// TYPES
// ==================================================

interface ScrollRevealProps {
  children: ReactNode;
  delay?: number;
  threshold?: number;
  duration?: number;
  className?: string;
}

// ==================================================
// COMPONENT
// ==================================================

export function ScrollReveal({
  children,
  delay = 0,
  threshold = 0,
  duration = 800,
  className,
}: ScrollRevealProps) {
  // mounted tracks hydration. During SSR, opacity:1 so the SSR
  // and hydration outputs are identical (no hydration mismatch).
  const [mounted, setMounted] = useState(false);
  const { ref, isVisible } = useScrollReveal({ threshold, delay });

  useEffect(() => {
    setMounted(true);
  }, []);

  const hidden = mounted && !isVisible;

  const style: CSSProperties = {
    opacity: hidden ? 0 : 1,
    transform: hidden ? "translateY(40px)" : "translateY(0px)",
    transition: mounted ? [`opacity ${duration}ms ease`, `transform ${duration}ms ease`].join(", ") : "none",
    willChange: hidden ? "transform" : "auto",
  };

  return (
    <div ref={ref} style={style} className={className}>
      {children}
    </div>
  );
}
