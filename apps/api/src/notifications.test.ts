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
async function person(name: string) {
  const call = client()
  await call('POST', '/auth/signup', { name, email: `notify-${++counter}@example.com`, password: 'correct horse' })
  const id = (await call('GET', '/me')).json.user.id as string
  return { call, id }
}

// An owner with one tracked product (stock 5) and a staff member who joined by invite.
async function team() {
  const owner = await person('Owner')
  const handle = `notify-shop-${counter}`
  const store = (await owner.call('POST', '/stores', { name: 'Shop', handle })).json
  const product = (await owner.call('POST', `/stores/${handle}/products`, { name: 'শাড়ি', variants: [{ options: [], price: 500, stock: 5 }] })).json
  const staff = await person('Rina')
  const { token } = (await owner.call('POST', `/stores/${handle}/invites`, { role: 'staff' })).json
  assert.equal((await staff.call('POST', `/invites/${token}/accept`)).status, 200)
  const [inside, outside] = (await owner.call('GET', `/stores/${handle}/shipping-rates`)).json.map((r: { id: string }) => r.id) as string[]
  const list = async (who: { call: ReturnType<typeof client> }) => (await who.call('GET', `/stores/${handle}/notifications`)).json
  const storefrontOrder = (qty = 1, phone = '01711111111') => tx(null, (t) => t.execute(sql`
    select place_order(${store.id}::uuid, null, ${product.variants[0].id}::uuid, ${qty}, 'Karim', ${phone}, 'Dhaka', ${inside}::uuid)`))
  return { owner, staff, handle, inside, outside, storeId: store.id as string, variantId: product.variants[0].id as string, productId: product.id as string, list, storefrontOrder }
}

test('a joining member is announced to the owner, not to themselves', async () => {
  const s = await team()
  const owner = await s.list(s.owner)
  assert.equal(owner.unread, 1)
  assert.equal(owner.items[0].kind, 'member_joined')
  assert.deepEqual({ name: owner.items[0].data.name, role: owner.items[0].data.role }, { name: 'Rina', role: 'staff' })
  assert.equal((await s.list(s.staff)).unread, 0)
})

test('storefront orders reach everyone; a typed-in order skips the person who typed it', async () => {
  const s = await team()
  await s.storefrontOrder()
  const staffView = await s.list(s.staff)
  assert.equal(staffView.items[0].kind, 'order_new')
  assert.equal(typeof staffView.items[0].data.number, 'number')
  assert.equal(staffView.items[0].data.name, 'Karim')
  assert.equal(staffView.items[0].data.total, 570)
  assert.equal(staffView.items[0].data.product, 'শাড়ি')
  assert.equal(staffView.items[0].data.duplicate, false)
  assert.equal((await s.list(s.owner)).items.filter((n: { kind: string }) => n.kind === 'order_new').length, 1)

  // Same number and product again within a day is marked as a likely repeat.
  await s.storefrontOrder()
  assert.equal((await s.list(s.staff)).items[0].data.duplicate, true)

  const typed = await s.owner.call('POST', `/stores/${s.handle}/orders`, { variantId: s.variantId, quantity: 1, customerName: 'Phone buyer', phone: '01722222222', address: 'Khulna', shippingRateId: s.outside, source: 'phone' })
  assert.equal(typed.status, 201)
  assert.equal((await s.list(s.staff)).items[0].data.name, 'Phone buyer')
  assert.ok(!(await s.list(s.owner)).items.some((n: { data: { name?: string } }) => n.data.name === 'Phone buyer'))
})

