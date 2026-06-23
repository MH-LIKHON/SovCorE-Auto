// ============================================================
// frontend/web/src/components/layout/navbar.tsx
// ============================================================
//
// Purpose:
//   Top navigation bar. Sits on every public page. Carries the
//   brand lockup on the left and a short link set on the right.
//
// Origin:
//   Mirrored from SovCorE QR src/components/layout/navbar.tsx.
//   Three changes:
//     1. Links point to Auto routes (not QR routes).
//     2. The auth slot reads from the Auto JWT context (Phase 1)
//        rather than next-auth. At Phase 0, a "Sign in" link
//        is rendered unconditionally until Phase 1 wires the
//        session provider.
//     3. BrandLockup receives subtitle="Auto".
//
// Design:
//   Sticky to the top of the viewport with a backdrop blur.
//   Active link carries the ping-pong underline animation from
//   BrandLockup. All other links are muted while any link is
//   active so the active link is the only bright element.
//
//   Responsive:
//     > 767 px: horizontal link set visible.
//     ≤ 767 px: link set hidden; hamburger button appears.
//     Clicking the hamburger opens a mobile menu panel below
//     the navbar. Navigating any link closes the menu.
//
// Consumed by:
//   - app/layout.tsx
// ============================================================

"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

import { BrandLockup } from "@/src/components/ui/brand-lockup";

// ==================================================
// LINK DEFINITIONS
// ==================================================

interface NavLink {
  href: string;
  label: string;
  muted?: boolean;
  prefix?: boolean;
}

// Phase 0: minimal link set. Full navigation lands in Phase 1
// once the public landing page and legal pages exist.
const LINKS: NavLink[] = [
  { href: "/vehicles", label: "Vehicles", prefix: true, muted: true },
  { href: "/legal/privacy", label: "Privacy", muted: true },
  { href: "/legal/terms", label: "Terms", muted: true },
];

// ==================================================
// NAV LINK ITEM
// ==================================================

function NavLinkItem({
  href,
  label,
  isActive,
  isMuted,
}: {
  href: string;
  label: string;
  isActive: boolean;
  isMuted: boolean;
}) {
  const underlineRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = underlineRef.current;
    if (!el) return;

    if (!isActive) {
      el.style.transition = "none";
      el.style.transform = "scaleX(0)";
      return;
    }

    const duration = 700;
    const pause = 350;
    let timeoutId: ReturnType<typeof setTimeout>;
    let cancelled = false;

    el.style.transition = "none";
    el.style.transform = "scaleX(0)";
    el.style.transformOrigin = "left";

    function drawLTR() {
      if (cancelled || !el) return;
      el.style.transition = `transform ${duration}ms ease-in-out`;
      el.style.transformOrigin = "left";
      el.style.transform = "scaleX(1)";
      timeoutId = setTimeout(retractRTL, duration + pause);
    }
    function retractRTL() {
      if (cancelled || !el) return;
      el.style.transition = `transform ${duration}ms ease-in-out`;
      el.style.transformOrigin = "right";
      el.style.transform = "scaleX(0)";
      timeoutId = setTimeout(drawRTL, duration + pause);
    }
    function drawRTL() {
      if (cancelled || !el) return;
      el.style.transition = `transform ${duration}ms ease-in-out`;
      el.style.transformOrigin = "right";
      el.style.transform = "scaleX(1)";
      timeoutId = setTimeout(retractLTR, duration + pause);
    }
    function retractLTR() {
      if (cancelled || !el) return;
      el.style.transition = `transform ${duration}ms ease-in-out`;
      el.style.transformOrigin = "left";
      el.style.transform = "scaleX(0)";
      timeoutId = setTimeout(drawLTR, duration + pause);
    }

    timeoutId = setTimeout(drawLTR, 300);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [isActive]);

  const cls = isActive
    ? "sov-nav__link sov-link"
    : isMuted
      ? "sov-nav__link sov-nav__link--muted sov-link"
      : "sov-nav__link sov-link";

  return (
    <Link
      href={href}
      className={cls}
      aria-current={isActive ? "page" : undefined}
    >
      <span style={{ position: "relative", display: "inline-block" }}>
        {label}
        <span
          ref={underlineRef}
          aria-hidden="true"
          style={{
            position: "absolute",
            top: -4,
            left: 0,
            right: 0,
            height: 1,
            borderRadius: 0.5,
            background: "linear-gradient(90deg, var(--colour-accent), var(--colour-accent2))",
            transform: "scaleX(0)",
            transformOrigin: "left",
            pointerEvents: "none",
          }}
        />
      </span>
    </Link>
  );
}

// ==================================================
// NAVBAR
// ==================================================

