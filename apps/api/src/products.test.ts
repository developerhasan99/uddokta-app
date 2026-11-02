import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import sharp from 'sharp'
import { app } from './app.ts'
import { pool, tx } from './db.ts'
import { productVariantCosts, products } from './schema.ts'

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
  await call('POST', '/auth/signup', { name: 'Owner', email: `p${n}@example.com`, password: 'correct horse' })
  const handle = `shop-${n}`
  const store = await call('POST', '/stores', { name: 'Shop', handle })
  return { call, handle, storeId: store.json.id as string, base: `/stores/${handle}/products` }
}

async function staffOf(owner: Awaited<ReturnType<typeof storeOwner>>) {
  const invite = await owner.call('POST', `/stores/${owner.handle}/invites`, { role: 'staff' })
  const staff = client()
  await staff('POST', '/auth/signup', { name: 'Staff', email: `pstaff${++count}@example.com`, password: 'correct horse' })
  await staff('POST', `/invites/${invite.json.token}/accept`)
  return staff
}

async function upload(owner: Awaited<ReturnType<typeof storeOwner>>) {
  const png = await sharp({ create: { width: 20, height: 20, channels: 3, background: '#2a7' } }).png().toBuffer()
  const form = new FormData()
  form.set('file', new File([png as BlobPart], 'a.png', { type: 'image/png' }))
  return (await owner.call('POST', `/stores/${owner.handle}/media`, form)).json
}

const simple = (extra = {}) => ({ name: 'পাঞ্জাবি', variants: [{ options: [], price: 1200, cost: 700, sku: 'P-1', stock: 5 }], ...extra })
const sized = (extra = {}) => ({
  name: 'Shirt',
  options: [{ name: 'Size', values: ['M', 'L'] }],
  variants: [{ options: ['M'], price: 500, stock: 3 }, { options: ['L'], price: 600, stock: 0 }],
  ...extra,
})

test('a product saves with its variants, buying price and images', async () => {
  const owner = await storeOwner()
  const image = await upload(owner)
  const made = await owner.call('POST', owner.base, simple({ description: 'সুতি', mediaIds: [image.id] }))
  assert.equal(made.status, 201)
  assert.equal(made.json.status, 'active')
  assert.equal(made.json.variants[0].cost, 700)
  assert.equal(made.json.media[0].id, image.id)

  const list = await owner.call('GET', owner.base)
  assert.deepEqual(list.json.counts, { active: 1 })
  const row = list.json.items[0]
  assert.deepEqual([row.minPrice, row.maxPrice, row.stock, row.variantCount], [1200, 1200, 5, 1])
  assert.equal(row.thumbUrl, image.thumbUrl)
})

test('saving keeps variant ids, removes dropped variants and leaves untouched buying prices alone', async () => {
  const owner = await storeOwner()
  const made = (await owner.call('POST', owner.base, sized())).json
  const [m, l] = made.variants
  const url = `${owner.base}/${made.id}`
  await owner.call('PUT', url, sized({ variants: [{ id: m.id, options: ['M'], price: 550, cost: 300 }, { id: l.id, options: ['L'], price: 600 }] }))
  const edited = await owner.call('PUT', url, {
    name: 'Shirt',
    options: [{ name: 'Size', values: ['M', 'XL'] }],
    variants: [{ id: m.id, options: ['M'], price: 560 }, { options: ['XL'], price: 700 }],
  })
  assert.equal(edited.json.variants.length, 2)
  assert.equal(edited.json.variants[0].id, m.id)
  assert.equal(edited.json.variants[0].cost, 300)
  assert.notEqual(edited.json.variants[1].id, l.id)
})

