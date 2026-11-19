import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { sql } from 'drizzle-orm'
import sharp from 'sharp'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { builtInTemplates } from '../../storefront/src/site.ts'
import { sweepDeletedStores } from '../../api/src/store-deletion.ts'
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
    const form = body instanceof FormData
    const response = await server.request(`/api${path}`, { method, headers: form ? { cookie, host: 'shop.test', origin: 'https://shop.test' } : { 'content-type': 'application/json', cookie }, body: body === undefined ? undefined : form ? body : JSON.stringify(body) })
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
  assert.notEqual((await owner.call('PUT', `/stores/${handle}/domain`, { domain: 'example-shop.com' })).json?.error, 'planNoDomain', 'a paid plan always includes the own domain')

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
  assert.ok((await owner.call('GET', '/me')).json.stores[0].suspendedAt, 'the team is told (dashboard bar)')
  assert.equal((await owner.call('PUT', `/stores/${handle}/domain`, { domain: 'x.com' })).json.error, 'storeSuspended')
  assert.equal((await owner.call('POST', `/stores/${handle}/collections`, { name: 'Rice' })).json.error, 'storeSuspended')
  await admin.call('POST', `/console/stores/${storeId}/suspend`, { suspend: false, reason: 'Paid' })
  assert.equal((await owner.call('GET', '/me')).json.stores[0].suspendedAt, null)
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
  // A paid plan always gets the own domain, even when it is left out; a free one may go without.
  await admin.call('POST', '/console/plans', { name: 'Paid no domain', priceBdt: 100, storageMb: 10, features: ['discounts'] })
  await admin.call('POST', '/console/plans', { name: 'Free no domain', priceBdt: 0, storageMb: 10, features: [] })
  const saved = (await admin.call('GET', '/console/plans')).json
  assert.deepEqual(saved.find((p: any) => p.name === 'Paid no domain').features, ['discounts', 'customDomain'])
  assert.deepEqual(saved.find((p: any) => p.name === 'Free no domain').features, [])
  await assert.rejects(pool.query(`insert into plans (name, price_bdt, storage_mb, features) values ('Sneaky', 50, 10, '{}')`), (err: any) => err.constraint === 'plans_paid_domain', 'the database refuses it too')
  // A custom plan with only landing pages and fake-order protection, 2 GB, 5 products, no end date.
  const custom = { priceBdt: 0, storageMb: 2048, maxProducts: 5, maxMembers: null, maxLandingPages: null, features: ['fakeOrderProtection'], billingNote: 'Yearly by bank transfer' }
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

  const stranger = client()
  assert.equal((await stranger('GET', '/support')).json.whatsapp, '', 'no number until the console sets one')
  await admin.call('PUT', '/console/settings', { whatsapp: '01700000000', bkash: '01800000000', nagad: '', bank: 'City Bank 123', note: 'Send the store address with the payment.' })
  assert.deepEqual((await stranger('GET', '/support')).json, { whatsapp: '01700000000' }, 'open to people who are not signed in, and nothing else')
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

