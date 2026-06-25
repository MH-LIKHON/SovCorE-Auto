// ============================================================
// frontend/web/app/layout.tsx
// ============================================================
//
// Purpose:
//   Root layout for every page in SovCorE Auto. Wraps every
//   page with shared chrome: navbar, footer, background canvas,
//   and the custom cursor overlay.
//
// Origin:
//   Mirrored from SovCorE QR app/layout.tsx. Changes:
//     - No NextAuth SessionProvider (Auto uses its own JWT
//       context, wired in Phase 1 under app/providers.tsx).
//     - Metadata reflects SovCorE Auto.
//     - lang="en-GB" retained from QR.
//
// Design:
//   globals.css imports variables.css, animations.css, and
//   Tailwind v4 in the correct order so all design tokens and
//   the utility layer are available before any rule runs.
//   CustomCursor is fixed at z-index 99999. The native cursor
//   is hidden via body { cursor: none } in globals.css.
//
// Consumed by:
//   - Next.js App Router (required root layout).
// ============================================================

import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { Footer } from "@/src/components/layout/footer";
import { Navbar } from "@/src/components/layout/navbar";
import { BackgroundCanvas } from "@/src/components/ui/background-canvas";
import { CustomCursor } from "@/src/components/ui/custom-cursor";

import "@/src/styles/globals.css";

// ==================================================
// SITE METADATA
// ==================================================

export const metadata: Metadata = {
  title: {
    default: "SovCorE Auto | Vehicle management",
    template: "%s | SovCorE Auto",
  },
  description:
    "Self-hosted vehicle management for individuals, families and small fleets. Track every service, MOT, expense, and document in one place.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  applicationName: "SovCorE Auto",
  authors: [{ name: "VelVadY LTD trading as SovCorE" }],
  icons: {
    icon: "/favicon.svg",
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    type: "website",
    siteName: "SovCorE Auto",
    title: "SovCorE Auto | Vehicle management",
    description:
      "Self-hosted vehicle management for individuals, families and small fleets.",
    locale: "en_GB",
  },
  twitter: {
    card: "summary_large_image",
    title: "SovCorE Auto | Vehicle management",
    description:
      "Self-hosted vehicle management for individuals, families and small fleets.",
  },
  robots: { index: false, follow: false },
};

// themeColor lives in viewport per Next.js 15 requirement.
export const viewport: Viewport = {
  themeColor: "#08080f",
};

// ==================================================
// ROOT LAYOUT
// ==================================================

export default function RootLayout({ children }: { children: ReactNode }) {
  // style on <html>: hardcoded bg/colour equivalents of --colour-bg
  // and --colour-text so the dark background is applied before
  // globals.css downloads, preventing a white-flash FOUC.
  return (
    <html lang="en-GB" suppressHydrationWarning style={{ background: "#08080f", color: "#f0f0f8" }}>
      <body>
        {/* ---------- Skip-to-content link ---------- */}
        <a href="#main" className="sov-skip">
          Skip to content
        </a>

        {/* ---------- Background particle network ---------- */}
        <BackgroundCanvas />

        {/* ---------- Cursor overlay ---------- */}
        <CustomCursor />

        {/* ---------- Site chrome and content slot ----------
            The wrapping div establishes a stacking context at
            z-index 1, placing all site content above BackgroundCanvas
            (z-index 0). Without this, the canvas paints on top of
            position:static sections. */}
        <div style={{ position: "relative", zIndex: 1 }}>
          <Navbar />
          <main id="main">{children}</main>
          <Footer />
        </div>

        <style>{`
          .sov-skip {
            position: absolute;
            left: -9999px;
            top: 8px;
            background: var(--colour-accent);
            color: #fff;
            padding: 8px 12px;
            border-radius: var(--radius-md);
            z-index: 99998;
          }
          .sov-skip:focus { left: 16px; }
        `}</style>
      </body>
    </html>
  );
}
