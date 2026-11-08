import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import { after, before, test } from 'node:test'
import { serve } from '@hono/node-server'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Hono } from 'hono'
import { app } from './app.ts'
import { pool } from './db.ts'

// A stand-in for Steadfast's API: it remembers parcels and lets a test set their state.
const booked: Record<string, unknown>[] = []
const states = new Map<string, string>()
const fake = new Hono()
fake.use(async (c, next) => (c.req.header('api-key') === 'good-key' && c.req.header('secret-key') === 'good-secret' ? next() : c.json({ message: 'Unauthorized' }, 401)))
fake.get('/get_balance', (c) => c.json({ status: 200, current_balance: 1250 }))
fake.post('/create_order', async (c) => {
  const body = await c.req.json()
  booked.push(body)
  const id = String(9000 + booked.length)
  states.set(id, 'in_review')
  return c.json({ status: 200, consignment: { consignment_id: Number(id), tracking_code: `TRK${id}`, status: 'in_review' } })
})
fake.get('/status_by_cid/:id', (c) => c.json({ status: 200, delivery_status: states.get(c.req.param('id')) ?? 'unknown' }))
let server: ReturnType<typeof serve>

before(async () => {
  await pool.query('drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public')
  await migrate(drizzle(pool), { migrationsFolder: new URL('../migrations', import.meta.url).pathname })
  server = serve({ fetch: fake.fetch, port: 0 })
  await new Promise((resolve) => server.once('listening', resolve))
  process.env.STEADFAST_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
after(async () => {
  server.close()
  await pool.end()
})

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
async function storeWithOrder() {
  const call = client()
  const n = ++count
  await call('POST', '/auth/signup', { name: 'Owner', email: `cr${n}@example.com`, password: 'correct horse' })
  const handle = `cr-${n}`
  await call('POST', '/stores', { name: 'Shop', handle })
  const product = (await call('POST', `/stores/${handle}/products`, { name: 'আতর', variants: [{ options: [], price: 500, stock: 5 }] })).json
  const order = (await call('POST', `/stores/${handle}/orders`, { variantId: product.variants[0].id, quantity: 2, customerName: 'রাফি', phone: '01712345678', address: 'বাসা ১২, ধানমন্ডি', shippingRateId: (await call('GET', `/stores/${handle}/shipping-rates`)).json[0].id, source: 'phone', note: 'সকালে দিন' })).json
  return { call, handle, order, stock: async () => (await pool.query('select stock from product_variants where id = $1', [product.variants[0].id])).rows[0].stock }
}

test('a store connects Steadfast with keys that are checked first and never sent back', async () => {
  const s = await storeWithOrder()
  const base = `/stores/${s.handle}/couriers`
  assert.equal((await s.call('PUT', `${base}/steadfast`, { apiKey: 'wrong', secretKey: 'nope' })).json.error, 'courierLoginFailed')
  assert.deepEqual((await s.call('GET', base)).json, [])
  const saved = await s.call('PUT', `${base}/steadfast`, { apiKey: 'good-key', secretKey: 'good-secret' })
  assert.deepEqual(saved.json, { courier: 'steadfast', balance: 1250 })
  const listed = (await s.call('GET', base)).json
  assert.deepEqual(listed.map((r: any) => Object.keys(r).sort()), [['courier', 'updatedAt']], 'no keys in the response')
  const [row] = (await pool.query('select credentials from courier_accounts')).rows.slice(-1)
  assert.doesNotMatch(row.credentials, /good-key|good-secret/, 'stored encrypted')
})

test('booking sends the order total as cash to collect, and tracking moves the order on', async () => {
  const s = await storeWithOrder()
  await s.call('PUT', `/stores/${s.handle}/couriers/steadfast`, { apiKey: 'good-key', secretKey: 'good-secret' })
  const order = `/stores/${s.handle}/orders/${s.order.id}`
  assert.equal((await s.call('POST', `${order}/ship`)).json.error, 'statusNotAllowed', 'a new order is confirmed first')
  await s.call('PATCH', order, { status: 'confirmed' })
  const shipped = await s.call('POST', `${order}/ship`)
  assert.equal(shipped.status, 201)
  assert.deepEqual(booked.at(-1), { invoice: `${s.handle}-1001`, recipient_name: 'রাফি', recipient_phone: '01712345678', recipient_address: 'বাসা ১২, ধানমন্ডি', cod_amount: 1070, note: 'সকালে দিন' })
  assert.equal((await s.call('POST', `${order}/ship`)).json.error, 'alreadyShipped')
  const detail = (await s.call('GET', order)).json
  assert.deepEqual([detail.status, detail.shipment.trackingCode], ['courier', shipped.json.trackingCode])

  assert.equal((await s.call('POST', `${order}/track`)).json.courierStatus, 'in_review')
  assert.equal((await s.call('GET', order)).json.status, 'courier')
  states.set(shipped.json.consignmentId, 'cancelled')
  await s.call('POST', `${order}/track`)
  assert.equal((await s.call('GET', order)).json.status, 'returned')
  assert.equal(await s.stock(), 5, 'a returned parcel puts the stock back')
})

test('staff can book parcels but not change the courier login; other stores reach nothing', async () => {
  const s = await storeWithOrder()
  await s.call('PUT', `/stores/${s.handle}/couriers/steadfast`, { apiKey: 'good-key', secretKey: 'good-secret' })
  const invite = await s.call('POST', `/stores/${s.handle}/invites`, { role: 'staff' })
  const staff = client()
  await staff('POST', '/auth/signup', { name: 'Staff', email: `crstaff${++count}@example.com`, password: 'correct horse' })
  await staff('POST', `/invites/${invite.json.token}/accept`)
  assert.equal((await staff('PUT', `/stores/${s.handle}/couriers/steadfast`, { apiKey: 'good-key', secretKey: 'good-secret' })).status, 403)
  assert.equal((await staff('DELETE', `/stores/${s.handle}/couriers/steadfast`)).status, 403)
  await staff('PATCH', `/stores/${s.handle}/orders/${s.order.id}`, { status: 'confirmed' })
  assert.equal((await staff('POST', `/stores/${s.handle}/orders/${s.order.id}/ship`)).status, 201)

  const other = await storeWithOrder()
  assert.equal((await other.call('POST', `/stores/${s.handle}/orders/${s.order.id}/ship`)).status, 404)
  assert.equal((await other.call('POST', `/stores/${other.handle}/orders/${s.order.id}/track`)).status, 404)
  await other.call('PATCH', `/stores/${other.handle}/orders/${other.order.id}`, { status: 'confirmed' })
  assert.equal((await other.call('POST', `/stores/${other.handle}/orders/${other.order.id}/ship`)).json.error, 'courierNotConnected')
})
