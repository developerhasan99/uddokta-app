import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { app } from '../../api/src/app.ts'
import { pool, tx } from '../../api/src/db.ts'
import { api } from './app.ts'

before(async () => {
  await pool.query('drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public')
  await migrate(drizzle(pool), { migrationsFolder: new URL('../../api/migrations', import.meta.url).pathname })
})
after(() => pool.end())

// A browser on the dashboard or on the console (a separate service with its own cookie).
function client(service: 'dashboard' | 'console' = 'dashboard') {
  let cookie = ''
  const server = service === 'console' ? api : app
  return async (method: string, path: string, body?: unknown) => {
    const response = await server.request(`/api${path}`, { method, headers: { 'content-type': 'application/json', cookie }, body: body === undefined ? undefined : JSON.stringify(body) })
    if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie')!.split(';')[0]
    const text = await response.text()
    return { status: response.status, json: text ? JSON.parse(text) : null }
  }
}
let counter = 0
async function person() {
  const email = `console-${++counter}@example.com`
  const call = client()
  await call('POST', '/auth/signup', { name: `Person ${counter}`, email, password: 'correct horse' })
  const id = (await call('GET', '/me')).json.user.id as string
  return { call, email, id }
}
// What `npm run admin -w console -- add` does, then a console sign-in.
async function administrator() {
  const p = await person()
  await pool.query('insert into platform_admins (user_id) values ($1)', [p.id])
  const call = client('console')
  assert.equal((await call('POST', '/auth/login', { email: p.email, password: 'correct horse' })).status, 200)
  return { ...p, call }
}

test('only platform administrators, with a console sign-in less than 12 hours old', async () => {
  const seller = await person()
  const asSeller = client('console')
  assert.equal((await asSeller('POST', '/auth/login', { email: seller.email, password: 'correct horse' })).json.error, 'invalidCredentials', 'a seller cannot sign in, and is not told their password was right')
  assert.equal((await asSeller('GET', '/console/overview')).json.error, 'consoleSignIn')
  assert.equal((await client('console')('POST', '/auth/login', { email: seller.email, password: 'wrong' })).json.error, 'invalidCredentials')
  const { rows: [{ n }] } = await pool.query('select count(*)::int as n from login_failures where email = $1', [seller.email])
  assert.equal(n, 2, 'both attempts count towards the lockout')
  const { rows: [{ s: sessions }] } = await pool.query('select count(*)::int as s from sessions where user_id = $1', [seller.id])
  assert.equal(sessions, 1, 'only their dashboard session: the console never made one')
  const admin = await administrator()
  assert.equal((await admin.call('GET', '/console/me')).json.email, admin.email)
  assert.equal((await client('console')('GET', '/console/me')).json.error, 'consoleSignIn', 'the dashboard session is not a console session')
  await pool.query(`update sessions set created_at = now() - interval '13 hours' where user_id = $1`, [admin.id])
  assert.equal((await admin.call('GET', '/console/overview')).json.error, 'consoleSignIn', 'older than 12 hours: sign in again')
  assert.equal((await admin.call('POST', '/auth/logout')).status, 200)
})

test('users: search, suspend (signs out, blocks log in, said only after the right password), restore, audit', async () => {
  const admin = await administrator()
  const seller = await person()
  const list = (await admin.call('GET', `/console/users?q=${seller.email}`)).json
  assert.deepEqual([list.total, list.items[0].email], [1, seller.email])
  assert.equal((await admin.call('POST', `/console/users/${seller.id}/suspend`, { suspend: true })).json.error, 'reasonRequired')
  assert.equal((await admin.call('POST', `/console/users/${admin.id}/suspend`, { suspend: true, reason: 'test' })).json.error, 'cannotSuspendSelf')
  assert.equal((await admin.call('POST', `/console/users/${seller.id}/suspend`, { suspend: true, reason: 'Fake orders reported' })).status, 200)
  assert.equal((await seller.call('GET', '/me')).status, 401, 'signed out at once')
  assert.equal((await client()('POST', '/auth/login', { email: seller.email, password: 'wrong' })).json.error, 'invalidCredentials')
  assert.equal((await client()('POST', '/auth/login', { email: seller.email, password: 'correct horse' })).json.error, 'accountSuspended')
  assert.ok((await admin.call('GET', `/console/users/${seller.id}`)).json.suspendedAt)
  await admin.call('POST', `/console/users/${seller.id}/suspend`, { suspend: false, reason: 'Cleared' })
  assert.equal((await client()('POST', '/auth/login', { email: seller.email, password: 'correct horse' })).status, 200)
  const audit = (await admin.call('GET', '/console/audit')).json.items.filter((a: any) => a.target_id === seller.id).map((a: any) => [a.action, a.reason, a.admin_email])
  assert.deepEqual(audit, [['user.restore', 'Cleared', admin.email], ['user.suspend', 'Fake orders reported', admin.email]])
})

