import type { FastifyInstance } from 'fastify'
import { authenticator } from 'otplib'
import QRCode from 'qrcode'
import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'
import { db } from '../lib/db.js'
import { users } from '../lib/schema.js'

function generateBackupCodes(): string[] {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  return Array.from({ length: 10 }, () => {
    const bytes = crypto.getRandomValues(new Uint8Array(8))
    return Array.from(bytes, (b) => chars[b % chars.length]).join('')
  })
}

async function verifyJwt(app: FastifyInstance, request: any, reply: any): Promise<{ sub: string; step?: string } | null> {
  try {
    await request.jwtVerify()
    return request.user as { sub: string; step?: string }
  } catch {
    reply.status(401).send({ error: 'Unauthorized' })
    return null
  }
}

export async function totpRoutes(app: FastifyInstance) {
  // POST /auth/2fa/setup — generate secret, store pending, return QR
  app.post('/auth/2fa/setup', async (request, reply) => {
    const payload = await verifyJwt(app, request, reply)
    if (!payload) return

    const user = await db.query.users.findFirst({ where: eq(users.id, payload.sub) })
    if (!user) return reply.status(404).send({ error: 'User not found' })

    const secret = authenticator.generateSecret()
    const otpauthUrl = authenticator.keyuri(user.email, 'Bazalt', secret)
    const qrDataUrl = await QRCode.toDataURL(otpauthUrl)

    await db.update(users).set({ totpSecret: secret }).where(eq(users.id, user.id))

    return { secret, otpauthUrl, qrDataUrl }
  })

  // POST /auth/2fa/enable — verify code, enable 2FA, return backup codes
  app.post<{ Body: { code: string } }>('/auth/2fa/enable', async (request, reply) => {
    const payload = await verifyJwt(app, request, reply)
    if (!payload) return

    const { code } = request.body
    if (!code) return reply.status(400).send({ error: 'code required' })

    const user = await db.query.users.findFirst({ where: eq(users.id, payload.sub) })
    if (!user || !user.totpSecret) {
      return reply.status(400).send({ error: '2FA setup not initiated — call /auth/2fa/setup first' })
    }

    const valid = authenticator.verify({ token: code, secret: user.totpSecret })
    if (!valid) return reply.status(400).send({ error: 'Invalid TOTP code' })

    const plainCodes = generateBackupCodes()
    const hashedCodes = await Promise.all(plainCodes.map((c) => bcrypt.hash(c, 10)))

    await db.update(users)
      .set({ totpEnabled: true, backupCodes: JSON.stringify(hashedCodes) })
      .where(eq(users.id, user.id))

    return { backupCodes: plainCodes }
  })

  // POST /auth/2fa/validate — uses tempToken; validate TOTP or backup code → full JWT
  app.post<{ Body: { code: string } }>('/auth/2fa/validate', async (request, reply) => {
    const payload = await verifyJwt(app, request, reply)
    if (!payload) return

    if (payload.step !== 'totp') {
      return reply.status(401).send({ error: 'Invalid token type' })
    }

    const { code } = request.body
    if (!code) return reply.status(400).send({ error: 'code required' })

    const user = await db.query.users.findFirst({ where: eq(users.id, payload.sub) })
    if (!user || !user.totpEnabled || !user.totpSecret) {
      return reply.status(400).send({ error: '2FA not enabled for this account' })
    }

    let valid = authenticator.verify({ token: code, secret: user.totpSecret })

    // Try backup codes if TOTP failed
    if (!valid && user.backupCodes) {
      const hashes: string[] = JSON.parse(user.backupCodes)
      let usedIndex = -1
      for (let i = 0; i < hashes.length; i++) {
        if (await bcrypt.compare(code, hashes[i])) {
          usedIndex = i
          break
        }
      }
      if (usedIndex >= 0) {
        valid = true
        hashes.splice(usedIndex, 1)
        await db.update(users)
          .set({ backupCodes: JSON.stringify(hashes) })
          .where(eq(users.id, user.id))
      }
    }

    if (!valid) return reply.status(401).send({ error: 'Invalid code' })

    const token = app.jwt.sign({ sub: user.id }, { expiresIn: '7d' })
    return { token, user: { id: user.id, email: user.email, name: user.name } }
  })

  // DELETE /auth/2fa — disable 2FA (requires password)
  app.delete<{ Body: { password: string } }>('/auth/2fa', async (request, reply) => {
    const payload = await verifyJwt(app, request, reply)
    if (!payload) return

    const { password } = request.body
    if (!password) return reply.status(400).send({ error: 'password required' })

    const user = await db.query.users.findFirst({ where: eq(users.id, payload.sub) })
    if (!user) return reply.status(404).send({ error: 'User not found' })

    if (!(await bcrypt.compare(password, user.password))) {
      return reply.status(401).send({ error: 'Invalid password' })
    }

    await db.update(users)
      .set({ totpEnabled: false, totpSecret: null, backupCodes: null })
      .where(eq(users.id, user.id))

    return { ok: true }
  })

  // POST /auth/2fa/backup-codes — regenerate backup codes (requires current TOTP)
  app.post<{ Body: { code: string } }>('/auth/2fa/backup-codes', async (request, reply) => {
    const payload = await verifyJwt(app, request, reply)
    if (!payload) return

    const { code } = request.body
    if (!code) return reply.status(400).send({ error: 'code required' })

    const user = await db.query.users.findFirst({ where: eq(users.id, payload.sub) })
    if (!user || !user.totpEnabled || !user.totpSecret) {
      return reply.status(400).send({ error: '2FA not enabled' })
    }

    const valid = authenticator.verify({ token: code, secret: user.totpSecret })
    if (!valid) return reply.status(400).send({ error: 'Invalid TOTP code' })

    const plainCodes = generateBackupCodes()
    const hashedCodes = await Promise.all(plainCodes.map((c) => bcrypt.hash(c, 10)))

    await db.update(users)
      .set({ backupCodes: JSON.stringify(hashedCodes) })
      .where(eq(users.id, user.id))

    return { backupCodes: plainCodes }
  })
}
