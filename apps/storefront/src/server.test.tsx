import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { after, before, test } from 'node:test'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { app as api } from '../../api/src/app.ts'
import { pool } from '../../api/src/db.ts'
import { app } from './server.tsx'

before(async () => {
  await pool.query('drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public')
  await migrate(drizzle(pool), { migrationsFolder: new URL('../../api/migrations', import.meta.url).pathname })
})
after(() => pool.end())

function client() {
  let cookie = ''
  return async (method: string, path: string, body?: unknown) => {
    const res = await api.request(`/api${path}`, { method, headers: { 'content-type': 'application/json', cookie }, body: body === undefined ? undefined : JSON.stringify(body) })
    const set = res.headers.get('set-cookie')
    if (set) cookie = set.split(';')[0]
    return { status: res.status, json: await res.json() as any }
  }
}

let count = 0
// A store with one published landing page selling a two-option product, 3 in stock of the first option.
async function publishedPage(status = 'active') {
  const call = client()
  const n = ++count
  await call('POST', '/auth/signup', { name: 'Owner', email: `sf${n}@example.com`, password: 'correct horse' })
  const handle = `sf-${n}`
  await call('POST', '/stores', { name: 'রঙিন শপ', handle })
  await call('PUT', `/stores/${handle}/settings`, { name: 'রঙিন শপ', deliveryInside: 60, deliveryOutside: 120 })
  const product = (await call('POST', `/stores/${handle}/products`, {
    name: 'পাঞ্জাবি', status, options: [{ name: 'সাইজ', values: ['M', 'L'] }],
    variants: [{ options: ['M'], price: 1200, stock: 3 }, { options: ['L'], price: 1300, stock: null }],
  })).json
  const page = (await call('POST', `/stores/${handle}/pages`, { title: 'ঈদ অফার' })).json
  const sections = page.draft.sections.map((s: any) => (s.type === 'order' ? { ...s, settings: { ...s.settings, product: product.id } } : s))
  await call('PUT', `/stores/${handle}/pages/${page.id}`, { title: page.title, handle: page.handle, draft: { version: 1, sections }, revision: page.revision })
  await call('POST', `/stores/${handle}/pages/${page.id}/publish`)
  const orderSection = sections.find((s: any) => s.type === 'order').id
  return { call, handle, product, page, orderSection, url: `/pages/${encodeURIComponent(page.handle)}` }
}

const visit = (store: string, path: string, init: RequestInit = {}) => app.request(path, { ...init, headers: { host: `${store}.localhost:8788`, ...init.headers } })
const order = (store: string, path: string, fields: Record<string, string>) =>
  visit(store, path, { method: 'POST', body: new URLSearchParams(fields), headers: { 'content-type': 'application/x-www-form-urlencoded' } })

test('a published page renders on its store’s address, and nowhere else', async () => {
  const s = await publishedPage()
  const res = await visit(s.handle, s.url)
  assert.equal(res.status, 200)
  const body = await res.text()
  assert.match(body, /^<!doctype html>/)
  assert.match(body, /পাঞ্জাবি/)
  assert.match(body, /৳১,২০০/)
  const csp = res.headers.get('content-security-policy')!
  assert.match(csp, /frame-ancestors 'none'/)
  const script = body.match(/<script>([\s\S]*?)<\/script>/)![1]
  assert.ok(csp.includes(`'sha256-${createHash('sha256').update(script).digest('base64')}'`), 'the page script is allowed by its hash, or browsers would block it')
  assert.equal((await visit('someone-else', s.url)).status, 404)
  assert.equal((await visit(s.handle, '/pages/missing')).status, 404)
})