test('hidden plans stay off Billing; moving stores off a plan lets it be deleted, unless payments were recorded on it', async () => {
  const admin = await administrator()
  const owner = await person()
  const handle = `move-shop-${counter}`
  await owner.call('POST', '/stores', { name: 'Move Shop', handle })
  const storeId = (await owner.call('GET', '/me')).json.stores[0].id as string
  await admin.call('POST', '/console/plans', { name: 'Early bird', priceBdt: 0, storageMb: 50, features: [], hidden: true })
  await admin.call('POST', '/console/plans', { name: 'Later', priceBdt: 200, storageMb: 50, features: [] })
  const find = async (name: string) => (await admin.call('GET', '/console/plans')).json.find((p: any) => p.name === name)
  const early = await find('Early bird')
  const later = await find('Later')
  assert.equal(early.hidden, true)
  await admin.call('PUT', `/console/stores/${storeId}/plan`, { planId: early.id, until: null, reason: 'Early access' })
  const billing = (await owner.call('GET', `/stores/${handle}/billing`)).json
  assert.equal(billing.plan.plan_name, 'Early bird', 'the store still sees its own hidden plan')
  assert.ok(!billing.plans.some((p: any) => p.name === 'Early bird'), 'but it is not offered')
  assert.ok(billing.plans.some((p: any) => p.name === 'Later'))

  assert.equal((await admin.call('DELETE', `/console/plans/${early.id}`, {})).json.error, 'planHasStores')
  assert.equal((await admin.call('POST', `/console/plans/${early.id}/move`, { planId: later.id })).json.error, 'reasonRequired')
  assert.equal((await admin.call('POST', `/console/plans/${early.id}/move`, { planId: early.id, reason: 'x' })).status, 404, 'not onto itself')
  assert.deepEqual((await admin.call('POST', `/console/plans/${early.id}/move`, { planId: later.id, reason: 'Early access over' })).json, { moved: 1 })
  assert.equal((await owner.call('GET', `/stores/${handle}/plan`)).json.planName, 'Later')
  assert.equal((await admin.call('DELETE', `/console/plans/${early.id}`, { reason: 'Unused' })).status, 200)
  assert.equal(await find('Early bird'), undefined)

  await admin.call('POST', `/console/stores/${storeId}/payments`, { planId: later.id, amount: 200, months: 1, method: 'bKash' })
  await admin.call('POST', `/console/plans/${later.id}/move`, { planId: null, reason: 'Back to default' })
  assert.equal((await owner.call('GET', `/stores/${handle}/plan`)).json.planName, 'Free')
  assert.equal((await admin.call('DELETE', `/console/plans/${later.id}`, {})).json.error, 'planHasPayments')
  const free = (await admin.call('GET', '/console/plans')).json.find((p: any) => p.isDefault)
  assert.equal((await admin.call('DELETE', `/console/plans/${free.id}`, {})).json.error, 'planDefaultRequired')
})

test('console tables are out of reach for the app role, and the functions refuse anyone but administrators', async () => {
  const seller = await person()
  for (const table of ['platform_admins', 'plans', 'store_payments', 'console_audit', 'platform_settings']) {
    await assert.rejects(tx(null, (t) => t.execute(sql.raw(`select * from ${table}`))), (err: any) => (err.cause?.code ?? err.code) === '42501', table)
  }
  await assert.rejects(tx(seller.id, (t) => t.execute(sql`select console_overview(${seller.id}::uuid)`)), (err: any) => (err.cause?.code ?? err.code) === '42501')
  await assert.rejects(tx(seller.id, (t) => t.execute(sql`select console_suspend_user(${seller.id}::uuid, ${seller.id}::uuid, true, 'x')`)), (err: any) => (err.cause?.code ?? err.code) === '42501')
})

