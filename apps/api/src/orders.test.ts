import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { emptyOrderFilters, readOrderFilters, orderFilterParams } from 'storefront/order-filters'
import { app } from './app.ts'
import { pool, tx } from './db.ts'
import { csvCell } from './order-query.ts'
import { orderViews } from './schema.ts'

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
    const bytes = new Uint8Array(await response.clone().arrayBuffer())
    const text = await response.text()
    return { status: response.status, headers: response.headers, text, bytes, json: response.headers.get('content-type')?.includes('json') ? JSON.parse(text) : null }
  }
}
let counter = 0
async function owner() {
  const call = client()
  await call('POST', '/auth/signup', { name: 'Owner', email: `orders-${++counter}@example.com`, password: 'correct horse' })
  const userId = (await call('GET', '/me')).json.user.id as string
  const handle = `order-shop-${counter}`
  const store = (await call('POST', '/stores', { name: 'Shop', handle })).json
  const product = (await call('POST', `/stores/${handle}/products`, { name: 'পণ্য, "এক"', variants: [{ options: [], price: 150 }] })).json
  const create = async (source = 'phone', name = 'Customer') => {
    const result = await call('POST', `/stores/${handle}/orders`, { variantId: product.variants[0].id, quantity: 1, customerName: name, phone: '01712345678', address: 'Dhaka, Road "4"', area: 'inside', source })
    assert.equal(result.status, 201)
    return result.json
  }
  return { call, userId, storeId: store.id as string, handle, base: `/stores/${handle}/orders`, views: `/stores/${handle}/order-views`, create }
}
// Parse independently to verify fields containing commas, quotes and newlines.
function parseCsv(input: string) {
  const rows: string[][] = []
  let row: string[] = [], cell = '', quoted = false
  const text = input.replace(/^\uFEFF/, '')
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === '"') { if (quoted && text[i + 1] === '"') { cell += '"'; i++ } else quoted = !quoted }
    else if (ch === ',' && !quoted) { row.push(cell); cell = '' }
    else if (ch === '\r' && text[i + 1] === '\n' && !quoted) { row.push(cell); rows.push(row); row = []; cell = ''; i++ }
    else cell += ch
  }
  if (cell || row.length) { row.push(cell); rows.push(row) }
  assert.equal(quoted, false)
  return rows
}

test('filters validate calendar dates, normalize URLs and keep saved rolling periods relative', () => {
  for (const input of [{ from: '2026-02-30' }, { from: '2026-11-06', to: '2026-11-05' }, { from: '0000-01-01' }, { source: 'bad' }, { status: 'bad' }, { period: 'bad' }, { q: {} }]) assert.equal(readOrderFilters(input), null)
  assert.equal(readOrderFilters({ from: '2024-02-29' })?.period, 'custom')
  const relative = readOrderFilters({ period: 'today', from: '2020-01-01' })!
  assert.equal(relative.from, '')
  assert.equal(orderFilterParams(relative).toString(), 'period=today')
  assert.deepEqual(readOrderFilters(Object.fromEntries(orderFilterParams(relative))), relative)
})

test('list, status counts and CSV agree at Bangladesh date boundaries', async () => {
  const s = await owner()
  const before = await s.create(), start = await s.create(), end = await s.create(), after = await s.create(), messenger = await s.create('messenger')
  for (const [id, at] of [[before.id, '2026-11-04T17:59:59.999Z'], [start.id, '2026-11-04T18:00:00Z'], [end.id, '2026-11-05T17:59:59.999Z'], [after.id, '2026-11-05T18:00:00Z'], [messenger.id, '2026-11-05T12:00:00Z']]) await pool.query('update orders set created_at=$2 where id=$1', [id, at])
  await s.call('PATCH', `${s.base}/${end.id}`, { status: 'hold' })
  const filter = '?from=2026-11-05&to=2026-11-05&source=phone&status=hold'
  const list = await s.call('GET', s.base + filter)
  assert.equal(list.status, 200)
  assert.deepEqual(list.json.items.map((o: any) => o.id), [end.id])
  assert.deepEqual(list.json.counts, { new: 1, hold: 1 })
  const csv = await s.call('GET', `${s.base}/export${filter}&lang=en`)
  assert.equal(csv.status, 200)
  const rows = parseCsv(csv.text)
  assert.equal(rows.length, 2)
  assert.equal(rows[1][0], String(end.number))
  assert.equal(rows[1][13], '2026-11-05 23:59:59')
  assert.equal((await s.call('GET', s.base + '?q=99999999999999999999999')).status, 200)
  for (const query of ['from=2026-02-30', 'from=2026-11-06&to=2026-11-05', 'source=bad', 'status=bad', 'period=bad', 'offset=-1', 'offset=1.5']) assert.equal((await s.call('GET', `${s.base}?${query}`)).status, 400, query)
  assert.equal((await s.call('GET', `${s.base}/export?from=invalid`)).status, 400)
})

