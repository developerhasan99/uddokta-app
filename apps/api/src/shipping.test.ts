import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { app } from './app.ts'
import { pool, tx } from './db.ts'

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
  await call('POST', '/auth/signup', { name: 'Seller', email: `ship-${++counter}@example.com`, password: 'correct horse' })
  return { call, id: (await call('GET', '/me')).json.user.id as string }
}

type Rate = { id: string; name: string; price: number; active: boolean; freeOver: number | null; freeMinQty: number | null; freeProducts: { id: string; name: string }[] }

async function shop(charges: Record<string, unknown> = {}) {
  const owner = await person()
  const handle = `ship-shop-${counter}`
  const created = await owner.call('POST', '/stores', { name: 'Shop', handle, ...charges })
  assert.equal(created.status, 201)
  const base = `/stores/${handle}/shipping-rates`
  const rates = async (who = owner) => (await who.call('GET', base)).json as Rate[]
  const product = (await owner.call('POST', `/stores/${handle}/products`, { name: 'Tea', variants: [{ options: [], price: 300 }] })).json
  const gift = (await owner.call('POST', `/stores/${handle}/products`, { name: 'Gift box', variants: [{ options: [], price: 500 }] })).json
  const storeId = created.json.id as string
  // A storefront order, priced by the database alone.
  const sell = async (rateId: string, qty = 1, variant = product.variants[0].id as string, phone = `0171${String(++counter).padStart(7, '0')}`) =>
    (await tx(null, (t) => t.execute<{ number: number; total: number }>(sql`select * from place_order(${storeId}::uuid, null, ${variant}::uuid, ${qty}, 'Buyer', ${phone}, 'Dhaka', ${rateId}::uuid)`))).rows[0]
  return { owner, handle, base, rates, product, gift, storeId, sell }
}

test('a new store starts with inside and outside Dhaka from its onboarding charges', async () => {
  const s = await shop({ deliveryInside: 60, deliveryOutside: 120 })
  assert.deepEqual((await s.rates()).map((r) => [r.name, r.price, r.active]), [['ঢাকার ভেতরে', 60, true], ['ঢাকার বাইরে', 120, true]])
  const plain = await shop()
  assert.deepEqual((await plain.rates()).map((r) => r.price), [70, 130])
  assert.equal((await plain.owner.call('POST', '/stores', { name: 'X', handle: `bad-charge-${counter}`, deliveryInside: -5 })).status, 400)
})

test('orders are charged by the chosen option, and the order keeps its name', async () => {
  const s = await shop()
  const [inside, outside] = await s.rates()
  assert.equal((await s.sell(inside.id)).total, 370)
  assert.equal((await s.sell(outside.id)).total, 430)
  const [order] = (await pool.query('select shipping_name, shipping_rate_id, delivery_charge from orders where store_id = $1 order by number desc limit 1', [s.storeId])).rows
  assert.deepEqual(order, { shipping_name: 'ঢাকার বাইরে', shipping_rate_id: outside.id, delivery_charge: 130 })

  // Another store's option, or one switched off, is refused.
  const other = await shop()
  await assert.rejects(s.sell((await other.rates())[0].id), (err: { cause?: { code?: string } }) => err.cause?.code === 'UD019')
  await s.owner.call('PUT', `${s.base}/${outside.id}`, { ...outside, active: false })
  await assert.rejects(s.sell(outside.id), (err: { cause?: { code?: string } }) => err.cause?.code === 'UD019')
})

test('free delivery when the total, the item count or a chosen product says so', async () => {
  const s = await shop()
  const added = await s.owner.call('POST', s.base, { name: 'ঢাকা সিটি', note: 'মিরপুর, উত্তরা', price: 60, freeOver: 900, freeMinQty: 4, productIds: [s.gift.id] })
  assert.equal(added.status, 201)
  assert.deepEqual([added.json.freeOver, added.json.freeMinQty, added.json.freeProducts], [900, 4, [{ id: s.gift.id, name: 'Gift box' }]])
  const city = added.json.id as string
  assert.equal((await s.sell(city, 2)).total, 660) // 600 + 60
  assert.equal((await s.sell(city, 3)).total, 900) // reaches 900: free
  assert.equal((await s.sell(city, 1, s.gift.variants[0].id)).total, 500) // the gift box is always free
  await s.owner.call('PUT', `${s.base}/${city}`, { name: 'ঢাকা সিটি', price: 60, freeMinQty: 2 })
  assert.equal((await s.sell(city, 2)).total, 600) // two items: free
  assert.deepEqual((await s.rates()).find((r) => r.id === city)!.freeProducts, [])
})