test('type, brand, tags and the unlisted status save, and the store suggests them back', async () => {
  const owner = await storeOwner()
  const made = await owner.call('POST', owner.base, simple({ status: 'unlisted', productType: ' শাড়ি ', brand: 'তাঁত', tags: ['ঈদ', 'ঈদ ', 'নতুন'] }))
  assert.equal(made.status, 201)
  assert.deepEqual([made.json.status, made.json.productType, made.json.brand, made.json.tags], ['unlisted', 'শাড়ি', 'তাঁত', ['ঈদ', 'নতুন']])
  assert.deepEqual((await owner.call('GET', `${owner.base}?status=unlisted`)).json.counts, { unlisted: 1 })
  assert.deepEqual((await owner.call('GET', `${owner.base}/suggestions`)).json, { types: ['শাড়ি'], brands: ['তাঁত'], tags: ['ঈদ', 'নতুন'] })
  const other = await storeOwner()
  assert.deepEqual((await other.call('GET', `${other.base}/suggestions`)).json, { types: [], brands: [], tags: [] })
})

test('descriptions keep basic formatting and lose everything that could run', async () => {
  const owner = await storeOwner()
  const save = async (description: string) => (await owner.call('POST', owner.base, simple({ description }))).json.description
  assert.equal(await save('<div style="color:red"><b>সুতি</b> <i onclick="x()">নরম</i></div><ul><li>এক</li></ul>'), '<p><strong>সুতি</strong> <em>নরম</em></p><ul><li>এক</li></ul>')
  assert.equal(await save('<script>alert(1)</script><img src=x onerror=alert(1)>'), 'alert(1)')
  assert.equal(await save('<svg/onload=alert(1)>'), '')
  assert.equal(await save('<b onclick="a>b">x</b>'), '<strong>b">x</strong>')
  assert.equal(await save('<<img src=x onerror=alert(1)>b>'), '&lt;b>')
  assert.equal(await save('<img src=x onerror=alert(1)'), '&lt;img src=x onerror=alert(1)')
  assert.equal(await save('১ < ২'), '১ &lt; ২')
  assert.equal(await save('<a class="x" href="https://a.com/?x=1&amp;y=2" onclick="x()">লিঙ্ক</a>'), '<a href="https://a.com/?x=1&amp;y=2">লিঙ্ক</a>')
  assert.equal(await save('<a href="tel:+8801700000000">ফোন</a>'), '<a href="tel:+8801700000000">ফোন</a>')
  for (const href of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', '&#106;avascript:alert(1)', 'java&#10;script:alert(1)', ' javascript:alert(1)', 'data:text/html,x', '//evil.test']) {
    assert.equal(await save(`<a href="${href}">x</a>`), 'x</a>', href)
  }
  assert.equal(await save(`<a href='javascript:alert(1)' title=' href="https://a.com"'>x</a>`), '<a href="https://a.com">x</a>', 'only a real href counts, and only a safe one')
})

test('a variant image must be one of the product images, and stays blocked from deletion', async () => {
  const owner = await storeOwner()
  const [image, loose] = [await upload(owner), await upload(owner)]
  const variants = (mediaId: string) => [{ options: ['M'], price: 500, mediaId }, { options: ['L'], price: 600 }]
  assert.equal((await owner.call('POST', owner.base, sized({ mediaIds: [image.id], variants: variants(loose.id) }))).status, 400)
  const made = await owner.call('POST', owner.base, sized({ mediaIds: [image.id], variants: variants(image.id) }))
  assert.equal(made.json.variants[0].mediaId, image.id)
  assert.equal(made.json.variants[1].mediaId, null)
  const url = `${owner.base}/${made.json.id}`
  const resaved = await owner.call('PUT', url, sized({ mediaIds: [loose.id, image.id], variants: made.json.variants.map((v: any) => ({ ...v, cost: undefined })) }))
  assert.equal(resaved.json.variants[0].mediaId, image.id, 'survives the images being replaced')
  assert.equal((await owner.call('DELETE', `/stores/${owner.handle}/media/${image.id}`)).status, 409)
  assert.equal((await owner.call('DELETE', url)).status, 200, 'deleting the product clears both together')
})

