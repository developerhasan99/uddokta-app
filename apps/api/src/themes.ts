import { and, desc, eq, inArray, ne, sql } from 'drizzle-orm'
import type { Context, Hono } from 'hono'
import { linkedIds, resolveMenu, type IdLinkType, type LinkTargets, type MenuItem } from 'storefront/menus'
import { readTheme, starterTheme, themeReferences, variationSettings, type ThemeDoc } from 'storefront/theme'
import { isPreset, type PresetId } from 'storefront/themes'
import { fail, storeByHandle, type Env } from './app.ts'
import { tx, type Tx } from './db.ts'
import { isId } from './products.ts'
import { collections, media, products, storePages, stores, themeMedia, themes } from './schema.ts'
import { getFile, publicUrl } from './storage.ts'
import { saveImage } from './media.ts'
import { remap } from './pages.ts'
import { signExport, verifyExport } from './secrets.ts'
import type { Content } from 'storefront/schema'
import { recordVersion } from './versions.ts'

export const starterName = 'উদ্যোক্তা'

// Keeps theme_media equal to the images in the draft and published copies, which is what blocks deleting them.
export async function syncThemeMedia(t: Tx, storeId: string, themeId: string, ...docs: (ThemeDoc | null)[]) {
  const ids = new Set(docs.flatMap((d) => (d ? themeReferences(d).media : [])))
  await t.delete(themeMedia).where(eq(themeMedia.themeId, themeId))
  if (ids.size) await t.insert(themeMedia).values([...ids].map((mediaId) => ({ storeId, themeId, mediaId })))
}

// Every store starts with the starter theme, published and live, in the style it chose.
export async function createStarterTheme(t: Tx, storeId: string, variation: PresetId = 'fresh') {
  const doc = starterTheme(variation)
  const [row] = await t.insert(themes).values({ storeId, name: starterName, draft: doc, published: doc, starter: `starter:${variation}`, publishedAt: sql`now()` }).returning({ id: themes.id })
  await t.update(stores).set({ liveThemeId: row.id }).where(eq(stores.id, storeId))
  return row.id
}

// One-click style: the preset's colours, font and corners on the live theme, in both copies so the store changes now.
export async function applyVariation(t: Tx, storeId: string, themeId: string | null, variation: PresetId) {
  if (!themeId) return
  const [row] = await t.select().from(themes).where(and(eq(themes.storeId, storeId), eq(themes.id, themeId)))
  if (!row) return
  const settings = variationSettings(variation)
  const restyle = (doc: unknown) => (doc ? { ...(doc as ThemeDoc), settings: { ...settings, latin: (doc as ThemeDoc).settings.latin, width: (doc as ThemeDoc).settings.width } } : doc)
  await t.update(themes).set({ draft: restyle(row.draft), published: restyle(row.published), revision: sql`${themes.revision} + 1`, updatedAt: sql`now()` }).where(eq(themes.id, row.id))
}

// ---- API ----

const maxThemes = 10
const themeFormat = 'uddokta-theme'
const maxThemeImportBytes = 2_000_000

const presentTheme = (row: typeof themes.$inferSelect, liveId: string | null) => ({
  id: row.id, name: row.name, starter: row.starter, revision: row.revision, isLive: row.id === liveId, isPublished: row.published !== null,
  hasChanges: row.published !== null && JSON.stringify(row.draft) !== JSON.stringify(row.published), updatedAt: row.updatedAt, publishedAt: row.publishedAt,
  settings: (row.draft as ThemeDoc).settings,
})

// Everything a theme points at must be the store's own.
async function checkThemeReferences(t: Tx, storeId: string, doc: ThemeDoc) {
  const refs = themeReferences(doc)
  const count = async (table: typeof media | typeof products | typeof collections, ids: string[]) =>
    ids.length ? (await t.select({ id: table.id }).from(table).where(and(eq(table.storeId, storeId), inArray(table.id, ids)))).length : 0
  if (await count(media, refs.media) !== refs.media.length || await count(products, refs.products) !== refs.products.length || await count(collections, refs.collections) !== refs.collections.length) throw fail(400, 'themeInvalid')
}

