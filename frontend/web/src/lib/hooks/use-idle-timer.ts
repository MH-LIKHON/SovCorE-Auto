// ============================================================
// frontend/web/src/lib/hooks/use-idle-timer.ts
// ============================================================
//
// Purpose:
//   GDPR-compliant idle-session timer. Tracks user activity via
//   DOM events and fires a warning callback when the user has
//   been idle for (timeoutMinutes - warningLeadSeconds). If the
//   user does not acknowledge within warningLeadSeconds it fires
//   the logout callback.
//
// Design:
//   A single interval polls the last-activity timestamp instead
//   of chaining setTimeout calls, which avoids timer drift on
//   suspended tabs. The interval runs every 5 seconds — coarse
//   enough not to hurt performance, fine enough for a 5-minute
//   minimum timeout.
//
//   Background tab handling:
//     Chrome and Safari throttle setInterval to ~1 minute when a
//     tab is in the background. A visibilitychange listener fires
//     the moment the tab becomes visible again and immediately
//     evaluates the elapsed idle time, so there is no 1-minute
//     grace period given to a returning user who was already past
//     the threshold.
//
//   Activity events: mousemove, keydown, pointerdown, scroll,
//   touchstart. Stored on window so the same listener set works
//   across nested iframes within the same origin.
//
//   The caller (dashboard layout) passes:
//     timeoutMinutes  — user preference from /api/v1/auth/me
//     onWarn          — show the warning modal + pass remaining seconds
//     onLogout        — perform the actual logout
//     onActivity      — dismiss the warning modal (user moved)
//
// Consumed by:
//   - frontend/web/app/(dashboard)/layout.tsx
// ============================================================

"use client";

import { useCallback, useEffect, useRef } from "react";

// ==================================================
// CONSTANTS
// ==================================================

// How many seconds before the hard logout to show the warning.
const WARNING_LEAD_SECONDS = 60;

// Poll interval in milliseconds.
const POLL_MS = 5_000;

// DOM events that count as user activity.
const ACTIVITY_EVENTS: (keyof WindowEventMap)[] = [
  "mousemove",
  "keydown",
  "pointerdown",
  "scroll",
  "touchstart",
];

// ==================================================
// HOOK
// ==================================================

export interface UseIdleTimerOptions {
  /** Idle timeout in minutes (from user preferences). */
  timeoutMinutes: number;
  /** Called when the user enters the warning window. Receives seconds remaining. */
  onWarn: (secondsLeft: number) => void;
  /** Called when the idle timer fully expires — perform logout here. */
  onLogout: () => void;
  /** Called when activity is detected while the warning is showing. */
  onActivity: () => void;
}

export function useIdleTimer({
  timeoutMinutes,
  onWarn,
  onLogout,
  onActivity,
}: UseIdleTimerOptions): void {
  const lastActivityRef = useRef<number>(Date.now());
  const warningSentRef = useRef<boolean>(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Stable callback refs so the interval closure does not go stale.
  const onWarnRef = useRef(onWarn);
  const onLogoutRef = useRef(onLogout);
  const onActivityRef = useRef(onActivity);

  useEffect(() => { onWarnRef.current = onWarn; }, [onWarn]);
  useEffect(() => { onLogoutRef.current = onLogout; }, [onLogout]);
  useEffect(() => { onActivityRef.current = onActivity; }, [onActivity]);

  const resetActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    if (warningSentRef.current) {
      warningSentRef.current = false;
      onActivityRef.current();
    }
  }, []);

  useEffect(() => {
    const timeoutMs = timeoutMinutes * 60 * 1_000;
    const warnAtMs = timeoutMs - WARNING_LEAD_SECONDS * 1_000;

    // ~~~~~~~~~ Shared idle evaluation ~~~~~~~~~
    // Extracted so both the interval and the visibility handler use
    // the same logic without duplicating it.
    function _evaluate() {
      const idleMs = Date.now() - lastActivityRef.current;
      if (idleMs >= timeoutMs) {
        clearInterval(intervalRef.current!);
        onLogoutRef.current();
        return;
      }
      if (idleMs >= warnAtMs && !warningSentRef.current) {
        warningSentRef.current = true;
        const secondsLeft = Math.ceil((timeoutMs - idleMs) / 1_000);
        onWarnRef.current(secondsLeft);
      }
    }

    // ~~~~~~~~~ Register activity listeners ~~~~~~~~~
    const handler = resetActivity;
    ACTIVITY_EVENTS.forEach((ev) => window.addEventListener(ev, handler, { passive: true }));

    // ~~~~~~~~~ Poll for idle state ~~~~~~~~~
    intervalRef.current = setInterval(_evaluate, POLL_MS);

    // ~~~~~~~~~ Visibility change handler ~~~~~~~~~
    // Chrome/Safari throttle setInterval to ~1 minute in background tabs.
    // On returning to the tab, immediately check whether the threshold was
    // exceeded while the tab was hidden — no extra grace period is given.
    function _handleVisibilityChange() {
      if (document.visibilityState !== "visible") return;
      _evaluate();
    }
    document.addEventListener("visibilitychange", _handleVisibilityChange);

    return () => {
      ACTIVITY_EVENTS.forEach((ev) => window.removeEventListener(ev, handler));
      if (intervalRef.current) clearInterval(intervalRef.current);
      document.removeEventListener("visibilitychange", _handleVisibilityChange);
    };
  }, [timeoutMinutes, resetActivity]);
}
