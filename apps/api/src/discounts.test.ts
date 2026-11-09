import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { app } from './app.ts'
import { pool } from './db.ts'

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
// A store with two products (৳500 and ৳300) and delivery inside Dhaka at ৳70.
async function shop() {
  const call = client()
  const n = ++count
  await call('POST', '/auth/signup', { name: 'Owner', email: `disc${n}@example.com`, password: 'correct horse' })
  const handle = `disc-${n}`
  await call('POST', '/stores', { name: 'Shop', handle, deliveryInside: 70, deliveryOutside: 130 })
  const product = async (name: string, price: number) => (await call('POST', `/stores/${handle}/products`, { name, variants: [{ options: [], price }] })).json
  const panjabi = await product('Panjabi', 500)
  const cap = await product('Cap', 300)
  const [inside] = (await call('GET', `/stores/${handle}/shipping-rates`)).json.map((r: { id: string }) => r.id) as string[]
  let phone = 0
  const order = async (items: [any, number][], coupon = '', mobile = `0171${String(n).padStart(3, '0')}${String(++phone).padStart(4, '0')}`) =>
    call('POST', `/stores/${handle}/orders`, { items: items.map(([p, quantity]) => ({ variantId: p.variants[0].id, quantity })), customerName: 'Buyer', phone: mobile, address: 'Dhaka', shippingRateId: inside, source: 'phone', coupon })
  const discount = async (body: Record<string, unknown>) => call('POST', `/stores/${handle}/discounts`, body)
  return { call, handle, panjabi, cap, order, discount, base: `/stores/${handle}/discounts` }
}

test('rules are checked: automatic needs a title, product lists need products of this store, dates must make sense', async () => {
  const s = await shop()
  const other = await shop()
  assert.equal((await s.discount({ method: 'automatic', type: 'order', kind: 'percent', value: 10 })).json.error, 'discountTitleRequired')
  assert.equal((await s.discount({ code: 'X', kind: 'percent', value: 10 })).json.error, 'couponCodeInvalid')
  assert.equal((await s.discount({ code: 'EID', type: 'products', kind: 'percent', value: 10, appliesAll: false, getProducts: [] })).json.error, 'discountProductsRequired')
  assert.equal((await s.discount({ code: 'EID', type: 'products', kind: 'percent', value: 10, appliesAll: false, getProducts: [other.panjabi.id] })).status, 400)
  assert.equal((await s.discount({ code: 'EID', kind: 'percent', value: 10, startsAt: '2026-12-02T00:00:00Z', endsAt: '2026-12-01T00:00:00Z' })).json.error, 'discountDatesInvalid')
  assert.equal((await s.discount({ code: 'EID', type: 'bxgy', buyQty: 0, getQty: 1, value: 100 })).status, 400)
  const made = await s.discount({ code: 'eid', type: 'products', kind: 'percent', value: 10, appliesAll: false, getProducts: [s.panjabi.id] })
  assert.equal(made.status, 201)
  assert.deepEqual([made.json.code, made.json.getProducts.map((p: any) => p.name)], ['EID', ['Panjabi']])
  assert.equal((await s.discount({ code: 'EID', kind: 'amount', value: 50 })).json.error, 'couponCodeTaken')
  assert.equal((await other.call('GET', `${s.base}/${made.json.id}`)).status, 404)
})

test('buy one get one: free or half price, as many times as the order allows, only on the named product', async () => {
  const s = await shop()
  const bogo = await s.discount({ method: 'automatic', title: '১টা কিনলে ১টা ফ্রি', type: 'bxgy', buyQty: 1, getQty: 1, value: 100, buysAll: false, buyProducts: [s.panjabi.id], appliesAll: false, getProducts: [s.panjabi.id] })
  assert.equal(bogo.status, 201)
  const one = (await s.order([[s.panjabi, 1]])).json
  assert.deepEqual([one.discount, one.total], [0, 570])
  const two = (await s.order([[s.panjabi, 2]])).json
  assert.deepEqual([two.discount, two.discountCode, two.total], [500, '১টা কিনলে ১টা ফ্রি', 570])
  assert.equal((await s.order([[s.panjabi, 3]])).json.discount, 500)
  assert.equal((await s.order([[s.panjabi, 4]])).json.discount, 1000)
  assert.equal((await s.order([[s.cap, 2]])).json.discount, 0, 'another product does not qualify')

  await s.call('PUT', `${s.base}/${bogo.json.id}`, { method: 'automatic', title: 'Half price', type: 'bxgy', buyQty: 1, getQty: 1, value: 50, maxPerOrder: 1, buysAll: false, buyProducts: [s.panjabi.id], appliesAll: false, getProducts: [s.panjabi.id] })
  assert.equal((await s.order([[s.panjabi, 4]])).json.discount, 250, 'half off one item, once per order')
  assert.equal((await s.call('GET', `${s.base}/${bogo.json.id}`)).json.uses, 4, 'only the orders it applied to are counted')
})

