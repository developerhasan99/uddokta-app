import { and, asc, eq, ilike, inArray, ne, or, sql } from 'drizzle-orm'
import type { Hono } from 'hono'
import { fixedMenus, linkedIds, maxMenus, readMenuItems, walkMenu, type MenuItem } from 'storefront/menus'
import { databaseCode, fail, storeByHandle, type Env } from './app.ts'
import { tx, type Tx } from './db.ts'
import { isId } from './products.ts'
import { collections, menus, pages, products } from './schema.ts'

const isFixed = (handle: string) => (fixedMenus as readonly string[]).includes(handle)
const handleFormat = /^[a-z0-9]+(-[a-z0-9]+)*$/
// A menu handle from its title: Latin letters and digits only, since themes refer to menus by handle.
const toHandle = (title: string) => title.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '')

function readTitle(raw: unknown) {
  const title = typeof raw === 'string' ? raw.trim() : ''
  if (!title || title.length > 60) throw fail(400, 'nameRequired')
  return title
}

// Linked records a buyer can open; any other linked id is a broken link (deleted, a draft, or unpublished).
async function visibleTargets(t: Tx, storeId: string, ids: string[]) {
  if (!ids.length) return new Set<string>()
  const rows = (await t.execute<{ id: string }>(sql`select id from storefront_link_targets(${storeId}::uuid, ${`{${ids.join(',')}}`}::uuid[])`)).rows
  return new Set(rows.map((r) => r.id))
}
const brokenCount = (items: MenuItem[], visible: Set<string>) => [...walkMenu(items)].filter((i) => i.link.id && !visible.has(i.link.id)).length

const conflict = (err: unknown): never => {
  if (databaseCode(err) === '23505') throw fail(409, 'handleTaken')
  throw err
}

