import type { FastifyInstance } from 'fastify'
import { eq, and, desc } from 'drizzle-orm'
import { db } from '../lib/db.js'
import { vaults, vaultMembers, vaultFiles, vaultFileVersions } from '../lib/schema.js'
import { putObject, getObject, getObjectBuffer, deleteObject, storageKey } from '../lib/storage.js'
import { createHash } from 'crypto'

function mimeType(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  const map: Record<string, string> = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
    pdf: 'application/pdf', mp3: 'audio/mpeg', wav: 'audio/wav',
    mp4: 'video/mp4', webm: 'video/webm',
  }
  return map[ext] ?? 'application/octet-stream'
}

export async function vaultRoutes(app: FastifyInstance) {
  app.addContentTypeParser('application/octet-stream', { parseAs: 'buffer' }, (_req, body, done) => {
    done(null, body)
  })
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

      const isBinary = !record.path.endsWith('.md') && !record.path.endsWith('.txt')
      if (isBinary) {
        const buf = await getObjectBuffer(record.storageKey)
        reply.header('Content-Type', mimeType(record.path))
        return reply.send(buf)
      }
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

    // Record a version snapshot
    const versionKey = `${request.params.vaultId}/${path}@${Date.now()}`
    await putObject(versionKey, content)
    await db.insert(vaultFileVersions).values({
      vaultId: request.params.vaultId, path, hash, size, storageKey: versionKey,
    })

    // Keep at most 50 versions per file — delete oldest
    const allVersions = await db
      .select({ id: vaultFileVersions.id, storageKey: vaultFileVersions.storageKey })
      .from(vaultFileVersions)
      .where(and(
        eq(vaultFileVersions.vaultId, request.params.vaultId),
        eq(vaultFileVersions.path, path),
      ))
      .orderBy(desc(vaultFileVersions.createdAt))
    if (allVersions.length > 50) {
      const toDelete = allVersions.slice(50)
      for (const v of toDelete) {
        await deleteObject(v.storageKey).catch(() => {})
        await db.delete(vaultFileVersions).where(eq(vaultFileVersions.id, v.id))
      }
    }

    return record
  })

  /** Put a binary file (images, attachments) */
  app.put<{
    Params: { vaultId: string }
    Querystring: { path: string }
    Body: Buffer
  }>('/api/vaults/:vaultId/file/binary', async (request, reply) => {
    const member = await assertMember(request.userId, request.params.vaultId)
    if (member.role === 'VIEWER') return reply.status(403).send({ error: 'Read-only access' })

    const { path } = request.query
    const body = request.body
    if (!path || !body) return reply.status(400).send({ error: 'path and body required' })

    const hash = createHash('sha256').update(body).digest('hex')
    const size = body.byteLength
    const key = storageKey(request.params.vaultId, path)

    await putObject(key, body)
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

  /** List versions of a file */
  app.get<{ Params: { vaultId: string }; Querystring: { path: string } }>(
    '/api/vaults/:vaultId/file/versions',
    async (request, reply) => {
      await assertMember(request.userId, request.params.vaultId)
      const versions = await db
        .select({
          id: vaultFileVersions.id,
          hash: vaultFileVersions.hash,
          size: vaultFileVersions.size,
          createdAt: vaultFileVersions.createdAt,
        })
        .from(vaultFileVersions)
        .where(and(
          eq(vaultFileVersions.vaultId, request.params.vaultId),
          eq(vaultFileVersions.path, request.query.path),
        ))
        .orderBy(desc(vaultFileVersions.createdAt))
        .limit(50)
      return versions
    },
  )

  /** Get content of a specific version */
  app.get<{ Params: { vaultId: string }; Querystring: { path: string; id: string } }>(
    '/api/vaults/:vaultId/file/version',
    async (request, reply) => {
      await assertMember(request.userId, request.params.vaultId)
      const version = await db.query.vaultFileVersions.findFirst({
        where: and(
          eq(vaultFileVersions.id, parseInt(request.query.id, 10)),
          eq(vaultFileVersions.vaultId, request.params.vaultId),
        ),
      })
      if (!version) return reply.status(404).send({ error: 'Version not found' })
      const content = await getObject(version.storageKey)
      reply.header('Content-Type', 'text/plain; charset=utf-8')
      return content
    },
  )

  /** Restore a file to a previous version */
  app.post<{
    Params: { vaultId: string }
    Body: { path: string; versionId: number }
  }>('/api/vaults/:vaultId/file/restore', async (request, reply) => {
    const member = await assertMember(request.userId, request.params.vaultId)
    if (member.role === 'VIEWER') return reply.status(403).send({ error: 'Read-only access' })

    const { path, versionId } = request.body
    const version = await db.query.vaultFileVersions.findFirst({
      where: and(
        eq(vaultFileVersions.id, versionId),
        eq(vaultFileVersions.vaultId, request.params.vaultId),
      ),
    })
    if (!version) return reply.status(404).send({ error: 'Version not found' })

    const content = await getObject(version.storageKey)
    const hash = createHash('sha256').update(content).digest('hex')
    const size = Buffer.byteLength(content, 'utf8')
    const key = storageKey(request.params.vaultId, path)

    await putObject(key, content)
    await db
      .insert(vaultFiles)
      .values({ vaultId: request.params.vaultId, path, hash, size, storageKey: key })
      .onConflictDoUpdate({
        target: [vaultFiles.vaultId, vaultFiles.path],
        set: { hash, size, storageKey: key, updatedAt: new Date() },
      })

    // Record restore as a new version entry
    const versionKey = `${request.params.vaultId}/${path}@${Date.now()}`
    await putObject(versionKey, content)
    await db.insert(vaultFileVersions).values({
      vaultId: request.params.vaultId, path, hash, size, storageKey: versionKey,
    })

    return { ok: true }
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
