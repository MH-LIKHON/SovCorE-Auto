// ============================================================
// frontend/web/src/components/shared/divider-line.tsx
// ============================================================
//
// Origin:
//   Mirrored from SovCorE QR src/components/shared/divider-line.tsx.
//
// Purpose:
//   A single-pixel horizontal gradient rule used to separate
//   sections on the marketing pages. Fades from transparent at
//   the edges through purple-to-cyan in the middle.
//
// Consumed by:
//   - app/page.tsx (between sections)
// ============================================================

// ==================================================
// TYPES
// ==================================================

interface DividerLineProps {
  margin?: string;
}

// ==================================================
// COMPONENT
// ==================================================

export function DividerLine({ margin = "0 var(--space-10)" }: DividerLineProps) {
  return (
    <hr
      aria-hidden="true"
      style={{
        border: "none",
        height: "1px",
        background:
          "linear-gradient(90deg, transparent, rgba(108, 99, 255, 0.30), rgba(0, 212, 255, 0.20), transparent)",
        margin,
      }}
    />
  );
}
