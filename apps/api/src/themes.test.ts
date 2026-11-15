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
