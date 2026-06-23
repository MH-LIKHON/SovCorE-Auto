// ============================================================
// frontend/web/next.config.ts
// ============================================================
//
// Purpose:
//   Next.js configuration for SovCorE Auto. Minimal at Phase 0;
//   image domains and rewrites are added as modules land.
//
// ============================================================

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The backend API base URL is injected at build time via
  // NEXT_PUBLIC_API_URL. No rewrites are needed because the
  // frontend calls the FastAPI backend directly over HTTP.
};

export default nextConfig;
