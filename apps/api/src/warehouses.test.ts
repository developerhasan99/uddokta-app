import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { app } from './app.ts'
import { pool, tx } from './db.ts'
import { warehouses, warehouseStock } from './schema.ts'

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
async function storeOwner() {
  const call = client()
  const n = ++count
  await call('POST', '/auth/signup', { name: 'Owner', email: `w${n}@example.com`, password: 'correct horse' })
  const handle = `ware-${n}`
  const store = await call('POST', '/stores', { name: 'Shop', handle })
  return { call, handle, storeId: store.json.id as string, base: `/stores/${handle}/warehouses` }
}

test('warehouses can be added, listed by name, changed and deleted', async () => {
  const owner = await storeOwner()
  const made = await owner.call('POST', owner.base, { name: ' মিরপুর ', phone: ' 01700000000 ', address: 'মিরপুর ১০, ঢাকা' })
  assert.equal(made.status, 201)
  assert.deepEqual([made.json.name, made.json.phone], ['মিরপুর', '01700000000'])
  await owner.call('POST', owner.base, { name: 'Banani' })
  assert.deepEqual((await owner.call('GET', owner.base)).json.map((w: any) => w.name), ['প্রধান গুদাম', 'মিরপুর', 'Banani'], 'a new store starts with one, and the oldest comes first')

  const url = `${owner.base}/${made.json.id}`
  assert.equal((await owner.call('PUT', url, { name: 'উত্তরা', address: 'সেক্টর ৪' })).json.name, 'উত্তরা')
  assert.equal((await owner.call('PUT', url, { name: 'উত্তরা', address: 'সেক্টর ৪' })).status, 200, 'keeping its own name is fine')
  assert.equal((await owner.call('DELETE', url)).status, 200)
  assert.deepEqual((await owner.call('GET', owner.base)).json.map((w: any) => w.name), ['প্রধান গুদাম', 'Banani'])
})

test('names are unique inside one store', async () => {
  const owner = await storeOwner()
  await owner.call('POST', owner.base, { name: 'Main' })
  const other = (await owner.call('POST', owner.base, { name: 'Second' })).json
  const taken = await owner.call('POST', owner.base, { name: 'Main' })
  assert.deepEqual([taken.status, taken.json.error], [409, 'warehouseNameTaken'])
  assert.equal((await owner.call('PUT', `${owner.base}/${other.id}`, { name: 'Main' })).status, 409)
  const second = await storeOwner()
  assert.equal((await second.call('POST', second.base, { name: 'Main' })).status, 201)
})

test('bad warehouses are refused', async () => {
  const owner = await storeOwner()
  for (const body of [{ name: ' ' }, {}, { name: 'x', phone: 'x'.repeat(31) }, { name: 'x', address: 'x'.repeat(501) }, { name: 'x', phone: 1 }]) {
    assert.equal((await owner.call('POST', owner.base, body)).status, 400, JSON.stringify(body))
  }
  assert.equal((await owner.call('PUT', `${owner.base}/not-an-id`, { name: 'x' })).status, 404)
})

test('staff can add and edit warehouses but not delete them', async () => {
  const owner = await storeOwner()
  const invite = await owner.call('POST', `/stores/${owner.handle}/invites`, { role: 'staff' })
  const staff = client()
  await staff('POST', '/auth/signup', { name: 'Staff', email: `wstaff${++count}@example.com`, password: 'correct horse' })
  await staff('POST', `/invites/${invite.json.token}/accept`)
  const made = await staff('POST', owner.base, { name: 'S' })
  assert.equal(made.status, 201)
  assert.equal((await staff('PUT', `${owner.base}/${made.json.id}`, { name: 'S2' })).status, 200)
  assert.equal((await staff('DELETE', `${owner.base}/${made.json.id}`)).status, 403)
  assert.equal((await owner.call('DELETE', `${owner.base}/${made.json.id}`)).status, 200)
})

