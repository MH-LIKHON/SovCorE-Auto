// ============================================================
// frontend/web/app/(dashboard)/dashboard/vehicles/[id]/layout.tsx
// ============================================================
//
// Purpose:
//   Per-vehicle layout shell. Renders a sticky header bar
//   (back link, registration plate, vehicle name, lifecycle
//   badge), a primary tab strip of six groups, and a secondary
//   sub-tab strip that appears when the active group has children.
//   Children mount below the bars.
//
// Design:
//   Fetches minimal vehicle data on mount (same GET endpoint
//   that page.tsx uses — Next.js deduplicates in-flight fetches).
//   usePathname() drives active-tab highlighting for both rows.
//   body:has(.vl-sticky) removes dash-main's top padding so the
//   bar reaches flush to the top of the scroll container.
//
//   Groups: Overview · Media · Manage · Records · Analytics · History
//   Sub-tabs are derived from NAV_GROUPS and scroll horizontally.
//
// Consumed by:
//   - All routes under /dashboard/vehicles/[id]/*
// ============================================================

"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { Badge } from "@/src/components/ui/badge";
import { apiFetch, getAccountId } from "@/src/lib/api/fetch";

// ==================================================
// TYPES
// ==================================================

interface VehicleMinimal {
  id: string;
  make: string | null;
  model: string | null;
  registration: string | null;
  lifecycle_state: "active" | "sold" | "scrapped" | "archived";
}

// ==================================================
// CONSTANTS
// ==================================================

const BADGE_TONE: Record<VehicleMinimal["lifecycle_state"], "success" | "muted"> = {
  active:   "success",
  sold:     "muted",
  scrapped: "muted",
  archived: "muted",
};

const BADGE_LABEL: Record<VehicleMinimal["lifecycle_state"], string> = {
  active:   "ACTIVE",
  sold:     "SOLD",
  scrapped: "SCRAPPED",
  archived: "ARCHIVED",
};

type SubTab  = { readonly label: string; readonly segment: string };
type NavGroup = {
  readonly label:          string;
  readonly defaultSegment: string | null;
  readonly subTabs:        readonly SubTab[];
};

const NAV_GROUPS: readonly NavGroup[] = [
  { label: "Overview",  defaultSegment: null,       subTabs: [] },
  { label: "Media",     defaultSegment: "photos",   subTabs: [
    { label: "Photos",    segment: "photos" },
    { label: "Documents", segment: "documents" },
  ]},
  { label: "Manage",    defaultSegment: "tasks",    subTabs: [
    { label: "Tasks",     segment: "tasks" },
    { label: "Reminders", segment: "reminders" },
    { label: "Alerts",    segment: "alerts" },
  ]},
  { label: "Records",   defaultSegment: "records",  subTabs: [] },
  { label: "Analytics", defaultSegment: "expenses", subTabs: [
    { label: "Expenses",      segment: "expenses" },
    { label: "Odometer",      segment: "mileage" },
    { label: "Maintenance",   segment: "maintenance" },
    { label: "Repairs",       segment: "repairs" },
    { label: "Damage",        segment: "damage" },
    { label: "Diagnostics",   segment: "diagnostics" },
    { label: "Insurance",     segment: "insurance" },
    { label: "Warranty",      segment: "warranty" },
    { label: "Roadside",      segment: "roadside" },
    { label: "MOT",           segment: "mot" },
    { label: "Tax",           segment: "tax" },
    { label: "Fuel",          segment: "fuel" },
    { label: "Parking",       segment: "parking" },
    { label: "PCNs",          segment: "pcns" },
    { label: "Cleaning",      segment: "cleaning" },
    { label: "Accessories",   segment: "accessories" },
    { label: "Miscellaneous", segment: "miscellaneous" },
  ]},
  { label: "History",   defaultSegment: "timeline", subTabs: [
    { label: "Timeline",  segment: "timeline" },
    { label: "Audit",     segment: "audit" },
  ]},
];