test('returns notify by default, deliveries only when switched on', async () => {
  const s = await team()
  await s.storefrontOrder(1)
  const [{ id }] = (await pool.query('select id from orders where store_id = $1', [s.storeId])).rows
  for (const next of ['confirmed', 'packed', 'courier', 'delivered']) await tx(s.owner.id, (t) => t.execute(sql`select set_order_status(${id}::uuid, ${next})`))
  assert.ok(!(await s.list(s.staff)).items.some((n: { kind: string }) => n.kind === 'order_delivered'))

  await s.storefrontOrder(1, '01733333333')
  const [{ id: second }] = (await pool.query('select id from orders where store_id = $1 and phone = $2', [s.storeId, '01733333333'])).rows
  assert.equal((await s.staff.call('PUT', `/stores/${s.handle}/notification-settings`, { settings: { order_delivered: true } })).status, 200)
  for (const next of ['confirmed', 'packed', 'courier', 'returned']) await tx(s.owner.id, (t) => t.execute(sql`select set_order_status(${second}::uuid, ${next})`))
  await s.storefrontOrder(1, '01734444444')
  const [{ id: third }] = (await pool.query('select id from orders where store_id = $1 and phone = $2', [s.storeId, '01734444444'])).rows
  for (const next of ['confirmed', 'packed', 'courier', 'delivered']) await tx(s.owner.id, (t) => t.execute(sql`select set_order_status(${third}::uuid, ${next})`))
  const kinds = (await s.list(s.staff)).items.map((n: { kind: string }) => n.kind)
  assert.ok(kinds.includes('order_returned'))
  assert.equal(kinds.filter((k: string) => k === 'order_delivered').length, 1)
  // The owner made those changes, so the owner is not told about them.
  assert.ok(!(await s.list(s.owner)).items.some((n: { kind: string }) => n.kind === 'order_returned'))
})

test('stock alerts fire when crossing the alert level and when running out, not on every sale', async () => {
  const s = await team()
  await pool.query('update product_variants set low_stock = 3 where id = $1', [s.variantId])
  await s.storefrontOrder(1) // 5 → 4: above the level
  assert.ok(!(await s.list(s.staff)).items.some((n: { kind: string }) => n.kind === 'low_stock'))
  await s.storefrontOrder(1, '01744444444') // 4 → 3: crossed
  await s.storefrontOrder(1, '01755555555') // 3 → 2: still low, no repeat
  let low = (await s.list(s.staff)).items.filter((n: { kind: string }) => n.kind === 'low_stock')
  assert.equal(low.length, 1)
  assert.deepEqual({ stock: low[0].data.stock, out: low[0].data.out, product: low[0].data.product, productId: low[0].data.productId }, { stock: 3, out: false, product: 'শাড়ি', productId: s.productId })
  await s.storefrontOrder(2, '01766666666') // 2 → 0
  low = (await s.list(s.staff)).items.filter((n: { kind: string }) => n.kind === 'low_stock')
  assert.equal(low.length, 2)
  assert.equal(low[0].data.out, true)
})

test('settings are personal, validated and respected', async () => {
  const s = await team()
  const staffSettings = (await s.staff.call('GET', `/stores/${s.handle}/notification-settings`)).json.settings
  assert.deepEqual(staffSettings, { order_new: true, checkout_draft: true, order_delivered: false, order_returned: true, low_stock: true })
  assert.equal((await s.owner.call('GET', `/stores/${s.handle}/notification-settings`)).json.settings.member_joined, true)
  assert.equal((await s.staff.call('PUT', `/stores/${s.handle}/notification-settings`, { settings: { sms: true } })).status, 400)
  assert.equal((await s.staff.call('PUT', `/stores/${s.handle}/notification-settings`, { settings: { order_new: 'no' } })).status, 400)
  // Staff cannot opt into what only managers receive; the switch is ignored.
  const saved = (await s.staff.call('PUT', `/stores/${s.handle}/notification-settings`, { settings: { order_new: false, member_joined: true } })).json.settings
  assert.equal(saved.order_new, false)
  assert.equal('member_joined' in saved, false)

  await s.storefrontOrder()
  assert.equal((await s.list(s.staff)).items.filter((n: { kind: string }) => n.kind === 'order_new').length, 0)
  assert.equal((await s.list(s.owner)).items.filter((n: { kind: string }) => n.kind === 'order_new').length, 1)
})