export function registerMenus(app: Hono<Env>) {
  app.get('/stores/:handle/menus', async (c) => tx(c.get('userId'), async (t) => {
    const store = await storeByHandle(t, c.req.param('handle'))
    const rows = await t.select().from(menus).where(eq(menus.storeId, store.id)).orderBy(sql`case ${menus.handle} when 'main-menu' then 0 when 'footer' then 1 else 2 end`, asc(menus.title))
    const visible = await visibleTargets(t, store.id, [...new Set(rows.flatMap((r) => linkedIds(r.items)))])
    return c.json(rows.map((r) => ({ id: r.id, handle: r.handle, title: r.title, fixed: isFixed(r.handle), items: [...walkMenu(r.items)].length, broken: brokenCount(r.items, visible), updatedAt: r.updatedAt })))
  }))

  app.get('/stores/:handle/menus/:id', async (c) => {
    const id = c.req.param('id')
    if (!isId(id)) throw fail(404, 'notFound')
    return tx(c.get('userId'), async (t) => {
      const store = await storeByHandle(t, c.req.param('handle'))
      const [row] = await t.select().from(menus).where(and(eq(menus.storeId, store.id), eq(menus.id, id)))
      if (!row) throw fail(404, 'notFound')
      return c.json({ id: row.id, handle: row.handle, title: row.title, fixed: isFixed(row.handle), items: row.items, revision: row.revision })
    })
  })

  app.post('/stores/:handle/menus', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    const title = readTitle(body?.title)
    return tx(c.get('userId'), async (t) => {
      const store = await storeByHandle(t, c.req.param('handle'))
      await t.execute(sql`select pg_advisory_xact_lock(hashtext(${`menus:${store.id}`}))`)
      const taken = new Set((await t.select({ handle: menus.handle }).from(menus).where(eq(menus.storeId, store.id))).map((r) => r.handle))
      if (taken.size >= maxMenus) throw fail(409, 'menuLimit')
      const base = toHandle(title) || 'menu'
      let handle = base
      for (let n = 2; taken.has(handle); n++) handle = `${base}-${n}`
      const [row] = await t.insert(menus).values({ storeId: store.id, title, handle }).returning({ id: menus.id })
      return c.json({ id: row.id, handle }, 201)
    })
  })

  // Saves the whole menu. A stale revision means someone else saved first: 409, never a silent overwrite.
  app.put('/stores/:handle/menus/:id', async (c) => {
    const id = c.req.param('id')
    if (!isId(id)) throw fail(404, 'notFound')
    const body = await c.req.json().catch(() => null)
    if (!body || !Number.isInteger(body.revision)) throw fail(400, 'invalidRequest')
    const title = readTitle(body.title)
    const items = readMenuItems(body.items)
    if (!items) throw fail(400, 'menuInvalid')
    const handle = typeof body.handle === 'string' ? body.handle.trim().toLowerCase() : ''
    if (!handleFormat.test(handle) || handle.length > 60) throw fail(400, 'handleInvalid')
    return tx(c.get('userId'), async (t) => {
      const store = await storeByHandle(t, c.req.param('handle'))
      const [current] = await t.select({ handle: menus.handle, revision: menus.revision }).from(menus).where(and(eq(menus.storeId, store.id), eq(menus.id, id)))
      if (!current) throw fail(404, 'notFound')
      if (current.revision !== body.revision) throw fail(409, 'menuChanged')
      // Themes find the built-in menus by handle, so theirs never changes; nor can another menu take one.
      if (handle !== current.handle && (isFixed(current.handle) || isFixed(handle))) throw fail(400, 'handleInvalid')
      const [row] = await t.update(menus).set({ title, handle, items, revision: sql`${menus.revision} + 1`, updatedAt: sql`now()` })
        .where(and(eq(menus.storeId, store.id), eq(menus.id, id), eq(menus.revision, body.revision))).returning().catch(conflict)
      if (!row) throw fail(409, 'menuChanged')
      return c.json({ id: row.id, handle: row.handle, title: row.title, fixed: isFixed(row.handle), items: row.items, revision: row.revision })
    })
  })

  app.delete('/stores/:handle/menus/:id', async (c) => {
    const id = c.req.param('id')
    if (!isId(id)) throw fail(404, 'notFound')
    return tx(c.get('userId'), async (t) => {
      const store = await storeByHandle(t, c.req.param('handle'))
      const [row] = await t.select({ handle: menus.handle }).from(menus).where(and(eq(menus.storeId, store.id), eq(menus.id, id)))
      if (!row) throw fail(404, 'notFound')
      if (isFixed(row.handle)) throw fail(409, 'menuFixed')
      const gone = await t.delete(menus).where(and(eq(menus.storeId, store.id), eq(menus.id, id))).returning({ id: menus.id })
      if (!gone.length) throw fail(403, 'forbidden')
      return c.body(null, 204)
    })
  })

  // What a menu item can link to, for the link picker: a search across the store's records (q), or the given ids (ids=a,b)
  // so the editor can show names and mark broken links. visible = a buyer can open it now.
  app.get('/stores/:handle/link-targets', async (c) => tx(c.get('userId'), async (t) => {
    const store = await storeByHandle(t, c.req.param('handle'))
    const q = (c.req.query('q') ?? '').trim().slice(0, 100)
    const ids = (c.req.query('ids') ?? '').split(',').filter(isId).slice(0, 200)
    const byIds = c.req.query('ids') !== undefined
    if (byIds && !ids.length) return c.json([])
    const like = `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`
    const limit = byIds ? 200 : 15
    const cols = await t.select({ id: collections.id, title: collections.name, handle: collections.handle }).from(collections)
        .where(and(eq(collections.storeId, store.id), byIds ? inArray(collections.id, ids) : ilike(collections.name, like))).orderBy(asc(collections.name)).limit(limit)
    const prods = await t.select({ id: products.id, title: products.name, handle: products.handle, status: products.status }).from(products)
        .where(and(eq(products.storeId, store.id), byIds ? inArray(products.id, ids) : and(ne(products.status, 'draft'), ilike(products.name, like)))).orderBy(asc(products.name)).limit(limit)
    const lps = await t.select({ id: pages.id, title: pages.title, handle: sql<string>`coalesce(${pages.publishedMeta}->>'handle', ${pages.handle})` }).from(pages)
        .where(and(eq(pages.storeId, store.id), byIds ? inArray(pages.id, ids) : and(sql`${pages.published} is not null`, or(ilike(pages.title, like), ilike(pages.handle, like))))).orderBy(asc(pages.title)).limit(limit)
    const visible = await visibleTargets(t, store.id, [...cols, ...prods, ...lps].map((r) => r.id))
    return c.json([
      ...cols.map((r) => ({ type: 'collection', id: r.id, title: r.title, handle: r.handle, visible: visible.has(r.id) })),
      ...prods.map((r) => ({ type: 'product', id: r.id, title: r.title, handle: r.handle, visible: visible.has(r.id) })),
      ...lps.map((r) => ({ type: 'page', id: r.id, title: r.title, handle: r.handle, visible: visible.has(r.id) })),
    ])
  }))
}
