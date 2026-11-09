import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { app } from './app.ts'
import { pool, tx } from './db.ts'
import { stores, storeMembers, users } from './schema.ts'

before(async () => {
  await pool.query('drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public')
  await migrate(drizzle(pool), { migrationsFolder: new URL('../migrations', import.meta.url).pathname })
})
after(() => pool.end())

// A signed-in browser: keeps the session cookie between calls.
function client() {
  let cookie = ''
  return async (method: string, path: string, body?: unknown) => {
    const res = await app.request(`/api${path}`, {
      method,
      headers: { 'content-type': 'application/json', cookie },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const set = res.headers.get('set-cookie')
    if (set) cookie = set.split(';')[0]
    return { status: res.status, set, json: (await res.json()) as any }
  }
}

let count = 0
async function signUp() {
  const call = client()
  const email = `user${++count}@example.com`
  const res = await call('POST', '/auth/signup', { name: `User ${count}`, email, password: 'correct horse' })
  assert.equal(res.status, 201)
  const me = await call('GET', '/me')
  return { call, email, id: me.json.user.id as string }
}

async function storeWithOwner() {
  const owner = await signUp()
  const handle = `shop-${++count}`
  assert.equal((await owner.call('POST', '/stores', { name: 'Shop', handle })).status, 201)
  return { owner, handle }
}

async function join(handle: string, inviter: Awaited<ReturnType<typeof signUp>>, role: string) {
  const person = await signUp()
  const invite = await inviter.call('POST', `/stores/${handle}/invites`, { role })
  assert.equal(invite.status, 201)
  assert.equal((await person.call('POST', `/invites/${invite.json.token}/accept`)).status, 200)
  return person
}

test('a new user exists with no stores', async () => {
  const { call } = await signUp()
  assert.deepEqual((await call('GET', '/me')).json.stores, [])
})

test('signed-out requests are refused', async () => {
  const res = await client()('GET', '/me')
  assert.equal(res.status, 401)
})

test('login, wrong password and logout', async () => {
  const { email } = await signUp()
  const call = client()
  assert.equal((await call('POST', '/auth/login', { email, password: 'wrong password' })).json.error, 'invalidCredentials')
  assert.equal((await call('POST', '/auth/login', { email: 'nobody@example.com', password: 'x' })).json.error, 'invalidCredentials')
  const ok = await call('POST', '/auth/login', { email: email.toUpperCase(), password: 'correct horse' })
  assert.equal(ok.status, 200)
  assert.match(ok.set!, /HttpOnly/)
  assert.equal((await call('GET', '/me')).status, 200)
  await call('POST', '/auth/logout')
  assert.equal((await call('GET', '/me')).status, 401)
})

test('repeated wrong passwords lock the email for a while', { timeout: 60000 }, async () => {
  const { email } = await signUp()
  const call = client()
  for (let i = 0; i < 10; i++) await call('POST', '/auth/login', { email, password: 'wrong password' })
  assert.equal((await call('POST', '/auth/login', { email, password: 'correct horse' })).status, 429)
})

test('sign-up input is validated and emails are unique', async () => {
  const call = client()
  assert.equal((await call('POST', '/auth/signup', { name: '', email: 'a@b.co', password: 'longenough' })).json.error, 'nameRequired')
  assert.equal((await call('POST', '/auth/signup', { name: 'A', email: 'nope', password: 'longenough' })).json.error, 'emailInvalid')
  assert.equal((await call('POST', '/auth/signup', { name: 'A', email: 'a@b.co', password: 'short' })).json.error, 'weakPassword')
  const { email } = await signUp()
  assert.equal((await call('POST', '/auth/signup', { name: 'A', email, password: 'longenough' })).json.error, 'emailTaken')
})

test('creating a store makes the creator its owner', async () => {
  const { owner, handle } = await storeWithOwner()
  const { stores: mine } = (await owner.call('GET', '/me')).json
  assert.equal(mine[0].handle, handle)
  assert.equal(mine[0].role, 'owner')
  assert.equal((await owner.call('POST', '/stores', { name: 'X', handle })).json.error, 'handleTaken')
  assert.equal((await owner.call('POST', '/stores', { name: 'X', handle: 'Bad Handle' })).json.error, 'handleInvalid')
})

test('one user in many stores, one store with many users', async () => {
  const { owner, handle } = await storeWithOwner()
  const second = await storeWithOwner()
  const invite = await second.owner.call('POST', `/stores/${second.handle}/invites`, { role: 'staff' })
  await owner.call('POST', `/invites/${invite.json.token}/accept`)
  assert.equal((await owner.call('GET', '/me')).json.stores.length, 2)
  await join(handle, owner, 'staff')
  assert.equal((await owner.call('GET', `/stores/${handle}/members`)).json.members.length, 2)
})

test('the last owner cannot be removed or demoted', async () => {
  const { owner, handle } = await storeWithOwner()
  const remove = await owner.call('DELETE', `/stores/${handle}/members/${owner.id}`)
  assert.equal(remove.json.error, 'lastOwner')
  const demote = await owner.call('PATCH', `/stores/${handle}/members/${owner.id}`, { role: 'staff' })
  assert.equal(demote.json.error, 'lastOwner')
  assert.equal((await owner.call('GET', `/stores/${handle}/members`)).json.members[0].role, 'owner')
})

test('an owner can leave once another owner exists', async () => {
  const { owner, handle } = await storeWithOwner()
  const other = await join(handle, owner, 'owner')
  assert.equal((await owner.call('DELETE', `/stores/${handle}/members/${owner.id}`)).status, 200)
  const members = (await other.call('GET', `/stores/${handle}/members`)).json.members
  assert.deepEqual(members.map((m: any) => m.id), [other.id])
})

test('two owners demoting each other at once cannot leave a store ownerless', async () => {
  const { owner, handle } = await storeWithOwner()
  const other = await join(handle, owner, 'owner')
  const results = await Promise.all([
    owner.call('PATCH', `/stores/${handle}/members/${other.id}`, { role: 'staff' }),
    other.call('PATCH', `/stores/${handle}/members/${owner.id}`, { role: 'staff' }),
  ])
  assert.ok(results.some((r) => r.status !== 200), JSON.stringify(results.map((r) => r.status)))
})

test('a store created without an owner is rejected by the database', async () => {
  const { id } = await signUp()
  await assert.rejects(tx(id, (t) => t.insert(stores).values({ handle: 'no-owner', name: 'No owner' })))
})

test('staff cannot manage the team, admins cannot touch owners', async () => {
  const { owner, handle } = await storeWithOwner()
  const admin = await join(handle, owner, 'admin')
  const staff = await join(handle, owner, 'staff')
  assert.equal((await staff.call('POST', `/stores/${handle}/invites`, { role: 'staff' })).status, 403)
  assert.equal((await staff.call('PATCH', `/stores/${handle}/members/${admin.id}`, { role: 'staff' })).status, 403)
  assert.equal((await staff.call('DELETE', `/stores/${handle}/members/${admin.id}`)).status, 403)
  assert.equal((await staff.call('PATCH', `/stores/${handle}/members/${staff.id}`, { role: 'owner' })).status, 403)
  assert.equal((await admin.call('DELETE', `/stores/${handle}/members/${owner.id}`)).status, 403)
  assert.equal((await admin.call('PATCH', `/stores/${handle}/members/${staff.id}`, { role: 'owner' })).status, 403)
  assert.equal((await admin.call('POST', `/stores/${handle}/invites`, { role: 'owner' })).status, 403)
  assert.equal((await admin.call('PATCH', `/stores/${handle}/members/${staff.id}`, { role: 'admin' })).status, 200)
  assert.equal((await staff.call('DELETE', `/stores/${handle}/members/${staff.id}`)).status, 200)
})

test('one store cannot see or change another', async () => {
  const a = await storeWithOwner()
  const b = await storeWithOwner()
  assert.equal((await a.owner.call('GET', `/stores/${b.handle}/members`)).status, 404)
  assert.equal((await a.owner.call('POST', `/stores/${b.handle}/invites`, { role: 'owner' })).status, 404)
  assert.equal((await a.owner.call('DELETE', `/stores/${b.handle}/members/${b.owner.id}`)).status, 404)
})

test('row-level security holds even when a query has no store filter', async () => {
  const a = await storeWithOwner()
  const b = await storeWithOwner()
  await tx(a.owner.id, async (t) => {
    const allStores = await t.select().from(stores)
    assert.deepEqual(allStores.map((s) => s.handle), [a.handle])
    const allMembers = await t.select().from(storeMembers)
    assert.deepEqual(allMembers.map((m) => m.userId), [a.owner.id])
    assert.deepEqual((await t.select().from(users)).map((u) => u.id), [a.owner.id])
    const [other] = await (await pool.query('select id from stores where handle = $1', [b.handle])).rows
    await assert.rejects(t.insert(storeMembers).values({ storeId: other.id, userId: a.owner.id, role: 'owner' }))
  })
})

test('the app role cannot read passwords or sessions', async () => {
  const { id } = await signUp()
  await assert.rejects(tx(id, (t) => t.execute(sql`select * from user_credentials`)))
  await assert.rejects(tx(id, (t) => t.execute(sql`select * from sessions`)))
})

test('settings from one request do not leak to the next on a pooled connection', async () => {
  const { id } = await signUp()
  await tx(id, async () => {})
  const row = await tx(null, async (t) => (await t.execute(sql`select current_user_id() as id, current_user as role`)).rows[0])
  assert.equal(row.id, null)
  const after = await pool.query('select current_user as role')
  assert.notEqual(after.rows[0].role, 'uddokta_app')
})

test('invites are single use, can expire and can be revoked', async () => {
  const { owner, handle } = await storeWithOwner()
  const invite = await owner.call('POST', `/stores/${handle}/invites`, { role: 'staff' })
  const anonymous = await client()('GET', `/invites/${invite.json.token}`)
  assert.equal(anonymous.json.storeName, 'Shop')
  const first = await signUp()
  const second = await signUp()
  assert.equal((await first.call('POST', `/invites/${invite.json.token}/accept`)).json.handle, handle)
  assert.equal((await second.call('POST', `/invites/${invite.json.token}/accept`)).json.error, 'inviteInvalid')

  const revoked = await owner.call('POST', `/stores/${handle}/invites`, { role: 'staff' })
  assert.equal((await owner.call('DELETE', `/stores/${handle}/invites/${revoked.json.id}`)).status, 200)
  assert.equal((await second.call('POST', `/invites/${revoked.json.token}/accept`)).status, 404)

  const expired = await owner.call('POST', `/stores/${handle}/invites`, { role: 'staff' })
  await pool.query(`update store_invites set expires_at = now() - interval '1 minute' where id = $1`, [expired.json.id])
  assert.equal((await second.call('POST', `/invites/${expired.json.token}/accept`)).status, 404)
})

test('owners and admins set the store name and delivery charges; staff can only read them', async () => {
  const { owner, handle } = await storeWithOwner()
  const admin = await join(handle, owner, 'admin')
  const staff = await join(handle, owner, 'staff')
  const base = `/stores/${handle}/settings`
  const online = ({ name, theme, metaPixel, tiktokPixel, menu }: any) => ({ name, theme, metaPixel, tiktokPixel, menu })
  assert.deepEqual(online((await owner.call('GET', base)).json), { name: 'Shop', theme: 'fresh', metaPixel: '', tiktokPixel: '', menu: [] })
  assert.equal((await admin.call('PUT', base, { name: 'নতুন নাম' })).status, 200)
  assert.deepEqual(online((await staff.call('GET', base)).json), { name: 'নতুন নাম', theme: 'fresh', metaPixel: '', tiktokPixel: '', menu: [] })
  assert.equal((await admin.call('PUT', `/stores/${handle}/theme`, { theme: 'night' })).status, 200)
  assert.equal((await staff.call('PUT', `/stores/${handle}/theme`, { theme: 'bold' })).status, 403)
  assert.equal((await owner.call('PUT', `/stores/${handle}/theme`, { theme: 'neon' })).status, 400)
  assert.equal((await owner.call('GET', base)).json.theme, 'night')
  assert.equal((await owner.call('PUT', `/stores/${handle}/tracking`, { metaPixel: "1');alert(1)//", tiktokPixel: '' })).json.error, 'pixelInvalid')
  assert.deepEqual((await owner.call('PUT', `/stores/${handle}/tracking`, { metaPixel: '123456789012345', tiktokPixel: 'c1abc2def3' })).json, { metaPixel: '123456789012345', tiktokPixel: 'C1ABC2DEF3' })
  assert.equal((await staff.call('PUT', `/stores/${handle}/tracking`, { metaPixel: '', tiktokPixel: '' })).status, 403)
  for (const href of ['javascript:alert(1)', '//evil.example', 'http://plain.example', 'data:text/html,x']) {
    assert.equal((await owner.call('PUT', `/stores/${handle}/menu`, { items: [{ label: 'x', href }] })).json.error, 'menuInvalid', href)
  }
  const menu = [{ label: 'ঈদ', href: '/collections/ঈদ' }, { label: 'ফেসবুক', href: 'https://facebook.com/shop' }]
  assert.deepEqual((await owner.call('PUT', `/stores/${handle}/menu`, { items: menu })).json.menu, menu)
  assert.equal((await staff.call('PUT', `/stores/${handle}/menu`, { items: [] })).status, 403)
  assert.equal((await staff.call('PUT', base, { name: 'x' })).status, 403)
  for (const bad of [{ name: '' }, { name: 'x'.repeat(101) }]) {
    assert.equal((await owner.call('PUT', base, bad)).status, 400)
  }
  const other = await storeWithOwner()
  assert.equal((await other.owner.call('PUT', base, { name: 'x' })).status, 404)
})

test('store business details are checked, kept when left out, and only owners and admins change them', async () => {
  const { owner, handle } = await storeWithOwner()
  const staff = await join(handle, owner, 'staff')
  const base = `/stores/${handle}/settings`
  const details = { phone: '01712-345678', whatsapp: '+8801712345678', email: 'shop@example.com', facebook: 'https://facebook.com/shop', address: 'বাড়ি ১২, মিরপুর, ঢাকা', legalName: 'রিনা ফ্যাশন', tradeLicence: 'TRAD/DNCC/1234', bin: '000123456-0101', invoiceNote: 'পণ্য দেখে টাকা দিন' }
  const saved = (await owner.call('PUT', base, { name: 'Shop', ...details })).json
  assert.deepEqual({ logo: saved.logo, ...Object.fromEntries(Object.keys(details).map((k) => [k, saved[k]])) }, { logo: null, ...details })
  assert.equal((await owner.call('PUT', base, { name: 'Renamed' })).json.phone, details.phone)
  assert.equal((await owner.call('PUT', base, { name: 'Shop', facebook: 'facebook.com/rina' })).json.facebook, 'https://facebook.com/rina')
  const invoice = (await owner.call('PUT', base, { invoiceNote: 'ধন্যবাদ' })).json
  assert.deepEqual([invoice.name, invoice.invoiceNote, invoice.phone], ['Shop', 'ধন্যবাদ', details.phone])
  assert.equal((await owner.call('PUT', base, {})).status, 400)
  for (const [bad, error] of [[{ phone: 'call me' }, 'phoneInvalid'], [{ whatsapp: '12' }, 'phoneInvalid'], [{ email: 'shop@' }, 'emailInvalid'], [{ facebook: 'javascript:alert(1)' }, 'facebookInvalid'], [{ facebook: 'http://facebook.com/x' }, 'facebookInvalid'], [{ address: 'x'.repeat(301) }, 'invalidRequest'], [{ bin: 5 }, 'invalidRequest'], [{ logoId: 'nope' }, 'invalidRequest']] as const) {
    assert.equal((await owner.call('PUT', base, { name: 'Shop', ...bad })).json.error, error, JSON.stringify(bad))
  }
  assert.equal((await staff.call('GET', base)).json.address, details.address)
  assert.equal((await staff.call('PUT', base, { name: 'Shop', phone: '' })).status, 403)
  await assert.rejects(pool.query(`update stores set facebook = 'javascript:x' where handle = $1`, [handle]))
})

test('merchant handles cannot claim infrastructure hosts', async () => {
  const { call } = await signUp()
  for (const handle of ['media', 'admin', 'www', 'api', 'a'.repeat(64)]) {
    assert.equal((await call('POST', '/stores', { name: 'Shop', handle })).json.error, 'handleInvalid')
  }
})

test('beta registration is enforced by the API', async () => {
  const oldMode = process.env.SIGNUP_MODE
  const oldList = process.env.SIGNUP_EMAIL_ALLOWLIST
  try {
    process.env.SIGNUP_MODE = 'allowlist'
    process.env.SIGNUP_EMAIL_ALLOWLIST = 'allowed@example.test'
    const denied = await client()('POST', '/auth/signup', { name: 'Denied', email: 'denied@example.test', password: 'correct horse' })
    assert.equal(denied.status, 403)
    assert.equal(denied.json.error, 'signupClosed')
    assert.equal((await client()('POST', '/auth/signup', { name: 'Allowed', email: 'allowed@example.test', password: 'correct horse' })).status, 201)
  } finally {
    if (oldMode === undefined) delete process.env.SIGNUP_MODE; else process.env.SIGNUP_MODE = oldMode
    if (oldList === undefined) delete process.env.SIGNUP_EMAIL_ALLOWLIST; else process.env.SIGNUP_EMAIL_ALLOWLIST = oldList
  }
})