test('stores and plans: limits come from the plan, payments extend it, expiry falls back to the default, suspension makes it read-only', async () => {
  const admin = await administrator()
  const owner = await person()
  const handle = `console-shop-${counter}`
  await owner.call('POST', '/stores', { name: 'Shop', handle })
  const storeId = (await owner.call('GET', '/me')).json.stores[0].id as string
  const product = { name: 'চাল', variants: [{ options: [], price: 100 }] }

  assert.equal((await admin.call('POST', '/console/plans', { name: 'Tiny', priceBdt: 300, storageMb: 100, maxProducts: 1, maxMembers: 1, maxLandingPages: 1, features: ['onlineStore', 'courierBooking'] })).status, 201)
  assert.equal((await admin.call('POST', '/console/plans', { name: 'Tiny', priceBdt: 1, storageMb: 1, features: [] })).json.error, 'planNameTaken')
  const plans = (await admin.call('GET', '/console/plans')).json
  const free = plans.find((p: any) => p.isDefault)
  const tiny = plans.find((p: any) => p.name === 'Tiny')
  assert.equal(free.name, 'Free')
  assert.equal((await admin.call('PUT', `/console/plans/${free.id}`, { ...free, isDefault: false })).json.error, 'planDefaultRequired')

  assert.equal((await admin.call('PUT', `/console/stores/${storeId}/plan`, { planId: tiny.id, until: null, reason: 'Trial of the small plan' })).status, 200)
  assert.equal((await owner.call('GET', `/stores/${handle}/plan`)).json.planName, 'Tiny')
  assert.equal((await owner.call('POST', `/stores/${handle}/products`, product)).status, 201)
  assert.equal((await owner.call('POST', `/stores/${handle}/products`, product)).json.error, 'productLimit')
  assert.equal((await owner.call('POST', `/stores/${handle}/invites`, { role: 'staff' })).json.error, 'memberLimit', 'the owner already fills the one seat')
  assert.equal((await owner.call('PUT', `/stores/${handle}/domain`, { domain: 'example-shop.com' })).json.error, 'planNoDomain')

  // A payment on a plan with an end date in the past restarts from today; another payment adds to it.
  await pool.query(`update stores set plan_until = current_date - 1 where id = $1`, [storeId])
  assert.equal((await owner.call('GET', `/stores/${handle}/plan`)).json.planName, 'Free', 'expired: back on the default plan')
  const first = (await admin.call('POST', `/console/stores/${storeId}/payments`, { planId: tiny.id, amount: 300, months: 1, method: 'bKash', reference: 'TX1' })).json.until
  const second = (await admin.call('POST', `/console/stores/${storeId}/payments`, { planId: tiny.id, amount: 300, months: 1, method: 'bKash', reference: 'TX2' })).json.until
  const { rows: [dates] } = await pool.query(`select (current_date + interval '1 month')::date::text as one, (current_date + interval '2 months')::date::text as two`)
  assert.deepEqual([first, second], [dates.one, dates.two])
  const store = (await admin.call('GET', `/console/stores/${storeId}`)).json
  assert.deepEqual([store.limits.plan_name, store.payments.length, store.counts.products], ['Tiny', 2, 1])

  assert.equal((await admin.call('POST', `/console/stores/${storeId}/suspend`, { suspend: true, reason: 'Unpaid' })).status, 200)
  assert.equal((await owner.call('GET', `/stores/${handle}/products`)).status, 200, 'the team can still look')
  assert.equal((await owner.call('PUT', `/stores/${handle}/domain`, { domain: 'x.com' })).json.error, 'storeSuspended')
  assert.equal((await owner.call('POST', `/stores/${handle}/collections`, { name: 'Rice' })).json.error, 'storeSuspended')
  await admin.call('POST', `/console/stores/${storeId}/suspend`, { suspend: false, reason: 'Paid' })
  assert.notEqual((await owner.call('POST', `/stores/${handle}/collections`, { name: 'Rice' })).json?.error, 'storeSuspended')
})