test('demos: the team designs in a store, the console snapshots it, sellers start from published demos in their own store', async () => {
  const admin = await administrator()
  // The demo store, built by the team with the normal dashboard.
  const team = await person()
  const demoHandle = `demo-store-${counter}`
  await team.call('POST', '/stores', { name: 'Demo store', handle: demoHandle })
  const png = await sharp({ create: { width: 40, height: 30, channels: 3, background: '#2a7' } }).png().toBuffer()
  const upload = async (call: typeof team.call, handle: string) => {
    const form = new FormData()
    form.set('file', new File([png as BlobPart], 'shot.png', { type: 'image/png' }))
    return (await call('POST', `/stores/${handle}/media`, form)).json
  }
  const image = await upload(team.call, demoHandle)
  const teamProduct = (await team.call('POST', `/stores/${demoHandle}/products`, { name: 'নমুনা পণ্য', variants: [{ options: [], price: 500 }] })).json
  const page = (await team.call('POST', `/stores/${demoHandle}/pages`, { title: 'Demo page', blank: true })).json
  const hero = { id: 'hero', type: 'layout', hidden: false, settings: { name: 'Hero' }, children: [
    { id: 'hh', kind: 'heading', props: { text: 'অফার', level: 'h1' } }, { id: 'hi', kind: 'image', props: { image: image.id, link: '' } },
    { id: 'ord', kind: 'block', props: {}, block: { type: 'order', settings: { product: teamProduct.id } } },
  ] }
  const draft = { version: 2, sections: [hero, { id: 'faq', type: 'layout', hidden: false, settings: { name: 'Questions' }, children: [{ id: 'q', kind: 'heading', props: { text: 'প্রশ্ন', level: 'h2' } }] }] }
  const saved = await team.call('PUT', `/stores/${demoHandle}/pages/${page.id}`, { title: 'Demo page', handle: page.handle, seoTitle: '', seoDescription: '', draft, revision: page.revision })
  assert.equal(saved.status, 200, JSON.stringify(saved.json))
  const header = (await team.call('POST', `/stores/${demoHandle}/templates`, { type: 'header', title: 'Bold header', from: 'builtin' })).json

  // A seller cannot reach the console's demo tools, nor the table itself.
  const seller = await person()
  const sellerHandle = `seller-${counter}`
  await seller.call('POST', '/stores', { name: 'Seller', handle: sellerHandle })
  const asSeller = client('console')
  await asSeller('POST', '/auth/login', { email: seller.email, password: 'correct horse' })
  assert.equal((await asSeller('GET', '/console/demos')).status, 401)
  await assert.rejects(tx(seller.id, (t) => t.execute(sql`select * from demo_items`)), (e: any) => /permission denied/.test(e.cause?.message))
  await assert.rejects(tx(seller.id, (t) => t.execute(sql`select console_save_demo(${seller.id}::uuid, gen_random_uuid(), '{}'::jsonb)`)), (e: any) => /not a platform administrator/.test(e.cause?.message))

  const sources = (await admin.call('GET', `/console/demos/sources?store=${demoHandle}`)).json
  assert.deepEqual(sources.pages[0].sections.map((s: any) => s.name), ['Hero', 'Questions'])
  assert.ok(sources.templates.some((t: any) => t.id === header.id))
  assert.equal((await admin.call('GET', '/console/demos/sources?store=nope')).json.error, 'storeNotFound')

  const base = { sourceStoreId: sources.store.id, category: 'Fashion', status: 'published' }
  // Saves are forms: the details as JSON, plus a thumbnail uploaded from the administrator's computer.
  const demoForm = (data: unknown, thumbnail?: Buffer) => {
    const form = new FormData()
    form.set('data', JSON.stringify(data))
    if (thumbnail) form.set('thumbnail', new File([thumbnail as BlobPart], 'shot.png', { type: 'image/png' }))
    return form
  }
  const landing = await admin.call('POST', '/console/demos', demoForm({ ...base, kind: 'landing', sourceId: page.id, nameBn: 'ঈদ অফার', nameEn: 'Eid offer' }, png))
  assert.equal(landing.status, 201, JSON.stringify(landing.json))
  const section = (await admin.call('POST', '/console/demos', demoForm({ ...base, kind: 'section', sourceId: page.id, sourceSection: 'hero', nameBn: 'হিরো', nameEn: 'Hero' }))).json
  const template = (await admin.call('POST', '/console/demos', demoForm({ ...base, kind: 'template', sourceId: header.id, nameBn: 'হেডার', nameEn: 'Header' }))).json
  const hidden = (await admin.call('POST', '/console/demos', demoForm({ ...base, status: 'draft', kind: 'landing', sourceId: page.id, nameBn: 'খসড়া', nameEn: 'Draft one' }))).json
  assert.equal((await admin.call('POST', '/console/demos', demoForm({ ...base, kind: 'landing', sourceId: page.id, nameBn: '', nameEn: 'X' }))).json.error, 'nameRequired')
  assert.equal((await admin.call('POST', '/console/demos', demoForm({ ...base, kind: 'landing', sourceId: page.id, nameBn: 'ক', nameEn: 'X' }, Buffer.from('not an image')))).json.error, 'fileNotImage')
  const list = (await admin.call('GET', '/console/demos')).json
  assert.equal(list.length, 4)
  assert.ok(list.find((d: any) => d.id === landing.json.id).thumb, 'the uploaded thumbnail')
  // Replacing or removing a thumbnail deletes the old file; nothing piles up in storage.
  const stored = (key: string) => existsSync(join(process.env.MEDIA_DIR!, key))
  const firstThumb = list.find((d: any) => d.id === landing.json.id).thumbKey
  assert.ok(stored(firstThumb))
  await admin.call('PUT', `/console/demos/${landing.json.id}`, demoForm({ nameBn: 'ঈদ অফার', nameEn: 'Eid offer', category: 'Fashion', status: 'published' }, png))
  const secondThumb = (await admin.call('GET', '/console/demos')).json.find((d: any) => d.id === landing.json.id).thumbKey
  assert.ok(secondThumb !== firstThumb && stored(secondThumb) && !stored(firstThumb), 'the replaced thumbnail is deleted')
  const sectionThumb = list.find((d: any) => d.id === section.id).thumbKey
  await admin.call('PUT', `/console/demos/${section.id}`, demoForm({ nameBn: 'হিরো', nameEn: 'Hero', category: 'Fashion', status: 'published', removeThumbnail: true }))
  assert.ok(stored(sectionThumb), 'the first image stays: the section still uses it')
  assert.ok(list.find((d: any) => d.id === section.id).thumb, 'no upload: the first image stands in')
  assert.equal(list.find((d: any) => d.id === template.id).thumb, null, 'no upload and no images: none')

  // The team deletes the image from the source: published demos keep their own copies.
  await team.call('PUT', `/stores/${demoHandle}/pages/${page.id}`, { title: 'Demo page', handle: page.handle, seoTitle: '', seoDescription: '', draft: { version: 2, sections: [] }, revision: saved.json.revision })
  assert.equal((await team.call('DELETE', `/stores/${demoHandle}/media/${image.id}`)).status, 200)

  // Sellers see published demos only, and start from them in their own store.
  const gallery = (await seller.call('GET', '/demos?kind=landing')).json
  assert.deepEqual(gallery.map((d: any) => d.name), [['ঈদ অফার', 'Eid offer']])
  assert.equal((await seller.call('POST', `/stores/${sellerHandle}/pages`, { title: 'X', demo: hidden.id })).status, 404, 'a draft demo cannot be used')
  const mine = (await seller.call('POST', `/stores/${sellerHandle}/products`, { name: 'আমার পণ্য', variants: [{ options: [], price: 900 }] })).json
  const made = await seller.call('POST', `/stores/${sellerHandle}/pages`, { title: 'আমার অফার', demo: landing.json.id, productId: mine.id })
  assert.equal(made.status, 201, JSON.stringify(made.json))
  const [madeHero] = made.json.draft.sections
  const madeImage = madeHero.children.find((n: any) => n.kind === 'image').props.image
  assert.ok(madeImage && madeImage !== image.id, 'the image was copied into the seller\'s store')
  assert.equal((await seller.call('GET', `/stores/${sellerHandle}/media`)).json.items?.length ?? (await seller.call('GET', `/stores/${sellerHandle}/media`)).json.length, 1)
  assert.equal(madeHero.children.find((n: any) => n.kind === 'block').block.settings.product, mine.id, 'the demo\'s product became the seller\'s')
  const other = (await seller.call('POST', `/stores/${sellerHandle}/products`, { name: 'x', variants: [{ options: [], price: 1 }] })).json
  assert.equal((await team.call('POST', `/stores/${demoHandle}/pages`, { title: 'Steal', demo: landing.json.id, productId: other.id })).status, 400, 'another store\'s product is refused')

  const piece = await seller.call('POST', `/stores/${sellerHandle}/demos/${section.id}/section`)
  assert.equal(piece.status, 200, JSON.stringify(piece.json))
  assert.equal(piece.json.section.settings.name, 'Hero')
  assert.equal(Object.keys(piece.json.media).length, 1)
  assert.equal((await seller.call('POST', `/stores/${sellerHandle}/demos/${landing.json.id}/section`)).status, 404, 'only section demos fit there')

  assert.deepEqual((await seller.call('GET', '/demos?kind=template&type=header')).json.map((d: any) => d.id), [template.id])
  const madeTemplate = await seller.call('POST', `/stores/${sellerHandle}/templates`, { type: 'header', title: 'From demo', from: `demo:${template.id}` })
  assert.equal(madeTemplate.status, 201, JSON.stringify(madeTemplate.json))
  assert.equal((await seller.call('POST', `/stores/${sellerHandle}/templates`, { type: 'footer', title: 'Wrong type', from: `demo:${template.id}` })).status, 400)

  // Unpublishing hides it at once; deleting removes it; pages made from it stay.
  await admin.call('PUT', `/console/demos/${landing.json.id}`, demoForm({ nameBn: 'ঈদ অফার', nameEn: 'Eid offer', category: 'Fashion', status: 'draft', removeThumbnail: true }))
  assert.equal((await admin.call('GET', '/console/demos')).json.find((d: any) => d.id === landing.json.id).thumb, null, 'thumbnail removed')
  assert.ok(!stored(secondThumb), 'and its file deleted')
  assert.deepEqual((await seller.call('GET', '/demos?kind=landing')).json, [])
  assert.equal((await admin.call('DELETE', `/console/demos/${landing.json.id}`, { reason: 'Old' })).status, 200)
  assert.equal((await seller.call('GET', `/stores/${sellerHandle}/pages/${made.json.id}`)).status, 200)
  const actions = (await admin.call('GET', '/console/audit')).json.items.filter((a: any) => a.target_type === 'demo').map((a: any) => a.action)
  assert.ok(actions.includes('demo.create') && actions.includes('demo.update') && actions.includes('demo.delete'))
})