test('an order is priced by the system, takes stock from a warehouse, and gets the next number', async () => {
  const s = await publishedPage()
  const m = s.product.variants[0].id
  const res = await order(s.handle, s.url, { section: s.orderSection, variant: m, quantity: '2', name: 'রাফি', phone: '০১৭১২-৩৪৫৬৭৮', address: 'বাসা ১২, রোড ৪, ধানমন্ডি', area: 'outside' })
  assert.equal(res.status, 303)
  assert.match(res.headers.get('location')!, /\/thanks\?order=1001&total=2520$/)
  const placed = await pool.query('select o.number, o.phone, o.subtotal, o.delivery_charge, o.total, o.warehouse_id is not null as has_warehouse, i.price, i.quantity, i.variant_label from orders o join order_items i on i.order_id = o.id')
  assert.deepEqual(placed.rows, [{ number: 1001, phone: '01712345678', subtotal: 2400, delivery_charge: 120, total: 2520, has_warehouse: true, price: 1200, quantity: 2, variant_label: 'M' }])
  assert.equal((await pool.query('select stock from product_variants where id = $1', [m])).rows[0].stock, 1)

  const second = await order(s.handle, s.url, { section: s.orderSection, variant: s.product.variants[1].id, quantity: '1', name: 'নুসরাত', phone: '01812345678', address: 'আগ্রাবাদ, চট্টগ্রাম', area: 'inside' })
  assert.match(second.headers.get('location')!, /order=1002&total=1360$/, 'untracked stock is never refused')
})

test('the buyer is told what to fix, and nothing is saved', async () => {
  const s = await publishedPage()
  const base = { section: s.orderSection, variant: s.product.variants[0].id, quantity: '1', name: 'রাফি', phone: '01712345678', address: 'বাসা ১২, ধানমন্ডি', area: 'inside' }
  const cases: [Record<string, string>, RegExp][] = [
    [{ phone: '12345' }, /সঠিক মোবাইল নম্বর দিন/],
    [{ name: '' }, /আপনার নাম লিখুন/],
    [{ address: 'x' }, /পুরো ঠিকানা লিখুন/],
    [{ quantity: '5' }, /স্টকে নেই/],
  ]
  for (const [change, message] of cases) {
    const res = await order(s.handle, s.url, { ...base, ...change })
    assert.equal(res.status, 422)
    const body = await res.text()
    assert.match(body, message)
    assert.match(body, /value="রাফি"|value=""/, 'what the buyer typed is kept')
  }
  assert.equal((await pool.query('select count(*)::int as n from orders')).rows[0].n, 2, 'only the earlier test’s orders')
})

test('draft products and unpublished pages take no orders', async () => {
  const s = await publishedPage('draft')
  const body = await (await visit(s.handle, s.url)).text()
  assert.doesNotMatch(body, /অর্ডার নিশ্চিত করুন/, 'the order form hides a draft product')
  const res = await order(s.handle, s.url, { section: s.orderSection, variant: s.product.variants[0].id, quantity: '1', name: 'x', phone: '01712345678', address: 'বাসা ১২, ধানমন্ডি', area: 'inside' })
  assert.equal(res.status, 404)

  const live = await publishedPage()
  await live.call('POST', `/stores/${live.handle}/pages/${live.page.id}/unpublish`)
  assert.equal((await visit(live.handle, live.url)).status, 404)
})

test('the seller sees landing page orders in their list, and other stores cannot', async () => {
  const s = await publishedPage()
  await order(s.handle, s.url, { section: s.orderSection, variant: s.product.variants[1].id, quantity: '1', name: 'সাদিয়া', phone: '01912345678', address: 'উত্তরা, ঢাকা', area: 'inside' })
  const list = await s.call('GET', `/stores/${s.handle}/orders`)
  assert.equal(list.status, 200)
  assert.deepEqual(list.json.items.map((o: any) => [o.number, o.customerName, o.total, o.source, o.items]), [[1001, 'সাদিয়া', 1360, 'landing_page', 'পাঞ্জাবি (L) × 1']])
  assert.deepEqual(list.json.counts, { new: 1 })
  assert.equal((await s.call('GET', `/stores/${s.handle}/orders?q=০১৯১২`)).json.items.length, 1, 'found by phone typed in Bangla digits')
  assert.equal((await s.call('GET', `/stores/${s.handle}/orders?q=%231001`)).json.items.length, 1, 'found by order number')

  const other = await publishedPage()
  assert.equal((await other.call('GET', `/stores/${s.handle}/orders`)).status, 404)
  assert.equal((await other.call('GET', `/stores/${other.handle}/orders`)).json.items.length, 0)
})

