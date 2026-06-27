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
//     - Scripts from self (Next.js needs unsafe-inline/eval without nonces).
//     - Styles from self and inline.
//     - Images from self, data: URIs (avatars), blob: (canvas snapshots),
//       and the EU R2 domain for signed GET URLs (private bucket, no public URL).
//     - Connections to self only — all API calls use relative paths. Browser
//       never connects to R2 directly (proxy upload pattern); no R2 connect-src needed.
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

// ------------------------------ Content-Security-Policy --------------------
// All API calls use relative paths (/api/v1/...) so connect-src only needs
// 'self' for the API. R2 storage is the only external connection origin.
// 'unsafe-inline' for scripts is required by Next.js App Router without a
// nonce implementation. Adding nonces is a Phase 9 hardening item.
const csp = [
  `default-src 'self'`,
  `script-src 'self' 'unsafe-inline' 'unsafe-eval'`,  // unsafe-eval required by Next.js App Router in production; remove only after adopting nonces (Phase 9)
  `style-src 'self' 'unsafe-inline'`,
  `img-src 'self' data: blob: https://0d015e9069ac7a0b9d14088046d1f3ae.eu.r2.cloudflarestorage.com`,
  `font-src 'self' data:`,
  `connect-src 'self'`,
  `frame-src 'self' blob: https://login.microsoftonline.com`,
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
  output: "standalone",

  // In development the Next.js server runs on :3000 and the backend on :8000.
  // Rewrite /api/v1/* to the local backend so relative API calls work in dev
  // the same way they do in production (where nginx handles the proxy).
  async rewrites() {
    if (process.env.NODE_ENV !== "production") {
      return [
        {
          source: "/api/v1/:path*",
          destination: "http://127.0.0.1:8000/api/v1/:path*",
        },
      ];
    }
    return [];
  },

  async redirects() {
    return [
      // /vehicles has no page; redirect to the dashboard vehicles list.
      { source: "/vehicles", destination: "/dashboard/vehicles", permanent: false },
    ];
  },

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