test('handles come from the name, stay put, and are unique inside one store', async () => {
  const owner = await storeOwner()
  const first = (await owner.call('POST', owner.base, simple({ name: 'লাল শাড়ি, Red!' }))).json
  assert.equal(first.handle, 'লাল-শাড়ি-red')
  const second = (await owner.call('POST', owner.base, simple({ name: 'লাল শাড়ি, Red!' }))).json
  assert.equal(second.handle, 'লাল-শাড়ি-red-2')
  const url = `${owner.base}/${first.id}`
  assert.equal((await owner.call('PUT', url, simple({ name: 'নতুন নাম', handle: first.handle }))).json.handle, first.handle, 'renaming keeps the address')
  assert.equal((await owner.call('PUT', url, simple({ name: 'নতুন নাম', handle: 'My Own Page!' }))).json.handle, 'my-own-page')
  const taken = await owner.call('PUT', url, simple({ handle: second.handle }))
  assert.deepEqual([taken.status, taken.json.error], [409, 'productHandleTaken'])
  assert.equal((await owner.call('POST', owner.base, simple({ handle: second.handle }))).status, 409)
  const other = await storeOwner()
  assert.equal((await other.call('POST', other.base, simple({ handle: second.handle }))).json.handle, second.handle, 'another store can use the same one')
  assert.equal((await owner.call('POST', owner.base, simple({ name: '!!!' }))).json.handle, 'product')
})

test('search title and description save', async () => {
  const owner = await storeOwner()
  const made = (await owner.call('POST', owner.base, simple({ seoTitle: ' শিরোনাম ', seoDescription: 'বর্ণনা' }))).json
  assert.deepEqual([made.seoTitle, made.seoDescription], ['শিরোনাম', 'বর্ণনা'])
  assert.equal((await owner.call('POST', owner.base, simple({ seoTitle: 'x'.repeat(301) }))).status, 400)
})

test('bad products are refused', async () => {
  const owner = await storeOwner()
  const other = (await owner.call('POST', owner.base, simple())).json
  const bad: [string, unknown][] = [
    ['no name', simple({ name: '  ' })],
    ['no variants', simple({ variants: [] })],
    ['negative price', simple({ variants: [{ options: [], price: -1 }] })],
    ['fractional price', simple({ variants: [{ options: [], price: 1.5 }] })],
    ['missing combination', sized({ variants: [{ options: ['M'], price: 1 }] })],
    ['repeated combination', sized({ variants: [{ options: ['M'], price: 1 }, { options: ['M'], price: 1 }] })],
    ['unknown value', sized({ variants: [{ options: ['M'], price: 1 }, { options: ['S'], price: 1 }] })],
    ['repeated option', sized({ options: [{ name: 'Size', values: ['M'] }, { name: 'Size', values: ['L'] }], variants: [{ options: ['M', 'L'], price: 1 }] })],
    ['bad status', simple({ status: 'live' })],
    ['bad image id', simple({ mediaIds: ['x'] })],
    ['bad variant image id', simple({ variants: [{ options: [], price: 1, mediaId: 'x' }] })],
    ['too many tags', simple({ tags: Array.from({ length: 31 }, (_, i) => `t${i}`) })],
    ['blank tag', simple({ tags: [' '] })],
    ['type too long', simple({ productType: 'x'.repeat(101) })],
    ['another product’s variant', simple({ variants: [{ id: other.variants[0].id, options: [], price: 1 }] })],
  ]
  for (const [label, body] of bad) assert.equal((await owner.call('POST', owner.base, body)).status, 400, label)
  assert.equal((await owner.call('GET', `${owner.base}/not-an-id`)).status, 404)
})