test('an order moves through its statuses, and cancelling or a return puts the stock back', async () => {
  const s = await publishedPage()
  const m = s.product.variants[0].id
  const stock = async () => (await pool.query('select stock from product_variants where id = $1', [m])).rows[0].stock
  const place = () => order(s.handle, s.url, { section: s.orderSection, variant: m, quantity: '1', name: 'রাফি', phone: '01712345678', address: 'বাসা ১২, ধানমন্ডি', area: 'inside' })
  await place()
  await place()
  assert.equal(await stock(), 1)
  const [second, first] = (await s.call('GET', `/stores/${s.handle}/orders`)).json.items
  const base = `/stores/${s.handle}/orders`
  const move = (o: any, status: string) => s.call('PATCH', `${base}/${o.id}`, { status })

  const detail = await s.call('GET', `${base}/${second.id}`)
  assert.deepEqual(detail.json.history, { total: 1, delivered: 0, returned: 0, cancelled: 0 }, 'the earlier order from this number')
  assert.equal(detail.json.page.title, 'ঈদ অফার')
  assert.deepEqual(detail.json.items.map((i: any) => [i.productName, i.variantLabel, i.price, i.quantity]), [['পাঞ্জাবি', 'M', 1200, 1]])

  assert.equal((await move(first, 'delivered')).json.error, 'statusNotAllowed', 'a new order cannot jump to delivered')
  assert.equal((await move(first, 'cancelled')).json.status, 'cancelled')
  assert.equal(await stock(), 2, 'cancelling puts it back')
  assert.equal((await move(first, 'confirmed')).status, 409, 'a cancelled order stays cancelled')

  for (const status of ['confirmed', 'packed', 'courier', 'returned']) assert.equal((await move(second, status)).json.status, status)
  assert.equal(await stock(), 3, 'a return puts it back once')
  assert.equal((await s.call('PATCH', `${base}/${second.id}`, { note: 'কাস্টমার ফোন ধরেননি' })).json.note, 'কাস্টমার ফোন ধরেননি')

  const other = await publishedPage()
  assert.equal((await other.call('PATCH', `/stores/${other.handle}/orders/${second.id}`, { status: 'cancelled' })).status, 404)
  assert.equal((await other.call('GET', `/stores/${other.handle}/orders/${second.id}`)).status, 404)
})

test('bots that fill the hidden field, and floods from one number, place no orders', async () => {
  const s = await publishedPage()
  const fields = { section: s.orderSection, variant: s.product.variants[1].id, quantity: '1', name: 'x', phone: '01612345678', address: 'বাসা ১২, ধানমন্ডি', area: 'inside' }
  const before = (await pool.query('select count(*)::int as n from orders')).rows[0].n
  const bot = await order(s.handle, s.url, { ...fields, website: 'http://spam.example' })
  assert.equal(bot.status, 303)
  assert.equal((await pool.query('select count(*)::int as n from orders')).rows[0].n, before)

  for (let i = 0; i < 5; i++) assert.equal((await order(s.handle, s.url, fields)).status, 303)
  const sixth = await order(s.handle, s.url, fields)
  assert.equal(sixth.status, 422)
  assert.match(await sixth.text(), /অনেকগুলো অর্ডার/)
})

test('the team types in an order from a chat, priced and stocked like a storefront order', async () => {
  const s = await publishedPage()
  const m = s.product.variants[0].id
  const base = `/stores/${s.handle}/orders`
  const fields = { variantId: m, quantity: 2, customerName: 'নুসরাত', phone: '+8801712345678', address: 'আগ্রাবাদ, চট্টগ্রাম', area: 'outside', source: 'messenger', note: 'বিকেলে ফোন দিতে বলেছেন' }
  const made = await s.call('POST', base, fields)
  assert.equal(made.status, 201)
  assert.deepEqual([made.json.number, made.json.phone, made.json.subtotal, made.json.deliveryCharge, made.json.total, made.json.source, made.json.note], [1001, '01712345678', 2400, 120, 2520, 'messenger', 'বিকেলে ফোন দিতে বলেছেন'])
  assert.equal((await pool.query('select stock from product_variants where id = $1', [m])).rows[0].stock, 1)
  assert.equal((await s.call('POST', base, { ...fields, quantity: 2 })).json.error, 'soldOut')
  assert.equal((await s.call('POST', base, { ...fields, phone: '123' })).json.error, 'phoneInvalid')
  assert.equal((await s.call('POST', base, { ...fields, source: 'landing_page' })).status, 400, 'only the storefront makes landing page orders')

  const other = await publishedPage()
  assert.equal((await other.call('POST', `/stores/${other.handle}/orders`, fields)).json.error, 'notOnSale', 'another store’s product cannot be sold')
})
