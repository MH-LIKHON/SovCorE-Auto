// ============================================================
// frontend/web/src/hooks/use-scroll-reveal.ts
// ============================================================
//
// Purpose:
//   Observes when an element enters the viewport and returns a
//   boolean that components use to trigger entrance animations.
//   Once visible, the observer disconnects so the animation
//   plays only once per session.
//
// Origin:
//   Copied verbatim from SovCorE QR src/hooks/use-scroll-reveal.ts,
//   which mirrors the upstream SovCorE platform hook.
//
// Robustness notes:
//   React Strict Mode double-invokes effects (mount → cleanup →
//   remount). hasBeenVisible is a ref (not state) so it survives
//   the unmount/remount cycle and the remounted effect can skip
//   straight to setIsVisible(true).
//
//   A 1 200 ms safety-net timer ensures content is never
//   permanently hidden if the observer fails entirely.
//
// Consumed by:
//   - src/components/ui/scroll-reveal.tsx
// ============================================================

"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

// ==================================================
// TYPES
// ==================================================

interface UseScrollRevealOptions {
  threshold?: number;
  delay?: number;
}

interface UseScrollRevealResult {
  ref: RefObject<HTMLDivElement | null>;
  isVisible: boolean;
}

// ==================================================
// HOOK
// ==================================================

export function useScrollReveal({
  threshold = 0,
  delay = 0,
}: UseScrollRevealOptions = {}): UseScrollRevealResult {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const hasBeenVisible = useRef(false);

  useEffect(() => {
    // Strict Mode remount path: already observed once, restore now.
    if (hasBeenVisible.current) {
      setIsVisible(true);
      return;
    }

    const element = ref.current;
    if (!element) return;

    // Synchronous check: if already in viewport at mount, reveal immediately.
    const rect = element.getBoundingClientRect();
    if (rect.top < window.innerHeight && rect.bottom > 0) {
      hasBeenVisible.current = true;
      if (delay > 0) {
        setTimeout(() => setIsVisible(true), delay);
      } else {
        setIsVisible(true);
      }
      return;
    }

    if (typeof IntersectionObserver === "undefined") {
      hasBeenVisible.current = true;
      setIsVisible(true);
      return;
    }

    const reveal = () => {
      hasBeenVisible.current = true;
      if (delay > 0) {
        setTimeout(() => setIsVisible(true), delay);
      } else {
        setIsVisible(true);
      }
    };

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          reveal();
          observer.disconnect();
        }
      },
      { threshold, rootMargin: "0px 0px 50px 0px" },
    );

    observer.observe(element);

    // Safety net: never leave content permanently hidden.
    const fallback = setTimeout(reveal, 1200);

    return () => {
      observer.disconnect();
      clearTimeout(fallback);
    };
  }, [threshold, delay]);

  return { ref, isVisible };
}