test('default templates: one per type, locked while default, copied into every new store (images too); other types keep the built-in', async () => {
  const admin = await administrator()
  const team = await person()
  const demoHandle = `defaults-${counter}`
  await team.call('POST', '/stores', { name: 'Demo store', handle: demoHandle })
  const form = new FormData()
  form.set('file', new File([await sharp({ create: { width: 40, height: 30, channels: 3, background: '#147' } }).png().toBuffer() as BlobPart], 'logo.png', { type: 'image/png' }))
  const image = (await team.call('POST', `/stores/${demoHandle}/media`, form)).json
  const footer = (await team.call('POST', `/stores/${demoHandle}/templates`, { type: 'footer', title: 'Rich footer', from: 'builtin' })).json
  const draft = { version: 2, sections: [{ id: 'about', type: 'layout', hidden: false, settings: { name: 'About' }, children: [
    { id: 'logo', kind: 'image', props: { image: image.id, link: '' } }, { id: 'line', kind: 'heading', props: { text: 'সারা দেশে ডেলিভারি', level: 'h3' } },
  ] }] }
  assert.equal((await team.call('PUT', `/stores/${demoHandle}/templates/${footer.id}`, { title: 'Rich footer', draft, revision: footer.revision })).status, 200)
  const sources = (await admin.call('GET', `/console/demos/sources?store=${demoHandle}`)).json
  const make = async (status: string, nameEn: string) => {
    const f = new FormData()
    f.set('data', JSON.stringify({ kind: 'template', sourceStoreId: sources.store.id, sourceId: footer.id, nameBn: 'ফুটার', nameEn, status }))
    return (await admin.call('POST', '/console/demos', f)).json.id as string
  }
  const first = await make('published', 'Footer one')
  const second = await make('published', 'Footer two')
  const hidden = await make('draft', 'Footer draft')
  assert.equal((await admin.call('POST', `/console/demos/${hidden}/default`)).json.error, 'demoDefaultInvalid', 'a draft cannot be the default')
  assert.equal((await admin.call('POST', `/console/demos/${first}/default`)).status, 200)

  // Locked while it is the default.
  const asDraft = new FormData()
  asDraft.set('data', JSON.stringify({ nameBn: 'ফুটার', nameEn: 'Footer one', status: 'draft' }))
  assert.equal((await admin.call('PUT', `/console/demos/${first}`, asDraft)).json.error, 'demoDefaultLocked')
  assert.equal((await admin.call('DELETE', `/console/demos/${first}`, { reason: 'x' })).json.error, 'demoDefaultLocked')

  // A new store gets it as its built-in footer, with its own copy of the image; the header stays the code built-in.
  const seller = await person()
  const handle = `newshop-${counter}`
  assert.equal((await seller.call('POST', '/stores', { name: 'New shop', handle })).status, 201)
  const builtIns = (await seller.call('GET', `/stores/${handle}/templates`)).json.filter((t: any) => t.builtIn)
  const mineFooter = (await seller.call('GET', `/stores/${handle}/templates/${builtIns.find((t: any) => t.type === 'footer').id}`)).json
  const copied = mineFooter.draft.sections[0].children.find((n: any) => n.kind === 'image').props.image
  assert.ok(copied && copied !== image.id, 'the image was copied into the new store')
  assert.equal((await seller.call('GET', `/stores/${handle}/media`)).json.items.length, 1)
  assert.equal(mineFooter.isPublished, true)
  const mineHeader = (await seller.call('GET', `/stores/${handle}/templates/${builtIns.find((t: any) => t.type === 'header').id}`)).json
  assert.deepEqual(mineHeader.draft, builtInTemplates.header, 'no default header yet: the built-in one')

  // Another default takes over; the old one is an ordinary demo again and can be drafted or deleted.
  assert.equal((await admin.call('POST', `/console/demos/${second}/default`)).status, 200)
  const list = (await admin.call('GET', '/console/demos')).json
  assert.deepEqual([list.find((d: any) => d.id === first).isDefault, list.find((d: any) => d.id === second).isDefault], [false, true])
  assert.equal((await admin.call('PUT', `/console/demos/${first}`, asDraft)).status, 200)
  assert.equal((await admin.call('DELETE', `/console/demos/${first}`, { reason: 'Replaced' })).status, 200)
})

