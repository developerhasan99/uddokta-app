import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { app } from './app.ts'
import { pool, tx } from './db.ts'
import { readdir, readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { sendSms, smsReady } from './sms.ts'
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
  const res = await call('POST', '/auth/signup', { name: `User ${count}`, email, password: 'correct horse', phone: '01711000000' })
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
  assert.equal((await call('POST', '/auth/signup', { name: '', email: 'a@b.co', password: 'longenough', phone: '01711000000' })).json.error, 'nameRequired')
  assert.equal((await call('POST', '/auth/signup', { name: 'A', email: 'nope', password: 'longenough', phone: '01711000000' })).json.error, 'emailInvalid')
  assert.equal((await call('POST', '/auth/signup', { name: 'A', email: 'a@b.co', password: 'short' })).json.error, 'weakPassword')
  const { email } = await signUp()
  assert.equal((await call('POST', '/auth/signup', { name: 'A', email, password: 'longenough', phone: '01711000000' })).json.error, 'emailTaken')
})

test('sign-ups are capped per network address, new stores per account', async () => {
  const signupFrom = (address: string, n: number) => app.request('/api/auth/signup', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-real-ip': address },
    body: JSON.stringify({ name: 'Bot', email: `bot-${address}-${n}@example.com`, password: 'longenough', phone: '01711000000' }),
  })
  for (let i = 0; i < 10; i++) assert.equal((await signupFrom('203.0.113.7', i)).status, 201)
  const blocked = await signupFrom('203.0.113.7', 10)
  assert.deepEqual([blocked.status, (await blocked.json() as any).error], [429, 'tooManySignups'])
  assert.equal((await signupFrom('203.0.113.8', 0)).status, 201, 'another address is not affected')

  const { call } = await signUp()
  for (let i = 0; i < 5; i++) assert.equal((await call('POST', '/stores', { name: 'Shop', handle: `capped-${count}-${i}` })).status, 201)
  assert.equal((await call('POST', '/stores', { name: 'Shop', handle: `capped-${count}-5` })).json.error, 'tooManyStores')
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
  const online = ({ name, theme, metaPixel, tiktokPixel }: any) => ({ name, theme, metaPixel, tiktokPixel })
  assert.deepEqual(online((await owner.call('GET', base)).json), { name: 'Shop', theme: 'fresh', metaPixel: '', tiktokPixel: '' })
  assert.equal((await admin.call('PUT', base, { name: 'নতুন নাম' })).status, 200)
  assert.deepEqual(online((await staff.call('GET', base)).json), { name: 'নতুন নাম', theme: 'fresh', metaPixel: '', tiktokPixel: '' })
  assert.equal((await admin.call('PUT', `/stores/${handle}/theme`, { theme: 'night' })).status, 200)
  assert.equal((await staff.call('PUT', `/stores/${handle}/theme`, { theme: 'bold' })).status, 403)
  assert.equal((await owner.call('PUT', `/stores/${handle}/theme`, { theme: 'neon' })).status, 400)
  assert.equal((await owner.call('GET', base)).json.theme, 'night')
  assert.equal((await owner.call('PUT', `/stores/${handle}/tracking`, { metaPixel: "1');alert(1)//", tiktokPixel: '' })).json.error, 'pixelInvalid')
  assert.deepEqual((await owner.call('PUT', `/stores/${handle}/tracking`, { metaPixel: '123456789012345', tiktokPixel: 'c1abc2def3' })).json, { metaPixel: '123456789012345', tiktokPixel: 'C1ABC2DEF3' })
  assert.equal((await staff.call('PUT', `/stores/${handle}/tracking`, { metaPixel: '', tiktokPixel: '' })).status, 403)
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

// The rules Settings › Team lists (apps/dashboard/src/permissions.ts) that other tests do not already cover.
test('the team list shows join and invite dates; staff cannot open analytics or delete discounts, admins can', async () => {
  const { owner, handle } = await storeWithOwner()
  const admin = await join(handle, owner, 'admin')
  const staff = await join(handle, owner, 'staff')
  await owner.call('POST', `/stores/${handle}/invites`, { role: 'staff' })
  const team = (await staff.call('GET', `/stores/${handle}/members`)).json
  assert.ok(team.members.every((m: any) => !Number.isNaN(Date.parse(m.joinedAt))))
  assert.equal((await owner.call('GET', `/stores/${handle}/members`)).json.invites.every((i: any) => !Number.isNaN(Date.parse(i.createdAt))), true)
  assert.equal((await staff.call('GET', `/stores/${handle}/analytics`)).status, 403)
  assert.equal((await admin.call('GET', `/stores/${handle}/analytics`)).status, 200)
  const coupon = (await staff.call('POST', `/stores/${handle}/discounts`, { code: 'EID10', kind: 'percent', value: 10 })).json
  assert.equal((await staff.call('PATCH', `/stores/${handle}/discounts/${coupon.id}`, { active: false })).status, 200)
  assert.equal((await staff.call('DELETE', `/stores/${handle}/discounts/${coupon.id}`)).status, 403)
  assert.equal((await admin.call('DELETE', `/stores/${handle}/discounts/${coupon.id}`)).status, 200)
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
    const denied = await client()('POST', '/auth/signup', { name: 'Denied', email: 'denied@example.test', password: 'correct horse', phone: '01711000000' })
    assert.equal(denied.status, 403)
    assert.equal(denied.json.error, 'signupClosed')
    assert.equal((await client()('POST', '/auth/signup', { name: 'Allowed', email: 'allowed@example.test', password: 'correct horse', phone: '01711000000' })).status, 201)
  } finally {
    if (oldMode === undefined) delete process.env.SIGNUP_MODE; else process.env.SIGNUP_MODE = oldMode
    if (oldList === undefined) delete process.env.SIGNUP_EMAIL_ALLOWLIST; else process.env.SIGNUP_EMAIL_ALLOWLIST = oldList
  }
})

