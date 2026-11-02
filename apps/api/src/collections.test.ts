import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import sharp from 'sharp'
import { app } from './app.ts'
import { pool, tx } from './db.ts'
import { collectionProducts, collections } from './schema.ts'

before(async () => {
  await pool.query('drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public')
  await migrate(drizzle(pool), { migrationsFolder: new URL('../migrations', import.meta.url).pathname })
})
after(() => pool.end())

function client() {
  let cookie = ''
  return async (method: string, path: string, body?: unknown) => {
    const isForm = body instanceof FormData
    const res = await app.request(`/api${path}`, {
      method,
      headers: isForm ? { cookie, host: 'shop.test', origin: 'https://shop.test' } : { 'content-type': 'application/json', cookie },
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    })
    const set = res.headers.get('set-cookie')
    if (set) cookie = set.split(';')[0]
    return { status: res.status, json: await res.json() as any }
  }
}

let count = 0
async function storeOwner() {
  const call = client()
  const n = ++count
  await call('POST', '/auth/signup', { name: 'Owner', email: `c${n}@example.com`, password: 'correct horse' })
  const handle = `coll-${n}`
  const store = await call('POST', '/stores', { name: 'Shop', handle })
  return { call, handle, storeId: store.json.id as string, base: `/stores/${handle}/collections`, products: `/stores/${handle}/products` }
}
type Owner = Awaited<ReturnType<typeof storeOwner>>

const product = async (owner: Owner, name: string, extra = {}) => (await owner.call('POST', owner.products, { name, variants: [{ options: [], price: 100 }], ...extra })).json

async function upload(owner: Owner) {
  const png = await sharp({ create: { width: 20, height: 20, channels: 3, background: '#2a7' } }).png().toBuffer()
  const form = new FormData()
  form.set('file', new File([png as BlobPart], 'a.png', { type: 'image/png' }))
  return (await owner.call('POST', `/stores/${owner.handle}/media`, form)).json
}

test('a collection saves its products in the order given, and lists them', async () => {
  const owner = await storeOwner()
  const [a, b] = [await product(owner, 'A'), await product(owner, 'B')]
  const made = await owner.call('POST', owner.base, { name: 'ঈদ কালেকশন', description: '<p onclick="x()">নতুন</p><script>y</script>', productIds: [b.id, a.id] })
  assert.equal(made.status, 201)
  assert.equal(made.json.handle, 'ঈদ-কালেকশন')
  assert.equal(made.json.description, '<p>নতুন</p>y', 'cleaned like product descriptions')
  assert.deepEqual(made.json.products.map((p: any) => p.name), ['B', 'A'])
  assert.deepEqual([made.json.products[0].minPrice, made.json.products[0].status], [100, 'active'])

  const edited = await owner.call('PUT', `${owner.base}/${made.json.id}`, { name: 'ঈদ', handle: made.json.handle, productIds: [a.id, b.id] })
  assert.deepEqual(edited.json.products.map((p: any) => p.name), ['A', 'B'])
  assert.equal(edited.json.handle, 'ঈদ-কালেকশন', 'renaming keeps the address')

  const list = await owner.call('GET', `${owner.base}?q=ঈদ`)
  assert.deepEqual(list.json.items.map((c: any) => [c.name, c.productCount]), [['ঈদ', 2]])
  assert.deepEqual((await owner.call('GET', `${owner.base}?q=none`)).json.items, [])
  assert.deepEqual((await owner.call('GET', `${owner.base}/options`)).json, [{ id: made.json.id, name: 'ঈদ' }])
})

test('handles are unique inside one store', async () => {
  const owner = await storeOwner()
  const first = (await owner.call('POST', owner.base, { name: 'Sale' })).json
  assert.equal((await owner.call('POST', owner.base, { name: 'Sale' })).json.handle, 'sale-2')
  const taken = await owner.call('POST', owner.base, { name: 'Other', handle: first.handle })
  assert.deepEqual([taken.status, taken.json.error], [409, 'collectionHandleTaken'])
  const other = await storeOwner()
  assert.equal((await other.call('POST', other.base, { name: 'x', handle: first.handle })).status, 201)
})