const readName = (raw: unknown) => {
  const name = typeof raw === 'string' ? raw.trim() : ''
  if (!name || name.length > 60) throw fail(400, 'nameRequired')
  return name
}

export function registerThemes(app: Hono<Env>) {
  const themeRoute = (handler: (c: Context<Env>, t: Tx, store: typeof stores.$inferSelect, row: typeof themes.$inferSelect) => Promise<Response>) => async (c: Context<Env>) => {
    const id = c.req.param('id')!
    if (!isId(id)) throw fail(404, 'notFound')
    return tx(c.get('userId'), async (t) => {
      const store = await storeByHandle(t, c.req.param('handle')!)
      const [row] = await t.select().from(themes).where(and(eq(themes.storeId, store.id), eq(themes.id, id)))
      if (!row) throw fail(404, 'notFound')
      return handler(c, t, store, row)
    })
  }

  app.get('/stores/:handle/themes', async (c) => tx(c.get('userId'), async (t) => {
    const store = await storeByHandle(t, c.req.param('handle'))
    const rows = await t.select().from(themes).where(eq(themes.storeId, store.id)).orderBy(desc(themes.updatedAt))
    return c.json(rows.map((r) => presentTheme(r, store.liveThemeId)))
  }))

  app.get('/stores/:handle/themes/:id', themeRoute(async (c, _t, store, row) => c.json({ ...presentTheme(row, store.liveThemeId), draft: row.draft })))

  // Saves the draft (and name). A stale revision gets 409 themeChanged; the live store changes only on publish.
  app.put('/stores/:handle/themes/:id', themeRoute(async (c, t, store, row) => {
    const body = await c.req.json().catch(() => null)
    if (!body || !Number.isInteger(body.revision)) throw fail(400, 'invalidRequest')
    const draft = readTheme(body.draft)
    if (!draft) throw fail(400, 'themeInvalid')
    const name = body.name === undefined ? row.name : readName(body.name)
    await checkThemeReferences(t, store.id, draft)
    const [saved] = await t.update(themes).set({ name, draft, revision: sql`${themes.revision} + 1`, updatedAt: sql`now()` })
      .where(and(eq(themes.id, row.id), eq(themes.revision, body.revision))).returning()
    if (!saved) throw fail(row.revision !== body.revision ? 409 : 403, row.revision !== body.revision ? 'themeChanged' : 'forbidden')
    await syncThemeMedia(t, store.id, row.id, draft, saved.published as ThemeDoc | null)
    await recordVersion(t, store.id, { themeId: row.id }, 'save', { name, draft }, c.get('userId'))
    return c.json({ ...presentTheme(saved, store.liveThemeId), draft: saved.draft })
  }))

  // Copies the draft to the published copy. For the live theme that is what buyers see from now on.
  // ponytail: no CDN in front of the storefront yet; purge the store's pages here once Cloudflare caches them.
  app.post('/stores/:handle/themes/:id/publish', themeRoute(async (c, t, store, row) => {
    const body = await c.req.json().catch(() => null)
    if (!body || !Number.isInteger(body.revision)) throw fail(400, 'invalidRequest')
    if (row.revision !== body.revision) throw fail(409, 'themeChanged')
    const [saved] = await t.update(themes).set({ published: sql`${themes.draft}`, publishedAt: sql`now()`, revision: sql`${themes.revision} + 1` }).where(eq(themes.id, row.id)).returning()
    if (!saved) throw fail(403, 'forbidden')
    await recordVersion(t, store.id, { themeId: row.id }, 'publish', { name: saved.name, draft: saved.draft }, c.get('userId'))
    return c.json({ ...presentTheme(saved, store.liveThemeId), draft: saved.draft })
  }))

  // Makes a published theme the one buyers see.
  app.post('/stores/:handle/themes/:id/live', themeRoute(async (c, t, store, row) => {
    if (row.published === null) throw fail(409, 'themeNotPublished')
    const [updated] = await t.update(stores).set({ liveThemeId: row.id }).where(eq(stores.id, store.id)).returning({ id: stores.id })
    if (!updated) throw fail(403, 'forbidden')
    return c.json(presentTheme(row, row.id))
  }))

  app.delete('/stores/:handle/themes/:id', themeRoute(async (c, t, store, row) => {
    if (row.id === store.liveThemeId) throw fail(409, 'themeLive')
    const gone = await t.delete(themes).where(eq(themes.id, row.id)).returning({ id: themes.id })
    if (!gone.length) throw fail(403, 'forbidden')
    return c.body(null, 204)
  }))

  // A new theme in the library: a starter in one of its styles, or a copy of another theme's draft. Never live until chosen.
  app.post('/stores/:handle/themes', async (c) => {
    const body = await c.req.json().catch(() => null)
    if (!body || typeof body !== 'object') throw fail(400, 'invalidRequest')
    const name = readName(body.name)
    return tx(c.get('userId'), async (t) => {
      const store = await storeByHandle(t, c.req.param('handle'))
      await t.execute(sql`select pg_advisory_xact_lock(hashtext(${`themes:${store.id}`}))`)
      const [{ n }] = await t.select({ n: sql<number>`count(*)::int` }).from(themes).where(eq(themes.storeId, store.id))
      if (n >= maxThemes) throw fail(409, 'themeLimit')
      let doc: ThemeDoc
      let starter: string
      if (body.from !== undefined) {
        if (!isId(body.from)) throw fail(400, 'invalidRequest')
        const [source] = await t.select().from(themes).where(and(eq(themes.storeId, store.id), eq(themes.id, body.from)))
        if (!source) throw fail(404, 'notFound')
        doc = source.draft as ThemeDoc
        starter = source.starter
      } else {
        if (!isPreset(body.variation ?? 'fresh')) throw fail(400, 'invalidRequest')
        doc = starterTheme(body.variation ?? 'fresh')
        starter = `starter:${body.variation ?? 'fresh'}`
      }
      const [row] = await t.insert(themes).values({ storeId: store.id, name, draft: doc, starter }).returning()
      if (!row) throw fail(403, 'forbidden')
      await syncThemeMedia(t, store.id, row.id, doc)
      return c.json(presentTheme(row, store.liveThemeId), 201)
    })
  })

  // Theme file: the draft and where its images live, signed so only our own unchanged files come back in.
  app.get('/stores/:handle/themes/:id/export', themeRoute(async (c, t, store, row) => {
    const doc = row.draft as ThemeDoc
    const ids = themeReferences(doc).media
    const files = ids.length ? await t.select().from(media).where(and(eq(media.storeId, store.id), inArray(media.id, ids))) : []
    const payload = JSON.stringify({
      exportedAt: new Date().toISOString(), name: row.name, draft: doc,
      media: files.map((m) => ({ id: m.id, key: m.key, thumbKey: m.thumbKey, name: m.name, alt: m.alt, width: m.width, height: m.height, sourceFormat: m.sourceFormat })),
    })
    return c.json({ format: themeFormat, version: 1, payload, signature: signExport(payload) })
  }))

  // Import: a new, unpublished theme in the library. Images already in this store are kept, others on the platform are
  // copied in (counting against storage); missing images, products and collections become blank.
  app.post('/stores/:handle/themes/import', async (c) => {
    const body = await c.req.json().catch(() => null)
    if (!body || body.format !== themeFormat || body.version !== 1 || typeof body.payload !== 'string' || body.payload.length > maxThemeImportBytes || !verifyExport(body.payload, body.signature)) throw fail(400, 'importInvalid')
    const data = JSON.parse(body.payload)
    const userId = c.get('userId')
    const source = readTheme(data.draft)
    if (!source) throw fail(400, 'importInvalid')
    const name = typeof data.name === 'string' && data.name.trim() ? data.name.trim().slice(0, 60) : starterName
    const storeId = await tx(userId, async (t) => (await storeByHandle(t, c.req.param('handle')!)).id)
    const refs = themeReferences(source)
    const swap = new Map<string, string | null>()
    const own = await tx(userId, async (t) => {
      const have = async (table: typeof media | typeof products | typeof collections, ids: string[]) => (ids.length ? (await t.select({ id: table.id }).from(table).where(and(eq(table.storeId, storeId), inArray(table.id, ids)))).map((r) => r.id) : [])
      return new Set([...await have(media, refs.media), ...await have(products, refs.products), ...await have(collections, refs.collections)])
    })
    const files = new Map<string, any>((Array.isArray(data.media) ? data.media : []).map((m: any) => [m.id, m]))
    for (const id of refs.media) {
      if (own.has(id)) continue
      const file = files.get(id)
      const [full, thumb] = file ? await Promise.all([getFile(file.key), getFile(file.thumbKey)]).catch(() => [null, null]) : [null, null]
      if (!full || !thumb) { swap.set(id, null); continue }
      const copy = await saveImage(userId, storeId, String(file.name ?? 'image'), { full, thumb, width: file.width, height: file.height, sourceFormat: String(file.sourceFormat ?? 'webp') })
      swap.set(id, copy.id)
    }
    for (const id of [...refs.products, ...refs.collections]) if (!own.has(id)) swap.set(id, null)
    const doc = readTheme(remap(source as unknown as Content, swap))
    if (!doc) throw fail(400, 'importInvalid')
    return tx(userId, async (t) => {
      const store = await storeByHandle(t, c.req.param('handle')!)
      await t.execute(sql`select pg_advisory_xact_lock(hashtext(${`themes:${store.id}`}))`)
      const [{ n }] = await t.select({ n: sql<number>`count(*)::int` }).from(themes).where(eq(themes.storeId, store.id))
      if (n >= maxThemes) throw fail(409, 'themeLimit')
      const [row] = await t.insert(themes).values({ storeId: store.id, name, draft: doc, starter: 'import' }).returning()
      if (!row) throw fail(403, 'forbidden')
      await syncThemeMedia(t, store.id, row.id, doc)
      return c.json(presentTheme(row, store.liveThemeId), 201)
    })
  })

  // The live theme's alternate templates by kind ("gift" for product.gift), for the Template choice on products,
  // collections and store pages. Both copies count, so a template made but not yet published can already be chosen.
  app.get('/stores/:handle/theme-templates', async (c) => tx(c.get('userId'), async (t) => {
    const store = await storeByHandle(t, c.req.param('handle'))
    const [row] = store.liveThemeId ? await t.select({ draft: themes.draft, published: themes.published }).from(themes).where(eq(themes.id, store.liveThemeId)) : []
    const keys = new Set([...Object.keys((row?.draft as ThemeDoc | undefined)?.templates ?? {}), ...Object.keys((row?.published as ThemeDoc | null | undefined)?.templates ?? {})])
    const by = (kind: string) => [...keys].filter((k) => k.startsWith(`${kind}.`)).map((k) => k.slice(kind.length + 1)).sort()
    return c.json({ product: by('product'), collection: by('collection'), page: by('page') })
  }))

  // What the editor's preview needs to draw store blocks like the live store does: the store, its menus with links
  // resolved, collections, products to list, and the product, collection or page being previewed. Buyer-visible data only.
  app.get('/stores/:handle/theme-preview', async (c) => tx(c.get('userId'), async (t) => {
    const store = await storeByHandle(t, c.req.param('handle'))
    const q = (key: string) => { const v = c.req.query(key); return v && isId(v) ? v : null }
    const img = (key: string | null, alt: string, width: number, height: number) => (key ? { url: publicUrl(key), alt, width, height } : null)
    const info = (await t.execute<{ logo_key: string | null; logo_width: number; logo_height: number; phone: string; whatsapp: string; email: string; address: string; facebook: string }>(sql`select * from storefront_store_info(${store.id}::uuid)`)).rows[0]
    const rows = (await t.execute<{ handle: string; items: MenuItem[] }>(sql`select * from storefront_menus(${store.id}::uuid)`)).rows
    const ids = linkedIds(rows.flatMap((r) => r.items))
    const targets: LinkTargets = new Map(ids.length ? (await t.execute<{ id: string; type: IdLinkType; handle: string }>(sql`select * from storefront_link_targets(${store.id}::uuid, ${`{${ids.join(',')}}`}::uuid[])`)).rows.map((r) => [r.id, { type: r.type, handle: r.handle }]) : [])
    const collectionRows = (await t.execute<{ id: string; name: string; handle: string; image_key: string | null; image_width: number; image_height: number }>(sql`select * from storefront_collection_cards(${store.id}::uuid)`)).rows
    const menus = Object.fromEntries(rows.map((r) => [r.handle, resolveMenu(r.items, targets)]))
    if (!menus['main-menu']?.length) menus['main-menu'] = collectionRows.map((x) => ({ title: x.name, href: `/collections/${encodeURIComponent(x.handle)}`, children: [] }))
    const collectionId = q('collection')
    const cards = (await t.execute<{ id: string; name: string; handle: string; min_price: number; compare_price: number | null; image_key: string | null; image_alt: string; image_width: number; image_height: number; in_stock: boolean }>(sql`select * from storefront_listing(${store.id}::uuid, ${collectionId}::uuid, 48, 0)`)).rows
      .map((r) => ({ id: r.id, name: r.name, handle: r.handle, price: r.min_price, comparePrice: r.compare_price, image: img(r.image_key, r.image_alt || r.name, r.image_width, r.image_height), inStock: r.in_stock }))
    let product = null
    const productId = q('product')
    if (productId) {
      const [found] = await t.select({ handle: products.handle }).from(products).where(and(eq(products.storeId, store.id), eq(products.id, productId)))
      const row = found && (await t.execute<{ id: string; name: string; description: string; images: { key: string; alt: string; width: number; height: number }[]; variants: { id: string; options: string[]; price: number; comparePrice: number | null; stock: number | null }[] }>(sql`select * from storefront_product(${store.id}::uuid, ${found.handle})`)).rows[0]
      if (row) {
        const images = row.images.map((m) => img(m.key, m.alt || row.name, m.width, m.height)!)
        product = { id: row.id, name: row.name, description: row.description, images, product: { id: row.id, name: row.name, image: images[0] ?? null, variants: (row.variants ?? []).map((v) => ({ id: v.id, label: v.options.join(' / ') || row.name, price: v.price, comparePrice: v.comparePrice, available: v.stock === null || v.stock > 0 })) } }
      }
    }
    const [collection] = collectionId ? await t.select({ name: collections.name, handle: collections.handle, description: collections.description }).from(collections).where(and(eq(collections.storeId, store.id), eq(collections.id, collectionId))) : []
    const pageId = q('page')
    const [page] = pageId ? await t.select({ title: storePages.title, body: storePages.body, policy: storePages.policy }).from(storePages).where(and(eq(storePages.storeId, store.id), eq(storePages.id, pageId))) : []
    const [live] = store.liveThemeId ? await t.select({ published: themes.published }).from(themes).where(eq(themes.id, store.liveThemeId)) : []
    const liveDoc = (live?.published ? readTheme(live.published) : null) ?? starterTheme(isPreset(store.theme) ? store.theme : 'fresh')
    const choices = {
      products: await t.select({ id: products.id, name: products.name }).from(products).where(and(eq(products.storeId, store.id), ne(products.status, 'draft'))).orderBy(desc(products.createdAt)).limit(50),
      collections: collectionRows.map((x) => ({ id: x.id, name: x.name })),
      pages: await t.select({ id: storePages.id, name: storePages.title }).from(storePages).where(eq(storePages.storeId, store.id)).orderBy(desc(storePages.updatedAt)).limit(50),
    }
    return c.json({
      store: { name: store.name, logo: info ? img(info.logo_key, store.name, info.logo_width, info.logo_height) : null, phone: info?.phone ?? '', whatsapp: info?.whatsapp ?? '', email: info?.email ?? '', address: info?.address ?? '', facebook: info?.facebook ?? '' },
      menus, cards, product, collection: collection ?? null, page: page ?? null,
      collections: collectionRows.map((x) => ({ id: x.id, name: x.name, handle: x.handle, image: img(x.image_key, x.name, x.image_width, x.image_height) })),
      live: { settings: liveDoc.settings, header: liveDoc.header, footer: liveDoc.footer, css: liveDoc.css },
      choices,
    })
  }))
}