test('an abandoned order form is announced once, after the buyer left it for 15 minutes', async () => {
  const s = await team()
  await tx(null, (t) => t.execute(sql`select save_checkout_draft(${s.storeId}::uuid, null, '01799999999', 'Salma', 'Sylhet', 'শাড়ি')`))
  assert.ok(!(await s.list(s.staff)).items.some((n: { kind: string }) => n.kind === 'checkout_draft'))
  await pool.query(`update checkout_drafts set updated_at = now() - interval '20 minutes' where store_id = $1`, [s.storeId])
  const first = (await s.list(s.staff)).items.filter((n: { kind: string }) => n.kind === 'checkout_draft')
  assert.equal(first.length, 1)
  assert.deepEqual({ name: first[0].data.name, product: first[0].data.product }, { name: 'Salma', product: 'শাড়ি' })
  assert.equal((await s.list(s.owner)).items.filter((n: { kind: string }) => n.kind === 'checkout_draft').length, 1)
  assert.equal((await s.list(s.staff)).items.filter((n: { kind: string }) => n.kind === 'checkout_draft').length, 1)
})

test('reading marks only your own; other members and stores cannot see or touch them', async () => {
  const s = await team()
  await s.storefrontOrder()
  await s.storefrontOrder(1, '01788888888')
  const mine = await s.list(s.owner)
  assert.equal(mine.unread, 3)

  const outsider = await person('Outsider')
  assert.equal((await outsider.call('GET', `/stores/${s.handle}/notifications`)).status, 404)
  assert.equal((await outsider.call('POST', `/stores/${s.handle}/notifications/read`, {})).status, 404)
  // Even with the database queried directly, row-level security hides other people's notifications.
  assert.equal((await tx(s.staff.id, (t) => t.execute(sql`select count(*)::int as n from notifications where user_id = ${s.owner.id}::uuid`))).rows[0].n, 0)
  assert.equal((await tx(outsider.id, (t) => t.execute(sql`select count(*)::int as n from notifications`))).rows[0].n, 0)
  const staffTry = await tx(s.staff.id, (t) => t.execute(sql`update notifications set read_at = now() where user_id = ${s.owner.id}::uuid`))
  assert.equal(staffTry.rowCount, 0)
  await assert.rejects(tx(s.owner.id, (t) => t.execute(sql`update notifications set kind = 'low_stock' where user_id = ${s.owner.id}::uuid`)))
  await assert.rejects(tx(s.owner.id, (t) => t.execute(sql`insert into notifications (store_id, user_id, kind) values (${s.storeId}::uuid, ${s.owner.id}::uuid, 'order_new')`)))

  assert.equal((await s.owner.call('POST', `/stores/${s.handle}/notifications/read`, { ids: ['nope'] })).status, 400)
  assert.equal((await s.owner.call('POST', `/stores/${s.handle}/notifications/read`, { ids: [mine.items[0].id] })).json.unread, 2)
  assert.equal((await s.list(s.staff)).unread, 2)
  assert.equal((await s.owner.call('POST', `/stores/${s.handle}/notifications/read`, {})).json.unread, 0)
  assert.equal((await s.list(s.staff)).unread, 2)
})

test('pages back through older ones and forgets a member who leaves', async () => {
  const s = await team()
  await pool.query('delete from warehouse_stock where variant_id = $1', [s.variantId]) // untracked, so 32 orders fit
  for (let i = 0; i < 32; i++) await s.storefrontOrder(1, `0170000${String(i).padStart(4, '0')}`)
  const first = await s.list(s.staff)
  assert.equal(first.items.length, 30)
  assert.equal(first.more, true)
  const older = (await s.staff.call('GET', `/stores/${s.handle}/notifications?before=${first.items[29].id}`)).json
  assert.equal(older.items.length, 2)
  assert.equal(older.more, false)
  assert.equal(new Set([...first.items, ...older.items].map((n: { id: string }) => n.id)).size, 32)
  assert.equal((await s.staff.call('GET', `/stores/${s.handle}/notifications?before=nonsense`)).status, 400)

  assert.equal((await s.owner.call('DELETE', `/stores/${s.handle}/members/${s.staff.id}`)).status, 200)
  assert.equal((await pool.query('select count(*)::int as n from notifications where user_id = $1', [s.staff.id])).rows[0].n, 0)
})