function resolveActiveGroup(pathname: string, base: string): NavGroup {
  for (const group of NAV_GROUPS) {
    if (group.subTabs.length > 0) {
      if (group.subTabs.some((st) => pathname.startsWith(`${base}/${st.segment}`))) return group;
    } else if (group.defaultSegment === null) {
      if (pathname === base) return group;
    } else {
      if (pathname.startsWith(`${base}/${group.defaultSegment}`)) return group;
    }
  }
  return NAV_GROUPS[0] as NavGroup;
}

// ==================================================
// LAYOUT
// ==================================================

export default function VehicleLayout({ children }: { children: ReactNode }) {
  const { id } = useParams<{ id: string }>();
  const pathname  = usePathname();
  const accountId = getAccountId() ?? "";

  const [vehicle, setVehicle] = useState<VehicleMinimal | null>(null);

  useEffect(() => {
    if (!accountId || !id) return;
    apiFetch(`/api/v1/accounts/${accountId}/vehicles/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setVehicle(d));
  }, [accountId, id]);

  const base         = `/dashboard/vehicles/${id}`;
  const title        = vehicle
    ? [vehicle.make, vehicle.model].filter(Boolean).join(" ") || "Vehicle"
    : "";
  const activeGroup  = resolveActiveGroup(pathname, base);
  const activeSubTabs = activeGroup.subTabs;

  return (
    <>
      {/* ──────────── Sticky nav shell ──────────── */}
      <div className="vl-sticky">
        {/* Row 1: back · registration (centre) · name + badge (right) */}
        <div className="vl-bar">
          <div className="vl-bar-left">
            <Link href="/dashboard/vehicles" className="vl-back sov-link">← Vehicles</Link>
          </div>
          <div className="vl-bar-center">
            {vehicle?.registration && (
              <span className="vd-plate">{vehicle.registration}</span>
            )}
          </div>
          <div className="vl-bar-right">
            {vehicle && (
              <>
                <span className="vl-title">{title}</span>
                <Badge tone={BADGE_TONE[vehicle.lifecycle_state]}>
                  {BADGE_LABEL[vehicle.lifecycle_state]}
                </Badge>
              </>
            )}
          </div>
        </div>

        {/* Row 2: primary group strip */}
        <nav className="vl-tabs" aria-label="Vehicle sections">
          {NAV_GROUPS.map((group) => {
            const href = group.defaultSegment ? `${base}/${group.defaultSegment}` : base;
            return (
              <Link
                key={group.label}
                href={href}
                className={activeGroup.label === group.label ? "vl-tab vl-tab--active" : "vl-tab"}
              >
                {group.label}
              </Link>
            );
          })}
        </nav>

        {/* Row 3: sub-tab strip — only when active group has children */}
        {activeSubTabs.length > 0 && (
          <nav className="vl-sub-tabs" aria-label="Section navigation">
            {activeSubTabs.map((st) => {
              const href     = `${base}/${st.segment}`;
              const isActive = pathname.startsWith(href);
              return (
                <Link
                  key={st.label}
                  href={href}
                  className={isActive ? "vl-sub-tab vl-sub-tab--active" : "vl-sub-tab"}
                >
                  {st.label}
                </Link>
              );
            })}
          </nav>
        )}
      </div>

      {/* ──────────── Page content ──────────── */}
      <div className="vl-content">
        {children}
      </div>

      <style>{VL_STYLES}</style>
    </>
  );
}

// ==================================================
// STYLES
// ==================================================

const VL_STYLES = `
  /* Remove dash-main top padding for vehicle pages so the sticky
     bar sits flush against the top of the scroll container. */
  body:has(.vl-sticky) .dash-main { padding-top: 0; }

  /* ── Sticky shell ── */
  .vl-sticky {
    position: sticky;
    top: var(--topbar-h, 0px);
    z-index: 40;
    background: var(--colour-bg);
    border-bottom: 1px solid var(--colour-border);
    /* Extend left/right past dash-content to fill dash-main width */
    margin-left:  calc(-1 * var(--space-10));
    margin-right: calc(-1 * var(--space-10));
    padding-left:  var(--space-10);
    padding-right: var(--space-10);
    padding-top:   var(--space-6);
    /* Prevent browser text-insertion caret on click */
    user-select: none;
  }

  /* ── Identity row: 3-column grid ── */
  .vl-bar {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: var(--space-3);
    padding-bottom: var(--space-2);
  }
  .vl-bar-left {
    display: flex;
    align-items: center;
  }
  .vl-bar-center {
    display: flex;
    justify-content: center;
    align-items: center;
  }
  .vl-bar-right {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: var(--space-1);
  }
  .vl-back {
    font-size: var(--text-sm);
    color: var(--colour-text-muted);
    text-decoration: none;
    white-space: nowrap;
  }
  .vl-title {
    font-size: var(--text-md);
    font-weight: var(--weight-semibold);
    text-align: right;
  }

  /* Registration plate (reused from page.tsx) */
  .vd-plate {
    display: inline-block;
    padding: 2px 8px;
    background: #f5c842;
    color: #000;
    font-size: 12px;
    font-weight: var(--weight-bold);
    border-radius: 2px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  /* ── Tab strip ── */
  .vl-tabs {
    display: flex;
    gap: 0;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
  }
  .vl-tabs::-webkit-scrollbar { display: none; }
  /* Flex spacers: centre when tabs fit, scroll from left when they overflow */
  .vl-tabs::before, .vl-tabs::after { content: ''; flex: 1; min-width: 0; }

  .vl-tab {
    padding: 9px 16px;
    font-size: var(--text-sm);
    color: var(--colour-text-muted);
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    white-space: nowrap;
    text-decoration: none;
    display: block;
    transition: color 0.2s, border-color 0.2s;
    cursor: none;
  }
  .vl-tab:hover { color: var(--colour-text); }
  .vl-tab--active {
    color: var(--colour-text);
    border-bottom-color: var(--colour-accent);
  }

  /* ── Sub-tab strip ── */
  .vl-sub-tabs {
    display: flex;
    gap: 0;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
    border-top: 1px solid var(--colour-border);
  }
  .vl-sub-tabs::-webkit-scrollbar { display: none; }
  .vl-sub-tabs::before, .vl-sub-tabs::after { content: ''; flex: 1; min-width: 0; }

  .vl-sub-tab {
    padding: 6px 14px;
    font-size: var(--text-xs);
    color: var(--colour-text-muted);
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    white-space: nowrap;
    text-decoration: none;
    display: block;
    transition: color 0.2s, border-color 0.2s;
    cursor: none;
  }
  .vl-sub-tab:hover { color: var(--colour-text); }
  .vl-sub-tab--active {
    color: var(--colour-text);
    border-bottom-color: var(--colour-accent);
  }

  /* ── Content area below sticky bar ── */
  .vl-content {
    padding-top: var(--space-6);
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
  }

  /* ── Responsive adjustments ── */
  @media (max-width: 1023px) {
    .vl-sticky {
      margin-left:  calc(-1 * var(--space-6));
      margin-right: calc(-1 * var(--space-6));
      padding-left:  var(--space-6);
      padding-right: var(--space-6);
    }
  }
  @media (max-width: 767px) {
    .vl-sticky {
      margin-left:  calc(-1 * var(--space-5));
      margin-right: calc(-1 * var(--space-5));
      padding-left:  var(--space-5);
      padding-right: var(--space-5);
    }
    .vl-title { font-size: var(--text-sm); }
  }
  @media (max-width: 479px) {
    .vl-sticky {
      margin-left:  calc(-1 * var(--space-4));
      margin-right: calc(-1 * var(--space-4));
      padding-left:  var(--space-4);
      padding-right: var(--space-4);
    }
    .vl-bar { grid-template-columns: auto 1fr auto; gap: var(--space-2); }
    .vl-title { font-size: var(--text-xs); }
  }
  @media (max-width: 359px) {
    .vl-sticky {
      margin-left:  calc(-1 * var(--space-3));
      margin-right: calc(-1 * var(--space-3));
      padding-left:  var(--space-3);
      padding-right: var(--space-3);
    }
    .vl-bar { grid-template-columns: 1fr; gap: var(--space-1); }
    .vl-bar-center { justify-content: flex-start; }
    .vl-bar-right  { align-items: flex-start; }
  }
`;
