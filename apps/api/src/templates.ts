import { and, desc, eq, inArray, ne, sql } from 'drizzle-orm'
import type { Context, Hono } from 'hono'
import { linkedIds, resolveMenu, type IdLinkType, type LinkTargets, type MenuItem } from 'storefront/menus'
import { references, type Content } from 'storefront/schema'
import { builtInTemplates, isTemplateType, maxTemplates, readSiteStyle, readTemplateContent, readyMade, styleFromPreset, type SiteStyle, type TemplateType } from 'storefront/site'
import { isPreset, type PresetId } from 'storefront/themes'
import { fail, storeByHandle, type Env } from './app.ts'
import { tx, type Tx } from './db.ts'
import { isId } from './products.ts'
import { collections, media, products, storePages, stores, templateMedia, templates } from './schema.ts'
import { publicUrl } from './storage.ts'
import { recordVersion } from './versions.ts'

// The store's Site settings, or its style preset's look until it saves its own.
export const siteStyleOf = (store: { siteStyle: unknown; theme: string }): SiteStyle =>
  (store.siteStyle ? readSiteStyle(store.siteStyle) : null) ?? styleFromPreset(isPreset(store.theme) ? store.theme : 'fresh')

// Keeps template_media equal to the images in the draft and published copies, which is what blocks deleting them.
export async function syncTemplateMedia(t: Tx, storeId: string, templateId: string, ...docs: (Content | null)[]) {
  const ids = new Set(docs.flatMap((d) => (d ? references(d).media : [])))
  await t.delete(templateMedia).where(eq(templateMedia.templateId, templateId))
  if (ids.size) await t.insert(templateMedia).values([...ids].map((mediaId) => ({ storeId, templateId, mediaId })))
}

// Everything a template points at must be the store's own.
async function checkReferences(t: Tx, storeId: string, content: Content) {
  const refs = references(content)
  const count = async (table: typeof media | typeof products | typeof collections, ids: string[]) =>
    ids.length ? (await t.select({ id: table.id }).from(table).where(and(eq(table.storeId, storeId), inArray(table.id, ids)))).length : 0
  if (await count(media, refs.media) !== refs.media.length || await count(products, refs.products) !== refs.products.length || await count(collections, refs.collections) !== refs.collections.length) throw fail(400, 'templateInvalid')
}

const present = (row: typeof templates.$inferSelect) => ({
  id: row.id, type: row.type, title: row.title, isDefault: row.isDefault, isPublished: row.published !== null, revision: row.revision,
  hasChanges: row.published !== null && JSON.stringify(row.draft) !== JSON.stringify(row.published), updatedAt: row.updatedAt, publishedAt: row.publishedAt,
})

const readTitle = (raw: unknown) => {
  const title = typeof raw === 'string' ? raw.trim() : ''
  if (!title || title.length > 100) throw fail(400, 'nameRequired')
  return title
}

