// ============================================================
// frontend/web/src/lib/constants/brand.ts
// ============================================================
//
// Purpose:
//   Single source of truth for brand-level constants shared
//   across the SovCorE Auto frontend. Mirrors the upstream
//   module in the SovCorE platform so the wordmark and
//   copyright holder read identically across the suite.
//
// Consumed by:
//   - src/components/ui/copyright.tsx  (year + brand name)
//   - src/components/ui/brand-lockup.tsx (logo + brand name)
// ============================================================

// ==================================================
// BRAND CONSTANTS
// ==================================================

// Wordmark shown next to the logo across every surface.
export const BRAND_NAME = "SoVCorE";

// Legal entity name used in the copyright line.
export const BRAND_LEGAL = "SoVCorE";

// Product label shown next to the brand mark inside this app.
export const PRODUCT_LABEL = "Auto";
