import type { FastifyInstance } from 'fastify'
import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'
import { db } from '../lib/db.js'
import { users } from '../lib/schema.js'

export async function authRoutes(app: FastifyInstance) {
  app.post<{
    Body: { email: string; password: string; name?: string }
  }>('/auth/register', async (request, reply) => {
    const { email, password, name = '' } = request.body

    if (!email || !password) {
      return reply.status(400).send({ error: 'email and password required' })
    }
    if (password.length < 8) {
      return reply.status(400).send({ error: 'password must be at least 8 characters' })
    }

    const existing = await db.query.users.findFirst({ where: eq(users.email, email) })
    if (existing) {
      return reply.status(409).send({ error: 'Email already registered' })
    }

    const hashed = await bcrypt.hash(password, 12)
    const [user] = await db.insert(users).values({ email, password: hashed, name }).returning()

    const token = app.jwt.sign({ sub: user.id }, { expiresIn: '7d' })
    return { token, user: { id: user.id, email: user.email, name: user.name } }
  })

  app.post<{
    Body: { email: string; password: string }
  }>('/auth/login', async (request, reply) => {
    const { email, password } = request.body

    if (!email || !password) {
      return reply.status(400).send({ error: 'email and password required' })
    }

    const user = await db.query.users.findFirst({ where: eq(users.email, email) })
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return reply.status(401).send({ error: 'Invalid credentials' })
    }

    if (user.totpEnabled) {
      const tempToken = app.jwt.sign({ sub: user.id, step: 'totp' }, { expiresIn: '3m' })
      return { tempToken, user: { id: user.id, email: user.email, name: user.name }, requiresTOTP: true }
    }

    const token = app.jwt.sign({ sub: user.id }, { expiresIn: '7d' })
    return { token, user: { id: user.id, email: user.email, name: user.name } }
  })

  app.get('/auth/me', async (request, reply) => {
    await request.jwtVerify()
    const payload = request.user as { sub: string }
    const user = await db.query.users.findFirst({ where: eq(users.id, payload.sub) })
    if (!user) return reply.status(404).send({ error: 'User not found' })
    return { id: user.id, email: user.email, name: user.name, totpEnabled: user.totpEnabled }
  })
}