test('the product form joins and leaves collections, keeping places in the others', async () => {
  const owner = await storeOwner()
  const [a, b] = [await product(owner, 'A'), await product(owner, 'B')]
  const one = (await owner.call('POST', owner.base, { name: 'One', productIds: [a.id] })).json
  const two = (await owner.call('POST', owner.base, { name: 'Two', productIds: [a.id] })).json
  const names = async (id: string) => (await owner.call('GET', `${owner.base}/${id}`)).json.products.map((p: any) => p.name)
  const body = (p: any, extra = {}) => ({ name: p.name, variants: [{ id: p.variants[0].id, options: [], price: 100 }], ...extra })

  const joined = await owner.call('PUT', `${owner.products}/${b.id}`, body(b, { collectionIds: [one.id] }))
  assert.deepEqual(joined.json.collections, [{ id: one.id, name: 'One' }])
  assert.deepEqual(await names(one.id), ['A', 'B'], 'added at the end')

  await owner.call('PUT', `${owner.products}/${a.id}`, body(a, { collectionIds: [one.id] }))
  assert.deepEqual(await names(one.id), ['A', 'B'], 'staying keeps its place')
  assert.deepEqual(await names(two.id), [], 'left the other one')

  await owner.call('PUT', `${owner.products}/${a.id}`, body(a))
  assert.deepEqual(await names(one.id), ['A', 'B'], 'a save that leaves collections out changes nothing')

  await owner.call('PUT', `${owner.products}/${a.id}`, body(a, { collectionIds: [] }))
  assert.deepEqual(await names(one.id), ['B'])

  const made = await product(owner, 'C', { collectionIds: [two.id] })
  assert.deepEqual(made.collections, [{ id: two.id, name: 'Two' }], 'a new product can join straight away')
})

test('deleting a collection keeps its products, and deleting a product leaves its collections', async () => {
  const owner = await storeOwner()
  const [a, b] = [await product(owner, 'A'), await product(owner, 'B')]
  const made = (await owner.call('POST', owner.base, { name: 'C', productIds: [a.id, b.id] })).json
  assert.equal((await owner.call('DELETE', `${owner.products}/${a.id}`)).status, 200)
  assert.deepEqual((await owner.call('GET', `${owner.base}/${made.id}`)).json.products.map((p: any) => p.name), ['B'])
  assert.equal((await owner.call('DELETE', `${owner.base}/${made.id}`)).status, 200)
  assert.equal((await owner.call('GET', `${owner.base}/${made.id}`)).status, 404)
  assert.equal((await owner.call('GET', `${owner.products}/${b.id}`)).status, 200)
})

test('a collection image shows where it is used and cannot be deleted, until the store goes', async () => {
  const owner = await storeOwner()
  const image = await upload(owner)
  const made = (await owner.call('POST', owner.base, { name: 'C', mediaId: image.id })).json
  assert.equal(made.media.id, image.id)
  assert.equal((await owner.call('GET', owner.base)).json.items[0].thumbUrl, image.thumbUrl)
  const mediaUrl = `/stores/${owner.handle}/media/${image.id}`
  assert.deepEqual((await owner.call('GET', `${mediaUrl}/usage`)).json.collections, [{ id: made.id, name: 'C' }])
  const refused = await owner.call('DELETE', mediaUrl)
  assert.deepEqual([refused.status, refused.json.error], [409, 'mediaInUse'])
  await owner.call('PUT', `${owner.base}/${made.id}`, { name: 'C', handle: made.handle, mediaId: null })
  assert.equal((await owner.call('DELETE', mediaUrl)).status, 200)

  const again = await upload(owner)
  await owner.call('POST', owner.base, { name: 'D', mediaId: again.id })
  await pool.query('delete from stores where id = $1', [owner.storeId])
  assert.equal((await pool.query('select count(*)::int as n from collections where store_id = $1', [owner.storeId])).rows[0].n, 0, 'deleting the store clears both together')
})