export function registerTemplates(app: Hono<Env>) {
  const templateRoute = (handler: (c: Context<Env>, t: Tx, store: typeof stores.$inferSelect, row: typeof templates.$inferSelect) => Promise<Response>) => async (c: Context<Env>) => {
    const id = c.req.param('id')!
    if (!isId(id)) throw fail(404, 'notFound')
    return tx(c.get('userId'), async (t) => {
      const store = await storeByHandle(t, c.req.param('handle')!)
      const [row] = await t.select().from(templates).where(and(eq(templates.storeId, store.id), eq(templates.id, id)))
      if (!row) throw fail(404, 'notFound')
      return handler(c, t, store, row)
    })
  }

  // Every template of the store, newest change first; ?type=product narrows to one type (the Template choices).
  app.get('/stores/:handle/templates', async (c) => tx(c.get('userId'), async (t) => {
    const store = await storeByHandle(t, c.req.param('handle'))
    const type = c.req.query('type')
    const rows = await t.select().from(templates).where(and(eq(templates.storeId, store.id), isTemplateType(type) ? eq(templates.type, type) : undefined)).orderBy(desc(templates.updatedAt))
    return c.json(rows.map(present))
  }))

  app.get('/stores/:handle/templates/:id', templateRoute(async (c, _t, _store, row) => c.json({ ...present(row), draft: row.draft })))

  // A new template: blank, a copy of the built-in one, a ready-made start, or a copy of another template (from: its id).
  app.post('/stores/:handle/templates', async (c) => {
    const body = await c.req.json().catch(() => null)
    if (!body || !isTemplateType(body.type)) throw fail(400, 'invalidRequest')
    const type: TemplateType = body.type
    const title = readTitle(body.title)
    const from = body.from ?? 'builtin'
    return tx(c.get('userId'), async (t) => {
      const store = await storeByHandle(t, c.req.param('handle'))
      await t.execute(sql`select pg_advisory_xact_lock(hashtext(${`templates:${store.id}`}))`)
      const [{ n }] = await t.select({ n: sql<number>`count(*)::int` }).from(templates).where(eq(templates.storeId, store.id))
      if (n >= maxTemplates) throw fail(409, 'templateLimit')
      let draft: Content
      if (from === 'blank') draft = { version: 2, sections: [] }
      else if (from === 'builtin') draft = structuredClone(builtInTemplates[type])
      else if (isId(from)) {
        const [source] = await t.select().from(templates).where(and(eq(templates.storeId, store.id), eq(templates.id, from), eq(templates.type, type)))
        if (!source) throw fail(404, 'notFound')
        draft = source.draft as Content
      } else {
        const start = readyMade[type]?.find((r) => r.id === from)
        if (!start) throw fail(400, 'invalidRequest')
        draft = structuredClone(start.content)
      }
      const [row] = await t.insert(templates).values({ storeId: store.id, type, title, draft }).returning()
      if (!row) throw fail(403, 'forbidden')
      await syncTemplateMedia(t, store.id, row.id, draft)
      return c.json(present(row), 201)
    })
  })

  // Saves the draft (and title). A stale revision gets 409 templateChanged; buyers see it only once published.
  app.put('/stores/:handle/templates/:id', templateRoute(async (c, t, store, row) => {
    const body = await c.req.json().catch(() => null)
    if (!body || !Number.isInteger(body.revision)) throw fail(400, 'invalidRequest')
    const draft = readTemplateContent(body.draft)
    if (!draft || JSON.stringify(draft).length > 300_000) throw fail(400, 'templateInvalid')
    const title = body.title === undefined ? row.title : readTitle(body.title)
    await checkReferences(t, store.id, draft)
    if (row.revision !== body.revision) throw fail(409, 'templateChanged')
    const [saved] = await t.update(templates).set({ title, draft, revision: sql`${templates.revision} + 1`, updatedAt: sql`now()` })
      .where(and(eq(templates.id, row.id), eq(templates.revision, body.revision))).returning()
    if (!saved) throw fail(403, 'forbidden')
    await syncTemplateMedia(t, store.id, row.id, draft, saved.published as Content | null)
    await recordVersion(t, store.id, { templateId: row.id }, 'save', { title, draft }, c.get('userId'))
    return c.json({ ...present(saved), draft: saved.draft })
  }))

  // ponytail: no CDN in front of the storefront yet; purge the store's pages here once Cloudflare caches them.
  app.post('/stores/:handle/templates/:id/publish', templateRoute(async (c, t, store, row) => {
    const body = await c.req.json().catch(() => null)
    if (!body || !Number.isInteger(body.revision)) throw fail(400, 'invalidRequest')
    if (row.revision !== body.revision) throw fail(409, 'templateChanged')
    const [saved] = await t.update(templates).set({ published: sql`${templates.draft}`, publishedAt: sql`now()`, revision: sql`${templates.revision} + 1` }).where(eq(templates.id, row.id)).returning()
    if (!saved) throw fail(403, 'forbidden')
    await syncTemplateMedia(t, store.id, row.id, saved.draft as Content, saved.published as Content)
    await recordVersion(t, store.id, { templateId: row.id }, 'publish', { title: saved.title, draft: saved.draft }, c.get('userId'))
    return c.json({ ...present(saved), draft: saved.draft })
  }))

  // Back to draft only: the store stops using it (a default must first stop being the default).
  app.post('/stores/:handle/templates/:id/unpublish', templateRoute(async (c, t, store, row) => {
    if (row.isDefault) throw fail(409, 'templateDefault')
    const [saved] = await t.update(templates).set({ published: null, publishedAt: null, revision: sql`${templates.revision} + 1` }).where(eq(templates.id, row.id)).returning()
    if (!saved) throw fail(403, 'forbidden')
    await syncTemplateMedia(t, store.id, row.id, saved.draft as Content)
    return c.json({ ...present(saved), draft: saved.draft })
  }))

  // The store's default for this type, in place of the previous one (or the built-in template).
  app.post('/stores/:handle/templates/:id/default', templateRoute(async (c, t, store, row) => {
    if (row.published === null) throw fail(409, 'templateNotPublished')
    await t.update(templates).set({ isDefault: false }).where(and(eq(templates.storeId, store.id), eq(templates.type, row.type), ne(templates.id, row.id)))
    const [saved] = await t.update(templates).set({ isDefault: true }).where(eq(templates.id, row.id)).returning()
    if (!saved) throw fail(403, 'forbidden')
    return c.json(present(saved))
  }))

  // Stops being the default: the built-in template takes over for this type.
  app.delete('/stores/:handle/templates/:id/default', templateRoute(async (c, t, _store, row) => {
    const [saved] = await t.update(templates).set({ isDefault: false }).where(eq(templates.id, row.id)).returning()
    if (!saved) throw fail(403, 'forbidden')
    return c.json(present(saved))
  }))

  // Products, collections and pages that picked it go back to the default (the database sets their choice to null).
  app.delete('/stores/:handle/templates/:id', templateRoute(async (c, t, _store, row) => {
    const gone = await t.delete(templates).where(eq(templates.id, row.id)).returning({ id: templates.id })
    if (!gone.length) throw fail(403, 'forbidden')
    return c.body(null, 204)
  }))

  // Site settings: the online store's look. Owners and admins change it (row-level security on stores).
  app.get('/stores/:handle/site-style', async (c) => tx(c.get('userId'), async (t) => c.json(siteStyleOf(await storeByHandle(t, c.req.param('handle'))))))
  app.put('/stores/:handle/site-style', async (c) => {
    const style = readSiteStyle(await c.req.json().catch(() => null))
    if (!style) throw fail(400, 'invalidRequest')
    return tx(c.get('userId'), async (t) => {
      const store = await storeByHandle(t, c.req.param('handle'))
      const [row] = await t.update(stores).set({ siteStyle: style }).where(eq(stores.id, store.id)).returning()
      if (!row) throw fail(403, 'forbidden')
      return c.json(siteStyleOf(row))
    })
  })

  // What the editors' previews need to draw store blocks as the live store does: the store, its menus with links
  // resolved, collections, products to list, the product, collection or page previewed, the look, and the published
  // header and footer templates (defaults first) so landing pages and templates show them around the page.
  app.get('/stores/:handle/store-preview', async (c) => tx(c.get('userId'), async (t) => {
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
    const frames = await t.select({ id: templates.id, type: templates.type, title: templates.title, isDefault: templates.isDefault, published: templates.published })
      .from(templates).where(and(eq(templates.storeId, store.id), inArray(templates.type, ['header', 'footer']), sql`${templates.published} is not null`)).orderBy(desc(templates.isDefault), templates.title)
    const frame = (type: 'header' | 'footer') => frames.filter((f) => f.type === type).map((f) => ({ id: f.id, title: f.title, isDefault: f.isDefault, sections: (f.published as Content).sections }))
    const choices = {
      products: await t.select({ id: products.id, name: products.name }).from(products).where(and(eq(products.storeId, store.id), ne(products.status, 'draft'))).orderBy(desc(products.createdAt)).limit(50),
      collections: collectionRows.map((x) => ({ id: x.id, name: x.name })),
      pages: await t.select({ id: storePages.id, name: storePages.title }).from(storePages).where(eq(storePages.storeId, store.id)).orderBy(desc(storePages.updatedAt)).limit(50),
    }
    return c.json({
      store: { name: store.name, logo: info ? img(info.logo_key, store.name, info.logo_width, info.logo_height) : null, phone: info?.phone ?? '', whatsapp: info?.whatsapp ?? '', email: info?.email ?? '', address: info?.address ?? '', facebook: info?.facebook ?? '' },
      menus, cards, product, collection: collection ?? null, page: page ?? null,
      collections: collectionRows.map((x) => ({ id: x.id, name: x.name, handle: x.handle, image: img(x.image_key, x.name, x.image_width, x.image_height) })),
      style: siteStyleOf(store),
      headers: frame('header'), footers: frame('footer'),
      builtIn: { header: builtInTemplates.header.sections, footer: builtInTemplates.footer.sections },
      choices,
    })
  }))
}

// One-click style from the old preset picker: the preset's colours, font and corners, keeping width, English font and CSS.
export async function applyPreset(t: Tx, store: typeof stores.$inferSelect, preset: PresetId) {
  const current = siteStyleOf(store)
  await t.update(stores).set({ siteStyle: { ...styleFromPreset(preset), latin: current.latin, width: current.width, css: current.css } }).where(eq(stores.id, store.id))
}
