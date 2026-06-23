# ============================================================
# frontend/web/Dockerfile
# ============================================================
#
# Purpose:
#   Multi-stage production image for the SovCorE Auto frontend.
#   Stage 1 installs Node.js dependencies and builds the Next.js
#   standalone bundle. Stage 2 copies only the standalone output,
#   producing a lean image with no source or node_modules.
#
# Design:
#   `output: "standalone"` in next.config.ts generates a self-contained
#   bundle under .next/standalone that includes its own minimal
#   node_modules. The public and static directories are copied
#   separately because the standalone output does not include them.
#
#   The image serves on port 3000. Nginx proxies to this port
#   internally; it is never exposed directly on the host.
#
# ============================================================

# ==================================================
# STAGE 1 — Builder
# ==================================================

FROM node:22-alpine AS builder

WORKDIR /build

# Install dependencies before copying source so the layer is cached.
COPY package.json package-lock.json* ./
RUN npm ci --production=false

COPY . .

# Disable Next.js telemetry in CI and production builds.
ENV NEXT_TELEMETRY_DISABLED=1

# Build-time public environment variables must be present at this stage
# because Next.js bakes them into the bundle. Pass them via --build-arg
# in the docker-compose.production.yml build block.
ARG NEXT_PUBLIC_API_URL=http://localhost:8000
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

RUN npm run build

# ==================================================
# STAGE 2 — Runtime
# ==================================================

FROM node:22-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Non-root user for least-privilege execution.
RUN addgroup --system sovcore && adduser --system --ingroup sovcore sovcore

# Copy the standalone bundle, the static assets, and the public directory.
COPY --from=builder --chown=sovcore:sovcore /build/.next/standalone ./
COPY --from=builder --chown=sovcore:sovcore /build/.next/static ./.next/static
COPY --from=builder --chown=sovcore:sovcore /build/public ./public

USER sovcore

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["node", "server.js"]