test('one store cannot reach another store’s warehouses', async () => {
  const a = await storeOwner()
  const b = await storeOwner()
  const theirs = (await b.call('POST', b.base, { name: 'B' })).json
  assert.equal((await a.call('GET', b.base)).status, 404)
  assert.equal((await a.call('PUT', `${a.base}/${theirs.id}`, { name: 'x' })).status, 404)
  assert.equal((await a.call('DELETE', `${a.base}/${theirs.id}`)).status, 403)
  const me = await a.call('GET', '/me')
  await tx(me.json.user.id, async (t) => {
    assert.deepEqual((await t.select().from(warehouses)).map((w) => w.storeId), [a.storeId], 'only its own')
  })
  await assert.rejects(tx(me.json.user.id, (t) => t.insert(warehouses).values({ storeId: b.storeId, name: 'x' })), 'the database refuses writing into another store')
})

const products = (o: Awaited<ReturnType<typeof storeOwner>>) => `/stores/${o.handle}/products`
const inventory = (o: Awaited<ReturnType<typeof storeOwner>>) => `/stores/${o.handle}/inventory`
const sized = (extra = {}) => ({ name: 'Shirt', options: [{ name: 'Size', values: ['M', 'L'] }], variants: [{ options: ['M'], price: 1, stock: 3 }, { options: ['L'], price: 1 }], ...extra })

test('stock lives per warehouse, and the variant shows the total', async () => {
  const owner = await storeOwner()
  const [first] = (await owner.call('GET', owner.base)).json
  const second = (await owner.call('POST', owner.base, { name: 'Second' })).json
  const made = (await owner.call('POST', products(owner), sized())).json
  const [m, l] = made.variants
  assert.deepEqual([m.stock, m.stocks], [3, { [first.id]: 3 }], 'a plain number goes to the first warehouse')
  assert.deepEqual([l.stock, l.stocks], [null, {}], 'blank is not tracked')

  assert.equal((await owner.call('PATCH', inventory(owner), { warehouseId: second.id, changes: [{ variantId: m.id, stock: 4 }] })).status, 200)
  const url = `${products(owner)}/${made.id}`
  let now = (await owner.call('GET', url)).json.variants[0]
  assert.deepEqual([now.stock, now.stocks], [7, { [first.id]: 3, [second.id]: 4 }])
  assert.equal((await owner.call('GET', products(owner))).json.items[0].stock, 7, 'the product list adds up')

  const here = async (id: string, query = '') => (await owner.call('GET', `${inventory(owner)}?warehouse=${id}${query}`)).json
  assert.deepEqual((await here(second.id)).items.map((i: any) => [i.options[0], i.stock, i.total]), [['M', 4, 7], ['L', null, null]])
  await owner.call('PATCH', inventory(owner), { warehouseId: second.id, changes: [{ variantId: m.id, stock: null }] })
  assert.deepEqual((await here(second.id)).items[0].stock, 0, 'tracked elsewhere, so none here rather than untracked')
  assert.deepEqual((await here(second.id, '&filter=out')).items.map((i: any) => i.options[0]), ['M'])
  assert.deepEqual((await here(first.id, '&filter=in')).items.map((i: any) => i.options[0]), ['M'])

  // Saving from the form changes only the warehouses it names.
  await owner.call('PUT', url, sized({ variants: [{ id: m.id, options: ['M'], price: 1, stocks: { [second.id]: 2 } }, { id: l.id, options: ['L'], price: 1, stocks: {} }] }))
  now = (await owner.call('GET', url)).json.variants[0]
  assert.deepEqual([now.stock, now.stocks], [5, { [first.id]: 3, [second.id]: 2 }])
  await owner.call('PUT', url, sized({ variants: [{ id: m.id, options: ['M'], price: 1, stocks: { [first.id]: null, [second.id]: null } }, { id: l.id, options: ['L'], price: 1, stocks: {} }] }))
  assert.equal((await owner.call('GET', url)).json.variants[0].stock, null, 'blank everywhere stops tracking')
})