test('today, seven-day and thirty-day presets resolve at request time in Bangladesh', async () => {
  const s = await owner()
  for (const days of [0, 5, 8, 31, -1]) {
    const order = await s.create()
    await pool.query("update orders set created_at = ((now() at time zone 'Asia/Dhaka')::date::timestamp + interval '12 hours' - $2::int * interval '1 day') at time zone 'Asia/Dhaka' where id=$1", [order.id, days])
  }
  for (const [period, count] of [['today', 1], ['7d', 2], ['30d', 3]] as const) {
    const result = await s.call('GET', `${s.base}?period=${period}`)
    assert.equal(result.status, 200)
    assert.equal(result.json.items.length, count)
    assert.equal(result.json.counts.new, count)
  }
})

test('CSV exports all pages and preserves text phones, Bangla, quotes and formula safety', async () => {
  const s = await owner()
  for (let i = 0; i < 51; i++) await s.create('phone', i === 0 ? '=HYPERLINK("bad")' : `Customer ${i}`)
  const newest = (await s.call('GET', s.base)).json.items[0]
  await s.call('PATCH', `${s.base}/${newest.id}`, { note: 'line one\n@formula, "quote"' })
  const list = await s.call('GET', s.base + '?source=phone')
  assert.equal(list.json.items.length, 50)
  assert.equal(list.json.hasMore, true)
  assert.equal((await s.call('GET', s.base + '?source=phone&offset=50')).json.items.length, 1)
  const csv = await s.call('GET', s.base + '/export?source=phone&lang=en')
  assert.equal(csv.status, 200)
  assert.match(csv.headers.get('content-type')!, /text\/csv; charset=utf-8/)
  assert.match(csv.headers.get('content-disposition')!, /attachment/)
  assert.equal(csv.headers.get('cache-control'), 'no-store')
  assert.deepEqual([...csv.bytes.slice(0, 3)], [0xEF, 0xBB, 0xBF])
  const rows = parseCsv(csv.text)
  assert.equal(rows.length, 52)
  assert.ok(rows.slice(1).every((r) => r.length === 14 && r[4] === "'01712345678"))
  assert.ok(rows.some((r) => r[3] === "'=HYPERLINK(\"bad\")"))
  assert.ok(rows.some((r) => r[7] === 'পণ্য, "এক" × 1'))
  assert.ok(rows.some((r) => r[12] === 'line one\n@formula, "quote"'))
  assert.ok(rows.slice(1).every((r) => r[11] === '220'))
  for (const attack of ['=1+1', '+1+1', '-1+1', '@SUM(1)', '\t=1', '\r=1', '  =1', '\ntext']) assert.equal(parseCsv(csvCell(attack) + '\r\n')[0][0], "'" + attack)
  const other = await owner()
  assert.equal((await other.call('GET', `${s.base}/export`)).status, 404)
  assert.equal((await client()('GET', `${s.base}/export`)).status, 401)
})

test('oversized exports are refused without silent truncation', async () => {
  const s = await owner()
  await pool.query("insert into orders (store_id,number,customer_name,phone,address,area,subtotal,delivery_charge,total,source) select $1, 2000+n, 'Bulk fixture', '01712345678', 'Dhaka', 'inside', 150, 70, 220, 'phone' from generate_series(1,10001) n", [s.storeId])
  const response = await s.call('GET', `${s.base}/export`)
  assert.equal(response.status, 409)
  assert.equal(response.json.error, 'orderExportLimit')
  const narrower = await s.call('GET', `${s.base}/export?source=messenger`)
  assert.equal(narrower.status, 200)
  assert.equal(parseCsv(narrower.text).length, 1)
})

