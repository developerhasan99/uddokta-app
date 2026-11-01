import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'

const N = 2 ** 16
const r = 8
const p = 1
const keyLength = 32

function derive(password: string, salt: Buffer, n: number, length: number) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, length, { N: n, r, p, maxmem: 256 * n * r }, (err, key) => (err ? reject(err) : resolve(key)))
  })
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16)
  const key = await derive(password, salt, N, keyLength)
  return `scrypt$${N}$${salt.toString('base64')}$${key.toString('base64')}`
}

export async function verifyPassword(password: string, stored: string) {
  const [, n, salt, key] = stored.split('$')
  const expected = Buffer.from(key, 'base64')
  const actual = await derive(password, Buffer.from(salt, 'base64'), Number(n), expected.length)
  return timingSafeEqual(actual, expected)
}

// Checked when an email has no account, so response time does not reveal which emails exist.
export const dummyHash = await hashPassword(randomBytes(16).toString('hex'))
