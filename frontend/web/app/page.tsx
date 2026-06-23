// ============================================================
// frontend/web/app/page.tsx
// ============================================================
//
// Purpose:
//   Marketing home page at the Auto root. Hero, marquee, stats,
//   four feature pillars, trust strip, and a final CTA.
//
// Design:
//   Structure and layout are identical to SovCorE QR's home
//   page. Only the content differs: vehicle management features
//   replace QR code features, and the CTA leads to /login.
//
// Consumed by:
//   - Next.js App Router (renders at /)
// ============================================================

import Link from "next/link";
import type { Metadata } from "next";

import { DividerLine } from "@/src/components/shared/divider-line";
import { MarqueeStrip } from "@/src/components/shared/marquee-strip";
import { StatsRow } from "@/src/components/shared/stats-row";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Card } from "@/src/components/ui/card";
import { ScrollReveal } from "@/src/components/ui/scroll-reveal";

// ==================================================
// PAGE METADATA
// ==================================================

export const metadata: Metadata = {
  title: "SovCorE Auto — vehicle management for UK drivers",
};

// ==================================================
// CONTENT BLOCKS
// ==================================================

const PILLARS = [
  {
    eyebrow: "01",
    title: "MOT, SORN, and insurance reminders",
    body: "Never miss an MOT, road-tax renewal, or insurance expiry again. SovCorE Auto tracks every UK regulatory deadline, sends reminders before they fall due, and logs the outcome when you renew. ULEZ compliance status and congestion-zone alerts included.",
  },
  {
    eyebrow: "02",
    title: "Expense and fuel tracking",
    body: "Log every fill-up, service, part, and repair. See your cost per mile, monthly totals, and running costs at a glance. Fuel analytics show consumption trends over time. Tag expenses by category and export for tax self-assessment.",
  },
  {
    eyebrow: "03",
    title: "Documents and certificates",
    body: "Store your V5C, MOT certificates, insurance schedules, and vehicle photos in one place. No searching through folders or email threads. Documents travel with the vehicle record and are available on any device.",
  },
  {
    eyebrow: "04",
    title: "Fleet overview and tasks",
    body: "Manage one car or twenty. Assign maintenance tasks, track open jobs, and see upcoming reminders across your entire fleet from a single dashboard. Invite family members or team members with role-based access control.",
  },
] as const;

// ==================================================
// HOME PAGE
// ==================================================

export default function HomePage() {
  return (
    <>
      {/* ---------- Hero ---------- */}
      <section className="hero">
        <div className="page-shell hero__inner">
          <Badge tone="success" className="hero__tag">
            UK-first vehicle management — MOT, SORN, insurance, ULEZ.
          </Badge>

          <h1 className="hero__title">
            One place for{" "}
            <span className="text-gradient">every</span>
            <br />
            vehicle.
          </h1>

          <p className="hero__subline">
            Track MOT dates, SORN renewals, insurance, fuel, expenses, and documents for every
            vehicle in your household or fleet. UK-first features designed around the DVLA, DVSA,
            and HMRC rules you actually deal with.
          </p>

          <div className="hero__cta">
            <Link href="/login" style={{ textDecoration: "none" }}>
              <Button size="lg">Get started</Button>
            </Link>
            <Link href="#features" className="hero__link sov-link">
              See what is included &rarr;
            </Link>
          </div>
        </div>

        <div className="hero__glow" aria-hidden="true" />
      </section>

      {/* ---------- Credential marquee ---------- */}
      <MarqueeStrip />

      {/* ---------- Stats row ---------- */}
      <StatsRow />

      <DividerLine />

      {/* ---------- Pillars ---------- */}
      <section id="features" className="pillars page-shell">
        <ScrollReveal>
          <p className="eyebrow">What is in the box</p>
          <h2 className="heading">Four features, one platform.</h2>
        </ScrollReveal>

        <div className="pillars__grid">
          {PILLARS.map((p, i) => (
            <ScrollReveal key={p.eyebrow} delay={i * 80}>
              <Card fillHeight hoverEffect="glow">
                <p className="pillars__num">{p.eyebrow}</p>
                <h3 className="pillars__title">{p.title}</h3>
                <p className="pillars__body">{p.body}</p>
              </Card>
            </ScrollReveal>
          ))}
        </div>
      </section>

      <DividerLine />

      {/* ---------- Trust strip ---------- */}
      <section className="trust page-shell">
        <div className="trust__grid">
          <div>
            <p className="eyebrow">Security</p>
            <h3 className="trust__title">Built around your data.</h3>
            <p className="trust__body">
              Passwordless email sign-in with optional TOTP two-factor authentication. HTTP-only
              refresh tokens stored in secure cookies. Role-based access control on every endpoint.
              CSP headers. Magic-byte validation on every file upload. Your vehicle data is never
              shared with third parties.
            </p>
          </div>
          <div>
            <p className="eyebrow">Operator</p>
            <h3 className="trust__title">VelVadY LTD, trading as SovCorE.</h3>
            <p className="trust__body">
              Registered in England and Wales (15656680). ICO registration ZC137347. Hosted in the
              United Kingdom behind Cloudflare. Read the{" "}
              <Link href="/legal/privacy" style={{ color: "var(--colour-accent2)" }}>privacy policy</Link>{" "}
              and the{" "}
              <Link href="/legal/terms" style={{ color: "var(--colour-accent2)" }}>terms of service</Link>.
            </p>
          </div>
        </div>
      </section>

      {/* ---------- Final CTA ---------- */}
      <section className="finalcta page-shell">
        <h2 className="heading">Track every vehicle in minutes.</h2>
        <p className="finalcta__body">
          Add your first vehicle, set your MOT date, and your first reminder is ready. Invite family
          members or workshop staff. No spreadsheets. No missed renewals.
        </p>
        <div className="finalcta__cta">
          <Link href="/login" style={{ textDecoration: "none" }}>
            <Button size="lg">Get started</Button>
          </Link>
          <Link href="/legal/privacy" style={{ textDecoration: "none" }}>
            <Button variant="secondary" size="lg">Privacy policy</Button>
          </Link>
        </div>
      </section>

      <style>{HOME_STYLES}</style>
    </>
  );
}

