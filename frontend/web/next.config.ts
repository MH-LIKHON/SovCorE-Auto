// ============================================================
// frontend/web/next.config.ts
// ============================================================
//
// Purpose:
//   Next.js configuration for SovCorE Auto. Phase 8 adds security
//   response headers via the headers() function so they are applied
//   to every route served by the frontend, including the marketing
//   pages, dashboard, auth pages and all API proxy routes.
//
// Design:
//   Headers are declared as an array and applied to the `source: "/(.*)"` pattern
//   which matches every path. Next.js merges these with any headers that route
//   handlers set explicitly — route-level headers win on conflict.
//
//   CSP allows:
//     - Scripts from self and data: (Next.js hydration needs inline scripts
//       when nonces are not configured; 'unsafe-inline' is the pragmatic
//       choice for Next.js App Router without a custom nonce implementation).
//     - Styles from self and inline (Tailwind generates inline style blocks
//       during rendering).
//     - Images from self, data: URIs (avatars) and blob: (canvas snapshots).
//     - Connections to self and the backend API origin. The API origin is
//       read from NEXT_PUBLIC_API_URL at build time.
//     - Fonts from self.
//     - Microsoft login iframe for SSO.
//     - Frames denied from any parent via frame-ancestors 'none'.
//
// Consumed by:
//   - Next.js build and dev server
// ============================================================

import type { NextConfig } from "next";

// ==================================================
// SECURITY HEADERS
// ==================================================

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ------------------------------ Content-Security-Policy --------------------
// 'unsafe-inline' for scripts is required by Next.js App Router without a
// nonce implementation. Adding nonces is a Phase 9 hardening item.
const csp = [
  `default-src 'self'`,
  `script-src 'self' 'unsafe-inline' 'unsafe-eval'`,  // unsafe-eval needed by Next.js dev
  `style-src 'self' 'unsafe-inline'`,
  `img-src 'self' data: blob:`,
  `font-src 'self' data:`,
  `connect-src 'self' ${apiUrl}`,
  `frame-src 'self' https://login.microsoftonline.com`,
  `frame-ancestors 'none'`,
  `form-action 'self'`,
  `base-uri 'self'`,
  `object-src 'none'`,
].join("; ");

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: csp,
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "X-XSS-Protection",
    value: "1; mode=block",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value: "geolocation=(), microphone=(), camera=()",
  },
  // HSTS is set here for completeness; in production Cloudflare also enforces
  // HTTPS independently. The header is harmless in development (the browser
  // applies HSTS only to HTTPS responses, so HTTP localhost is unaffected).
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },
];

// ==================================================
// CONFIG
// ==================================================

const nextConfig: NextConfig = {
  // The backend API base URL is injected at build time via NEXT_PUBLIC_API_URL.
  // No rewrites are needed because the frontend calls FastAPI directly over HTTP.
  output: "standalone",

  async headers() {
    return [
      {
        // Apply to every route served by the frontend.
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
