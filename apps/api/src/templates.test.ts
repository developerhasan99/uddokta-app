import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { app } from './app.ts'
import { pool, tx } from './db.ts'
import { products, templates } from './schema.ts'

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
  await call('POST', '/auth/signup', { name: 'Seller', email: `tpl-${++counter}@example.com`, password: 'correct horse' })
  return { call, id: (await call('GET', '/me')).json.user.id as string }
}

async function shop() {
  const owner = await person()
  const handle = `tpl-shop-${counter}`
  const created = await owner.call('POST', '/stores', { name: 'Shop', handle })
  const join = async (role: string) => {
    const member = await person()
    const invite = await owner.call('POST', `/stores/${handle}/invites`, { role })
    await member.call('POST', `/invites/${invite.json.token}/accept`)
    return member
  }
  return { owner, handle, join, base: `/stores/${handle}/templates`, storeId: created.json.id as string }
}

test('a template starts blank, from the built-in one, from a ready-made start or as a copy; invalid drafts and stale saves are refused', async () => {
  const s = await shop()
  const blank = await s.owner.call('POST', s.base, { type: 'home', title: 'Blank home', from: 'blank' })
  assert.equal(blank.status, 201)
  assert.deepEqual((await s.owner.call('GET', `${s.base}/${blank.json.id}`)).json.draft.sections, [])
  const built = (await s.owner.call('GET', `${s.base}/${(await s.owner.call('POST', s.base, { type: 'product', title: 'Product' })).json.id}`)).json
  assert.equal(built.draft.sections[0].type, 'productInfo')
  assert.equal((await s.owner.call('POST', s.base, { type: 'home', title: 'Shop front', from: 'shopfront' })).status, 201)
  assert.equal((await s.owner.call('POST', s.base, { type: 'home', title: 'Copy', from: blank.json.id })).status, 201)
  assert.equal((await s.owner.call('POST', s.base, { type: 'product', title: 'Wrong copy', from: blank.json.id })).status, 404, 'a copy keeps its type')
  assert.equal((await s.owner.call('POST', s.base, { type: 'blog', title: 'x' })).status, 400)
  assert.equal((await s.owner.call('PUT', `${s.base}/${built.id}`, { draft: { version: 2, sections: [{ id: 'x', type: 'nope', hidden: false, settings: {} }] }, revision: built.revision })).json.error, 'templateInvalid')
  const saved = await s.owner.call('PUT', `${s.base}/${built.id}`, { title: 'Gift', draft: built.draft, revision: built.revision })
  assert.equal(saved.json.title, 'Gift')
  assert.equal((await s.owner.call('PUT', `${s.base}/${built.id}`, { draft: built.draft, revision: built.revision })).json.error, 'templateChanged')
  assert.deepEqual((await s.owner.call('GET', `${s.base}?type=home`)).json.map((t: any) => t.builtIn), [false, false, false, true], 'three made plus the built-in copy')
})

test('one published default per type; deleting a template returns its products to the default', async () => {
  const s = await shop()
  const make = async (title: string) => {
    const made = (await s.owner.call('POST', s.base, { type: 'product', title })).json
    return (await s.owner.call('POST', `${s.base}/${made.id}/publish`, { revision: made.revision })).json
  }
  const a = await make('A')
  const b = await make('B')
  await s.owner.call('POST', `${s.base}/${a.id}/default`)
  await s.owner.call('POST', `${s.base}/${b.id}/default`)
  const list = (await s.owner.call('GET', `${s.base}?type=product`)).json
  assert.deepEqual(list.filter((t: any) => t.isDefault).map((t: any) => t.title), ['B'], 'the new default replaces the old one')
  const product = (await s.owner.call('POST', `/stores/${s.handle}/products`, { name: 'Tea', templateId: a.id, variants: [{ options: [], price: 300 }] })).json
  assert.equal(product.templateId, a.id)
  assert.equal((await s.owner.call('DELETE', `${s.base}/${a.id}`)).status, 204)
  const [row] = await tx(s.owner.id, (t) => t.select({ templateId: products.templateId }).from(products).where(eq(products.id, product.id)))
  assert.equal(row.templateId, null)
})

test('staff look at templates but cannot change them; other stores see nothing', async () => {
  const s = await shop()
  const made = (await s.owner.call('POST', s.base, { type: 'footer', title: 'Footer' })).json
  const staff = await s.join('staff')
  assert.equal((await staff.call('GET', `${s.base}/${made.id}`)).status, 200)
  assert.equal((await staff.call('PUT', `${s.base}/${made.id}`, { draft: { version: 2, sections: [] }, revision: made.revision })).status, 403)
  assert.equal((await staff.call('POST', s.base, { type: 'footer', title: 'Mine' })).status, 403)
  assert.equal((await staff.call('PUT', `/stores/${s.handle}/site-style`, (await staff.call('GET', `/stores/${s.handle}/site-style`)).json)).status, 403)
  const other = await shop()
  assert.equal((await other.owner.call('GET', `${s.base}/${made.id}`)).status, 404)
  assert.deepEqual(await tx(other.owner.id, (t) => t.select().from(templates).where(eq(templates.storeId, s.storeId))), [])
  assert.equal((await other.owner.call('POST', `/stores/${other.handle}/products`, { name: 'x', templateId: made.id, variants: [{ options: [], price: 1 }] })).status >= 400, true, 'another store’s template cannot be picked')
})

