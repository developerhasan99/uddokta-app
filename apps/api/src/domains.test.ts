import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { sql } from 'drizzle-orm'
import { app } from './app.ts'
import { pool, tx } from './db.ts'
import { readDomain } from './domains.ts'

before(async () => {
  await pool.query('drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public')
  await migrate(drizzle(pool), { migrationsFolder: new URL('../migrations', import.meta.url).pathname })
})
after(() => pool.end())

function client() {
  let cookie = ''
  return async (method: string, path: string, body?: unknown) => {
    const res = await app.request(`/api${path}`, { method, headers: { 'content-type': 'application/json', cookie }, body: body === undefined ? undefined : JSON.stringify(body) })
    const set = res.headers.get('set-cookie')
    if (set) cookie = set.split(';')[0]
    return { status: res.status, json: await res.json() as any }
  }
}

let count = 0
async function person() {
  const call = client()
  await call('POST', '/auth/signup', { name: 'Person', email: `d${++count}@example.com`, password: 'correct horse' })
  return call
}
async function storeOwner() {
  const call = await person()
  const handle = `dom-${count}`
  await call('POST', '/stores', { name: 'Shop', handle })
  return { call, handle, base: `/stores/${handle}/domain` }
}

test('what sellers type becomes a bare hostname', () => {
  assert.equal(readDomain(' https://WWW.RinaFashion.com/shop?x=1 '), 'rinafashion.com')
  assert.equal(readDomain('shop.rina.com.bd'), 'shop.rina.com.bd')
  assert.equal(readDomain('রিনা.বাংলা'), new URL('http://রিনা.বাংলা').hostname, 'Bangla domains become punycode')
  for (const bad of ['', 'rina', 'rina..com', '-rina.com', 'rina.uddokta.live', 'uddokta.studio', 'localhost', 'a b.com', 42]) {
    assert.equal(readDomain(bad), null, String(bad))
  }
})

test('owners set, replace and remove the domain; it starts as not live', async () => {
  const owner = await storeOwner()
  assert.deepEqual((await owner.call('GET', owner.base)).json, { domain: null, liveAt: null, ip: null })
  const set = await owner.call('PUT', owner.base, { domain: 'www.Rina.com' })
  assert.deepEqual([set.status, set.json.domain, set.json.liveAt], [200, 'rina.com', null])
  assert.equal((await owner.call('PUT', owner.base, { domain: 'rina.uddokta.live' })).json.error, 'domainInvalid')
  await pool.query("update stores set domain_live_at = now() where domain = 'rina.com'")
  assert.equal((await owner.call('PUT', owner.base, { domain: 'rina-shop.com' })).json.liveAt, null, 'a new domain is not live yet')
  assert.equal((await owner.call('DELETE', owner.base)).json.domain, null)
})

test('a domain belongs to one store, and other people cannot see or change it', async () => {
  const first = await storeOwner()
  const second = await storeOwner()
  await first.call('PUT', first.base, { domain: 'taken.com' })
  const taken = await second.call('PUT', second.base, { domain: 'https://taken.com' })
  assert.deepEqual([taken.status, taken.json.error], [409, 'domainTaken'])
  assert.equal((await second.call('GET', first.base)).status, 404, 'another store\'s domain is hidden')
  assert.equal((await second.call('PUT', first.base, { domain: 'steal.com' })).status, 404)
})

test('staff can see the domain but only owners and admins change it', async () => {
  const owner = await storeOwner()
  await owner.call('PUT', owner.base, { domain: 'team-shop.com' })
  const invite = await owner.call('POST', `/stores/${owner.handle}/invites`, { role: 'staff' })
  const staff = await person()
  await staff('POST', `/invites/${invite.json.token}/accept`)
  assert.equal((await staff('GET', owner.base)).json.domain, 'team-shop.com')
  assert.equal((await staff('PUT', owner.base, { domain: 'other.com' })).status, 403)
  assert.equal((await staff('DELETE', owner.base)).status, 403)
})

test('the storefront finds a store by its domain, and only redirects once it is live', async () => {
  const owner = await storeOwner()
  await owner.call('PUT', owner.base, { domain: 'live-shop.com' })
  const lookup = () => tx(null, async (t) => (await t.execute<{ store: string | null; live: string | null }>(
    sql`select storefront_domain_store('live-shop.com') as store, storefront_live_domain(${owner.handle}) as live`)).rows[0])
  assert.deepEqual(await lookup(), { store: owner.handle, live: null })
  await pool.query("update stores set domain_live_at = now() where domain = 'live-shop.com'")
  assert.deepEqual(await lookup(), { store: owner.handle, live: 'live-shop.com' })
})
