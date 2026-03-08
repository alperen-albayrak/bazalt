/**
 * Runs pending Drizzle migrations against the configured DATABASE_URL.
 * Called from Dockerfile CMD before starting the server.
 */
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL is not set')

const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationsFolder = join(__dirname, '..', 'drizzle')

const client = postgres(url, { max: 1 })
const db = drizzle(client)

console.log('Running migrations...')
await migrate(db, { migrationsFolder })
console.log('Migrations complete.')

await client.end()
