// ============================================================
// frontend/web/src/components/ui/copyright.tsx
// ============================================================
//
// Purpose:
//   Universal copyright line. Renders:
//     (c) {year} SoVCorE. All rights reserved.
//
// Origin:
//   Copied verbatim from SovCorE QR src/components/ui/copyright.tsx.
//
// Design:
//   Year is computed from Date at render time so no manual
//   update is needed when the calendar rolls over. Brand name
//   comes from the shared brand constants.
//
// Consumed by:
//   - src/components/layout/footer.tsx
// ============================================================

import { BRAND_LEGAL } from "@/src/lib/constants/brand";

// ==================================================
// TYPES
// ==================================================

interface CopyrightProps {
  className?: string;
}

// ==================================================
// COPYRIGHT COMPONENT
// ==================================================

export function Copyright({ className }: CopyrightProps) {
  const year = new Date().getFullYear();

  return (
    <p
      className={className}
      style={{
        fontSize: 11,
        color: "var(--colour-text-faint, rgba(136,136,170,0.45))",
        lineHeight: 1,
        margin: 0,
      }}
    >
      &copy; {year} {BRAND_LEGAL}. All rights reserved.
    </p>
  );
}
