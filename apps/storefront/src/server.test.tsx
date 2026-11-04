import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { after, before, test } from 'node:test'
import { createContext, runInContext } from 'node:vm'
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
async function staffMember(token: string) {
  const call = client()
  await call('POST', '/auth/signup', { name: 'Staff', email: `sfstaff${++count}@example.com`, password: 'correct horse' })
  await call('POST', `/invites/${token}/accept`)
  return call
}
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
  const savedPage = await call('PUT', `/stores/${handle}/pages/${page.id}`, { title: page.title, handle: page.handle, draft: { version: 1, sections }, revision: page.revision })
  await call('POST', `/stores/${handle}/pages/${page.id}/publish`, { revision: savedPage.json.revision })
  const orderSection = sections.find((s: any) => s.type === 'order').id
  return { call, handle, product, page, orderSection, url: `/${encodeURIComponent(page.handle)}` }
}

const visit = (store: string, path: string, init: RequestInit = {}) => app.request(path, { ...init, headers: { host: `${store}.localhost:8788`, ...init.headers } })
const order = (store: string, path: string, fields: Record<string, string>) =>
  visit(store, path, { method: 'POST', body: new URLSearchParams({ checkout: randomUUID(), ...fields }), headers: { 'content-type': 'application/x-www-form-urlencoded' } })

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
  assert.match(res.headers.get('location')!, /\/thanks\?receipt=[0-9a-f-]{36}$/)
  assert.match(await (await visit(s.handle, res.headers.get('location')!)).text(), /৳২,৫২০/)
  const placed = await pool.query('select o.number, o.phone, o.subtotal, o.delivery_charge, o.total, o.warehouse_id is not null as has_warehouse, i.price, i.quantity, i.variant_label from orders o join order_items i on i.order_id = o.id')
  assert.deepEqual(placed.rows, [{ number: 1001, phone: '01712345678', subtotal: 2400, delivery_charge: 120, total: 2520, has_warehouse: true, price: 1200, quantity: 2, variant_label: 'M' }])
  assert.equal((await pool.query('select stock from product_variants where id = $1', [m])).rows[0].stock, 1)

  const second = await order(s.handle, s.url, { section: s.orderSection, variant: s.product.variants[1].id, quantity: '1', name: 'নুসরাত', phone: '01812345678', address: 'আগ্রাবাদ, চট্টগ্রাম', area: 'inside' })
  assert.match(await (await visit(s.handle, second.headers.get('location')!)).text(), /৳১,৩৬০/, 'untracked stock is never refused')
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