// Phone verification. Development and tests write each SMS to SMS_DIR, named by number.
let phones = 0
const nextPhone = () => `0171${String(++phones).padStart(7, '0')}`
async function lastCode(phone: string) {
  const files = (await readdir(process.env.SMS_DIR!)).filter((f) => f.endsWith(`-${phone}.txt`)).sort()
  return /\b\d{6}\b/.exec(await readFile(`${process.env.SMS_DIR}/${files.at(-1)}`, 'utf8'))![0]
}
// Moves this account's codes into the past, past the one-a-minute limit.
const later = (userId: string) => pool.query(`update phone_codes set created_at = created_at - interval '2 minutes' where user_id = $1`, [userId])
async function signUpWith(phone: string) {
  const call = client()
  const email = `phone${++count}@example.com`
  const res = await call('POST', '/auth/signup', { name: 'Seller', email, password: 'correct horse', phone })
  return { call, email, res, id: res.status === 201 ? (await call('GET', '/me')).json.user.id as string : '' }
}

test('sign-up needs a Bangladeshi mobile number, sends it a code, and verifying it marks the account', async () => {
  const call = client()
  for (const phone of [undefined, '', '12345', '01211111111', '0171234567']) {
    assert.equal((await call('POST', '/auth/signup', { name: 'A', email: 'p@b.co', password: 'longenough', phone })).json.error, 'phoneInvalid', String(phone))
  }
  const phone = nextPhone()
  // Bangla digits, spaces and +88 are fine; the number is kept as 01XXXXXXXXX.
  const typed = `+88 ${phone.replace(/\d/g, (d) => '০১২৩৪৫৬৭৮৯'[Number(d)])}`
  const { call: seller, res } = await signUpWith(typed)
  assert.equal(res.status, 201)
  let me = (await seller('GET', '/me')).json.user
  assert.deepEqual([me.phone, me.phoneVerified], [phone, false])

  const code = await lastCode(phone)
  const wrong = code === '000000' ? '111111' : '000000'
  assert.equal((await seller('POST', '/me/phone/verify', { code: wrong })).json.error, 'codeWrong')
  assert.equal((await seller('POST', '/me/phone/verify', { code: 'abc' })).json.error, 'codeWrong')
  assert.equal((await seller('POST', '/me/phone/verify', { code })).status, 200)
  me = (await seller('GET', '/me')).json.user
  assert.equal(me.phoneVerified, true)
  // Used once; a verified number cannot be changed here.
  assert.equal((await seller('POST', '/me/phone/verify', { code })).json.error, 'codeExpired')
  assert.equal((await seller('POST', '/me/phone', { phone: nextPhone() })).json.error, 'phoneVerified')
})

