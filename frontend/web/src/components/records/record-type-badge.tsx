// ============================================================
// frontend/web/src/components/records/record-type-badge.tsx
// ============================================================
//
// Purpose:
//   Renders a colour-coded badge for a record type. Each type
//   has a fixed accent colour drawn from the CSS design tokens
//   so the badge is visually consistent across the records list,
//   timeline and vehicle card.
//
// Design:
//   Uses inline styles referencing CSS custom properties so the
//   badge respects the global theme. No animation needed here.
//
// Consumed by:
//   - frontend/web/app/(dashboard)/dashboard/vehicles/[id]/records/page.tsx
//   - frontend/web/app/(dashboard)/dashboard/vehicles/[id]/timeline/page.tsx
// ============================================================

// ==================================================
// TYPE COLOUR MAP
// ==================================================

const TYPE_COLOURS: Record<string, string> = {
  maintenance:  "var(--colour-accent)",
  repair:       "var(--colour-accent2, #6c63ff)",
  fuel:         "#22c55e",
  mot:          "#f59e0b",
  tax:          "#06b6d4",
  insurance:    "#8b5cf6",
  parking:      "#64748b",
  pcn:          "var(--colour-error)",
  cleaning:     "#0ea5e9",
  accessories:  "#d946ef",
  warranty:     "#10b981",
  diagnostics:  "#f97316",
  damage:       "#ef4444",
  roadside:     "#fb923c",
  custom:       "#94a3b8",
  odometer:     "var(--colour-teal, #00d4aa)",
};

const TYPE_LABELS: Record<string, string> = {
  maintenance:  "Maintenance",
  repair:       "Repair",
  fuel:         "Fuel",
  mot:          "MOT",
  tax:          "Tax",
  insurance:    "Insurance",
  parking:      "Parking",
  pcn:          "PCN",
  cleaning:     "Cleaning",
  accessories:  "Accessories",
  warranty:     "Warranty",
  diagnostics:  "Diagnostics",
  damage:       "Damage",
  roadside:     "Roadside",
  custom:       "Miscellaneous",
  odometer:     "Odometer",
};

// ==================================================
// COMPONENT
// ==================================================

interface RecordTypeBadgeProps {
  type: string;
}

export function RecordTypeBadge({ type }: RecordTypeBadgeProps) {
  const colour = TYPE_COLOURS[type] ?? "#94a3b8";
  const label  = TYPE_LABELS[type]  ?? type;

  return (
    <span
      style={{
        display:       "inline-block",
        padding:       "2px 9px",
        borderRadius:  "var(--radius-full, 999px)",
        fontSize:      "var(--text-xs)",
        fontWeight:    "var(--weight-medium)",
        background:    `${colour}22`,
        color:         colour,
        whiteSpace:    "nowrap",
        border:        `1px solid ${colour}44`,
        letterSpacing: "0.03em",
      }}
    >
      {label}
    </span>
  );
}
