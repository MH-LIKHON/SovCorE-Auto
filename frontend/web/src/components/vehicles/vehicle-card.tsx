// ============================================================
// frontend/web/src/components/vehicles/vehicle-card.tsx
// ============================================================
//
// Purpose:
//   Renders a single vehicle card on the /dashboard/vehicles
//   grid. Shows the vehicle image or body-type icon fallback,
//   registration, make/model/year, mileage, health score, and
//   red-amber-green indicators for MOT, tax, insurance and
//   service.
//
// Design:
//   Card visuals mirror SovCorE QR exactly — glass background,
//   18px radius, hairline border, pointer cursor. Uses the Card
//   primitive in glow + clickable mode: sweep animation at the
//   top edge, pop-lift, back glow, and bottom gradient click line
//   all appear on hover.
//
//   RAG indicators are four small circles (12px). Red maps to
//   --colour-error, amber to --colour-amber, green to
//   --colour-teal, unknown/grey to --colour-text-muted/0.3.
//
//   The health score ring is a 40px SVG circle showing the
//   percentage in stroke-dasharray. Phase 5 will supply a real
//   score; until then the API returns 0, displayed as "-".
//
//   Responsive: the grid reflows from 1 column on mobile to 2
//   at md (768 px) to 3 at lg (1024 px). The card itself has a
//   fixed min-width so it does not collapse below readable size.
//
// Consumed by:
//   - frontend/web/app/(dashboard)/dashboard/vehicles/page.tsx
//   - frontend/web/app/(dashboard)/dashboard/page.tsx
// ============================================================

"use client";

import Link from "next/link";

import { Card } from "@/src/components/ui/card";
import { BodyTypeIcon } from "@/src/components/vehicles/body-type-icon";

// ==================================================
// TYPES
// ==================================================

export type RagStatus = "green" | "amber" | "red" | "unknown";

export interface RenewalRag {
  mot: RagStatus;
  tax: RagStatus;
  insurance: RagStatus;
  service: RagStatus;
}

export interface VehicleCard {
  id: string;
  registration: string | null;
  make: string | null;
  model: string | null;
  variant: string | null;
  year: number | null;
  mileage: number | null;
  body_type: string | null;
  lifecycle_state: string;
  image_key: string | null;
  renewals: RenewalRag;
  health_score: number;
  custom_alert_status: RagStatus;
}

interface VehicleCardProps {
  vehicle: VehicleCard;
  accountId: string;
  imageBaseUrl?: string;
}

// ==================================================
// HELPERS
// ==================================================

const API_PUBLIC = process.env.NEXT_PUBLIC_R2_PUBLIC_URL ?? "";

function ragColour(status: RagStatus): string {
  switch (status) {
    case "green":  return "var(--colour-teal)";
    case "amber":  return "var(--colour-amber)";
    case "red":    return "var(--colour-error)";
    default:       return "rgba(136,136,170,0.35)";
  }
}

function ragLabel(status: RagStatus): string {
  switch (status) {
    case "green":  return "valid";
    case "amber":  return "due soon";
    case "red":    return "overdue or expired";
    default:       return "not set";
  }
}

function formatMileage(m: number | null): string {
  if (m === null) return "-";
  return m.toLocaleString("en-GB") + " mi";
}

// ==================================================
// HEALTH RING
// ==================================================

function HealthRing({ score }: { score: number }) {
  const r = 16;
  const circ = 2 * Math.PI * r;
  const dash = score > 0 ? (score / 100) * circ : 0;

  const colour =
    score === 0
      ? "rgba(136,136,170,0.35)"
      : score >= 75
      ? "var(--colour-teal)"
      : score >= 40
      ? "var(--colour-amber)"
      : "var(--colour-error)";

  return (
    <div className="vc-health" aria-label={`Health score: ${score > 0 ? score + "%" : "unknown"}`}>
      <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true">
        {/* Background track */}
        <circle
          cx="20" cy="20" r={r}
          fill="none"
          stroke="rgba(136,136,170,0.18)"
          strokeWidth="3"
        />
        {/* Score arc */}
        <circle
          cx="20" cy="20" r={r}
          fill="none"
          stroke={colour}
          strokeWidth="3"
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          transform="rotate(-90 20 20)"
          style={{ transition: "stroke-dasharray 0.6s cubic-bezier(0.4,0,0.2,1)" }}
        />
      </svg>
      <span className="vc-health__label" style={{ color: colour }}>
        {score > 0 ? `${score}` : "-"}
      </span>
    </div>
  );
}

// ==================================================
// VEHICLE CARD
// ==================================================