test('search covers name and SKU, and tabs filter by status', async () => {
  const owner = await storeOwner()
  await owner.call('POST', owner.base, simple({ name: 'লাল শাড়ি 100%', status: 'draft' }))
  await owner.call('POST', owner.base, simple({ name: 'Bag', variants: [{ options: [], price: 1, sku: 'XY-9' }] }))
  const names = async (query: string) => (await owner.call('GET', `${owner.base}?${query}`)).json.items.map((i: any) => i.name)
  assert.deepEqual(await names(`q=${encodeURIComponent('শাড়ি')}`), ['লাল শাড়ি 100%'])
  assert.deepEqual(await names('q=xy-9'), ['Bag'])
  assert.deepEqual(await names(`q=${encodeURIComponent('%')}`), ['লাল শাড়ি 100%'])
  assert.deepEqual(await names('status=draft'), ['লাল শাড়ি 100%'])
  const all = await owner.call('GET', `${owner.base}?status=draft`)
  assert.deepEqual(all.json.counts, { draft: 1, active: 1 }, 'tab counts ignore the current tab')
})

test('staff can edit products but never read or change buying prices, and cannot delete', async () => {
  const owner = await storeOwner()
  const staff = await staffOf(owner)
  const made = (await owner.call('POST', owner.base, simple())).json
  const url = `${owner.base}/${made.id}`
  const variant = made.variants[0]

  const seen = await staff('GET', url)
  assert.equal(seen.json.variants[0].cost, null)
  const me = await staff('GET', '/me')
  await tx(me.json.user.id, async (t) => assert.deepEqual(await t.select().from(productVariantCosts), []))

  const edited = await staff('PUT', url, simple({ name: 'New', variants: [{ id: variant.id, options: [], price: 1300 }] }))
  assert.equal(edited.status, 200)
  assert.equal((await owner.call('GET', url)).json.variants[0].cost, 700, 'a staff save keeps the buying price')

  assert.equal((await staff('PUT', url, simple({ variants: [{ id: variant.id, options: [], price: 1, cost: 1 }] }))).status, 403)
  assert.equal((await staff('PUT', url, simple({ variants: [{ id: variant.id, options: [], price: 1, cost: null }] }))).status, 200)
  assert.equal((await owner.call('GET', url)).json.variants[0].cost, 700, 'staff cannot clear it either')
  assert.equal((await staff('DELETE', url)).status, 403)
  assert.equal((await owner.call('DELETE', url)).status, 200)
  assert.equal((await owner.call('GET', url)).status, 404)
})

test('one store cannot reach another store’s products or use its images', async () => {
  const a = await storeOwner()
  const b = await storeOwner()
  const product = (await b.call('POST', b.base, simple())).json
  const image = await upload(b)
  assert.equal((await a.call('GET', b.base)).status, 404)
  assert.equal((await a.call('GET', `${a.base}/${product.id}`)).status, 404)
  assert.equal((await a.call('PUT', `${a.base}/${product.id}`, simple())).status, 404)
  assert.equal((await a.call('DELETE', `${a.base}/${product.id}`)).status, 403)
  assert.equal((await a.call('POST', a.base, simple({ mediaIds: [image.id] }))).status, 400)
  const me = await a.call('GET', '/me')
  await tx(me.json.user.id, async (t) => assert.deepEqual(await t.select().from(products), []))
  await assert.rejects(
    pool.query(`insert into product_media (store_id, product_id, media_id, position) values ($1, $2, $3, 0)`, [b.storeId, product.id, '00000000-0000-4000-8000-000000000000']),
    'the database refuses images outside the store as well',
  )
})

test('an image in use shows where and cannot be deleted until it is removed', async () => {
  const owner = await storeOwner()
  const image = await upload(owner)
  const made = (await owner.call('POST', owner.base, simple({ mediaIds: [image.id] }))).json
  const mediaUrl = `/stores/${owner.handle}/media/${image.id}`
  assert.deepEqual((await owner.call('GET', `${mediaUrl}/usage`)).json.products, [{ id: made.id, name: made.name }])

  const refused = await owner.call('DELETE', mediaUrl)
  assert.equal(refused.status, 409)
  assert.equal(refused.json.error, 'mediaInUse')
  assert.equal((await owner.call('GET', `/stores/${owner.handle}/media`)).json.items.length, 1)

  await owner.call('PUT', `${owner.base}/${made.id}`, simple({ variants: [{ id: made.variants[0].id, options: [], price: 1 }], mediaIds: [] }))
  assert.deepEqual((await owner.call('GET', `${mediaUrl}/usage`)).json.products, [])
  assert.equal((await owner.call('DELETE', mediaUrl)).status, 200)
})

