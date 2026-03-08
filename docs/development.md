# Bazalt Development Guide

## Stack overview

- **Monorepo**: pnpm workspaces + Turborepo
- **Frontend** (`apps/app`): Vite + React + TypeScript + Tailwind CSS
- **Backend** (`apps/server`): Fastify + Drizzle ORM + PostgreSQL
- **Storage**: SeaweedFS (S3-compatible)
- **Node**: 22 via fnm

---

## Local server (Docker)

### First run / after pulling changes

```bash
docker compose up -d --build
```

This rebuilds the server + SPA images and starts all services (nginx, server, postgres, redis, seaweedfs).

### Stop everything

```bash
docker compose down
```

### Rebuild and restart (after code changes)

```bash
docker compose down
docker compose up -d --build
```

Or just rebuild the server image without recreating volumes:

```bash
docker compose up -d --build server
```

### View logs

```bash
docker compose logs -f server    # server only
docker compose logs -f           # all services
```

### Health check

```bash
curl http://localhost/health
# → {"ok":true,"version":"0.1.0"}
```

### Database migrations

Migrations run automatically on server startup (`node dist/migrate.js && node dist/index.js`).

SQL migration files live in `apps/server/drizzle/`. To add a new migration:

1. Create `apps/server/drizzle/000N_description.sql`
2. Add an entry to `apps/server/drizzle/meta/_journal.json`
3. Rebuild + restart: `docker compose up -d --build`

---

## Local dev (without Docker)

### Prerequisites

```bash
# Node 22 via fnm
fnm use 22

# Install all workspace deps
pnpm install
```

### Run services

You still need postgres, redis, and seaweedfs running. The easiest way is to bring up only the infra containers:

```bash
docker compose up -d postgres redis seaweedfs-master seaweedfs-volume seaweedfs-filer seaweedfs-s3
```

### Backend dev server

```bash
cd apps/server
pnpm dev          # tsx watch — auto-restarts on changes
```

### Frontend dev server

```bash
cd apps/app
pnpm exec vite    # http://localhost:5173
```

### Build packages (required before running the app)

```bash
pnpm --filter @bazalt/core build
pnpm --filter @bazalt/sync build
pnpm --filter @bazalt/editor build
```

---

## Useful commands

```bash
# Run all builds via Turborepo
pnpm turbo build

# TypeScript check (all packages)
pnpm --filter @bazalt/server exec tsc --noEmit
pnpm --filter @bazalt/app exec tsc --noEmit

# Wipe postgres data and start fresh
docker compose down -v
docker compose up -d --build
```

---

## Mobile app (future: React Native)

The plan is to build a React Native app that reuses `packages/core` (vault types, parser, link resolver) and `packages/sync` (delta sync client).

### Planned approach

```
apps/mobile/        # Expo (React Native) app
```

Key decisions:
- **Expo** — managed workflow for iOS + Android from one codebase
- **Expo FileSystem** — replaces File System Access API used in the web app
- **Platform adapter pattern** — `packages/core` will expose a `readFile`/`writeFile` interface; the mobile app provides an Expo-based implementation; the web app provides the existing File System Access API implementation
- **SQLite** (via `expo-sqlite`) — for offline search index and sync state, replacing the in-memory approach used in the web app
- **Background sync** — via Expo background tasks (`expo-background-fetch`)
- **OTA updates** — via `expo-updates`

### Bootstrapping (when ready)

```bash
pnpm dlx create-expo-app apps/mobile --template blank-typescript
cd apps/mobile
pnpm add @bazalt/core @bazalt/sync
```

---

## Electron desktop app (future: Phase 3)

Planned as `apps/desktop`:

- Electron main + preload
- IPC: `openVaultFolder`, `readFile`, `writeFile`, `watchFolder`
- `better-sqlite3` for offline search index + sync state
- Background sync worker thread
- `electron-updater` for auto-updates, tray icon, native menus

### Bootstrapping (when ready)

```bash
mkdir apps/desktop
cd apps/desktop
pnpm init
pnpm add electron electron-builder electron-updater better-sqlite3
```
