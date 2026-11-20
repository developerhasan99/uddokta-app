import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { app } from './app.ts'
import { pool, tx } from './db.ts'
import { storePages } from './schema.ts'

before(async () => {
  await pool.query('drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public')
  await migrate(drizzle(pool), { migrationsFolder: new URL('../migrations', import.meta.url).pathname })
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
async function person() {
  const call = client()
  await call('POST', '/auth/signup', { name: 'Seller', email: `sp-${++counter}@example.com`, password: 'correct horse', phone: '01711000000' })
  return { call, id: (await call('GET', '/me')).json.user.id as string }
}

async function shop() {
  const owner = await person()
  const handle = `sp-shop-${counter}`
  const created = await owner.call('POST', '/stores', { name: 'রিনা ফ্যাশন', handle })
  const join = async (role: string) => {
    const member = await person()
    const invite = await owner.call('POST', `/stores/${handle}/invites`, { role })
    await member.call('POST', `/invites/${invite.json.token}/accept`)
    return member
  }
  return { owner, handle, join, base: `/stores/${handle}/store-pages`, storeId: created.json.id as string }
}

test('a page saves cleaned rich text, keeps its handle on rename, and refuses stale saves', async () => {
  const s = await shop()
  const made = await s.owner.call('POST', s.base, { title: 'আমাদের কথা', body: '<p onclick="x()">হাতে বানানো<script>alert(1)</script></p>' })
  assert.equal(made.status, 201)
  assert.equal(made.json.handle, 'আমাদের-কথা')
  assert.equal(made.json.body, '<p>হাতে বানানোalert(1)</p>')
  assert.equal(made.json.visible, true)
  const renamed = await s.owner.call('PUT', `${s.base}/${made.json.id}`, { ...made.json, title: 'আমাদের গল্প' })
  assert.equal(renamed.json.handle, 'আমাদের-কথা', 'the handle stays when the title changes')
  assert.equal((await s.owner.call('PUT', `${s.base}/${made.json.id}`, { ...made.json, title: 'x' })).json.error, 'storePageChanged')
  const later = new Date(Date.now() + 86_400_000).toISOString()
  const scheduled = await s.owner.call('PUT', `${s.base}/${made.json.id}`, { ...renamed.json, publishAt: later })
  assert.equal(new Date(scheduled.json.publishAt).toISOString(), later)
  assert.equal((await s.owner.call('PUT', `${s.base}/${made.json.id}`, { ...scheduled.json, publishAt: 'soon' })).status, 400)
  assert.equal((await s.owner.call('PATCH', `${s.base}/${made.json.id}`, { visible: false })).json.visible, false)
})

test('policies start hidden from our draft, once per store, and can be linked in the footer menu', async () => {
  const s = await shop()
  const refund = await s.owner.call('POST', s.base, { policy: 'refund', addToFooter: true })
  assert.equal(refund.status, 201)
  assert.equal(refund.json.title, 'রিটার্ন ও রিফান্ড নীতি')
  assert.equal(refund.json.handle, 'return-policy')
  assert.equal(refund.json.visible, false, 'the seller reads it before buyers do')
  assert.match(refund.json.body, /রিনা ফ্যাশন/, 'the store name is filled in')
  assert.equal((await s.owner.call('POST', s.base, { policy: 'refund' })).json.error, 'policyExists')
  assert.equal((await s.owner.call('POST', s.base, { policy: 'cookies' })).status, 400)
  const menus = (await s.owner.call('GET', `/stores/${s.handle}/menus`)).json
  const footer = (await s.owner.call('GET', `/stores/${s.handle}/menus/${menus.find((m: any) => m.handle === 'footer').id}`)).json
  assert.deepEqual(footer.items.map((i: any) => [i.title, i.link.type, i.link.id]), [['রিটার্ন ও রিফান্ড নীতি', 'storePage', refund.json.id]])
})

test('store pages and landing pages never share an address', async () => {
  const s = await shop()
  const landing = (await s.owner.call('POST', `/stores/${s.handle}/pages`, { title: 'offer', blank: true })).json
  assert.equal(landing.handle, 'offer')
  const page = await s.owner.call('POST', s.base, { title: 'Offer' })
  assert.equal(page.json.handle, 'offer-2', 'a free handle is picked')
  assert.equal((await s.owner.call('POST', s.base, { title: 'x', handle: 'offer' })).json.error, 'pageHandleTaken')
  assert.equal((await s.owner.call('POST', s.base, { title: 'x', handle: 'cart' })).json.error, 'pageHandleReserved')
  const draft = (await s.owner.call('GET', `/stores/${s.handle}/pages/${landing.id}`)).json
  assert.equal((await s.owner.call('PUT', `/stores/${s.handle}/pages/${landing.id}`, { ...draft, handle: 'offer-2', draft: draft.draft })).json.error, 'pageHandleTaken')
  // Even past the API, the database refuses a second page on one address.
  await assert.rejects(tx(s.owner.id, (t) => t.update(storePages).set({ handle: 'offer' }).where(eq(storePages.id, page.json.id))))
})

test('staff add and edit pages; only owners and admins delete; other stores see nothing', async () => {
  const s = await shop()
  const staff = await s.join('staff')
  const made = (await staff.call('POST', s.base, { title: 'FAQ' })).json
  assert.equal((await staff.call('PUT', `${s.base}/${made.id}`, { ...made, body: '<p>প্রশ্ন</p>' })).status, 200)
  assert.equal((await staff.call('DELETE', `${s.base}/${made.id}`)).status, 403)
  const other = await shop()
  assert.equal((await other.owner.call('GET', `${s.base}/${made.id}`)).status, 404)
  assert.equal((await other.owner.call('GET', `/stores/${other.handle}/store-pages/${made.id}`)).status, 404)
  assert.deepEqual(await tx(other.owner.id, (t) => t.select().from(storePages).where(eq(storePages.storeId, s.storeId))), [])
  assert.deepEqual((await other.owner.call('GET', `/stores/${other.handle}/link-targets?ids=${made.id}`)).json, [])
  assert.equal((await s.owner.call('DELETE', `${s.base}/${made.id}`)).status, 204)
})
