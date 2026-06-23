// ============================================================
// frontend/web/src/components/dashboard/sidebar.tsx
// ============================================================
//
// Purpose:
//   Persistent left sidebar inside the /dashboard shell. Carries
//   the brand lockup, the section nav links, the user's email,
//   and the sign-out button.
//
// Design:
//   Exact structural mirror of SovCorE QR sidebar.tsx — same
//   CSS class names, same animation on the foot section, same
//   responsive collapse at 900 px. Only the brand subtitle and
//   the nav links differ (Auto vs QR).
//
// Consumed by:
//   - frontend/web/app/(dashboard)/layout.tsx
// ============================================================

"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { BrandLockup } from "@/src/components/ui/brand-lockup";
import { signOut } from "@/src/lib/hooks/use-auth";

// ==================================================
// NAV LINKS
// ==================================================

interface LinkSpec {
  href: string;
  label: string;
}

const LINKS: ReadonlyArray<LinkSpec> = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/dashboard/vehicles", label: "Vehicles" },
  { href: "/dashboard/records", label: "Records" },
  { href: "/dashboard/documents", label: "Documents" },
  { href: "/dashboard/expenses", label: "Expenses" },
  { href: "/dashboard/reminders", label: "Reminders" },
  { href: "/dashboard/tasks", label: "Tasks" },
  { href: "/dashboard/reports", label: "Reports" },
  { href: "/dashboard/settings/account", label: "Settings" },
];

// ==================================================
// SIDEBAR
// ==================================================

interface SidebarProps {
  email: string | null;
}

export function Sidebar({ email }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <aside className="sov-side">
      {/* ---------- Brand ---------- */}
      <Link href="/" className="sov-side__brand" aria-label="SovCorE Auto home">
        <BrandLockup subtitle="Auto" size="md" />
      </Link>

      {/* ---------- Nav ---------- */}
      <nav className="sov-side__nav" aria-label="Dashboard">
        {LINKS.map((l) => {
          const active =
            l.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(l.href);
          return (
            <Link
              key={l.href}
              href={l.href}
              className={active ? "sov-side__link sov-side__link--active" : "sov-side__link"}
            >
              {l.label}
            </Link>
          );
        })}
      </nav>

      {/* ---------- User + sign out ---------- */}
      <div className="sov-side__foot">
        {email && <p className="sov-side__email">{email}</p>}
        <button onClick={() => signOut(router)} className="sov-side__signout">
          Sign out
        </button>
      </div>

      <style>{SIDE_STYLES}</style>
    </aside>
  );
}

// ==================================================
// STYLES — exact mirror of SovCorE QR sidebar styles
// ==================================================

const SIDE_STYLES = `
  .sov-side {
    width: 260px;
    flex-shrink: 0;
    background: var(--colour-bg-2);
    border-right: 0.5px solid var(--colour-border);
    padding: var(--space-5);
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
    min-height: 100vh;
    position: sticky;
    top: 0;
  }
  .sov-side__brand { text-decoration: none; }

  .sov-side__nav { display: flex; flex-direction: column; gap: 2px; flex: 1; }
  .sov-side__link {
    display: block;
    padding: 10px 14px;
    border-radius: var(--radius-md);
    font-size: var(--text-sm);
    color: var(--colour-text-muted);
    text-decoration: none;
    transition: background 0.2s, color 0.2s;
  }
  .sov-side__link:hover { background: rgba(108, 99, 255, 0.06); color: var(--colour-text); }
  .sov-side__link--active { background: rgba(108, 99, 255, 0.12); color: var(--colour-text); }

  .sov-side__foot { display: flex; flex-direction: column; gap: 8px; padding-top: var(--space-4); border-top: 1px solid var(--colour-border); }
  .sov-side__email { font-size: var(--text-xs); color: var(--colour-text-muted); margin: 0; word-break: break-all; }
  .sov-side__signout {
    background: none;
    border: none;
    color: var(--colour-text-muted);
    text-align: left;
    padding: 6px 0;
    cursor: none;
    font-size: var(--text-sm);
    transition: color 0.2s;
  }
  .sov-side__signout:hover { color: var(--colour-error); }

  @media (max-width: 900px) {
    .sov-side { position: static; width: 100%; min-height: auto; border-right: none; border-bottom: 0.5px solid var(--colour-border); }
  }
`;