test('buy a panjabi, get the cheaper cap free: the cheapest qualifying item is the one given', async () => {
  const s = await shop()
  await s.discount({ method: 'automatic', title: 'Free cap', type: 'bxgy', buyQty: 1, getQty: 1, value: 100, buysAll: false, buyProducts: [s.panjabi.id], appliesAll: false, getProducts: [s.cap.id] })
  assert.equal((await s.order([[s.panjabi, 1], [s.cap, 1]])).json.discount, 300)
  assert.equal((await s.order([[s.cap, 2]])).json.discount, 0, 'nothing bought to qualify')
})

test('amount off products counts per item and only on listed products; percent off the order; free delivery', async () => {
  const s = await shop()
  await s.discount({ code: 'CAP50', type: 'products', kind: 'amount', value: 50, appliesAll: false, getProducts: [s.cap.id] })
  const capped = (await s.order([[s.panjabi, 1], [s.cap, 3]], 'cap50')).json
  assert.deepEqual([capped.discount, capped.discountCode, capped.total], [150, 'CAP50', 500 + 900 + 70 - 150])
  await s.discount({ code: 'TEN', kind: 'percent', value: 10 })
  assert.equal((await s.order([[s.panjabi, 1], [s.cap, 1]], 'ten')).json.discount, 80)
  await s.discount({ code: 'FREEDEL', type: 'shipping', minSubtotal: 400 })
  const free = (await s.order([[s.panjabi, 1]], 'FREEDEL')).json
  assert.deepEqual([free.deliveryCharge, free.discount, free.total], [70, 70, 500])
  assert.equal((await s.order([[s.cap, 1]], 'FREEDEL')).json.error, 'couponInvalid', 'below its minimum')
})

test('the best discount wins; scheduled, paused, used-up and once-per-phone discounts do not apply', async () => {
  const s = await shop()
  await s.discount({ method: 'automatic', title: '5% off', kind: 'percent', value: 5 })
  await s.discount({ code: 'BIG', kind: 'amount', value: 200 })
  const best = (await s.order([[s.panjabi, 2]], 'BIG')).json
  assert.deepEqual([best.discount, best.discountCode], [200, 'BIG'])
  assert.deepEqual(await s.order([[s.panjabi, 2]]).then((r) => [r.json.discount, r.json.discountCode]), [50, '5% off'])

  await s.discount({ code: 'LATER', kind: 'percent', value: 50, startsAt: new Date(Date.now() + 86_400_000).toISOString() })
  assert.equal((await s.order([[s.panjabi, 1]], 'LATER')).json.error, 'couponInvalid', 'not started yet')
  const once = await s.discount({ code: 'ONCE', kind: 'amount', value: 100, oncePerPhone: true, minQty: 2 })
  assert.equal((await s.order([[s.panjabi, 1]], 'ONCE', '01799999901')).json.error, 'couponInvalid', 'needs two items')
  assert.equal((await s.order([[s.panjabi, 2]], 'ONCE', '01799999901')).json.discount, 100)
  assert.equal((await s.order([[s.panjabi, 2]], 'ONCE', '01799999901')).json.error, 'couponInvalid', 'same phone again')
  await s.call('PATCH', `${s.base}/${once.json.id}`, { active: false })
  assert.equal((await s.order([[s.panjabi, 2]], 'ONCE', '01799999902')).json.error, 'couponInvalid', 'paused')
})

test('editing an order follows the discount rule; a product deleted from a list stops it, never widens it', async () => {
  const s = await shop()
  const bogo = await s.discount({ method: 'automatic', title: 'BOGO', type: 'bxgy', buyQty: 1, getQty: 1, value: 100, buysAll: false, buyProducts: [s.cap.id], appliesAll: false, getProducts: [s.cap.id] })
  const placed = (await s.order([[s.cap, 2]])).json
  assert.equal(placed.discount, 300)
  const edited = await s.call('PUT', `/stores/${s.handle}/orders/${placed.id}/items`, { items: [{ variantId: s.cap.variants[0].id, quantity: 1 }] })
  assert.deepEqual([edited.json.discount, edited.json.total], [0, 370])

  assert.equal((await s.call('DELETE', `/stores/${s.handle}/products/${s.cap.id}`)).status, 200)
  const after = (await s.call('GET', `${s.base}/${bogo.json.id}`)).json
  assert.deepEqual([after.appliesAll, after.getProducts.length], [false, 0])
  assert.equal((await s.order([[s.panjabi, 2]])).json.discount, 0)
})