test('store deletion: the owner asks (address + password), 30 days offline and read-only, restore, console export and delete now, hourly sweep', async () => {
  const admin = await administrator()
  const owner = await person()
  const handle = `bye-${counter}`
  await owner.call('POST', '/stores', { name: 'Bye shop', handle })
  const storeId = (await owner.call('GET', '/me')).json.stores.find((s: any) => s.handle === handle).id as string
  const form = new FormData()
  form.set('file', new File([await sharp({ create: { width: 20, height: 20, channels: 3, background: '#a33' } }).png().toBuffer() as BlobPart], 'a.png', { type: 'image/png' }))
  const image = (await owner.call('POST', `/stores/${handle}/media`, form)).json
  await owner.call('POST', `/stores/${handle}/products`, { name: 'চা', variants: [{ options: [], price: 100 }] })
  await owner.call('PUT', `/stores/${handle}/preferences`, { homeTitle: '', homeDescription: '', passwordOn: true, password: 'secret-pass' })

  assert.equal((await owner.call('POST', `/stores/${handle}/deletion`, { confirm: 'wrong', password: 'correct horse' })).json.error, 'deleteConfirmMismatch')
  assert.equal((await owner.call('POST', `/stores/${handle}/deletion`, { confirm: handle, password: 'nope' })).json.error, 'wrongPassword')
  const stranger = await person()
  assert.equal((await stranger.call('POST', `/stores/${handle}/deletion`, { confirm: handle, password: 'correct horse' })).status, 404)
  assert.equal((await admin.call('POST', `/console/stores/${storeId}/delete`, { reason: 'x' })).json.error, 'storeNotScheduled', 'the owner has not asked')

  const asked = await owner.call('POST', `/stores/${handle}/deletion`, { confirm: handle, password: 'correct horse' })
  assert.equal(asked.status, 200)
  const days = (new Date(asked.json.deletionDueAt).getTime() - Date.now()) / 86_400_000
  assert.ok(days > 29.9 && days <= 30)
  assert.ok((await owner.call('GET', '/me')).json.stores.find((s: any) => s.handle === handle).deletionDueAt)
  assert.equal((await owner.call('POST', `/stores/${handle}/products`, { name: 'x', variants: [{ options: [], price: 1 }] })).json.error, 'storeDeleting', 'read-only')
  assert.equal((await tx(null, (t) => t.execute(sql`select * from storefront_store_state(${handle})`))).rows[0].suspended, true, 'buyers see it closed')
  // Only the definer functions change these columns, never app code.
  await assert.rejects(tx(owner.id, (t) => t.execute(sql`update stores set deletion_due_at = null where handle = ${handle}`)), (e: any) => e.cause?.code === '42501')
  await assert.rejects(tx(owner.id, (t) => t.execute(sql`update stores set suspended_at = now() where handle = ${handle}`)), (e: any) => e.cause?.code === '42501')

  // The console sees it and can export everything (no secrets).
  assert.ok((await admin.call('GET', `/console/stores/${storeId}`)).json.deletionDueAt)
  assert.ok((await admin.call('GET', `/console/stores?q=${handle}`)).json.items[0].deletion_due_at)
  assert.equal((await admin.call('POST', `/console/stores/${storeId}/export`, {})).json.error, 'reasonRequired')
  const exported = await admin.call('POST', `/console/stores/${storeId}/export`, { reason: 'Owner asked for a copy' })
  assert.equal(exported.json.tables.products[0].name, 'চা')
  assert.equal(exported.json.members[0].email, owner.email)
  assert.ok(exported.json.tables.media.some((m: any) => m.id === image.id), 'its images (the default footer from the test above adds one more)')
  assert.deepEqual(exported.json.tables.orders, [])
  assert.doesNotMatch(JSON.stringify(exported.json), /password_hash|credentials|token_hash/)

  // Restored by the owner: open again.
  assert.equal((await owner.call('DELETE', `/stores/${handle}/deletion`)).status, 200)
  assert.equal((await owner.call('POST', `/stores/${handle}/products`, { name: 'দুধ', variants: [{ options: [], price: 50 }] })).status, 201)

  // Asked again, then removed at once from the console, files included.
  await owner.call('POST', `/stores/${handle}/deletion`, { confirm: handle, password: 'correct horse' })
  const file = join(process.env.MEDIA_DIR!, image.key ?? `${storeId}/${image.id}.webp`)
  assert.ok(existsSync(file))
  assert.equal((await admin.call('POST', `/console/stores/${storeId}/delete`, { reason: 'Owner asked by phone' })).status, 200)
  assert.equal((await owner.call('GET', `/stores/${handle}/products`)).status, 404)
  assert.ok(!existsSync(file), 'its images are gone too')
  assert.equal((await owner.call('GET', '/me')).json.stores.some((s: any) => s.handle === handle), false)
  assert.ok((await admin.call('GET', '/console/audit')).json.items.some((a: any) => a.action === 'store.delete' && a.target_id === storeId))

  // The hourly sweep removes stores whose 30 days are over.
  const late = `late-${counter}`
  await owner.call('POST', '/stores', { name: 'Late', handle: late })
  await owner.call('POST', `/stores/${late}/deletion`, { confirm: late, password: 'correct horse' })
  await pool.query(`update stores set deletion_due_at = now() - interval '1 minute' where handle = $1`, [late])
  assert.equal(await sweepDeletedStores(), 1)
  assert.equal((await pool.query('select 1 from stores where handle = $1', [late])).rowCount, 0)
})