export function VehicleCard({ vehicle, accountId }: VehicleCardProps) {
  const title = [vehicle.make, vehicle.model].filter(Boolean).join(" ") || "Vehicle";
  const sub = [vehicle.variant, vehicle.year].filter(Boolean).join(" · ") || null;
  const href = `/dashboard/vehicles/${vehicle.id}`;

  const imageUrl = vehicle.image_key && API_PUBLIC
    ? `${API_PUBLIC}/${vehicle.image_key}`
    : null;

  return (
    <Link href={href} className="vc-link" aria-label={`Open ${title}`}>
      <Card hoverEffect="glow" clickable className="vc-card">
        {/* ~~~~~~~~~ Image / icon panel ~~~~~~~~~ */}
        <div className="vc-media">
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt={title}
              className="vc-media__img"
            />
          ) : (
            <div className="vc-media__fallback">
              <BodyTypeIcon
                bodyType={vehicle.body_type as Parameters<typeof BodyTypeIcon>[0]["bodyType"]}
                size={72}
                className="vc-media__icon"
              />
            </div>
          )}

          {/* Lifecycle badge — shown when not active */}
          {vehicle.lifecycle_state !== "active" && (
            <span className="vc-lifecycle-badge">
              {vehicle.lifecycle_state}
            </span>
          )}
        </div>

        {/* ~~~~~~~~~ Body ~~~~~~~~~ */}
        <div className="vc-body">
          <div className="vc-plate">
            {vehicle.registration ?? "No plate"}
          </div>

          <p className="vc-title">{title}</p>
          {sub && <p className="vc-sub">{sub}</p>}

          <div className="vc-meta">
            <span className="vc-mileage">{formatMileage(vehicle.mileage)}</span>
            <HealthRing score={vehicle.health_score} />
          </div>

          <div className="vc-rag">
            {(["mot", "tax", "insurance", "service"] as const).map((key) => {
              const s = vehicle.renewals[key];
              return (
                <div
                  key={key}
                  className="vc-rag__item"
                  title={`${key.toUpperCase()}: ${ragLabel(s)}`}
                  aria-label={`${key.toUpperCase()} ${ragLabel(s)}`}
                >
                  <span
                    className="vc-rag__dot"
                    style={{ background: ragColour(s) }}
                    aria-hidden="true"
                  />
                  <span className="vc-rag__label">{key.toUpperCase()}</span>
                </div>
              );
            })}
            {/* 5th dot: worst-case status across all custom alerts */}
            {vehicle.custom_alert_status !== "unknown" && (
              <div
                className="vc-rag__item"
                title={`Alerts: ${ragLabel(vehicle.custom_alert_status)}`}
                aria-label={`Alerts ${ragLabel(vehicle.custom_alert_status)}`}
              >
                <span
                  className="vc-rag__dot"
                  style={{ background: ragColour(vehicle.custom_alert_status) }}
                  aria-hidden="true"
                />
                <span className="vc-rag__label">ALERTS</span>
              </div>
            )}
          </div>
        </div>

        <style>{CARD_STYLES}</style>
      </Card>
    </Link>
  );
}

// ==================================================
// STYLES — mirrored from SovCorE QR card visual language
// ==================================================

const CARD_STYLES = `
  .vc-link { text-decoration: none; display: block; }

  .vc-card {
    padding: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    min-width: 240px;
    transition: transform 0.2s cubic-bezier(0.34,1.56,0.64,1);
  }

  /* ---- Media panel ---- */
  .vc-media {
    position: relative;
    height: 140px;
    background: rgba(14,14,22,0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    border-bottom: 0.5px solid var(--colour-border);
    overflow: hidden;
  }
  .vc-media__img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .vc-media__fallback {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    background: linear-gradient(135deg, rgba(108,99,255,0.06) 0%, rgba(0,212,255,0.04) 100%);
  }
  .vc-media__icon { color: rgba(136,136,170,0.4); }

  /* Lifecycle badge — absolute over the media panel */
  .vc-lifecycle-badge {
    position: absolute;
    top: 10px;
    right: 10px;
    background: rgba(0,0,0,0.65);
    border: 1px solid rgba(255,255,255,0.12);
    color: var(--colour-text-muted);
    font-size: var(--text-xs);
    padding: 2px 8px;
    border-radius: var(--radius-full);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
  }

  /* ---- Body ---- */
  .vc-body { padding: var(--space-5); display: flex; flex-direction: column; gap: var(--space-3); flex: 1; }

  /* Registration plate — yellow, bold, monospace-adjacent */
  .vc-plate {
    display: inline-block;
    align-self: flex-start;
    font-size: var(--text-sm);
    font-weight: var(--weight-semibold);
    letter-spacing: 0.1em;
    background: #f0c30f;
    color: #1a1a1a;
    padding: 2px 10px;
    border-radius: 4px;
    font-family: "UK Number Plate", monospace, sans-serif;
    text-transform: uppercase;
  }

  .vc-title { font-size: var(--text-md); font-weight: var(--weight-medium); color: var(--colour-text); margin: 0; }
  .vc-sub { font-size: var(--text-sm); color: var(--colour-text-muted); margin: 0; }

  /* Mileage + health row */
  .vc-meta { display: flex; align-items: center; justify-content: space-between; margin-top: var(--space-1); }
  .vc-mileage { font-size: var(--text-sm); color: var(--colour-text-muted); }

  /* Health ring */
  .vc-health { position: relative; width: 40px; height: 40px; flex-shrink: 0; }
  .vc-health__label {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    font-weight: var(--weight-semibold);
  }

  /* RAG strip */
  .vc-rag { display: flex; gap: var(--space-3); flex-wrap: wrap; padding-top: var(--space-2); border-top: 0.5px solid var(--colour-border); }
  .vc-rag__item { display: flex; align-items: center; gap: 4px; }
  .vc-rag__dot { display: block; width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .vc-rag__label { font-size: 10px; color: var(--colour-text-muted); letter-spacing: 0.05em; }
`;