export function Navbar() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  // Close the mobile menu whenever the route changes.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  // The dashboard has its own sidebar navigation.
  if (pathname.startsWith("/app")) return null;

  function isActivePage(link: NavLink): boolean {
    return link.prefix
      ? pathname.startsWith(link.href)
      : pathname === link.href;
  }

  const anyActive = LINKS.some(isActivePage);

  return (
    <header className="sov-nav">
      <div className="sov-nav__inner">
        {/* ---------- Brand lockup ---------- */}
        <Link href="/" className="sov-nav__brand" aria-label="SovCorE Auto, home">
          <BrandLockup subtitle="Auto" size="md" />
        </Link>

        {/* ---------- Primary links + auth slot (desktop) ---------- */}
        <nav className="sov-nav__links" aria-label="Primary">
          {LINKS.map((link) => {
            const active = isActivePage(link);
            const muted = !active && (!!link.muted || anyActive);
            return (
              <NavLinkItem
                key={link.href}
                href={link.href}
                label={link.label}
                isActive={active}
                isMuted={muted}
              />
            );
          })}

          {/* ---------- Auth slot ----------
              Phase 0: renders a "Sign in" link unconditionally.
              Phase 1 replaces this with the JWT session state. */}
          <Link href="/login" className="sov-nav__auth-signin sov-link">
            Sign in
          </Link>
        </nav>

        {/* ---------- Hamburger — visible only on mobile ---------- */}
        <button
          className="sov-nav__hamburger"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          aria-controls="sov-nav-mobile"
        >
          <span className="sov-nav__hbar" aria-hidden="true" />
          <span className="sov-nav__hbar" aria-hidden="true" />
          <span className="sov-nav__hbar" aria-hidden="true" />
        </button>
      </div>

      {/* ---------- Mobile menu — rendered only when open ---------- */}
      {menuOpen && (
        <nav
          id="sov-nav-mobile"
          className="sov-nav__mobile"
          aria-label="Mobile navigation"
        >
          {LINKS.map((link) => {
            const active = isActivePage(link);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={
                  active
                    ? "sov-nav__mobile-link sov-nav__mobile-link--active"
                    : "sov-nav__mobile-link"
                }
                onClick={() => setMenuOpen(false)}
              >
                {link.label}
              </Link>
            );
          })}
          <Link
            href="/login"
            className="sov-nav__mobile-link"
            onClick={() => setMenuOpen(false)}
          >
            Sign in
          </Link>
        </nav>
      )}

      <style>{NAV_STYLES}</style>
    </header>
  );
}

// ==================================================
// NAVBAR STYLES
// ==================================================

const NAV_STYLES = `
  .sov-nav {
    width: 100%;
    background: rgba(8, 8, 15, 0.65);
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
    position: sticky;
    top: 0;
    z-index: var(--z-nav);
  }

  .sov-nav__inner {
    max-width: 1280px;
    margin: 0 auto;
    padding: 18px var(--space-10);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-8);
  }

  .sov-nav__brand {
    text-decoration: none;
  }

  .sov-nav__links {
    display: flex;
    align-items: center;
    gap: var(--space-8);
  }

  .sov-nav__link {
    font-size: var(--text-sm);
    color: var(--colour-text);
    font-weight: var(--weight-medium);
    letter-spacing: var(--tracking-wide);
    text-decoration: none;
  }

  .sov-nav__link--muted {
    color: var(--colour-text-muted);
  }

  /* ---------- Auth: sign-in link ---------- */
  .sov-nav__auth-signin {
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    color: var(--colour-text-muted);
    text-decoration: none;
    letter-spacing: var(--tracking-wide);
    margin-left: var(--space-2);
  }

  /* ---------- Auth: signed-in pill (Phase 1) ---------- */
  .sov-nav__auth-pill {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    color: var(--colour-text);
    text-decoration: none;
    background: rgba(108, 99, 255, 0.12);
    border: 1px solid rgba(108, 99, 255, 0.25);
    border-radius: var(--radius-full);
    padding: 4px 12px 4px 4px;
    margin-left: var(--space-2);
    transition: background var(--duration-normal) var(--ease-smooth),
                border-color var(--duration-normal) var(--ease-smooth);
  }
  .sov-nav__auth-pill:hover {
    background: rgba(108, 99, 255, 0.2);
    border-color: rgba(108, 99, 255, 0.45);
  }
  .sov-nav__auth-avatar {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: linear-gradient(135deg, var(--colour-accent), var(--colour-accent2));
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: var(--weight-bold);
    color: #fff;
    flex-shrink: 0;
  }

  /* ---------- Hamburger button — hidden on desktop ---------- */
  .sov-nav__hamburger {
    display: none;
    flex-direction: column;
    justify-content: center;
    gap: 5px;
    background: none;
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-sm);
    padding: 8px 10px;
    transition: border-color 0.2s;
  }
  .sov-nav__hamburger:hover { border-color: rgba(108, 99, 255, 0.45); }
  .sov-nav__hbar {
    display: block;
    width: 18px;
    height: 1.5px;
    background: var(--colour-text-muted);
    border-radius: 1px;
  }

  /* ---------- Mobile menu panel ---------- */
  .sov-nav__mobile {
    display: flex;
    flex-direction: column;
    background: rgba(8, 8, 15, 0.97);
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
    border-top: 0.5px solid var(--colour-border);
    padding: var(--space-3) var(--space-5) var(--space-4);
    gap: 2px;
  }
  .sov-nav__mobile-link {
    display: block;
    padding: 10px 14px;
    font-size: var(--text-sm);
    color: var(--colour-text-muted);
    text-decoration: none;
    border-radius: var(--radius-md);
    transition: background 0.2s, color 0.2s;
  }
  .sov-nav__mobile-link:hover { background: rgba(108, 99, 255, 0.06); color: var(--colour-text); }
  .sov-nav__mobile-link--active { color: var(--colour-text); }

  /* Guard: never show mobile menu at desktop (window-resize edge case). */
  @media (min-width: 768px) {
    .sov-nav__mobile { display: none !important; }
  }

  /* ---------- Tablet ---------- */
  @media (max-width: 1023px) {
    .sov-nav__inner { padding: 16px var(--space-6); gap: var(--space-5); }
    .sov-nav__links { gap: var(--space-5); }
  }

  /* ---------- Mobile — swap link set for hamburger ---------- */
  @media (max-width: 767px) {
    .sov-nav__inner { padding: 14px var(--space-5); gap: var(--space-5); }
    .sov-nav__links { display: none; }
    .sov-nav__hamburger { display: flex; }
    .sov-nav__auth-pill { margin-left: 0; padding: 4px 10px 4px 4px; }
  }
`;