test('only owners and admins change options; staff read them; input is checked', async () => {
  const s = await shop()
  const staff = await person()
  const { token } = (await s.owner.call('POST', `/stores/${s.handle}/invites`, { role: 'staff' })).json
  await staff.call('POST', `/invites/${token}/accept`)
  const [inside] = await s.rates(staff)
  assert.equal((await staff.call('POST', s.base, { name: 'Express', price: 200 })).status, 403)
  assert.equal((await staff.call('PUT', `${s.base}/${inside.id}`, { name: 'Cheap', price: 1 })).status, 403)
  assert.equal((await staff.call('DELETE', `${s.base}/${inside.id}`)).status, 403)
  await assert.rejects(tx(staff.id, (t) => t.execute(sql`insert into shipping_rates (store_id, name, price, position) values (${s.storeId}::uuid, 'x', 1, 9)`)))

  for (const bad of [{ name: '', price: 10 }, { name: 'x', price: -1 }, { name: 'x', price: 1.5 }, { name: 'x', price: 10, freeOver: 0 }, { name: 'x', price: 10, freeMinQty: 1 }, { name: 'x'.repeat(61), price: 10 }, { name: 'x', price: 10, productIds: ['nope'] }]) {
    assert.equal((await s.owner.call('POST', s.base, bad)).status, 400, JSON.stringify(bad))
  }
  const other = await shop()
  assert.equal((await s.owner.call('POST', s.base, { name: 'x', price: 10, productIds: [other.product.id] })).status, 400)
  assert.equal((await other.owner.call('GET', s.base)).status, 404)
  assert.equal((await tx(other.owner.id, (t) => t.execute(sql`select count(*)::int as n from shipping_rates where store_id = ${s.storeId}::uuid`))).rows[0].n, 0)
})

test('the last option that is on cannot be turned off or deleted; deleting keeps past orders as they were', async () => {
  const s = await shop()
  const [inside, outside] = await s.rates()
  await s.sell(outside.id)
  assert.equal((await s.owner.call('DELETE', `${s.base}/${outside.id}`)).status, 200)
  const [order] = (await pool.query('select shipping_name, shipping_rate_id, delivery_charge from orders where store_id = $1', [s.storeId])).rows
  assert.deepEqual(order, { shipping_name: 'ঢাকার বাইরে', shipping_rate_id: null, delivery_charge: 130 })
  assert.equal((await s.owner.call('PUT', `${s.base}/${inside.id}`, { name: inside.name, price: 70, active: false })).json.error, 'lastShippingRate')
  assert.equal((await s.owner.call('DELETE', `${s.base}/${inside.id}`)).json.error, 'lastShippingRate')
  assert.equal((await s.rates()).length, 1)
})

test('options keep the order the seller gives them', async () => {
  const s = await shop()
  const express = (await s.owner.call('POST', s.base, { name: 'Express', price: 200 })).json
  const [inside, outside] = await s.rates()
  const sorted = (await s.owner.call('PUT', `/stores/${s.handle}/shipping-rates-order`, { ids: [express.id, outside.id, inside.id] })).json as Rate[]
  assert.deepEqual(sorted.map((r) => r.name), ['Express', 'ঢাকার বাইরে', 'ঢাকার ভেতরে'])
  const storefront = (await tx(null, (t) => t.execute<{ name: string }>(sql`select name from storefront_shipping(${s.storeId}::uuid)`))).rows
  assert.deepEqual(storefront.map((r) => r.name), ['Express', 'ঢাকার বাইরে', 'ঢাকার ভেতরে'])
})

test('editing an order keeps its agreed charge, follows free-delivery conditions and prices a new option afresh', async () => {
  const s = await shop()
  const [inside, outside] = await s.rates()
  const call = s.owner.call
  const ordersBase = `/stores/${s.handle}/orders`
  const order = (await call('POST', ordersBase, { customerName: 'Rafi', phone: '01812345678', address: 'Dhaka', shippingRateId: inside.id, source: 'phone', items: [{ variantId: s.product.variants[0].id, quantity: 1 }] })).json
  assert.equal(order.deliveryCharge, 70)

  // The seller raises the price later: the order keeps the 70 it was agreed at.
  await call('PUT', `${s.base}/${inside.id}`, { name: inside.name, price: 90, freeOver: 1200 })
  let edited = (await call('PUT', `${ordersBase}/${order.id}/items`, { items: [{ variantId: s.product.variants[0].id, quantity: 2 }] })).json
  assert.equal(edited.deliveryCharge, 70)
  // Now over 1200: free.
  edited = (await call('PUT', `${ordersBase}/${order.id}/items`, { items: [{ variantId: s.product.variants[0].id, quantity: 4 }] })).json
  assert.deepEqual([edited.deliveryCharge, edited.total], [0, 1200])
  // Back under: the option's current price.
  edited = (await call('PUT', `${ordersBase}/${order.id}/items`, { items: [{ variantId: s.product.variants[0].id, quantity: 1 }] })).json
  assert.equal(edited.deliveryCharge, 90)
  // Another option is priced as it is now.
  edited = (await call('PUT', `${ordersBase}/${order.id}/items`, { shippingRateId: outside.id, items: [{ variantId: s.product.variants[0].id, quantity: 1 }] })).json
  assert.deepEqual([edited.deliveryCharge, edited.shippingName, edited.events[0].data.toShipping], [130, 'ঢাকার বাইরে', 'ঢাকার বাইরে'])
  assert.equal((await call('POST', ordersBase, { customerName: 'x', phone: '01812345678', address: 'Dhaka', source: 'phone', items: [{ variantId: s.product.variants[0].id, quantity: 1 }] })).json.error, 'shippingRateInvalid')
})
