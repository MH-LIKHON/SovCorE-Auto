// ============================================================
// frontend/web/src/components/shared/stats-row.tsx
// ============================================================
//
// Origin:
//   Pattern mirrored from SovCorE QR src/components/shared/
//   stats-row.tsx. Same visual treatment (4-cell grid with a
//   1 px gap exposing the container background as dividers,
//   gradient value text, ScrollReveal entrance, 2x2 on mobile,
//   single row on desktop). Only the stat values differ:
//   Auto vehicle management claims.
//
// Design:
//   The 1 px gap trick: grid container has a faint background,
//   cells sit on top, the 1 px gap exposes the container colour
//   as a thin divider. Cleaner than per-cell borders.
//
//   Responsive layout is driven by CSS media queries (not the
//   useBreakpoint JS hook) so the server renders the correct
//   column count and there is no hydration layout shift.
//
// Consumed by:
//   - app/page.tsx (between marquee and pillars)
// ============================================================

"use client";

import { ScrollReveal } from "@/src/components/ui/scroll-reveal";

// ==================================================
// DATA
// ==================================================

const STATS = [
  { id: "uk-first",       value: "UK-first",   label: "MOT, SORN, ULEZ alerts" },
  { id: "vehicles",       value: "Unlimited",  label: "Vehicles per account" },
  { id: "reminder-types", value: "20+",        label: "Reminder and task types" },
  { id: "latency",        value: "Sub-100 ms", label: "Dashboard load" },
] as const;

// ==================================================
// COMPONENT
// ==================================================

export function StatsRow() {
  return (
    <section className="stats-section" style={{ position: "relative", zIndex: 1 }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <ScrollReveal>
          <div
            className="stats-grid"
            style={{
              gap: "1px",
              background: "rgba(255, 255, 255, 0.06)",
              borderRadius: "var(--radius-xl)",
              overflow: "hidden",
              border: "1px solid rgba(255, 255, 255, 0.06)",
            }}
          >
            {STATS.map((stat) => (
              <div
                key={stat.id}
                className="stats-cell"
                style={{
                  background: "rgba(14, 14, 22, 0.90)",
                  textAlign: "center",
                  transition: "background var(--duration-normal)",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLDivElement).style.background =
                    "rgba(20, 20, 34, 0.95)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLDivElement).style.background =
                    "rgba(14, 14, 22, 0.90)";
                }}
              >
                <div
                  className="stats-value"
                  style={{
                    fontWeight: 500,
                    letterSpacing: "-0.5px",
                    marginBottom: 6,
                    background:
                      "linear-gradient(90deg, var(--colour-accent), var(--colour-accent2))",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    backgroundClip: "text",
                    lineHeight: 1,
                  }}
                >
                  {stat.value}
                </div>
                <p
                  style={{
                    fontSize: "var(--text-xs)",
                    color: "var(--colour-text-muted)",
                    letterSpacing: "var(--tracking-wide)",
                    margin: 0,
                  }}
                >
                  {stat.label}
                </p>
              </div>
            ))}
          </div>
        </ScrollReveal>
      </div>

      <style>{STATS_STYLES}</style>
    </section>
  );
}

// ==================================================
// STYLES
// ==================================================

const STATS_STYLES = `
  /* ---- Desktop base ---- */
  .stats-section { padding: var(--space-20) var(--space-10); }
  .stats-grid    { display: grid; grid-template-columns: repeat(4, 1fr); }
  .stats-cell    { padding: 36px 28px; }
  .stats-value   { font-size: 28px; }

  /* ---- Tablet: 2-column grid ---- */
  @media (max-width: 1023px) {
    .stats-section { padding: var(--space-16) var(--space-6); }
    .stats-grid    { grid-template-columns: repeat(2, 1fr); }
    .stats-cell    { padding: 28px 20px; }
    .stats-value   { font-size: 22px; }
  }

  /* ---- Small phone ---- */
  @media (max-width: 479px) {
    .stats-section { padding: var(--space-12) var(--space-5); }
    .stats-cell    { padding: 24px 16px; }
    .stats-value   { font-size: 20px; }
  }
`;
