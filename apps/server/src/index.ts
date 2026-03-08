import Fastify from 'fastify'
import fastifyJwt from '@fastify/jwt'
import fastifyCors from '@fastify/cors'
import fastifyMultipart from '@fastify/multipart'
import fastifyStatic from '@fastify/static'
import path from 'path'
import { env } from './lib/env.js'
import { ensureBucket } from './lib/storage.js'
import { authMiddleware } from './middleware/auth.js'
import { authRoutes } from './routes/auth.js'
import { totpRoutes } from './routes/totp.js'
import { vaultRoutes } from './routes/vaults.js'
import { syncRoutes } from './routes/sync.js'

const app = Fastify({ logger: { level: env.NODE_ENV === 'development' ? 'info' : 'warn' } })

// ── Plugins ──────────────────────────────────────────────────────────────────
await app.register(fastifyCors, { origin: true })
await app.register(fastifyJwt, { secret: env.JWT_SECRET })
await app.register(fastifyMultipart, { limits: { fileSize: 50 * 1024 * 1024 } }) // 50 MB

// Serve SPA if path configured
if (env.SPA_PATH) {
  await app.register(fastifyStatic, {
    root: path.resolve(env.SPA_PATH),
    prefix: '/',
    index: 'index.html',
  })
  // SPA fallback for client-side routing
  app.setNotFoundHandler((_req, reply) => {
    reply.sendFile('index.html')
  })
}

await app.register(authMiddleware)

// ── Routes ───────────────────────────────────────────────────────────────────
app.get('/health', async () => ({ ok: true, version: '0.1.0' }))

await app.register(authRoutes)
await app.register(totpRoutes)
await app.register(vaultRoutes)
await app.register(syncRoutes)

// ── Start ────────────────────────────────────────────────────────────────────
async function start() {
  try {
    await ensureBucket()
    app.log.info('Storage bucket ready')
  } catch (e) {
    app.log.warn(`Storage not available: ${e}`)
  }

  await app.listen({ port: env.PORT, host: '0.0.0.0' })
  app.log.info(`Bazalt server listening on :${env.PORT}`)
}

start().catch((e) => {
  console.error(e)
  process.exit(1)
})

// Graceful shutdown
const signals = ['SIGTERM', 'SIGINT'] as const
for (const sig of signals) {
  process.on(sig, async () => {
    await app.close()
    process.exit(0)
  })
}
