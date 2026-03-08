# Bazalt

Open-source Obsidian alternative with self-hosted sync.

Write and navigate Markdown notes in the browser, sync them to your own server, and manage everything from a clean vault-picker UI.

---

## Features

- **CodeMirror 6 editor** — live wikilink decoration, auto-save
- **Markdown preview** — split view or full preview
- **Wikilinks** — `[[note]]` navigation; clicking an unresolved link creates the note
- **Backlinks panel** — see every note that links to the current one
- **File tree sidebar** — folder-aware, create notes inline
- **Self-hosted sync** — delta sync over HTTPS to your own Fastify server
- **Vault picker** — create/open server-side vaults or open a local folder (no sync)
- **Authentication** — register, login, JWT sessions, optional TOTP 2FA
- **Dark / light theme**

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | Vite + React + TypeScript |
| Editor | CodeMirror 6 |
| Styling | Tailwind CSS |
| Backend | Fastify + Drizzle ORM + PostgreSQL |
| File storage | SeaweedFS (S3-compatible) |
| Auth | JWT + bcrypt + TOTP (otplib) |
| Monorepo | pnpm workspaces + Turborepo |

---

## Monorepo layout

```
bazalt/
├── apps/
│   ├── app/          # Vite SPA — main UI
│   └── server/       # Fastify API server
├── packages/
│   ├── core/         # vault types, file tree builder, wikilink parser, link graph
│   ├── editor/       # CodeMirror 6 React component + wikilink extension
│   └── sync/         # SyncClient (fetch-based delta sync, SHA-256 via SubtleCrypto)
├── docker-compose.yml
├── nginx.conf
├── turbo.json
└── pnpm-workspace.yaml
```

---

## Quick start (Docker)

```bash
cp .env.example .env          # fill in secrets
docker compose up -d --build  # starts nginx + server + postgres + redis + seaweedfs
```

Open **http://localhost**, register an account, create a vault, open a local folder, and start writing.

---

## Local development

Requires **Node 22** (via fnm) and **pnpm 10**.

```bash
pnpm install

# Build packages first
pnpm --filter @bazalt/core build
pnpm --filter @bazalt/sync build
pnpm --filter @bazalt/editor build

# Run the frontend dev server (hot reload on :5173)
cd apps/app && pnpm exec vite

# Run the backend (requires postgres + seaweedfs running)
cd apps/server && pnpm dev
```

### Environment variables (server)

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | — | PostgreSQL connection string |
| `JWT_SECRET` | — | Secret for signing JWTs |
| `S3_ENDPOINT` | — | SeaweedFS S3 endpoint |
| `S3_ACCESS_KEY` | — | S3 access key |
| `S3_SECRET_KEY` | — | S3 secret key |
| `S3_BUCKET` | `bazalt` | S3 bucket name |
| `PORT` | `3001` | Server port |
| `SPA_PATH` | — | Path to built SPA (served by Fastify in production) |

---

## How sync works

1. The client computes SHA-256 hashes for every local file.
2. `POST /api/vaults/:id/sync/changes` compares hashes with the server and returns a diff (files to upload, download, or delete).
3. `POST /api/vaults/:id/sync/push` uploads changed files to SeaweedFS via the S3 API.
4. Downloads are streamed back to the client and written via the File System Access API.

---

## File System Access API

The browser vault opener (`Open local folder`) uses the [File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API), which requires a **Chromium-based browser** (Chrome, Edge, Arc, Brave).

---

## License

MIT
