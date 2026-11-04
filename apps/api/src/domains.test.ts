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
  const empty = (await owner.call('GET', owner.base)).json
  assert.deepEqual([empty.domain, empty.verifiedAt, empty.liveAt, empty.primary, empty.ip, empty.txt.name], [null, null, null, true, null, '_uddokta'])
  assert.match(empty.txt.value, /^uddokta=[0-9a-f-]{36}$/, 'each store gets its own TXT value')
  const set = await owner.call('PUT', owner.base, { domain: 'www.Rina.com' })
  assert.deepEqual([set.status, set.json.domain, set.json.liveAt], [200, 'rina.com', null])
  assert.equal((await owner.call('PUT', owner.base, { domain: 'rina.uddokta.live' })).json.error, 'domainInvalid')
  await pool.query("update stores set domain_live_at = now() where domain = 'rina.com'")
  assert.equal((await owner.call('PUT', owner.base, { domain: 'rina-shop.com' })).json.liveAt, null, 'a new domain is not live yet')
  assert.equal((await owner.call('DELETE', owner.base)).json.domain, null)
})

test('anyone may claim a domain, but once verified it belongs to one store, and other people cannot see or change it', async () => {
  const first = await storeOwner()
  const second = await storeOwner()
  await first.call('PUT', first.base, { domain: 'taken.com' })
  assert.equal((await second.call('PUT', second.base, { domain: 'taken.com' })).status, 200, 'an unverified claim blocks nobody, so squatting gains nothing')
  await pool.query("update stores set domain_verified_at = now() where handle = $1", [first.handle])
  await assert.rejects(pool.query("update stores set domain_verified_at = now() where handle = $1", [second.handle]), /stores_verified_domain/)
  const release = (found: string[]) => tx(null, (t) => t.execute(sql`select release_stale_domain('taken.com', ${sql.param(found)}::text[])`))
  const firstTxt = (await first.call('GET', first.base)).json.txt.value
  await release([firstTxt, (await second.call('GET', second.base)).json.txt.value])
  assert.equal((await pool.query("select domain_verified_at from stores where handle = $1", [first.handle])).rows[0].domain_verified_at === null, false, 'the holder keeps it while its TXT record is there')
  await release([(await second.call('GET', second.base)).json.txt.value])
  assert.equal((await pool.query("select domain_verified_at from stores where handle = $1", [first.handle])).rows[0].domain_verified_at, null, 'once the DNS owner replaces the TXT record, the old holder lets go')
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
  assert.equal((await staff('PATCH', owner.base, { primary: false })).status, 403)
})

test('the storefront finds a store by its verified domain, and redirects only while it is live and the main address', async () => {
  const owner = await storeOwner()
  const squatter = await storeOwner()
  await squatter.call('PUT', squatter.base, { domain: 'live-shop.com' })
  await owner.call('PUT', owner.base, { domain: 'live-shop.com' })
  const lookup = () => tx(null, async (t) => (await t.execute<{ store: string | null; live: string | null }>(
    sql`select storefront_domain_store('live-shop.com') as store, storefront_live_domain(${owner.handle}) as live`)).rows[0])
  assert.deepEqual(await lookup(), { store: null, live: null }, 'unverified claims are never served')
  await pool.query("update stores set domain_verified_at = now() where handle = $1", [owner.handle])
  assert.deepEqual(await lookup(), { store: owner.handle, live: null })
  await pool.query("update stores set domain_live_at = now() where handle = $1", [owner.handle])
  assert.deepEqual(await lookup(), { store: owner.handle, live: 'live-shop.com' })
  assert.equal((await owner.call('PATCH', owner.base, { primary: false })).json.primary, false)
  assert.deepEqual(await lookup(), { store: owner.handle, live: null }, 'uddokta.live is the main address again, and the domain still serves')
  assert.equal((await owner.call('PATCH', owner.base, { primary: 'no' })).status, 400)
})
