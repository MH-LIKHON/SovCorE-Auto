// ============================================================
// frontend/web/src/lib/text.ts
// ============================================================
//
// Purpose:
//   Shared input-normalisation helpers used in onChange handlers
//   across all form fields. Centralised here so the casing rules
//   live in one place and every field stays consistent.
//
// Rules:
//   toAllCaps      — identifiers: registration, VIN, fault code,
//                    part number, PCN reference, alert name
//   toTitleCase    — proper nouns: make, model, garage, supplier,
//                    names, places, organisations
//   toSentenceCase — free text: notes, descriptions, titles
// ============================================================

export function toAllCaps(s: string): string {
  return s.toUpperCase();
}

export function toTitleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

export function toSentenceCase(s: string): string {
  return s.replace(/(^|[.!?]\s+)([a-z])/g, (_, p, c) => p + c.toUpperCase());
}
