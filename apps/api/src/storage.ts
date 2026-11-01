import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { AwsClient } from 'aws4fetch'

const { R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, MEDIA_PUBLIC_URL, R2_ENDPOINT } = process.env
const localDir = process.env.MEDIA_DIR ?? new URL('../../../.media', import.meta.url).pathname
const validKey = /^[0-9a-f-]{36}\/[0-9a-f-]{36}(-thumb)?\.webp$/

export const usesR2 = Boolean(R2_BUCKET)
if (process.env.NODE_ENV === 'production' && !usesR2) throw new Error('R2_BUCKET is required in production: local files do not survive a deploy')

const r2 = usesR2 ? new AwsClient({ accessKeyId: R2_ACCESS_KEY_ID!, secretAccessKey: R2_SECRET_ACCESS_KEY!, service: 's3', region: 'auto' }) : null
const objectUrl = (key: string) => `${R2_ENDPOINT ?? `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`}/${R2_BUCKET}/${key}`

export function publicUrl(key: string) {
  return usesR2 ? `${MEDIA_PUBLIC_URL}/${key}` : `/api/media-files/${key}`
}

export async function putFile(key: string, data: Buffer) {
  if (r2) {
    const res = await r2.fetch(objectUrl(key), {
      method: 'PUT',
      body: new Uint8Array(data),
      headers: { 'content-type': 'image/webp', 'cache-control': 'public, max-age=31536000, immutable' },
    })
    if (!res.ok) throw new Error(`R2 upload failed with status ${res.status}`)
    return
  }
  const path = join(localDir, key)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, data)
}

export async function getFile(key: string) {
  if (r2) {
    const res = await r2.fetch(objectUrl(key))
    if (!res.ok) throw new Error(`R2 read failed with status ${res.status}`)
    return Buffer.from(await res.arrayBuffer())
  }
  return readFile(join(localDir, key))
}

export async function deleteFile(key: string) {
  if (r2) {
    const res = await r2.fetch(objectUrl(key), { method: 'DELETE' })
    if (!res.ok && res.status !== 404) throw new Error(`R2 delete failed with status ${res.status}`)
    return
  }
  await rm(join(localDir, key), { force: true })
}

// Development only. Keys are checked so a crafted URL cannot read outside the media folder.
export async function readLocalFile(key: string) {
  if (usesR2 || !validKey.test(key)) return null
  return readFile(join(localDir, key)).catch(() => null)
}
