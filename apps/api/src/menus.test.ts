import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { eq } from 'drizzle-orm'
import { app } from './app.ts'
import { pool, tx } from './db.ts'
import { menus } from './schema.ts'

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
  await call('POST', '/auth/signup', { name: 'Seller', email: `menu-${++counter}@example.com`, password: 'correct horse' })
  return { call, id: (await call('GET', '/me')).json.user.id as string }
}

async function shop() {
  const owner = await person()
  const handle = `menu-shop-${counter}`
  const created = await owner.call('POST', '/stores', { name: 'Shop', handle })
  const join = async (role: string) => {
    const member = await person()
    const invite = await owner.call('POST', `/stores/${handle}/invites`, { role })
    await member.call('POST', `/invites/${invite.json.token}/accept`)
    return member
  }
  const base = `/stores/${handle}/menus`
  const list = async (who = owner) => (await who.call('GET', base)).json as { id: string; handle: string; fixed: boolean; items: number; broken: number }[]
  return { owner, handle, base, list, join, storeId: created.json.id as string }
}

const item = (id: string, title: string, link: object, children: object[] = []) => ({ id, title, link, children })

test('every store starts with a main menu and a footer menu that cannot be deleted or renamed', async () => {
  const s = await shop()
  const menusNow = await s.list()
  assert.deepEqual(menusNow.map((m) => [m.handle, m.fixed]), [['main-menu', true], ['footer', true]])
  const main = menusNow.find((m) => m.handle === 'main-menu')!
  assert.equal((await s.owner.call('DELETE', `${s.base}/${main.id}`)).json.error, 'menuFixed')
  const full = (await s.owner.call('GET', `${s.base}/${main.id}`)).json
  assert.equal((await s.owner.call('PUT', `${s.base}/${main.id}`, { ...full, handle: 'top' })).json.error, 'handleInvalid')
  // Even past the API, the database refuses to delete a built-in menu.
  await tx(s.owner.id, (t) => t.delete(menus).where(eq(menus.id, main.id)))
  assert.equal((await s.list()).length, 2)
})

test('menus save a nested tree of id links, refuse bad links and stale saves', async () => {
  const s = await shop()
  const created = await s.owner.call('POST', s.base, { title: 'Sidebar Links' })
  assert.equal(created.status, 201)
  assert.equal(created.json.handle, 'sidebar-links')
  assert.equal((await s.owner.call('POST', s.base, { title: 'Sidebar links' })).json.handle, 'sidebar-links-2')
  assert.equal((await s.owner.call('POST', s.base, { title: 'বাংলা মেনু' })).json.handle, 'menu', 'Bangla titles get a plain handle')
  const menu = (await s.owner.call('GET', `${s.base}/${created.json.id}`)).json
  const product = (await s.owner.call('POST', `/stores/${s.handle}/products`, { name: 'Tea', variants: [{ options: [], price: 300 }] })).json
  const items = [item('a', 'Home', { type: 'home' }), item('b', 'Shop', { type: 'products' }, [item('c', 'Tea', { type: 'product', id: product.id }, [item('d', 'Call', { type: 'phone', url: '+880 1711-000000' })])])]
  const saved = await s.owner.call('PUT', `${s.base}/${menu.id}`, { ...menu, items })
  assert.equal(saved.status, 200)
  assert.deepEqual(saved.json.items, items)
  assert.equal(saved.json.revision, menu.revision + 1)
  assert.equal((await s.owner.call('PUT', `${s.base}/${menu.id}`, { ...menu, items })).json.error, 'menuChanged', 'a stale revision never overwrites')

  const tooDeep = [item('a', 'A', { type: 'home' }, [item('b', 'B', { type: 'home' }, [item('c', 'C', { type: 'home' }, [item('d', 'D', { type: 'home' })])])])]
  for (const bad of [
    [item('a', 'x', { type: 'url', url: 'javascript:alert(1)' })],
    [item('a', 'x', { type: 'url', url: '//evil.example' })],
    [item('a', 'x', { type: 'url', url: 'http://plain.example' })],
    [item('a', 'x', { type: 'product', id: 'not-an-id' })],
    [item('a', 'x', { type: 'phone', url: 'call me' })],
    [item('a', '', { type: 'home' })],
    [item('a', 'x', { type: 'home' }), item('a', 'y', { type: 'home' })],
    tooDeep,
  ]) assert.equal((await s.owner.call('PUT', `${s.base}/${menu.id}`, { ...saved.json, items: bad })).json.error, 'menuInvalid', JSON.stringify(bad))

  // Deleting the product leaves a broken link: counted in the list, left out of the storefront.
  assert.equal((await s.list()).find((m) => m.id === menu.id)!.broken, 0)
  await s.owner.call('DELETE', `/stores/${s.handle}/products/${product.id}`)
  assert.equal((await s.list()).find((m) => m.id === menu.id)!.broken, 1)
})

test('staff edit menus; only owners and admins delete them', async () => {
  const s = await shop()
  const staff = await s.join('staff')
  const made = (await staff.call('POST', s.base, { title: 'Promo' })).json
  const menu = (await staff.call('GET', `${s.base}/${made.id}`)).json
  assert.equal((await staff.call('PUT', `${s.base}/${made.id}`, { ...menu, items: [item('a', 'Home', { type: 'home' })] })).status, 200)
  assert.equal((await staff.call('DELETE', `${s.base}/${made.id}`)).status, 403)
  assert.equal((await s.owner.call('DELETE', `${s.base}/${made.id}`)).status, 204)
})

test('another store cannot see, change or link to a store’s menus', async () => {
  const s = await shop()
  const other = await shop()
  const main = (await s.list()).find((m) => m.handle === 'main-menu')!
  assert.equal((await other.owner.call('GET', `${s.base}/${main.id}`)).status, 404)
  assert.equal((await other.owner.call('GET', `/stores/${other.handle}/menus/${main.id}`)).status, 404)
  assert.deepEqual(await tx(other.owner.id, (t) => t.select().from(menus).where(eq(menus.storeId, s.storeId))), [])
  const product = (await s.owner.call('POST', `/stores/${s.handle}/products`, { name: 'Secret tea', variants: [{ options: [], price: 300 }] })).json
  assert.deepEqual((await other.owner.call('GET', `/stores/${other.handle}/link-targets?ids=${product.id}`)).json, [])
  assert.deepEqual((await other.owner.call('GET', `/stores/${other.handle}/link-targets?q=Secret`)).json, [])
})
