// ============================================================
// frontend/web/src/components/vehicles/body-type-icon.tsx
// ============================================================
//
// Purpose:
//   Returns an SVG silhouette icon for a vehicle body type.
//   Used on the vehicle card when no photo has been uploaded.
//
// Design:
//   Each icon is a minimal SVG side-view silhouette drawn at
//   48 × 24 px. Colour is inherited from `currentColor` so the
//   parent component controls it. An "unknown" fallback renders
//   a generic sedan outline.
//
// Consumed by:
//   - frontend/web/src/components/vehicles/vehicle-card.tsx
// ============================================================

// ==================================================
// TYPES
// ==================================================

type BodyType =
  | "hatchback"
  | "saloon"
  | "estate"
  | "suv"
  | "convertible"
  | "van"
  | "mpv"
  | null
  | undefined;

interface BodyTypeIconProps {
  bodyType: BodyType;
  size?: number;
  className?: string;
}

// ==================================================
// ICON MAP
// ==================================================

// Each path is a simplified side-view silhouette at 48×24 viewBox.

const PATHS: Record<string, string> = {
  hatchback:
    "M6 18 L6 14 L10 8 L20 6 L32 6 L38 10 L42 14 L42 18 Z M10 18 A4 4 0 1 0 18 18 A4 4 0 1 0 10 18 M30 18 A4 4 0 1 0 38 18 A4 4 0 1 0 30 18",
  saloon:
    "M4 18 L4 13 L9 7 L22 5 L34 5 L40 10 L44 14 L44 18 Z M10 18 A4 4 0 1 0 18 18 A4 4 0 1 0 10 18 M30 18 A4 4 0 1 0 38 18 A4 4 0 1 0 30 18",
  estate:
    "M4 18 L4 12 L8 7 L20 5 L38 5 L44 10 L44 18 Z M10 18 A4 4 0 1 0 18 18 A4 4 0 1 0 10 18 M30 18 A4 4 0 1 0 38 18 A4 4 0 1 0 30 18",
  suv:
    "M4 18 L4 10 L8 6 L20 4 L36 4 L42 8 L44 14 L44 18 Z M9 18 A4 4 0 1 0 17 18 A4 4 0 1 0 9 18 M31 18 A4 4 0 1 0 39 18 A4 4 0 1 0 31 18",
  convertible:
    "M6 18 L6 14 L12 9 L20 7 L34 7 L40 12 L42 18 Z M10 18 A4 4 0 1 0 18 18 A4 4 0 1 0 10 18 M30 18 A4 4 0 1 0 38 18 A4 4 0 1 0 30 18",
  van:
    "M2 18 L2 8 L6 4 L14 4 L42 4 L44 8 L44 18 Z M8 18 A4 4 0 1 0 16 18 A4 4 0 1 0 8 18 M30 18 A4 4 0 1 0 38 18 A4 4 0 1 0 30 18",
  mpv:
    "M4 18 L4 9 L8 5 L16 4 L38 4 L44 9 L44 18 Z M9 18 A4 4 0 1 0 17 18 A4 4 0 1 0 9 18 M31 18 A4 4 0 1 0 39 18 A4 4 0 1 0 31 18",
};

const FALLBACK =
  "M4 18 L4 13 L9 7 L22 5 L34 5 L40 10 L44 14 L44 18 Z M10 18 A4 4 0 1 0 18 18 A4 4 0 1 0 10 18 M30 18 A4 4 0 1 0 38 18 A4 4 0 1 0 30 18";

// ==================================================
// COMPONENT
// ==================================================

export function BodyTypeIcon({ bodyType, size = 48, className }: BodyTypeIconProps) {
  const path = bodyType ? (PATHS[bodyType] ?? FALLBACK) : FALLBACK;
  const height = Math.round(size * 0.5);

  return (
    <svg
      width={size}
      height={height}
      viewBox="0 0 48 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d={path} />
    </svg>
  );
}