test('a warehouse with stock moves it when deleted, and the last one stays', async () => {
  const owner = await storeOwner()
  const [first] = (await owner.call('GET', owner.base)).json
  const second = (await owner.call('POST', owner.base, { name: 'Second' })).json
  const made = (await owner.call('POST', products(owner), sized())).json
  const [m, l] = made.variants
  await owner.call('PATCH', inventory(owner), { warehouseId: second.id, changes: [{ variantId: m.id, stock: 4 }] })
  await owner.call('PATCH', inventory(owner), { warehouseId: first.id, changes: [{ variantId: l.id, stock: 0 }] })
  const listed = (await owner.call('GET', owner.base)).json
  assert.deepEqual(listed.map((w: any) => [w.units, w.hasStock]), [[3, true], [4, true]])

  const refused = await owner.call('DELETE', `${owner.base}/${first.id}`)
  assert.deepEqual([refused.status, refused.json.error], [409, 'warehouseHasStock'])
  assert.equal((await owner.call('DELETE', `${owner.base}/${first.id}?moveTo=${first.id}`)).status, 400)
  assert.equal((await owner.call('DELETE', `${owner.base}/${first.id}?moveTo=00000000-0000-4000-8000-000000000000`)).status, 400)

  assert.equal((await owner.call('DELETE', `${owner.base}/${first.id}?moveTo=${second.id}`)).status, 200)
  const after = (await owner.call('GET', `${products(owner)}/${made.id}`)).json.variants
  assert.deepEqual(after.map((v: any) => [v.stock, v.stocks]), [[7, { [second.id]: 7 }], [0, { [second.id]: 0 }]], 'added together, and a zero count stays tracked')

  const last = await owner.call('DELETE', `${owner.base}/${second.id}`)
  assert.deepEqual([last.status, last.json.error], [409, 'warehouseLast'])
})

test('stock cannot cross stores', async () => {
  const a = await storeOwner()
  const b = await storeOwner()
  const [theirs] = (await b.call('GET', b.base)).json
  const [mine] = (await a.call('GET', a.base)).json
  const made = (await a.call('POST', products(a), sized())).json
  const [m, l] = made.variants
  assert.equal((await a.call('GET', `${inventory(a)}?warehouse=${theirs.id}`)).status, 404)
  assert.equal((await a.call('PATCH', inventory(a), { warehouseId: theirs.id, changes: [{ variantId: m.id, stock: 1 }] })).status, 404)
  assert.equal((await a.call('PUT', `${products(a)}/${made.id}`, sized({ variants: [{ id: m.id, options: ['M'], price: 1, stocks: { [theirs.id]: 1 } }, { id: l.id, options: ['L'], price: 1 }] }))).status, 400)
  assert.equal((await a.call('DELETE', `${a.base}/${(await a.call('POST', a.base, { name: 'x' })).json.id}?moveTo=${theirs.id}`)).status, 200, 'an empty warehouse needs nowhere to move')
  await a.call('POST', a.base, { name: 'y' })
  assert.equal((await a.call('DELETE', `${a.base}/${mine.id}?moveTo=${theirs.id}`)).status, 400)

  const me = await a.call('GET', '/me')
  await tx(me.json.user.id, async (t) => {
    assert.equal((await t.select().from(warehouseStock)).every((row) => row.storeId === a.storeId), true)
    await assert.rejects(t.insert(warehouseStock).values({ storeId: b.storeId, warehouseId: theirs.id, variantId: m.id, quantity: 1 }))
  })
  await assert.rejects(pool.query('insert into warehouse_stock (store_id, warehouse_id, variant_id, quantity) values ($1, $2, $3, 1)', [a.storeId, theirs.id, m.id]), 'the database refuses a link across stores')
})