// ==================================================
// HOME PAGE STYLES
// ==================================================

const HOME_STYLES = `
  /* ---------- Hero ---------- */
  .hero { position: relative; padding: var(--space-24) 0 var(--space-20); overflow: hidden; }
  .hero__inner { position: relative; z-index: 2; }
  .hero__tag { margin-bottom: var(--space-6); }
  .hero__title {
    font-size: var(--text-hero);
    line-height: var(--leading-tight);
    letter-spacing: var(--tracking-tight);
    margin-bottom: var(--space-6);
    max-width: 18ch;
  }
  .hero__subline {
    font-size: var(--text-md);
    color: var(--colour-text-muted);
    max-width: 62ch;
    margin-bottom: var(--space-8);
    line-height: var(--leading-normal);
  }
  .hero__cta { display: flex; align-items: center; gap: var(--space-5); flex-wrap: wrap; }
  .hero__link {
    font-size: var(--text-sm);
    color: var(--colour-text-muted);
    text-decoration: none;
  }
  .hero__glow {
    position: absolute;
    top: -200px;
    right: -200px;
    width: 600px;
    height: 600px;
    background: radial-gradient(circle at center, rgba(108, 99, 255, 0.18), transparent 60%);
    pointer-events: none;
    z-index: 1;
  }

  /* ---------- Shared section type ---------- */
  .eyebrow {
    font-size: var(--text-xs);
    color: var(--colour-accent);
    letter-spacing: var(--tracking-widest);
    text-transform: uppercase;
    margin-bottom: var(--space-3);
    font-weight: var(--weight-medium);
  }
  .heading { font-size: var(--text-2xl); margin-bottom: var(--space-10); letter-spacing: var(--tracking-tight); }

  /* ---------- Pillars grid ---------- */
  .pillars { padding-top: var(--space-16); }
  .pillars__grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--space-5); align-items: stretch; }
  .pillars__num { font-size: var(--text-xs); letter-spacing: 1px; color: rgba(108, 99, 255, 0.40); margin: 0 0 10px; font-variant-numeric: tabular-nums; }
  .pillars__title { font-size: var(--text-md); font-weight: var(--weight-medium); color: var(--colour-text); margin: 0 0 9px; letter-spacing: -0.2px; line-height: var(--leading-snug); }
  .pillars__body { font-size: var(--text-sm); color: var(--colour-text-muted); line-height: var(--leading-normal); margin: 0; }

  /* ---------- Trust strip ---------- */
  .trust { padding-top: var(--space-16); padding-bottom: var(--space-16); }
  .trust__grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-8); }
  .trust__title { font-size: var(--text-md); margin-bottom: var(--space-3); }
  .trust__body { color: var(--colour-text-muted); font-size: var(--text-sm); line-height: var(--leading-normal); }

  /* ---------- Final CTA ---------- */
  .finalcta { padding-top: var(--space-12); padding-bottom: var(--space-24); text-align: center; }
  .finalcta__body { color: var(--colour-text-muted); font-size: var(--text-base); max-width: 60ch; margin: 0 auto var(--space-8); line-height: var(--leading-normal); }
  .finalcta__cta { display: flex; gap: var(--space-3); justify-content: center; flex-wrap: wrap; }

  /* ---------- Tablet + mobile ---------- */
  @media (max-width: 1023px) {
    .hero { padding: var(--space-16) 0 var(--space-12); }
    .pillars__grid { grid-template-columns: 1fr; }
    .trust__grid { grid-template-columns: 1fr; }
  }

  /* ---------- Small phone ---------- */
  @media (max-width: 479px) {
    .hero { padding: var(--space-12) 0 var(--space-10); }
    .hero__title { font-size: clamp(1.8rem, 8vw, var(--text-hero)); }
    .hero__subline { font-size: var(--text-sm); }
    .heading { font-size: var(--text-xl); margin-bottom: var(--space-8); }
    .finalcta { padding-top: var(--space-10); padding-bottom: var(--space-16); }
  }
`;
