import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  CreateBucketCommand,
  HeadBucketCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { env } from './env.js'

export const s3 = new S3Client({
  endpoint: env.S3_ENDPOINT,
  region: 'us-east-1', // SeaweedFS ignores this but SDK requires it
  credentials: { accessKeyId: env.S3_ACCESS_KEY, secretAccessKey: env.S3_SECRET_KEY },
  forcePathStyle: true, // required for SeaweedFS
})

/** Ensure the bucket exists (idempotent). */
export async function ensureBucket(): Promise<void> {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: env.S3_BUCKET }))
  } catch {
    await s3.send(new CreateBucketCommand({ Bucket: env.S3_BUCKET }))
  }
}

export async function putObject(key: string, body: string | Buffer): Promise<void> {
  await s3.send(
    new PutObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: key,
      Body: body,
    }),
  )
}

export async function getObject(key: string): Promise<string> {
  const res = await s3.send(new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }))
  return res.Body!.transformToString()
}

export async function deleteObject(key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: key }))
}

export function storageKey(vaultId: string, filePath: string): string {
  return `${vaultId}/${filePath}`
}
