import type { FastifyInstance } from 'fastify'
import { eq, and } from 'drizzle-orm'
import { db } from '../lib/db.js'
import { vaultMembers, vaultFiles } from '../lib/schema.js'
import { putObject, storageKey } from '../lib/storage.js'
import { createHash } from 'crypto'

export interface SyncFile {
  path: string
  hash: string
  content?: string
}

export async function syncRoutes(app: FastifyInstance) {
  /**
   * POST /api/vaults/:vaultId/sync/changes
   * Client sends its local file hashes; server returns which files differ.
   * Body: { files: { path: string; hash: string }[] }
   * Response: { pull: string[]; push: string[] }
   *   pull = paths where server is newer (client should download)
   *   push = paths client has that server doesn't know about (server should be told)
   */
  app.post<{
    Params: { vaultId: string }
    Body: { files: { path: string; hash: string }[] }
  }>('/api/vaults/:vaultId/sync/changes', async (request) => {
    await assertMember(request.userId, request.params.vaultId)

    const clientFiles = new Map(request.body.files.map((f) => [f.path, f.hash]))
    const serverFiles = await db
      .select({ path: vaultFiles.path, hash: vaultFiles.hash })
      .from(vaultFiles)
      .where(eq(vaultFiles.vaultId, request.params.vaultId))
    const serverMap = new Map(serverFiles.map((f) => [f.path, f.hash]))

    const pull: string[] = []
    const push: string[] = []

    for (const [path, hash] of serverMap) {
      if (!clientFiles.has(path) || clientFiles.get(path) !== hash) {
        pull.push(path)
      }
    }

    for (const [path] of clientFiles) {
      if (!serverMap.has(path)) {
        push.push(path)
      }
    }

    return { pull, push }
  })

  /**
   * POST /api/vaults/:vaultId/sync/push
   * Client pushes changed files to server.
   * Body: { files: { path: string; content: string }[] }
   */
  app.post<{
    Params: { vaultId: string }
    Body: { files: { path: string; content: string }[] }
  }>('/api/vaults/:vaultId/sync/push', async (request, reply) => {
    const member = await assertMember(request.userId, request.params.vaultId)
    if (member.role === 'VIEWER') return reply.status(403).send({ error: 'Read-only access' })

    const { vaultId } = request.params
    const results: { path: string; ok: boolean }[] = []

    for (const { path, content } of request.body.files) {
      const hash = createHash('sha256').update(content).digest('hex')
      const size = Buffer.byteLength(content, 'utf8')
      const key = storageKey(vaultId, path)
      await putObject(key, content)
      await db
        .insert(vaultFiles)
        .values({ vaultId, path, hash, size, storageKey: key })
        .onConflictDoUpdate({
          target: [vaultFiles.vaultId, vaultFiles.path],
          set: { hash, size, storageKey: key, updatedAt: new Date() },
        })
      results.push({ path, ok: true })
    }

    return { results }
  })
}

async function assertMember(userId: string, vaultId: string) {
  const member = await db.query.vaultMembers.findFirst({
    where: and(eq(vaultMembers.userId, userId), eq(vaultMembers.vaultId, vaultId)),
  })
  if (!member) throw Object.assign(new Error('Not a member of this vault'), { statusCode: 403 })
  return member
}