test('history restores a template version into the draft; Site settings refuse unsafe values', async () => {
  const s = await shop()
  let t = (await s.owner.call('POST', s.base, { type: 'home', title: 'Home', from: 'blank' })).json
  t = (await s.owner.call('GET', `${s.base}/${t.id}`)).json
  t = (await s.owner.call('PUT', `${s.base}/${t.id}`, { title: 'Home v1', draft: t.draft, revision: t.revision })).json
  t = (await s.owner.call('POST', `${s.base}/${t.id}/publish`, { revision: t.revision })).json
  t = (await s.owner.call('PUT', `${s.base}/${t.id}`, { title: 'Home v2', draft: t.draft, revision: t.revision })).json
  const versions = (await s.owner.call('GET', `${s.base}/${t.id}/versions`)).json
  const publish = versions.find((v: any) => v.label === 'publish')
  assert.equal((await s.owner.call('POST', `/stores/${s.handle}/versions/${publish.id}/restore`, { revision: t.revision })).status, 200)
  assert.equal((await s.owner.call('GET', `${s.base}/${t.id}`)).json.title, 'Home v1')
  const style = (await s.owner.call('GET', `/stores/${s.handle}/site-style`)).json
  assert.equal((await s.owner.call('PUT', `/stores/${s.handle}/site-style`, { ...style, css: '</style>' })).status, 400)
  assert.equal((await s.owner.call('PUT', `/stores/${s.handle}/site-style`, { ...style, radius: 4 })).json.radius, 4)
})

test('the store preview shows the default published home template, else the built-in one', async () => {
  const s = await shop()
  const preview = async () => (await s.owner.call('GET', `/stores/${s.handle}/store-preview`)).json
  const { builtInTemplates } = await import('storefront/site')
  assert.deepEqual((await preview()).home, builtInTemplates.home)
  const made = (await s.owner.call('POST', s.base, { type: 'home', title: 'Blank', from: 'blank' })).json
  await s.owner.call('POST', `${s.base}/${made.id}/publish`, { revision: made.revision })
  assert.deepEqual((await preview()).home, builtInTemplates.home, 'not shown until it is the default')
  await s.owner.call('POST', `${s.base}/${made.id}/default`)
  assert.deepEqual((await preview()).home.sections, [])
  assert.deepEqual((await preview()).images, {})
})

test('every store has editable built-in templates that cannot be deleted, unpublished or stop being built in', async () => {
  const s = await shop()
  const { builtInTemplates, templateTypes } = await import('storefront/site')
  const list = (await s.owner.call('GET', s.base)).json
  assert.deepEqual(list.filter((t: any) => t.builtIn).map((t: any) => t.type).sort(), [...templateTypes].sort())
  const home = list.find((t: any) => t.builtIn && t.type === 'home')
  assert.equal(home.isPublished, true)
  assert.equal(home.isDefault, false)
  assert.equal((await s.owner.call('DELETE', `${s.base}/${home.id}`)).json.error, 'templateBuiltIn')
  assert.equal((await s.owner.call('POST', `${s.base}/${home.id}/unpublish`)).json.error, 'templateBuiltIn')
  // Row-level security refuses the delete even past the API, and the flag cannot be switched off.
  assert.equal((await tx(s.owner.id, (t) => t.delete(templates).where(eq(templates.id, home.id)).returning())).length, 0)
  await assert.rejects(tx(s.owner.id, (t) => t.update(templates).set({ builtIn: false }).where(eq(templates.id, home.id))))
  // Edited and published, it is what the store shows until another template is the default.
  const opened = (await s.owner.call('GET', `${s.base}/${home.id}`)).json
  const saved = (await s.owner.call('PUT', `${s.base}/${home.id}`, { title: 'Front', draft: { version: 2, sections: [] }, revision: opened.revision })).json
  await s.owner.call('POST', `${s.base}/${home.id}/publish`, { revision: saved.revision })
  const shown = async () => (await tx(null, (t) => t.execute<{ doc: any }>(sql`select storefront_template(${s.storeId}::uuid, 'home', null) as doc`))).rows[0].doc
  assert.deepEqual((await shown()).sections, [])
  const other = (await s.owner.call('POST', s.base, { type: 'home', title: 'Other', from: 'builtin' })).json
  await s.owner.call('POST', `${s.base}/${other.id}/publish`, { revision: other.revision })
  await s.owner.call('POST', `${s.base}/${other.id}/default`)
  assert.deepEqual((await shown()).sections, builtInTemplates.home.sections, 'the new default wins')
  await s.owner.call('DELETE', `${s.base}/${other.id}`)
  assert.deepEqual((await shown()).sections, [], 'back to the edited built-in copy')
  assert.equal((await s.owner.call('GET', `/stores/${s.handle}/store-preview`)).json.home.sections.length, 0)
})

test('your own template can be unpublished unless it is the default; the store then shows the default again', async () => {
  const s = await shop()
  const made = (await s.owner.call('POST', s.base, { type: 'home', title: 'Mine', from: 'blank' })).json
  await s.owner.call('POST', `${s.base}/${made.id}/publish`, { revision: made.revision })
  await s.owner.call('POST', `${s.base}/${made.id}/default`)
  assert.equal((await s.owner.call('POST', `${s.base}/${made.id}/unpublish`)).json.error, 'templateDefault')
  await s.owner.call('DELETE', `${s.base}/${made.id}/default`)
  const done = await s.owner.call('POST', `${s.base}/${made.id}/unpublish`)
  assert.equal(done.json.isPublished, false)
  const shown = (await tx(null, (t) => t.execute<{ doc: any }>(sql`select storefront_template(${s.storeId}::uuid, 'home', ${made.id}::uuid) as doc`))).rows[0].doc
  assert.ok(shown.sections.length > 0, 'a page that picked it gets the built-in copy')
})