test('personal saved views support creation, updates, reload and removal with validated filters', async () => {
  const s = await owner()
  const made = await s.call('POST', s.views, { name: 'Today to confirm', filters: { period: 'today', status: 'new', source: 'phone' } })
  assert.equal(made.status, 201)
  assert.equal(made.json.filters.period, 'today')
  assert.equal(made.json.filters.from, '')
  assert.deepEqual((await s.call('GET', s.views)).json, [made.json])
  assert.equal((await s.call('POST', s.views, { name: ' TODAY TO CONFIRM ', filters: {} })).json.error, 'orderViewNameTaken')
  const changed = await s.call('PUT', `${s.views}/${made.json.id}`, { name: 'Last week', filters: { period: '7d', status: 'confirmed' } })
  assert.equal(changed.status, 200)
  assert.equal(changed.json.filters.period, '7d')
  assert.equal((await s.call('GET', s.views)).json[0].name, 'Last week')
  for (const input of [{ name: '', filters: {} }, { name: 'X', filters: { from: '2026-02-30' } }, { name: 'X', filters: { status: 'fake' } }, { name: 'X', filters: null }]) assert.equal((await s.call('POST', s.views, input)).status, 400)
  assert.equal((await s.call('DELETE', `${s.views}/${made.json.id}`)).status, 200)
  assert.deepEqual((await s.call('GET', s.views)).json, [])
})

test('saved views enforce store and personal ownership at API and RLS boundaries', async () => {
  const s = await owner(), other = await owner()
  const invite = (await s.call('POST', `/stores/${s.handle}/invites`, { role: 'staff' })).json
  const staff = client()
  await staff('POST', '/auth/signup', { name: 'Staff', email: `view-staff-${++counter}@example.com`, password: 'correct horse' })
  await staff('POST', `/invites/${invite.token}/accept`)
  const staffId = (await staff('GET', '/me')).json.user.id as string
  const mine = (await s.call('POST', s.views, { name: 'Private', filters: {} })).json
  assert.deepEqual((await staff('GET', s.views)).json, [])
  assert.equal((await staff('PUT', `${s.views}/${mine.id}`, { name: 'Changed', filters: {} })).status, 404)
  assert.equal((await staff('DELETE', `${s.views}/${mine.id}`)).status, 404)
  assert.equal((await other.call('GET', s.views)).status, 404)
  assert.equal((await other.call('PUT', `${other.views}/${mine.id}`, { name: 'Changed', filters: {} })).status, 404)
  assert.equal((await other.call('DELETE', `${other.views}/${mine.id}`)).status, 404)
  assert.equal((await other.call('POST', s.views, { name: 'Foreign', filters: {} })).status, 404)
  assert.deepEqual(await tx(staffId, (t) => t.select().from(orderViews)), [])
  assert.deepEqual(await tx(other.userId, (t) => t.select().from(orderViews)), [])
  await assert.rejects(tx(staffId, (t) => t.insert(orderViews).values({ storeId: s.storeId, userId: s.userId, name: 'Forged owner', filters: emptyOrderFilters })))
  await assert.rejects(tx(s.userId, (t) => t.insert(orderViews).values({ storeId: other.storeId, userId: s.userId, name: 'Foreign store', filters: emptyOrderFilters })))
  assert.equal((await staff('POST', s.views, { name: 'My staff view', filters: {} })).status, 201)
  assert.equal((await s.call('GET', s.views)).json.length, 1)
})

test('concurrent saves respect the twenty-view personal limit', async () => {
  const s = await owner()
  await tx(s.userId, (t) => t.insert(orderViews).values(Array.from({ length: 19 }, (_, i) => ({ storeId: s.storeId, userId: s.userId, name: `View ${i}`, filters: emptyOrderFilters }))))
  const result = await Promise.all([s.call('POST', s.views, { name: 'A', filters: {} }), s.call('POST', s.views, { name: 'B', filters: {} })])
  assert.deepEqual(result.map((r) => r.status).sort(), [201, 409])
  assert.equal(result.find((r) => r.status === 409)?.json.error, 'orderViewLimit')
  assert.equal((await s.call('GET', s.views)).json.length, 20)
})
