import type { FastifyInstance } from 'fastify'
import { eq, and } from 'drizzle-orm'
import { db } from '../lib/db.js'
import { vaults, vaultMembers, vaultFiles } from '../lib/schema.js'
import { putObject, getObject, storageKey } from '../lib/storage.js'
import { createHash } from 'crypto'

export async function vaultRoutes(app: FastifyInstance) {
  /** List all vaults the current user is a member of */
  app.get('/api/vaults', async (request) => {
    const memberships = await db.query.vaultMembers.findMany({
      where: eq(vaultMembers.userId, request.userId),
      with: { vault: true },
    })
    return memberships.map((m) => ({ ...m.vault, role: m.role }))
  })

  /** Create a new vault */
  app.post<{ Body: { name: string } }>('/api/vaults', async (request, reply) => {
    const { name } = request.body
    if (!name) return reply.status(400).send({ error: 'name required' })

    const [vault] = await db.insert(vaults).values({ name }).returning()
    await db.insert(vaultMembers).values({ userId: request.userId, vaultId: vault.id, role: 'OWNER' })
    return vault
  })

  /** List files in a vault */
  app.get<{ Params: { vaultId: string } }>('/api/vaults/:vaultId/files', async (request, reply) => {
    await assertMember(request.userId, request.params.vaultId)
    const files = await db
      .select({
        path: vaultFiles.path,
        hash: vaultFiles.hash,
        size: vaultFiles.size,
        updatedAt: vaultFiles.updatedAt,
      })
      .from(vaultFiles)
      .where(eq(vaultFiles.vaultId, request.params.vaultId))
    return files
  })

  /** Get a single file's content */
  app.get<{ Params: { vaultId: string }; Querystring: { path: string } }>(
    '/api/vaults/:vaultId/file',
    async (request, reply) => {
      await assertMember(request.userId, request.params.vaultId)
      const record = await db.query.vaultFiles.findFirst({
        where: and(
          eq(vaultFiles.vaultId, request.params.vaultId),
          eq(vaultFiles.path, request.query.path),
        ),
      })
      if (!record) return reply.status(404).send({ error: 'File not found' })

      const content = await getObject(record.storageKey)
      reply.header('Content-Type', 'text/plain; charset=utf-8')
      return content
    },
  )

  /** Put (create or update) a file */
  app.put<{
    Params: { vaultId: string }
    Body: { path: string; content: string }
  }>('/api/vaults/:vaultId/file', async (request, reply) => {
    const member = await assertMember(request.userId, request.params.vaultId)
    if (member.role === 'VIEWER') return reply.status(403).send({ error: 'Read-only access' })

    const { path, content } = request.body
    if (!path || content === undefined) return reply.status(400).send({ error: 'path and content required' })

    const hash = createHash('sha256').update(content).digest('hex')
    const size = Buffer.byteLength(content, 'utf8')
    const key = storageKey(request.params.vaultId, path)

    await putObject(key, content)
    const [record] = await db
      .insert(vaultFiles)
      .values({ vaultId: request.params.vaultId, path, hash, size, storageKey: key })
      .onConflictDoUpdate({
        target: [vaultFiles.vaultId, vaultFiles.path],
        set: { hash, size, storageKey: key, updatedAt: new Date() },
      })
      .returning()
    return record
  })

  /** Delete a file */
  app.delete<{ Params: { vaultId: string }; Querystring: { path: string } }>(
    '/api/vaults/:vaultId/file',
    async (request, reply) => {
      const member = await assertMember(request.userId, request.params.vaultId)
      if (member.role === 'VIEWER') return reply.status(403).send({ error: 'Read-only access' })

      const record = await db.query.vaultFiles.findFirst({
        where: and(
          eq(vaultFiles.vaultId, request.params.vaultId),
          eq(vaultFiles.path, request.query.path),
        ),
      })
      if (!record) return reply.status(404).send({ error: 'File not found' })

      await db.delete(vaultFiles).where(eq(vaultFiles.id, record.id))
      return { ok: true }
    },
  )
}

async function assertMember(userId: string, vaultId: string) {
  const member = await db.query.vaultMembers.findFirst({
    where: and(eq(vaultMembers.userId, userId), eq(vaultMembers.vaultId, vaultId)),
  })
  if (!member) throw Object.assign(new Error('Not a member of this vault'), { statusCode: 403 })
  return member
}