test('staff can add and edit collections but not delete them', async () => {
  const owner = await storeOwner()
  const invite = await owner.call('POST', `/stores/${owner.handle}/invites`, { role: 'staff' })
  const staff = client()
  await staff('POST', '/auth/signup', { name: 'Staff', email: `cstaff${++count}@example.com`, password: 'correct horse' })
  await staff('POST', `/invites/${invite.json.token}/accept`)
  const made = await staff('POST', owner.base, { name: 'S' })
  assert.equal(made.status, 201)
  assert.equal((await staff('PUT', `${owner.base}/${made.json.id}`, { name: 'S2' })).status, 200)
  assert.equal((await staff('DELETE', `${owner.base}/${made.json.id}`)).status, 403)
  assert.equal((await owner.call('DELETE', `${owner.base}/${made.json.id}`)).status, 200)
})

test('bad collections are refused', async () => {
  const owner = await storeOwner()
  const bad: [string, unknown][] = [
    ['no name', { name: ' ' }],
    ['bad product id', { name: 'x', productIds: ['x'] }],
    ['repeated product', { name: 'x', productIds: ['00000000-0000-4000-8000-000000000000', '00000000-0000-4000-8000-000000000000'] }],
    ['unknown product', { name: 'x', productIds: ['00000000-0000-4000-8000-000000000000'] }],
    ['bad image id', { name: 'x', mediaId: 'x' }],
    ['unknown image', { name: 'x', mediaId: '00000000-0000-4000-8000-000000000000' }],
    ['long search title', { name: 'x', seoTitle: 'x'.repeat(301) }],
  ]
  for (const [label, body] of bad) assert.equal((await owner.call('POST', owner.base, body)).status, 400, label)
  assert.equal((await owner.call('GET', `${owner.base}/not-an-id`)).status, 404)
})

test('one store cannot reach another store’s collections, products or images', async () => {
  const a = await storeOwner()
  const b = await storeOwner()
  const theirProduct = await product(b, 'P')
  const theirImage = await upload(b)
  const theirs = (await b.call('POST', b.base, { name: 'B', productIds: [theirProduct.id] })).json
  assert.equal((await a.call('GET', b.base)).status, 404)
  assert.equal((await a.call('GET', `${a.base}/${theirs.id}`)).status, 404)
  assert.equal((await a.call('PUT', `${a.base}/${theirs.id}`, { name: 'x' })).status, 404)
  assert.equal((await a.call('DELETE', `${a.base}/${theirs.id}`)).status, 403)
  assert.equal((await a.call('POST', a.base, { name: 'x', productIds: [theirProduct.id] })).status, 400)
  assert.equal((await a.call('POST', a.base, { name: 'x', mediaId: theirImage.id })).status, 400)
  const mine = await product(a, 'Mine')
  assert.equal((await a.call('PUT', `${a.products}/${mine.id}`, { name: 'Mine', variants: [{ id: mine.variants[0].id, options: [], price: 1 }], collectionIds: [theirs.id] })).status, 400)

  const me = await a.call('GET', '/me')
  await tx(me.json.user.id, async (t) => {
    assert.deepEqual(await t.select().from(collections), [])
    assert.deepEqual(await t.select().from(collectionProducts), [])
  })
  await assert.rejects(
    tx(me.json.user.id, (t) => t.insert(collections).values({ storeId: b.storeId, name: 'x', handle: 'x' })),
    'the database refuses writing into another store',
  )
  await assert.rejects(
    pool.query(`insert into collection_products (store_id, collection_id, product_id, position) values ($1, $2, $3, 0)`, [a.storeId, theirs.id, mine.id]),
    'a link cannot cross stores',
  )
})