test('a verified number belongs to one account; typing it elsewhere does not take it', async () => {
  const phone = nextPhone()
  // Someone else typed the number first but never verified it.
  const squatter = await signUpWith(phone)
  assert.equal(squatter.res.status, 201)
  const owner = await signUpWith(phone)
  assert.equal(owner.res.status, 201)
  assert.equal((await owner.call('POST', '/me/phone/verify', { code: await lastCode(phone) })).status, 200)

  // Now it is taken: a new sign-up is refused and creates nothing, and the squatter cannot verify or resend it.
  const refused = await signUpWith(phone)
  assert.deepEqual([refused.res.status, refused.res.json.error], [409, 'phoneTaken'])
  assert.equal((await pool.query('select 1 from users where email = $1', [refused.email])).rowCount, 0)
  await later(squatter.id)
  assert.equal((await squatter.call('POST', '/me/phone')).json.error, 'phoneTaken')
  // The squatter can still put in their own number.
  const own = nextPhone()
  assert.equal((await squatter.call('POST', '/me/phone', { phone: own })).status, 200)
  assert.equal((await squatter.call('POST', '/me/phone/verify', { code: await lastCode(own) })).status, 200)
})

test('codes are limited: one a minute, three an hour, five tries each, and only the current number counts', async () => {
  const phone = nextPhone()
  const { call, id } = await signUpWith(phone)
  assert.equal((await call('POST', '/me/phone')).json.error, 'codeWait')

  // Five wrong tries use the code up, even for the right code afterwards.
  const first = await lastCode(phone)
  for (let i = 0; i < 5; i++) await call('POST', '/me/phone/verify', { code: first === '000000' ? '111111' : '000000' })
  assert.equal((await call('POST', '/me/phone/verify', { code: first })).json.error, 'codeExpired')

  // Changing the number sends a new code there; the old number's code no longer works.
  await later(id)
  const other = nextPhone()
  assert.deepEqual((await call('POST', '/me/phone', { phone: other })).json, { phone: other })
  assert.equal((await call('GET', '/me')).json.user.phone, other)
  await later(id)
  assert.equal((await call('POST', '/me/phone')).status, 200)
  await later(id)
  assert.equal((await call('POST', '/me/phone')).json.error, 'tooManyCodes')
  assert.equal((await call('POST', '/me/phone', { phone: 'nope' })).json.error, 'phoneInvalid')
  assert.equal((await call('POST', '/me/phone/verify', { code: await lastCode(other) })).status, 200)
})

test('the app role cannot read phone codes', async () => {
  const { id } = await signUpWith(nextPhone())
  await assert.rejects(tx(id, (t) => t.execute(sql`select * from phone_codes`)), (err: unknown) => (err as { cause?: { code?: string } }).cause?.code === '42501')
})

test('with an API key, SMS go to Alpha SMS and a refusal is an error', async () => {
  const posted: URLSearchParams[] = []
  let answer = { error: 0, msg: 'Request successfully submitted', data: { request_id: 1 } } as object
  const server = createServer((req, res) => {
    let body = ''
    req.on('data', (chunk) => { body += chunk })
    req.on('end', () => { posted.push(new URLSearchParams(body)); res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(answer)) })
  })
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  const env = { NODE_ENV: 'production', SMS_API_KEY: 'test-key', SMS_SENDER_ID: 'Uddokta', SMS_API_URL: `http://127.0.0.1:${(server.address() as { port: number }).port}/sendsms` }
  try {
    assert.equal(smsReady({ NODE_ENV: 'production' }), false)
    assert.equal(smsReady(env), true)
    await sendSms('01711000001', 'উদ্যোক্তা কোড: 123456', env)
    assert.deepEqual(Object.fromEntries(posted[0]), { api_key: 'test-key', msg: 'উদ্যোক্তা কোড: 123456', to: '8801711000001', sender_id: 'Uddokta' })
    answer = { error: 417, msg: 'Insufficient balance' }
    await assert.rejects(sendSms('01711000001', 'x', env), /417/)
  } finally {
    server.close()
  }
})
