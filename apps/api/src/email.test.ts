import assert from 'node:assert/strict'
import { createSign, generateKeyPairSync } from 'node:crypto'
import { readdir, readFile, rm } from 'node:fs/promises'
import { after, before, test } from 'node:test'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { app } from './app.ts'
import { pool, tx } from './db.ts'
import { drainOutbox, snsCerts, snsSigned, suppressedBy } from './email.ts'

const dir = process.env.EMAIL_DIR!

before(async () => {
  await pool.query('drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public')
  await migrate(drizzle(pool), { migrationsFolder: new URL('../migrations', import.meta.url).pathname })
  await rm(dir, { recursive: true, force: true })
})
after(() => pool.end())

function client() {
  let cookie = ''
  return async (method: string, path: string, body?: unknown) => {
    const response = await app.request(`/api${path}`, { method, headers: { 'content-type': 'application/json', cookie }, body: body === undefined ? undefined : JSON.stringify(body) })
    if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie')!.split(';')[0]
    const text = await response.text()
    return { status: response.status, json: text ? JSON.parse(text) : null }
  }
}

// The emails sent to an address so far (development writes each one to EMAIL_DIR).
async function inbox(to: string) {
  await drainOutbox()
  const files = (await readdir(dir).catch(() => [] as string[])).filter((f) => f.endsWith('.txt')).sort()
  const texts = await Promise.all(files.map((f) => readFile(`${dir}/${f}`, 'utf8')))
  return texts.filter((t) => t.startsWith(`To: ${to}\n`))
}
const linkIn = (email: string, path: string) => email.match(new RegExp(`/${path}/([A-Za-z0-9_-]+)`))![1]

test('sign-up sends a verification link that works once', async () => {
  const call = client()
  await call('POST', '/auth/signup', { name: 'রহিম', email: 'verify@example.com', password: 'correct horse', phone: '01711000000', lang: 'bn' })
  assert.equal((await call('GET', '/me')).json.user.emailVerified, false)
  const [email] = await inbox('verify@example.com')
  assert.match(email, /Subject: উদ্যোক্তা: আপনার ইমেইল নিশ্চিত করুন/)
  assert.match(email, /প্রিয় রহিম,/)
  const token = linkIn(email, 'verify-email')
  assert.equal((await client()('POST', '/auth/verify', { token })).status, 200, 'works without being signed in')
  assert.equal((await call('GET', '/me')).json.user.emailVerified, true)
  assert.equal((await call('POST', '/auth/verify', { token })).json.error, 'linkInvalid', 'single use')
  assert.equal((await call('POST', '/me/verify-email', {})).status, 200, 'already verified: nothing to send')
  assert.equal((await inbox('verify@example.com')).length, 1)
})

test('password reset: same answer for unknown emails, one use, signs out other sessions, three an hour', async () => {
  const old = client()
  await old('POST', '/auth/signup', { name: 'Karim', email: 'reset@example.com', password: 'first password', phone: '01711000000', lang: 'en' })
  assert.deepEqual(await client()('POST', '/auth/forgot', { email: 'nobody@example.com' }), { status: 200, json: { ok: true } })
  assert.equal((await inbox('nobody@example.com')).length, 0)

  const fresh = client()
  assert.equal((await fresh('POST', '/auth/forgot', { email: 'Reset@Example.com', lang: 'en' })).status, 200)
  const email = (await inbox('reset@example.com')).find((e) => e.includes('Subject: Reset your Uddokta password'))!
  const token = linkIn(email, 'reset-password')
  assert.equal((await fresh('POST', '/auth/reset', { token, password: 'short' })).json.error, 'weakPassword')
  assert.equal((await fresh('POST', '/auth/reset', { token, password: 'second password' })).status, 200)
  assert.equal((await fresh('GET', '/me')).json.user.email, 'reset@example.com', 'signed in by the reset')
  assert.equal((await fresh('GET', '/me')).json.user.emailVerified, true, 'the inbox is proven')
  assert.equal((await old('GET', '/me')).status, 401, 'other sessions end')
  assert.equal((await fresh('POST', '/auth/reset', { token, password: 'third password' })).json.error, 'linkInvalid', 'single use')
  assert.equal((await client()('POST', '/auth/login', { email: 'reset@example.com', password: 'second password' })).status, 200)

  for (let i = 0; i < 4; i++) await client()('POST', '/auth/forgot', { email: 'reset@example.com' })
  assert.equal((await inbox('reset@example.com')).filter((e) => e.includes('/reset-password/')).length, 4, 'the first, then three more in the hour (using a link clears the count)')
})