test('features and custom plans: a tool left out is closed, a custom plan sets exactly what a store gets, Billing shows it to owners', async () => {
  const admin = await administrator()
  const owner = await person()
  const handle = `feature-shop-${counter}`
  await owner.call('POST', '/stores', { name: 'Feature Shop', handle })
  const storeId = (await owner.call('GET', '/me')).json.stores[0].id as string
  const staff = await person()
  await staff.call('POST', `/invites/${(await owner.call('POST', `/stores/${handle}/invites`, { role: 'staff' })).json.token}/accept`)

  assert.equal((await admin.call('POST', '/console/plans', { name: 'Odd', priceBdt: 1, storageMb: 1, features: ['teleport'] })).json.error, 'planInvalid', 'unknown tools are refused')
  // A custom plan with only landing pages and fake-order protection, 2 GB, 5 products, no end date.
  const custom = { priceBdt: 750, storageMb: 2048, maxProducts: 5, maxMembers: null, maxLandingPages: null, features: ['fakeOrderProtection'], billingNote: 'Yearly by bank transfer' }
  assert.equal((await admin.call('PUT', `/console/stores/${storeId}/custom-plan`, { ...custom })).json.error, 'reasonRequired')
  assert.equal((await admin.call('PUT', `/console/stores/${storeId}/custom-plan`, { ...custom, reason: 'Agreed on a call' })).status, 200)
  const plan = (await owner.call('GET', `/stores/${handle}/plan`)).json
  assert.deepEqual([plan.planName, plan.isCustom, plan.storageMb, plan.maxProducts, plan.features], [`Custom · ${handle}`, true, 2048, 5, ['fakeOrderProtection']])
  assert.equal((await owner.call('GET', `/stores/${handle}/discounts`)).json.error, 'planFeature:discounts', 'reading a closed tool is refused too')
  assert.equal((await owner.call('GET', `/stores/${handle}/analytics`)).json.error, 'planFeature:analytics')
  assert.equal((await owner.call('PUT', `/stores/${handle}/couriers/steadfast`, { apiKey: 'k', secretKey: 's' })).json.error, 'planFeature:courierBooking')
  assert.equal((await owner.call('GET', `/stores/${handle}/blocked`)).status, 200, 'an included tool works')
  assert.equal((await owner.call('PUT', `/stores/${handle}/domain`, { domain: 'feature-shop.com' })).json.error, 'planNoDomain')
  assert.ok(!(await admin.call('GET', '/console/plans')).json.some((p: any) => p.name.startsWith('Custom')), 'custom plans are not offered to others')

  await admin.call('PUT', '/console/settings', { whatsapp: '01700000000', bkash: '01800000000', nagad: '', bank: 'City Bank 123', note: 'Send the store address with the payment.' })
  const billing = (await owner.call('GET', `/stores/${handle}/billing`)).json
  assert.deepEqual([billing.plan.plan_name, billing.plan.billing_note, billing.pay.bkash, billing.usage.members], [`Custom · ${handle}`, 'Yearly by bank transfer', '01800000000', 2])
  assert.ok(billing.plans.every((p: any) => !p.name.startsWith('Custom')))
  assert.equal((await staff.call('GET', `/stores/${handle}/billing`)).status, 403, 'staff do not see billing')

  // Ending the custom plan puts the store back on the default plan, with every tool.
  await admin.call('DELETE', `/console/stores/${storeId}/custom-plan`, { reason: 'Moved to a public plan' })
  assert.equal((await owner.call('GET', `/stores/${handle}/plan`)).json.planName, 'Free')
  assert.equal((await owner.call('GET', `/stores/${handle}/discounts`)).status, 200)
  const audit = (await admin.call('GET', '/console/audit')).json.items.filter((a: any) => a.target_id === storeId).map((a: any) => a.action)
  assert.deepEqual(audit, ['store.customPlanEnd', 'store.customPlan'])
})

test('console tables are out of reach for the app role, and the functions refuse anyone but administrators', async () => {
  const seller = await person()
  for (const table of ['platform_admins', 'plans', 'store_payments', 'console_audit', 'platform_settings']) {
    await assert.rejects(tx(null, (t) => t.execute(sql.raw(`select * from ${table}`))), (err: any) => (err.cause?.code ?? err.code) === '42501', table)
  }
  await assert.rejects(tx(seller.id, (t) => t.execute(sql`select console_overview(${seller.id}::uuid)`)), (err: any) => (err.cause?.code ?? err.code) === '42501')
  await assert.rejects(tx(seller.id, (t) => t.execute(sql`select console_suspend_user(${seller.id}::uuid, ${seller.id}::uuid, true, 'x')`)), (err: any) => (err.cause?.code ?? err.code) === '42501')
})