test('deleting a store removes its products and images together', async () => {
  const owner = await storeOwner()
  const image = await upload(owner)
  await owner.call('POST', owner.base, simple({ mediaIds: [image.id] }))
  await pool.query('delete from stores where id = $1', [owner.storeId])
  const left = await pool.query('select count(*)::int as n from products where store_id = $1', [owner.storeId])
  assert.equal(left.rows[0].n, 0)
})

test('inventory lists every variant, filters by stock and searches name and SKU', async () => {
  const owner = await storeOwner()
  const url = `/stores/${owner.handle}/inventory`
  await owner.call('POST', owner.base, sized())
  await owner.call('POST', owner.base, simple({ name: 'Untracked', variants: [{ options: [], price: 1, sku: 'U-1' }], status: 'draft' }))
  const labels = async (query = '') => (await owner.call('GET', `${url}?${query}`)).json.items.map((i: any) => [i.productName, i.options.join('/')])
  assert.deepEqual(await labels(), [['Untracked', ''], ['Shirt', 'M'], ['Shirt', 'L']])
  assert.deepEqual(await labels('filter=out'), [['Shirt', 'L']])
  assert.deepEqual(await labels('filter=in'), [['Shirt', 'M']])
  assert.deepEqual(await labels('filter=untracked'), [['Untracked', '']])
  assert.deepEqual(await labels('q=u-1'), [['Untracked', '']])
  assert.deepEqual((await owner.call('GET', `${url}?q=shirt&filter=out`)).json.counts, { all: 2, in: 1, out: 1, untracked: 0 }, 'tab counts ignore the current tab')
})

test('inventory saves many stock counts together, all or nothing, without touching anything else', async () => {
  const owner = await storeOwner()
  const url = `/stores/${owner.handle}/inventory`
  const made = (await owner.call('POST', owner.base, sized())).json
  const [m, l] = made.variants
  assert.equal((await owner.call('PATCH', url, { changes: [{ variantId: m.id, stock: 9 }, { variantId: l.id, stock: null }] })).status, 200)
  const after = (await owner.call('GET', `${owner.base}/${made.id}`)).json.variants
  assert.deepEqual(after.map((v: any) => [v.stock, v.price]), [[9, 500], [null, 600]])

  const bad: unknown[] = [{}, { changes: 'x' }, { changes: [{ variantId: 'x', stock: 1 }] }, { changes: [{ variantId: m.id, stock: -1 }] }, { changes: [{ variantId: m.id, stock: 1.5 }] }, { changes: [{ variantId: m.id }] }, { changes: [{ variantId: m.id, stock: 1 }, { variantId: m.id, stock: 2 }] }]
  for (const body of bad) assert.equal((await owner.call('PATCH', url, body)).status, 400, JSON.stringify(body))

  const other = await storeOwner()
  const theirs = (await other.call('POST', other.base, simple())).json.variants[0]
  assert.equal((await owner.call('PATCH', url, { changes: [{ variantId: m.id, stock: 1 }, { variantId: theirs.id, stock: 1 }] })).status, 404)
  assert.equal((await owner.call('GET', `${owner.base}/${made.id}`)).json.variants[0].stock, 9, 'the good change was undone too')
  assert.equal((await other.call('GET', `${other.base}/${(await other.call('GET', other.base)).json.items[0].id}`)).json.variants[0].stock, 5)
  assert.equal((await owner.call('GET', `/stores/${other.handle}/inventory`)).status, 404)

  const staff = await staffOf(owner)
  assert.equal((await staff('PATCH', url, { changes: [{ variantId: m.id, stock: 3 }] })).status, 200, 'staff can count stock')
})
