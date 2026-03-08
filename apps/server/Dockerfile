# ── Build stage ──────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /build

# Install pnpm
RUN npm install -g pnpm

# Copy workspace manifests
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/core/package.json ./packages/core/
COPY packages/sync/package.json ./packages/sync/
COPY packages/editor/package.json ./packages/editor/
COPY apps/server/package.json ./apps/server/
COPY apps/app/package.json ./apps/app/

# Install all deps (needed for workspace links)
RUN pnpm install --frozen-lockfile

# Copy source
COPY tsconfig.base.json ./
COPY packages/core ./packages/core
COPY packages/sync ./packages/sync
COPY packages/editor ./packages/editor
COPY apps/server ./apps/server
COPY apps/app ./apps/app

# Build packages in dependency order, then server + SPA
RUN pnpm --filter @bazalt/core build
RUN pnpm --filter @bazalt/sync build
RUN pnpm --filter @bazalt/editor build
RUN pnpm --filter @bazalt/server build

# VITE_API_URL: base URL for API calls baked into the SPA.
# Leave empty (default) when the SPA is served from the same origin as the server.
# Set to e.g. https://api.example.com when serving SPA from a CDN.
ARG VITE_API_URL=
ENV VITE_API_URL=$VITE_API_URL
RUN pnpm --filter @bazalt/app build

# ── Runtime stage ─────────────────────────────────────────────────────────────
FROM node:22-alpine

# Preserve monorepo structure so pnpm symlinks resolve correctly.
# Server workspace deps (postgres, drizzle-orm, etc.) live in
# apps/server/node_modules which symlinks into the root .pnpm store.
WORKDIR /app

# Root pnpm virtual store (contains all packages)
COPY --from=builder /build/node_modules ./node_modules

# Server workspace node_modules (symlinks into root .pnpm store)
COPY --from=builder /build/apps/server/node_modules ./apps/server/node_modules

# Built server artefacts
COPY --from=builder /build/apps/server/dist ./apps/server/dist
COPY --from=builder /build/apps/server/package.json ./apps/server/
COPY --from=builder /build/apps/server/drizzle ./apps/server/drizzle

# Built SPA (served as static files by the server at SPA_PATH=/app/spa)
COPY --from=builder /build/apps/app/dist /app/spa

WORKDIR /app/apps/server

# Run migrations then start server
CMD ["sh", "-c", "node dist/migrate.js && node dist/index.js"]