test('the store home and collections list only active products; unlisted ones open by link, drafts never', async () => {
  const s = await publishedPage()
  const make = async (name: string, status: string) => (await s.call('POST', `/stores/${s.handle}/products`, { name, status, variants: [{ options: [], price: 500, comparePrice: 700 }] })).json
  const unlisted = await make('গোপন অফার', 'unlisted')
  const draft = await make('খসড়া পণ্য', 'draft')
  await s.call('POST', `/stores/${s.handle}/collections`, { name: 'ঈদ', productIds: [s.product.id, unlisted.id, draft.id] })

  const home = await (await visit(s.handle, '/')).text()
  assert.match(home, /পাঞ্জাবি/)
  assert.doesNotMatch(home, /গোপন অফার|খসড়া পণ্য/)
  assert.match(home, /href="\/collections\/%E0%A6%88%E0%A6%A6"/, 'collections with active products are in the menu')
  await s.call('PUT', `/stores/${s.handle}/menu`, { items: [{ label: 'অফার', href: s.url }] })
  const menued = await (await visit(s.handle, '/')).text()
  assert.match(menued, />অফার<\/a>/)
  assert.doesNotMatch(menued, /href="\/collections\//, 'a seller’s menu replaces the automatic one')
  const collection = await (await visit(s.handle, '/collections/ঈদ')).text()
  assert.match(collection, /পাঞ্জাবি/)
  assert.doesNotMatch(collection, /গোপন অফার|খসড়া পণ্য/)

  const hidden = await visit(s.handle, `/products/${encodeURIComponent(unlisted.handle)}`)
  assert.equal(hidden.status, 200)
  const body = await hidden.text()
  assert.match(body, /<meta name="robots" content="noindex"/)
  assert.match(body, /<s>৳৭০০<\/s>/)
  assert.equal((await visit(s.handle, `/products/${encodeURIComponent(draft.handle)}`)).status, 404)
  assert.equal((await visit(s.handle, '/collections/missing')).status, 404)
})

test('a product page takes orders like a landing page, marked as from the website', async () => {
  const s = await publishedPage()
  const url = `/products/${encodeURIComponent(s.product.handle)}`
  assert.match(await (await visit(s.handle, url)).text(), /অর্ডার নিশ্চিত করুন/)
  const res = await order(s.handle, url, { section: 'buy', variant: s.product.variants[0].id, quantity: '1', name: 'রাফি', phone: '01712345678', address: 'বাসা ১২, ধানমন্ডি', area: 'inside' })
  assert.equal(res.status, 303)
  assert.match(await (await visit(s.handle, res.headers.get('location')!)).text(), /৳১,২৬০/)
  const [placed] = (await s.call('GET', `/stores/${s.handle}/orders`)).json.items
  assert.equal(placed.source, 'website')
  const bad = await order(s.handle, url, { section: 'buy', variant: s.product.variants[0].id, quantity: '1', name: '', phone: '01712345678', address: 'বাসা ১২, ধানমন্ডি', area: 'inside' })
  assert.equal(bad.status, 422)
})

test('a blocked number cannot order from the storefront, and repeat orders are marked as duplicates', async () => {
  const s = await publishedPage()
  const fields = { section: s.orderSection, variant: s.product.variants[1].id, quantity: '1', name: 'x', phone: '01512345678', address: 'বাসা ১২, ধানমন্ডি', area: 'inside' }
  await order(s.handle, s.url, fields)
  await order(s.handle, s.url, fields)
  const [second, first] = (await s.call('GET', `/stores/${s.handle}/orders`)).json.items
  assert.deepEqual([first.duplicate, second.duplicate], [true, true])
  assert.equal((await s.call('GET', `/stores/${s.handle}/orders/${first.id}`)).json.duplicate, true)

  assert.equal((await s.call('POST', `/stores/${s.handle}/blocked`, { phone: '০১৫১২-৩৪৫৬৭৮', reason: 'দুবার পার্সেল ফেরত' })).status, 201)
  assert.deepEqual((await s.call('GET', `/stores/${s.handle}/blocked`)).json.map((b: any) => [b.phone, b.reason]), [['01512345678', 'দুবার পার্সেল ফেরত']])
  const refused = await order(s.handle, s.url, fields)
  assert.equal(refused.status, 422)
  assert.match(await refused.text(), /দোকানে ফোন করুন/)
  assert.equal((await s.call('GET', `/stores/${s.handle}/orders/${first.id}`)).json.blocked, true)
  const typed = await s.call('POST', `/stores/${s.handle}/orders`, { variantId: s.product.variants[1].id, quantity: 1, customerName: 'x', phone: '01512345678', address: 'বাসা', area: 'inside', source: 'phone' })
  assert.equal(typed.status, 201, 'the team may still type in an order they decided to take')

  const other = await publishedPage()
  assert.equal((await other.call('GET', `/stores/${s.handle}/blocked`)).status, 404)
  assert.deepEqual((await other.call('GET', `/stores/${other.handle}/blocked`)).json, [])
  await s.call('DELETE', `/stores/${s.handle}/blocked/01512345678`)
  assert.equal((await order(s.handle, s.url, fields)).status, 303)
})

test('customers are grouped by phone number, with what they bought and returned', async () => {
  const s = await publishedPage()
  const fields = { section: s.orderSection, variant: s.product.variants[1].id, quantity: '1', name: 'সাদিয়া', phone: '01312345678', address: 'উত্তরা, ঢাকা', area: 'inside' }
  await order(s.handle, s.url, fields)
  await order(s.handle, s.url, { ...fields, name: 'সাদিয়া ইসলাম' })
  await order(s.handle, s.url, { ...fields, phone: '01412345678', name: 'রাফি' })
  const base = `/stores/${s.handle}/orders`
  const [, , first] = (await s.call('GET', base)).json.items
  for (const status of ['confirmed', 'packed', 'courier', 'delivered']) await s.call('PATCH', `${base}/${first.id}`, { status })

  const list = (await s.call('GET', `/stores/${s.handle}/customers`)).json.items
  assert.deepEqual(list.map((c: any) => [c.phone, c.name, c.orders, c.delivered, c.spent]), [['01412345678', 'রাফি', 1, 0, 0], ['01312345678', 'সাদিয়া ইসলাম', 2, 1, 1360]])
  assert.equal((await s.call('GET', `/stores/${s.handle}/customers?q=০১৩১২`)).json.items.length, 1)
  const other = await publishedPage()
  assert.equal((await other.call('GET', `/stores/${s.handle}/customers`)).status, 404)
})

test('home sums the last 14 days of real orders, leaving cancelled ones out', async () => {
  const s = await publishedPage()
  const empty = (await s.call('GET', `/stores/${s.handle}/summary`)).json
  assert.equal(empty.days.length, 14)
  assert.deepEqual(empty.setup, { products: 1, livePages: 1, orders: 0 })
  const fields = { section: s.orderSection, variant: s.product.variants[1].id, quantity: '1', name: 'x', phone: '01312345679', address: 'উত্তরা, ঢাকা', area: 'inside' }
  await order(s.handle, s.url, fields)
  await order(s.handle, s.url, { ...fields, phone: '01312345670' })
  const [latest] = (await s.call('GET', `/stores/${s.handle}/orders`)).json.items
  await s.call('PATCH', `/stores/${s.handle}/orders/${latest.id}`, { status: 'cancelled' })
  const summary = (await s.call('GET', `/stores/${s.handle}/summary`)).json
  assert.deepEqual([summary.days[13].sales, summary.days[13].orders], [1360, 1])
  assert.deepEqual(summary.statuses, { new: 1, cancelled: 1 })
  assert.equal(summary.setup.orders, 2)
})

test('a buyer who types a number but does not finish shows up to call, and leaves the list once they order', async () => {
  const s = await publishedPage()
  const draft = (fields: Record<string, string>) => visit(s.handle, '/drafts', { method: 'POST', body: new URLSearchParams({ checkout: randomUUID(), ...fields }), headers: { 'content-type': 'application/x-www-form-urlencoded' } })
  assert.equal((await draft({ phone: '0171', name: 'x' })).status, 204)
  await draft({ phone: '01812345671', name: 'রাফি', address: 'মিরপুর', product: 'পাঞ্জাবি' })
  await draft({ phone: '01812345671', name: 'রাফি আহমেদ', address: 'মিরপুর ১০', product: 'পাঞ্জাবি' })
  const base = `/stores/${s.handle}/drafts`
  const open = (await s.call('GET', base)).json
  assert.deepEqual(open.items.map((d: any) => [d.phone, d.name, d.address, d.productName]), [['01812345671', 'রাফি আহমেদ', 'মিরপুর ১০', 'পাঞ্জাবি']], 'invalid numbers are not saved, and a later save replaces the first')

  await order(s.handle, s.url, { section: s.orderSection, variant: s.product.variants[1].id, quantity: '1', name: 'রাফি', phone: '01812345671', address: 'মিরপুর ১০, ঢাকা', area: 'inside' })
  assert.equal((await s.call('GET', base)).json.items.length, 0)
  assert.equal((await s.call('GET', `${base}?status=ordered`)).json.items.length, 1)

  await draft({ phone: '01812345672', name: 'নুসরাত' })
  const [waiting] = (await s.call('GET', base)).json.items
  assert.equal((await s.call('PATCH', `${base}/${waiting.id}`, { status: 'dismissed' })).status, 200)
  assert.deepEqual((await s.call('GET', base)).json.counts, { ordered: 1, dismissed: 1 })

  const other = await publishedPage()
  assert.equal((await other.call('GET', base)).status, 404)
  assert.equal((await other.call('PATCH', `/stores/${other.handle}/drafts/${waiting.id}`, { status: 'open' })).status, 404)
})

test('repeat sales lists buyers delivered long enough ago, until someone calls them or they order again', async () => {
  const s = await publishedPage()
  const fields = { section: s.orderSection, variant: s.product.variants[1].id, quantity: '1', name: 'সাদিয়া', phone: '01712340001', address: 'উত্তরা, ঢাকা', area: 'inside' }
  await order(s.handle, s.url, fields)
  await order(s.handle, s.url, { ...fields, phone: '01712340002', name: 'রাফি' })
  const base = `/stores/${s.handle}/orders`
  for (const o of (await s.call('GET', base)).json.items) for (const status of ['confirmed', 'packed', 'courier', 'delivered']) await s.call('PATCH', `${base}/${o.id}`, { status })
  const repeat = `/stores/${s.handle}/repeat?days=30`
  assert.deepEqual((await s.call('GET', repeat)).json, [], 'delivered today is not due yet')

  await pool.query(`update orders set updated_at = now() - interval '40 days' where phone in ('01712340001', '01712340002')`)
  const due = (await s.call('GET', repeat)).json
  assert.deepEqual(due.map((d: any) => [d.phone, d.product, d.deliveredOrders, d.spent]).sort(), [['01712340001', 'পাঞ্জাবি', 1, 1360], ['01712340002', 'পাঞ্জাবি', 1, 1360]])

  assert.equal((await s.call('POST', `/stores/${s.handle}/calls`, { phone: '01712340001', outcome: 'later', note: 'বেতন পেলে নেবেন' })).status, 201)
  assert.deepEqual((await s.call('GET', repeat)).json.map((d: any) => d.phone), ['01712340002'], 'a call hides them for a while')
  const [call] = (await s.call('GET', `/stores/${s.handle}/calls`)).json
  assert.deepEqual([call.phone, call.outcome, call.note, call.by], ['01712340001', 'later', 'বেতন পেলে নেবেন', 'Owner'])

  await order(s.handle, s.url, { ...fields, phone: '01712340002', name: 'রাফি' })
  assert.deepEqual((await s.call('GET', repeat)).json, [], 'ordering again takes them off the list')
  assert.equal((await s.call('POST', `/stores/${s.handle}/calls`, { phone: '01712340001', outcome: 'maybe' })).status, 400)

  const other = await publishedPage()
  assert.equal((await other.call('GET', repeat)).status, 404)
  assert.equal((await other.call('POST', `/stores/${s.handle}/calls`, { phone: '01712340001', outcome: 'later' })).status, 404)
})

test('profit counts delivered orders at the buying price of the day of sale, less expenses, for owners only', async () => {
  const s = await publishedPage()
  const shop = `/stores/${s.handle}`
  const m = s.product.variants[0]
  await s.call('PUT', `${shop}/products/${s.product.id}`, { name: 'পাঞ্জাবি', options: [{ name: 'সাইজ', values: ['M', 'L'] }], variants: [{ id: m.id, options: ['M'], price: 1200, cost: 800, stock: 3 }, { id: s.product.variants[1].id, options: ['L'], price: 1300, stock: null }] })
  await order(s.handle, s.url, { section: s.orderSection, variant: m.id, quantity: '2', name: 'রাফি', phone: '01712349991', address: 'বাসা ১২, ধানমন্ডি', area: 'outside' })
  await order(s.handle, s.url, { section: s.orderSection, variant: s.product.variants[1].id, quantity: '1', name: 'নুসরাত', phone: '01712349992', address: 'বাসা ১২, ধানমন্ডি', area: 'inside' })
  const [returned, delivered] = (await s.call('GET', `${shop}/orders`)).json.items
  for (const status of ['confirmed', 'packed', 'courier', 'delivered']) await s.call('PATCH', `${shop}/orders/${delivered.id}`, { status })
  for (const status of ['confirmed', 'packed', 'courier', 'returned']) await s.call('PATCH', `${shop}/orders/${returned.id}`, { status })
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Dhaka' })
  assert.equal((await s.call('POST', `${shop}/expenses`, { spentOn: today, category: 'ads', amount: 300, note: 'ফেসবুক বিজ্ঞাপন' })).status, 201)
  assert.equal((await s.call('POST', `${shop}/expenses`, { spentOn: today, category: 'gifts', amount: 300 })).status, 400)

  // A later change to the buying price must not rewrite the profit of a sale already made.
  await s.call('PUT', `${shop}/products/${s.product.id}`, { name: 'পাঞ্জাবি', options: [{ name: 'সাইজ', values: ['M', 'L'] }], variants: [{ id: m.id, options: ['M'], price: 1200, cost: 1100, stock: 3 }, { id: s.product.variants[1].id, options: ['L'], price: 1300, stock: null }] })
  const a = (await s.call('GET', `${shop}/analytics?days=30`)).json
  assert.deepEqual([a.revenue, a.cost, a.expenses, a.profit, a.delivered, a.returned, a.missingCost], [2400, 1600, 300, 500, 1, 1, 0])
  assert.deepEqual(a.top, [{ name: 'পাঞ্জাবি', quantity: 2, revenue: 2400 }])
  assert.equal(a.series.length, 30)
  assert.equal(a.series[29].profit, 500)

  const invite = await s.call('POST', `${shop}/invites`, { role: 'staff' })
  const staffCall = await staffMember(invite.json.token)
  assert.equal((await staffCall('GET', `${shop}/analytics`)).status, 403)
  assert.equal((await staffCall('GET', `${shop}/expenses`)).status, 403)
  const other = await publishedPage()
  assert.equal((await other.call('GET', `${shop}/analytics`)).status, 404)
})

test('a coupon is priced by the database, counts its uses, and stops at its limit', async () => {
  const s = await publishedPage()
  const shop = `/stores/${s.handle}`
  assert.equal((await s.call('POST', `${shop}/discounts`, { code: 'eid 10', kind: 'percent', value: 10 })).json.error, 'couponCodeInvalid')
  assert.equal((await s.call('POST', `${shop}/discounts`, { code: 'eid10', kind: 'percent', value: 110 })).status, 400)
  const eid = (await s.call('POST', `${shop}/discounts`, { code: 'eid10', kind: 'percent', value: 10, maxUses: 1 })).json
  assert.equal(eid.code, 'EID10')
  assert.equal((await s.call('POST', `${shop}/discounts`, { code: 'EID10', kind: 'amount', value: 50 })).json.error, 'couponCodeTaken')
  await s.call('POST', `${shop}/discounts`, { code: 'BIG', kind: 'amount', value: 200, minSubtotal: 5000 })

  const fields = { section: s.orderSection, variant: s.product.variants[1].id, quantity: '1', name: 'রাফি', phone: '01711110001', address: 'বাসা ১২, ধানমন্ডি', area: 'inside' }
  const used = await order(s.handle, s.url, { ...fields, coupon: 'eid10' })
  assert.match(await (await visit(s.handle, used.headers.get('location')!)).text(), /৳১,২৩০/, '1300 − 130 + 60')
  const again = await order(s.handle, s.url, { ...fields, phone: '01711110002', coupon: 'EID10' })
  assert.equal(again.status, 422, 'the one use is gone')
  assert.match(await again.text(), /কুপন কোডটি চলছে না/)
  assert.equal((await order(s.handle, s.url, { ...fields, phone: '01711110003', coupon: 'BIG' })).status, 422, 'below the minimum')
  assert.equal((await order(s.handle, s.url, { ...fields, phone: '01711110004', coupon: '' })).status, 303)

  const [first] = (await s.call('GET', `${shop}/orders`)).json.items.slice(-1)
  const detail = (await s.call('GET', `${shop}/orders/${first.id}`)).json
  assert.deepEqual([detail.subtotal, detail.discount, detail.discountCode, detail.deliveryCharge, detail.total], [1300, 130, 'EID10', 60, 1230])
  assert.equal((await s.call('GET', `${shop}/discounts`)).json.find((d: any) => d.code === 'EID10').uses, 1)
  await s.call('PATCH', `${shop}/discounts/${eid.id}`, { active: false })
  const other = await publishedPage()
  assert.equal((await other.call('GET', `${shop}/discounts`)).status, 404)
  assert.equal((await other.call('PATCH', `/stores/${other.handle}/discounts/${eid.id}`, { active: true })).status, 404)
})

test('a store’s pixels load on its pages, are allowed by the page’s own policy, and report the order on thanks', async () => {
  const plain = await publishedPage()
  assert.doesNotMatch(await (await visit(plain.handle, plain.url)).text(), /fbq\(|ttq\./, 'no pixels unless the store sets them')

  const s = await publishedPage()
  await s.call('PUT', `/stores/${s.handle}/tracking`, { metaPixel: '123456789012345', tiktokPixel: 'C1ABC2DEF3' })
  const res = await visit(s.handle, s.url)
  const body = await res.text()
  assert.match(body, /fbq\('init','123456789012345'\);fbq\('track','PageView'\)/)
  assert.match(body, /ttq\.load\('C1ABC2DEF3'\)/)
  const csp = res.headers.get('content-security-policy')!
  assert.match(csp, /https:\/\/connect\.facebook\.net/)
  for (const [, script] of body.matchAll(/<script>([\s\S]*?)<\/script>/g)) {
    assert.ok(csp.includes(`'sha256-${createHash('sha256').update(script).digest('base64')}'`), 'every inline script is allowed by hash')
  }
  const placed = await order(s.handle, s.url, { section: s.orderSection, variant: s.product.variants[1].id, quantity: '1', name: 'Buyer', phone: '01712345678', address: 'Dhaka test address', area: 'inside' })
  const thanks = await (await visit(s.handle, placed.headers.get('location')!)).text()
  assert.match(thanks, /fbq\('track','Purchase',\{value:1360,currency:'BDT'\},\{eventID:'[0-9a-f-]{36}'\}\)/)
  assert.match(thanks, /ttq\.track\('PlaceAnOrder',\{value:1360,currency:'BDT'\},\{event_id:'[0-9a-f-]{36}'\}\)/)
  assert.doesNotMatch(await (await visit(s.handle, `${s.url}/thanks`)).text(), /Purchase/, 'no order event without an order')
  const memory = new Map<string, string>()
  const browser: any = {
    document: { createElement: () => ({}), getElementsByTagName: () => [{ parentNode: { insertBefore() {} } }] },
    sessionStorage: { getItem: (key: string) => memory.get(key), setItem: (key: string, value: string) => memory.set(key, value) },
  }
  browser.window = browser
  const runtime = createContext(browser)
  const script = thanks.match(/<script>([\s\S]*?)<\/script>/)![1]
  runInContext(script, runtime)
  runInContext(script, runtime)
  assert.equal(browser.fbq.queue.filter((args: any) => args[1] === 'Purchase').length, 1, 'refresh does not queue another Meta purchase in this session')
  assert.equal(browser.ttq.filter((args: any) => args[1] === 'PlaceAnOrder').length, 1, 'refresh does not queue another TikTok order in this session')

})

test('a checkout retry returns one receipt, takes stock and counts its coupon only once', async () => {
  const s = await publishedPage()
  assert.equal((await s.call('POST', `/stores/${s.handle}/discounts`, { code: 'ONCE', kind: 'amount', value: 100, maxUses: 1 })).status, 201)
  const fields = { checkout: randomUUID(), section: s.orderSection, variant: s.product.variants[0].id, quantity: '3', name: 'Buyer', phone: '01712345678', address: 'Dhaka test address', area: 'inside', coupon: 'ONCE' }
  const [a, b] = await Promise.all([order(s.handle, s.url, fields), order(s.handle, s.url, fields)])
  assert.equal(a.status, 303)
  assert.equal(b.status, 303)
  assert.equal(a.headers.get('location'), b.headers.get('location'))
  assert.equal((await pool.query('select count(*)::int as n from orders where store_id = (select id from stores where handle = $1)', [s.handle])).rows[0].n, 1)
  assert.equal((await pool.query('select stock from product_variants where id = $1', [fields.variant])).rows[0].stock, 0)
  assert.equal((await pool.query('select uses from discounts where store_id = (select id from stores where handle = $1)', [s.handle])).rows[0].uses, 1)
  const retried = await order(s.handle, s.url, fields)
  assert.equal(retried.status, 303, 'replay still succeeds after all stock is taken')
  assert.equal((await order(s.handle, s.url, { ...fields, quantity: '1' })).status, 422, 'a used token cannot place a different order')
})

test('confirmation amounts come from a store-scoped receipt, never URL parameters', async () => {
  const s = await publishedPage()
  const fields = { checkout: randomUUID(), section: s.orderSection, variant: s.product.variants[0].id, quantity: '1', name: 'Buyer', phone: '01712345678', address: 'Dhaka test address', area: 'inside' }
  const page = await (await visit(s.handle, s.url)).text()
  assert.match(page, /name="checkout" value="[0-9a-f-]{36}"/)
  const placed = await order(s.handle, s.url, fields)
  const receiptUrl = placed.headers.get('location')!
  const confirmed = await (await visit(s.handle, `${receiptUrl}&order=9999&total=1`)).text()
  assert.match(confirmed, /৳১,২৬০/)
  assert.doesNotMatch(confirmed, /QA|01712345678|Dhaka test address/)
  const other = await publishedPage()
  const leaked = await (await visit(other.handle, `${other.url}/thanks?receipt=${fields.checkout}`)).text()
  assert.doesNotMatch(leaked, /অর্ডার নম্বর|পণ্য হাতে পেয়ে দেবেন/)
  const fabricated = await (await visit(s.handle, `${s.url}/thanks?order=9999&total=999999`)).text()
  assert.doesNotMatch(fabricated, /অর্ডার নম্বর|পণ্য হাতে পেয়ে দেবেন|Purchase/)
  assert.equal((await order(s.handle, s.url, { ...fields, checkout: 'invalid' })).status, 422)
  const { tx } = await import('../../api/src/db.ts')
  const { sql } = await import('drizzle-orm')
  assert.equal((await tx(null, (t) => t.execute(sql`select * from checkout_receipts`))).rowCount, 0, 'anonymous direct reads are hidden by RLS')
  const otherUser = (await other.call('GET', '/me')).json.user.id
  assert.equal((await tx(otherUser, (t) => t.execute(sql`select * from checkout_receipts where token = ${fields.checkout}::uuid`))).rowCount, 0, 'another store member cannot read the receipt row')

})

test('short campaign URLs preserve legacy links, checkout posts, and receipt redirects', async () => {
  const s = await publishedPage()
  const legacy = `/pages/${encodeURIComponent(s.page.handle)}`
  const redirected = await visit(s.handle, `${legacy}?utm_source=qa`)
  assert.equal(redirected.status, 308)
  assert.equal(redirected.headers.get('location'), `${s.url}?utm_source=qa`)
  const placed = await order(s.handle, legacy, { section: s.orderSection, variant: s.product.variants[0].id, quantity: '1', name: 'Buyer', phone: '01712345678', address: 'Dhaka test address', area: 'inside' })
  assert.equal(placed.status, 303)
  assert.ok(placed.headers.get('location')!.startsWith(`${s.url}/thanks?receipt=`))
  const receipt = new URL(placed.headers.get('location')!, 'http://test').search
  const oldThanks = await visit(s.handle, `${legacy}/thanks${receipt}`)
  assert.equal(oldThanks.headers.get('location'), `${s.url}/thanks${receipt}`)
  assert.equal((await visit(s.handle, '/api')).status, 404)
  assert.equal((await visit(s.handle, '/products')).status, 404)
  assert.equal((await visit(s.handle, '/missing-page')).status, 404)
  assert.equal((await visit('media', s.url)).status, 404)
  assert.equal((await visit('nested.store', s.url)).status, 404)
  assert.equal((await visit('healthcheck', '/_health')).status, 200)
  const page = await (await visit(s.handle, s.url)).text()
  assert.match(page, /rel="canonical"/)
  assert.ok(page.includes(`action="${s.url}"`))
})

test('a seller’s own domain shows their store through the domains proxy, and becomes the main address once live', async () => {
  const s = await publishedPage()
  await s.call('PUT', `/stores/${s.handle}/domain`, { domain: 'www.rongin-shop.com' })
  const proxied = (path: string, host: string, init: RequestInit = {}) =>
    app.request(path, { ...init, headers: { host: 'domains.localhost', 'x-store-host': host, ...init.headers } })

  const page = await proxied(s.url, 'rongin-shop.com')
  assert.equal(page.status, 200)
  assert.match(await page.text(), new RegExp(`<link rel="canonical" href="https://rongin-shop.com${s.url}"`))
  const www = await proxied(`${s.url}?x=1`, 'www.rongin-shop.com')
  assert.deepEqual([www.status, www.headers.get('location')], [301, `https://rongin-shop.com${s.url}?x=1`])
  assert.equal((await proxied(s.url, 'not-a-seller.com')).status, 404)

  assert.equal((await app.request('/_domains/allowed?domain=www.rongin-shop.com')).status, 200, 'the proxy may get a certificate')
  assert.equal((await app.request('/_domains/allowed?domain=not-a-seller.com')).status, 404, 'strangers’ domains get none')

  assert.equal((await visit(s.handle, s.url)).status, 200, 'the uddokta address keeps working until the domain is live')
  await pool.query(`update stores set domain_live_at = now() where handle = '${s.handle}'`)
  const moved = await visit(s.handle, s.url)
  assert.deepEqual([moved.status, moved.headers.get('location')], [302, `https://rongin-shop.com${s.url}`])
  const posted = await order(s.handle, s.url, { section: s.orderSection, variant: s.product.variants[0].id, name: 'ক্রেতা', phone: '01711111111', address: 'বাসা ১২, রোড ৪, ধানমন্ডি', area: 'inside', quantity: '1' })
  assert.match(posted.headers.get('location') ?? '', /^\/[^/].*thanks\?receipt=/, 'an open checkout form still submits on the old address and gets its receipt')
})