test('SES bounce and complaint reports: only signed messages from our topic, then nothing more is sent', async () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const certUrl = 'https://sns.ap-southeast-1.amazonaws.com/test-cert.pem'
  snsCerts.set(certUrl, publicKey.export({ type: 'spki', format: 'pem' }).toString())
  process.env.SES_EVENTS_TOPIC_ARN = 'arn:aws:sns:ap-southeast-1:000000000000:uddokta-ses'
  const event = { eventType: 'Bounce', bounce: { bounceType: 'Permanent', bouncedRecipients: [{ emailAddress: 'Gone@Example.com' }] } }
  const message: Record<string, string> = { Type: 'Notification', MessageId: '1', TopicArn: process.env.SES_EVENTS_TOPIC_ARN, Message: JSON.stringify(event), Timestamp: new Date().toISOString(), SignatureVersion: '2', SigningCertURL: certUrl }
  const post = (m: Record<string, string>) => app.request('/api/ses/events', { method: 'POST', headers: { 'content-type': 'text/plain; charset=UTF-8' }, body: JSON.stringify(m) })

  assert.equal((await post({ ...message, Signature: 'forged' })).status, 403)
  const signed = { ...message, Signature: createSign('RSA-SHA256').update(snsSigned(message)).sign(privateKey, 'base64') }
  assert.equal((await post({ ...signed, TopicArn: 'arn:aws:sns:ap-southeast-1:000000000000:other' })).status, 403, 'another topic')
  assert.equal((await post(signed)).status, 200)

  const call = client()
  await call('POST', '/auth/signup', { name: 'Gone', email: 'gone@example.com', password: 'correct horse', phone: '01711000000' })
  assert.equal((await inbox('gone@example.com')).length, 0, 'suppressed address gets nothing')

  assert.deepEqual(suppressedBy({ notificationType: 'Bounce', bounce: { bounceType: 'Transient', bouncedRecipients: [{ emailAddress: 'full@example.com' }] } }), [], 'a full mailbox is not suppressed')
  assert.deepEqual(suppressedBy({ eventType: 'Complaint', complaint: { complainedRecipients: [{ emailAddress: 'no@example.com' }] } }), [{ email: 'no@example.com', reason: 'complaint' }])
})

test('production without SES keys or APP_URL: no reset promised, no verification asked for', async () => {
  const saved = { ...process.env }
  Object.assign(process.env, { NODE_ENV: 'production', SIGNUP_MODE: 'open', APP_URL: 'https://admin.uddokta.co' })
  delete process.env.AWS_ACCESS_KEY_ID
  try {
    const call = client()
    await call('POST', '/auth/signup', { name: 'Early', email: 'early@example.com', password: 'correct horse', phone: '01711000000' })
    assert.equal((await call('GET', '/me')).json.user.emailVerified, true, 'nothing to confirm while email is off')
    assert.equal((await client()('POST', '/auth/forgot', { email: 'early@example.com' })).json.error, 'emailUnavailable')
    assert.equal((await inbox('early@example.com')).length, 0)
  } finally {
    process.env = saved
  }
})

test('the app role cannot read tokens, the outbox or suppressions', async () => {
  for (const table of ['account_tokens', 'outbox_emails', 'email_suppressions']) {
    await assert.rejects(tx(null, (t) => t.execute(sql.raw(`select * from ${table}`))), (err: any) => (err.cause?.code ?? err.code) === '42501', table)
  }
})
