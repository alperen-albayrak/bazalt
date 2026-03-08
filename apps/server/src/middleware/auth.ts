import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'

// Augment Fastify request type so TS knows about user
declare module 'fastify' {
  interface FastifyRequest {
    userId: string
  }
}

export const authMiddleware = fp(async (app: FastifyInstance) => {
  app.addHook('onRequest', async (request, reply) => {
    // Routes that don't need auth
    const publicPaths = ['/auth/register', '/auth/login', '/health']
    if (publicPaths.some((p) => request.url.startsWith(p))) return
    // Static SPA assets
    if (!request.url.startsWith('/api')) return

    try {
      await request.jwtVerify()
      const payload = request.user as { sub: string }
      request.userId = payload.sub
    } catch {
      reply.status(401).send({ error: 'Unauthorized' })
    }
  })
})
