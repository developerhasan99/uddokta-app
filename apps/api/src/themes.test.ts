import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { readTheme, type ThemeDoc } from 'storefront/theme'
import { app } from './app.ts'
import { pool, tx } from './db.ts'
import { stores, themes } from './schema.ts'

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
  await call('POST', '/auth/signup', { name: 'Seller', email: `theme-${++counter}@example.com`, password: 'correct horse' })
  return { call, id: (await call('GET', '/me')).json.user.id as string }
}

async function shop() {
  const owner = await person()
  const handle = `theme-shop-${counter}`
  const created = await owner.call('POST', '/stores', { name: 'Shop', handle })
  const join = async (role: string) => {
    const member = await person()
    const invite = await owner.call('POST', `/stores/${handle}/invites`, { role })
    await member.call('POST', `/invites/${invite.json.token}/accept`)
    return member
  }
  const live = async (who = owner) => tx(who.id, async (t) => {
    const [store] = await t.select().from(stores).where(eq(stores.id, created.json.id))
    const [theme] = store?.liveThemeId ? await t.select().from(themes).where(eq(themes.id, store.liveThemeId)) : []
    return theme
  })
  return { owner, handle, join, live, storeId: created.json.id as string }
}

test('a new store starts with the starter theme, published and live', async () => {
  const s = await shop()
  const theme = await s.live()
  assert.ok(theme)
  assert.ok(readTheme(theme.published), 'the live copy passes validation')
  assert.deepEqual(theme.draft, theme.published)
})

test('choosing a style restyles the live theme at once; staff cannot', async () => {
  const s = await shop()
  assert.equal((await s.owner.call('PUT', `/stores/${s.handle}/theme`, { theme: 'night' })).status, 200)
  const theme = await s.live()
  assert.equal((theme.published as ThemeDoc).settings.colors.paper, '#141414')
  assert.equal((theme.draft as ThemeDoc).settings.colors.paper, '#141414')
  const staff = await s.join('staff')
  assert.equal((await staff.call('PUT', `/stores/${s.handle}/theme`, { theme: 'fresh' })).status, 403)
  await tx(staff.id, (t) => t.update(themes).set({ name: 'Taken over' }).where(eq(themes.id, theme.id)))
  assert.equal((await s.live()).name, theme.name, 'row-level security keeps staff from changing themes')
})

test('the live theme cannot be deleted, and other stores never see a store’s themes', async () => {
  const s = await shop()
  const theme = await s.live()
  await assert.rejects(tx(s.owner.id, (t) => t.delete(themes).where(eq(themes.id, theme.id))))
  const other = await shop()
  assert.deepEqual(await tx(other.owner.id, (t) => t.select().from(themes).where(eq(themes.storeId, s.storeId))), [])
})

test('the editor saves a valid draft, refuses invalid or stale ones, and publishing makes the draft live', async () => {
  const s = await shop()
  const base = `/stores/${s.handle}/themes`
  const [theme] = (await s.owner.call('GET', base)).json
  const full = (await s.owner.call('GET', `${base}/${theme.id}`)).json
  const draft = { ...full.draft, settings: { ...full.draft.settings, colors: { ...full.draft.settings.colors, accent: '#123456' } }, templates: { ...full.draft.templates, 'product.gift': full.draft.templates.product } }
  const saved = await s.owner.call('PUT', `${base}/${theme.id}`, { name: 'Spring', draft, revision: full.revision })
  assert.equal(saved.status, 200)
  assert.equal(saved.json.hasChanges, true)
  assert.equal((await s.live()).name, 'Spring')
  assert.equal(((await s.live()).published as ThemeDoc).settings.colors.accent === '#123456', false, 'saving does not change the live store')
  assert.equal((await s.owner.call('PUT', `${base}/${theme.id}`, { draft, revision: full.revision })).json.error, 'themeChanged')
  assert.equal((await s.owner.call('PUT', `${base}/${theme.id}`, { draft: { ...draft, css: '</style>' }, revision: saved.json.revision })).json.error, 'themeInvalid')
  const other = await shop()
  const foreign = { ...draft, header: [{ id: 'logo', type: 'storeHeader', hidden: false, settings: { logo: '00000000-0000-4000-8000-000000000000' } }] }
  assert.equal((await s.owner.call('PUT', `${base}/${theme.id}`, { draft: foreign, revision: saved.json.revision })).json.error, 'themeInvalid', 'images must be the store’s own')
  assert.deepEqual((await s.owner.call('GET', `/stores/${s.handle}/theme-templates`)).json, { product: ['gift'], collection: [], page: [] })
  const published = await s.owner.call('POST', `${base}/${theme.id}/publish`, { revision: saved.json.revision })
  assert.equal(published.json.hasChanges, false)
  assert.equal(((await s.live()).published as ThemeDoc).settings.colors.accent, '#123456')
  const staff = await s.join('staff')
  assert.equal((await staff.call('PUT', `${base}/${theme.id}`, { draft, revision: published.json.revision })).status, 403)
  assert.equal((await other.owner.call('GET', `${base}/${theme.id}`)).status, 404)
})

test('the library: add, duplicate, make live once published, delete all but the live theme, up to ten themes', async () => {
  const s = await shop()
  const base = `/stores/${s.handle}/themes`
  const [live] = (await s.owner.call('GET', base)).json
  const made = await s.owner.call('POST', base, { name: 'Night', variation: 'night' })
  assert.equal(made.status, 201)
  assert.equal(made.json.isLive, false)
  assert.equal(made.json.isPublished, false)
  assert.equal((await s.owner.call('POST', `${base}/${made.json.id}/live`)).json.error, 'themeNotPublished')
  await s.owner.call('POST', `${base}/${made.json.id}/publish`, { revision: made.json.revision })
  assert.equal((await s.owner.call('POST', `${base}/${made.json.id}/live`)).status, 200)
  assert.equal((await s.live()).id, made.json.id)
  assert.equal((await s.owner.call('DELETE', `${base}/${made.json.id}`)).json.error, 'themeLive')
  assert.equal((await s.owner.call('DELETE', `${base}/${live.id}`)).status, 204, 'the old theme can go once another is live')
  const copy = await s.owner.call('POST', base, { name: 'Copy', from: made.json.id })
  assert.equal(copy.status, 201)
  for (let i = 0; i < 8; i++) await s.owner.call('POST', base, { name: `T${i}` })
  assert.equal((await s.owner.call('POST', base, { name: 'One too many' })).json.error, 'themeLimit')
  const staff = await s.join('staff')
  assert.equal((await staff.call('POST', base, { name: 'x' })).status, 409, 'staff hit the limit check first, then row-level security')
})
