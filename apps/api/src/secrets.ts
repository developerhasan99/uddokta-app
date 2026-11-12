import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

// AES-256-GCM for courier logins. Production must set COURIER_KEY; development uses a fixed key so local data keeps working.
const raw = process.env.COURIER_KEY
if (process.env.NODE_ENV === 'production' && !raw) throw new Error('COURIER_KEY is required in production')
const key = createHash('sha256').update(raw ?? 'uddokta-development-only').digest()

export function seal(value: unknown) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const data = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()])
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64')).join('.')
}

export function open<T>(sealed: string): T {
  const [iv, tag, data] = sealed.split('.').map((p) => Buffer.from(p, 'base64'))
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  return JSON.parse(Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')) as T
}

// Page export files are signed, so only files our builder produced can be imported (a changed or hand-made file is
// refused). The signing key is derived from the same secret, for this purpose only.
const exportKey = createHash('sha256').update(`page-export:${raw ?? 'uddokta-development-only'}`).digest()
export const signExport = (text: string) => createHmac('sha256', exportKey).update(text).digest('base64url')
export function verifyExport(text: string, signature: unknown) {
  if (typeof signature !== 'string') return false
  const expected = Buffer.from(signExport(text))
  const given = Buffer.from(signature)
  return expected.length === given.length && timingSafeEqual(expected, given)
}
