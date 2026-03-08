function require(key: string): string {
  const v = process.env[key]
  if (!v) throw new Error(`Missing required env var: ${key}`)
  return v
}

export const env = {
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  PORT: Number(process.env.PORT ?? 3001),
  DATABASE_URL: require('DATABASE_URL'),
  JWT_SECRET: require('JWT_SECRET'),
  /** SeaweedFS S3 endpoint, e.g. http://seaweedfs:8333 */
  S3_ENDPOINT: process.env.S3_ENDPOINT ?? 'http://localhost:8333',
  S3_BUCKET: process.env.S3_BUCKET ?? 'bazalt',
  S3_ACCESS_KEY: process.env.S3_ACCESS_KEY ?? 'any',
  S3_SECRET_KEY: process.env.S3_SECRET_KEY ?? 'any',
  /** Absolute path to the compiled SPA — served as static files */
  SPA_PATH: process.env.SPA_PATH ?? '',
}
