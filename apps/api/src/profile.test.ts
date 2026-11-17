import assert from 'node:assert/strict'
import { readdir, readFile, rm } from 'node:fs/promises'
import { after, before, test } from 'node:test'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { app } from './app.ts'
import { pool } from './db.ts'
import { drainOutbox } from './email.ts'

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
let counter = 0
async function person(lang = 'bn') {
  const email = `profile-${++counter}@example.com`
  const call = client()
  await call('POST', '/auth/signup', { name: 'Seller', email, password: 'correct horse', lang })
  return { call, email }
}
async function inbox(to: string) {
  await drainOutbox()
  const files = (await readdir(dir).catch(() => [] as string[])).filter((f) => f.endsWith('.txt')).sort()
  return (await Promise.all(files.map((f) => readFile(`${dir}/${f}`, 'utf8')))).filter((t) => t.startsWith(`To: ${to}\n`))
}

test('name and language: saved, checked, and the language used for account email', async () => {
  const { call } = await person('en')
  assert.equal((await call('GET', '/me')).json.user.language, 'en', 'sign-up keeps the chosen language')
  assert.equal((await call('PUT', '/me', { name: '  ' })).json.error, 'nameRequired')
  assert.equal((await call('PUT', '/me', { name: 'রহিমা খাতুন' })).status, 200)
  assert.equal((await call('PUT', '/me', { language: 'bn' })).status, 200)
  const me = (await call('GET', '/me')).json.user
  assert.deepEqual([me.name, me.language], ['রহিমা খাতুন', 'bn'], 'each field kept when the other changes')
})

test('password: needs the current one, signs out other devices, counts wrong guesses', async () => {
  const { call, email } = await person()
  const other = client()
  await other('POST', '/auth/login', { email, password: 'correct horse' })
  assert.equal((await call('GET', '/me/sessions')).json.count, 2)
  assert.equal((await call('PUT', '/me/password', { current: 'wrong', password: 'new password' })).json.error, 'wrongPassword')
  assert.equal((await call('PUT', '/me/password', { current: 'correct horse', password: 'short' })).json.error, 'weakPassword')
  assert.equal((await call('PUT', '/me/password', { current: 'correct horse', password: 'new password' })).status, 200)
  assert.equal((await call('GET', '/me')).status, 200, 'this device stays signed in')
  assert.equal((await other('GET', '/me')).status, 401, 'other devices are signed out')
  assert.equal((await client()('POST', '/auth/login', { email, password: 'new password' })).status, 200)
  for (let i = 0; i < 10; i++) await call('PUT', '/me/password', { current: 'guess', password: 'another one' })
  assert.equal((await call('PUT', '/me/password', { current: 'new password', password: 'another one' })).json.error, 'tooManyAttempts')
})

test('sign out everywhere else keeps this device', async () => {
  const { call, email } = await person()
  const phone = client()
  await phone('POST', '/auth/login', { email, password: 'correct horse' })
  assert.equal((await call('POST', '/me/sessions/end-others')).status, 200)
  assert.equal((await phone('GET', '/me')).status, 401)
  assert.equal((await call('GET', '/me/sessions')).json.count, 1)
})

test('email change: password, link to the new address, notice to the old one, taken and reused refused', async () => {
  const { call, email } = await person()
  const taken = await person()
  assert.equal((await call('POST', '/me/email', { email: 'new@example.com', password: 'wrong' })).json.error, 'wrongPassword')
  assert.equal((await call('POST', '/me/email', { email: taken.email, password: 'correct horse' })).json.error, 'emailTaken')
  assert.equal((await call('POST', '/me/email', { email, password: 'correct horse' })).json.error, 'sameEmail')
  assert.equal((await call('POST', '/me/email', { email: 'New@Example.com', password: 'correct horse' })).status, 200)
  assert.equal((await call('GET', '/me')).json.user.email, email, 'nothing changes before the link is used')
  const [link] = await inbox('new@example.com')
  const token = link.match(/\/change-email\/([A-Za-z0-9_-]+)/)![1]
  assert.deepEqual((await client()('POST', '/auth/email-change', { token })).json, { ok: true, email: 'new@example.com' })
  const me = (await call('GET', '/me')).json.user
  assert.deepEqual([me.email, me.emailVerified], ['new@example.com', true])
  assert.match((await inbox(email)).at(-1)!, /new@example\.com/, 'the old address is told')
  assert.equal((await call('POST', '/auth/email-change', { token })).json.error, 'linkInvalid', 'single use')
  assert.equal((await client()('POST', '/auth/login', { email: 'new@example.com', password: 'correct horse' })).status, 200)
})

test('a password reset cancels a pending email change', async () => {
  const { call, email } = await person()
  await call('POST', '/me/email', { email: 'thief@example.com', password: 'correct horse' })
  const [link] = await inbox('thief@example.com')
  await client()('POST', '/auth/forgot', { email })
  const reset = (await inbox(email)).find((e) => e.includes('/reset-password/'))!
  await client()('POST', '/auth/reset', { token: reset.match(/\/reset-password\/([A-Za-z0-9_-]+)/)![1], password: 'taken back' })
  assert.equal((await client()('POST', '/auth/email-change', { token: link.match(/\/change-email\/([A-Za-z0-9_-]+)/)![1] })).json.error, 'linkInvalid')
})

test('delete account: password, refused while the only owner of a store, then gone', async () => {
  const owner = await person()
  await owner.call('POST', '/stores', { name: 'Shop', handle: `profile-shop-${counter}` })
  const staff = await person()
  const invite = await owner.call('POST', `/stores/profile-shop-${counter - 1}/invites`, { role: 'owner' })
  assert.equal((await owner.call('DELETE', '/me', { password: 'wrong' })).json.error, 'wrongPassword')

  const solo = await person()
  await solo.call('POST', '/stores', { name: 'Solo Shop', handle: `solo-shop-${counter}` })
  assert.deepEqual((await solo.call('DELETE', '/me', { password: 'correct horse' })).json, { error: 'soleOwner', stores: ['Solo Shop'] })

  await staff.call('POST', `/invites/${invite.json.token}/accept`)
  assert.equal((await owner.call('DELETE', '/me', { password: 'correct horse' })).status, 204, 'another owner keeps the store')
  assert.equal((await owner.call('GET', '/me')).status, 401)
  assert.equal((await client()('POST', '/auth/login', { email: owner.email, password: 'correct horse' })).status, 401)
  assert.equal((await staff.call('GET', '/me')).json.stores.length, 1, 'the store stays with its other owner')
})
