// ============================================================
// frontend/web/src/components/shared/marquee-strip.tsx
// ============================================================
//
// Origin:
//   Pattern mirrored from SovCorE QR src/components/shared/
//   marquee-strip.tsx. Identical visual behaviour (infinite
//   right-to-left scroll, two duplicated copies for seamless
//   loop, alternating accent colour for rhythm). Only the data
//   differs: Auto vehicle management capabilities.
//
// Design:
//   The track contains two identical copies of the item list.
//   marqueeScroll translates the track by -50% (one full copy
//   width) so when the first copy is off-screen the second
//   copy is exactly in its place — seamless loop.
//
// Consumed by:
//   - app/page.tsx (between hero and stats row)
// ============================================================

import type { CSSProperties } from "react";

// ==================================================
// DATA
// ==================================================

const ITEMS: Array<{ text: string; accent: boolean }> = [
  { text: "MOT reminders", accent: true },
  { text: "Road tax and SORN alerts", accent: false },
  { text: "Insurance renewal tracking", accent: true },
  { text: "Fuel log and analytics", accent: false },
  { text: "Expense and cost-per-mile tracking", accent: true },
  { text: "Document and certificate storage", accent: false },
  { text: "Service and maintenance records", accent: true },
  { text: "ULEZ compliance checks", accent: false },
  { text: "Multi-vehicle fleet overview", accent: true },
  { text: "Role-based team access", accent: false },
];

// ==================================================
// STYLE HELPERS
// ==================================================

function itemStyle(accent: boolean): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: "10px",
    padding: "0 32px",
    fontSize: "11px",
    letterSpacing: "1.8px",
    textTransform: "uppercase",
    whiteSpace: "nowrap",
    color: accent ? "rgba(108, 99, 255, 0.75)" : "rgba(136, 136, 170, 0.55)",
  };
}

function dotStyle(accent: boolean): CSSProperties {
  return {
    width: "3px",
    height: "3px",
    borderRadius: "50%",
    background: accent ? "rgba(108, 99, 255, 0.50)" : "rgba(136, 136, 170, 0.30)",
    flexShrink: 0,
  };
}

// ==================================================
// COMPONENT
// ==================================================

export function MarqueeStrip() {
  return (
    <div
      aria-hidden="true"
      style={{
        borderTop: "1px solid rgba(108, 99, 255, 0.15)",
        borderBottom: "1px solid rgba(108, 99, 255, 0.15)",
        padding: "18px 0",
        overflow: "hidden",
        pointerEvents: "none",
        position: "relative",
        zIndex: 1,
      }}
    >
      {/* Track — two identical copies for continuous looping. */}
      <div
        style={{
          display: "flex",
          width: "max-content",
          alignItems: "center",
          animation: "marqueeScroll 28s linear infinite",
        }}
      >
        {ITEMS.map((item, i) => (
          <span key={`a-${i}`} style={itemStyle(item.accent)}>
            <span style={dotStyle(item.accent)} />
            {item.text}
          </span>
        ))}
        {ITEMS.map((item, i) => (
          <span key={`b-${i}`} style={itemStyle(item.accent)}>
            <span style={dotStyle(item.accent)} />
            {item.text}
          </span>
        ))}
      </div>
    </div>
  );
}
