import { randomUUID } from 'node:crypto'
import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import type { Context, Hono } from 'hono'
import { isReservedPageHandle } from 'storefront/paths'
import { blankContent, readContent, references, starterContent, type Content } from 'storefront/schema'
import { type Tx, tx } from './db.ts'
import { present as presentMedia } from './media.ts'
import { firstFreeHandle, isId, isName, slugify } from './products.ts'
import { media, pageMedia, pages, products } from './schema.ts'
import { databaseCode, fail, storeByHandle, type Env } from './app.ts'

// ponytail: one cap for every store; read it from the store's plan once plans exist (Starter allows 3).
export const maxPages = 50
const maxContentBytes = 200_000

const sectionId = () => randomUUID().slice(0, 8)

function readSettings(body: any) {
  const { handle = '', seoTitle = '', seoDescription = '' } = body
  const shortText = (v: unknown, max: number) => typeof v === 'string' && v.length <= max
  if (!isName(body.title, 200)) throw fail(400, 'nameRequired')
  if (!shortText(handle, 200) || !shortText(seoTitle, 300) || !shortText(seoDescription, 1000)) throw fail(400, 'invalidRequest')
  return { title: body.title.trim() as string, handle: slugify(handle), seoTitle: seoTitle.trim() as string, seoDescription: seoDescription.trim() as string }
}

function readPage(body: any) {
  if (!body || typeof body !== 'object' || !Number.isInteger(body.revision)) throw fail(400, 'invalidRequest')
  const draft = readContent(body.draft)
  if (!draft || JSON.stringify(draft).length > maxContentBytes) throw fail(400, 'invalidRequest')
  return { ...readSettings(body), draft, revision: body.revision as number }
}

async function chooseHandle(t: Tx, storeId: string, title: string, handle: string, pageId?: string) {
  const taken = async (h: string) => {
    const [found] = await t.select({ id: pages.id }).from(pages).where(and(eq(pages.storeId, storeId), sql`(${pages.handle} = ${h} or (${pages.published} is not null and ${pages.publishedMeta}->>'handle' = ${h}))`, pageId ? sql`${pages.id} <> ${pageId}::uuid` : undefined))
    return Boolean(found)
  }
  if (handle) {
    if (isReservedPageHandle(handle)) throw fail(409, 'pageHandleReserved')
    if (await taken(handle)) throw fail(409, 'pageHandleTaken')
    return handle
  }
  return firstFreeHandle(slugify(title) || 'page', async (h) => isReservedPageHandle(h) || await taken(h))
}

const refuseTakenHandle = (err: unknown) => {
  throw databaseCode(err) === '23505' ? fail(409, 'pageHandleTaken') : err
}

// Images and products a page points at must be this store's. Products may be any status: the storefront hides drafts itself.
async function checkReferences(t: Tx, storeId: string, content: Content) {
  const refs = references(content)
  if (refs.media.length > 0) {
    const found = await t.select({ id: media.id }).from(media).where(and(eq(media.storeId, storeId), inArray(media.id, refs.media)))
    if (found.length !== refs.media.length) throw fail(400, 'invalidRequest')
  }
  if (refs.products.length > 0) {
    const found = await t.select({ id: products.id }).from(products).where(and(eq(products.storeId, storeId), inArray(products.id, refs.products)))
    if (found.length !== refs.products.length) throw fail(400, 'invalidRequest')
  }
}

// Keeps page_media equal to the images in the draft and the published version, which is what blocks deleting them.
async function syncMedia(t: Tx, storeId: string, pageId: string, draft: Content, published: Content | null) {
  const ids = new Set([...references(draft).media, ...(published ? references(published).media : [])])
  await t.delete(pageMedia).where(eq(pageMedia.pageId, pageId))
  if (ids.size > 0) await t.insert(pageMedia).values([...ids].map((mediaId) => ({ storeId, pageId, mediaId })))
}

async function loadPage(t: Tx, storeId: string, id: string) {
  const [row] = await t.select().from(pages).where(and(eq(pages.storeId, storeId), eq(pages.id, id)))
  if (!row) throw fail(404, 'notFound')
  const used = await t.select({ media }).from(pageMedia).innerJoin(media, eq(media.id, pageMedia.mediaId)).where(eq(pageMedia.pageId, id))
  return {
    id: row.id, title: row.title, handle: row.handle, seoTitle: row.seoTitle, seoDescription: row.seoDescription,
    draft: row.draft as Content, revision: row.revision, publishedAt: row.publishedAt, updatedAt: row.updatedAt,
    publishedHandle: row.published !== null ? row.publishedMeta?.handle ?? null : null,
    isPublished: row.published !== null,
    hasChanges: row.published !== null && (JSON.stringify(row.published) !== JSON.stringify(row.draft) || row.publishedMeta?.title !== row.title || row.publishedMeta?.handle !== row.handle || row.publishedMeta?.seoTitle !== row.seoTitle || row.publishedMeta?.seoDescription !== row.seoDescription),
    media: Object.fromEntries(used.map((u) => [u.media.id, presentMedia(u.media)])),
  }
}

const pageRoute = (handler: (c: Context<Env>, t: Tx, storeId: string, id: string) => Promise<Response>) => async (c: Context<Env>) => {
  const id = c.req.param('id')
  if (!isId(id)) throw fail(404, 'notFound')
  return tx(c.get('userId'), async (t) => {
    const store = await storeByHandle(t, c.req.param('handle')!)
    return handler(c, t, store.id, id)
  }).catch(refuseTakenHandle)
}

export function registerPages(app: Hono<Env>) {
  app.get('/stores/:handle/pages', async (c) => {
    return tx(c.get('userId'), async (t) => {
      const store = await storeByHandle(t, c.req.param('handle'))
      const rows = await t.execute<{ id: string; title: string; handle: string; is_published: boolean; has_changes: boolean; updated_at: string }>(sql`
        select id, title, handle, published is not null as is_published, published is not null and (published <> draft or published_meta is distinct from jsonb_build_object('title', title, 'handle', handle, 'seoTitle', seo_title, 'seoDescription', seo_description)) as has_changes, updated_at
        from pages where store_id = ${store.id}::uuid order by updated_at desc, id desc limit ${maxPages}`)
      return c.json(rows.rows.map((r) => ({ id: r.id, title: r.title, handle: r.handle, isPublished: r.is_published, hasChanges: r.has_changes, updatedAt: r.updated_at })))
    })
  })

  app.post('/stores/:handle/pages', async (c) => {
    const body = await c.req.json().catch(() => null)
    if (!body || typeof body !== 'object') throw fail(400, 'invalidRequest')
    if (body.blank !== undefined && typeof body.blank !== 'boolean') throw fail(400, 'invalidRequest')
    const settings = readSettings(body)
    return tx(c.get('userId'), async (t) => {
      const store = await storeByHandle(t, c.req.param('handle'))
      // Serialises page creation per store so two at once cannot pass the limit together.
      await t.execute(sql`select pg_advisory_xact_lock(hashtext(${`pages:${store.id}`}))`)
      const [{ count }] = await t.select({ count: sql<number>`count(*)::int` }).from(pages).where(eq(pages.storeId, store.id))
      if (count >= maxPages) throw fail(409, 'pageLimit')
      const [row] = await t.insert(pages).values({
        storeId: store.id, ...settings, handle: await chooseHandle(t, store.id, settings.title, settings.handle), draft: body.blank === true ? blankContent() : starterContent(sectionId),
      }).returning({ id: pages.id })
      return c.json(await loadPage(t, store.id, row.id), 201)
    }).catch(refuseTakenHandle)
  })

  app.get('/stores/:handle/pages/:id', pageRoute(async (c, t, storeId, id) => c.json(await loadPage(t, storeId, id))))

  // Saves the draft. A stale revision means someone else saved first, and the seller is asked to reload rather than overwrite them.
  app.put('/stores/:handle/pages/:id', async (c) => {
    const input = readPage(await c.req.json().catch(() => null))
    return pageRoute(async (c, t, storeId, id) => {
      await t.execute(sql`select pg_advisory_xact_lock(hashtext(${`pages:${storeId}`}))`)
      await checkReferences(t, storeId, input.draft)
      const [row] = await t.update(pages)
        .set({ title: input.title, handle: await chooseHandle(t, storeId, input.title, input.handle, id), seoTitle: input.seoTitle, seoDescription: input.seoDescription, draft: input.draft, revision: sql`${pages.revision} + 1`, updatedAt: sql`now()` })
        .where(and(eq(pages.storeId, storeId), eq(pages.id, id), eq(pages.revision, input.revision)))
        .returning({ published: pages.published })
      if (!row) {
        const [exists] = await t.select({ id: pages.id }).from(pages).where(and(eq(pages.storeId, storeId), eq(pages.id, id)))
        throw exists ? fail(409, 'pageChanged') : fail(404, 'notFound')
      }
      await syncMedia(t, storeId, id, input.draft, row.published as Content | null)
      return c.json(await loadPage(t, storeId, id))
    })(c)
  })

  // ponytail: no CDN in front of the storefront yet; purge the page's URL here once Cloudflare caches it.
  app.post('/stores/:handle/pages/:id/publish', async (c) => {
    const body = await c.req.json().catch(() => null)
    if (!body || !Number.isInteger(body.revision)) throw fail(400, 'invalidRequest')
    return pageRoute(async (c, t, storeId, id) => {
      await t.execute(sql`select pg_advisory_xact_lock(hashtext(${`pages:${storeId}`}))`)
      const [row] = await t.update(pages).set({ published: sql`${pages.draft}`, publishedMeta: sql`jsonb_build_object('title', ${pages.title}, 'handle', ${pages.handle}, 'seoTitle', ${pages.seoTitle}, 'seoDescription', ${pages.seoDescription})`, publishedAt: sql`now()`, revision: sql`${pages.revision} + 1` })
        .where(and(eq(pages.storeId, storeId), eq(pages.id, id), eq(pages.revision, body.revision))).returning({ draft: pages.draft })
      if (!row) {
        const [exists] = await t.select({ id: pages.id }).from(pages).where(and(eq(pages.storeId, storeId), eq(pages.id, id)))
        throw exists ? fail(409, 'pageChanged') : fail(404, 'notFound')
      }
      await syncMedia(t, storeId, id, row.draft as Content, null)
      return c.json(await loadPage(t, storeId, id))
    })(c)
  })

  app.post('/stores/:handle/pages/:id/unpublish', pageRoute(async (c, t, storeId, id) => {
    const [row] = await t.update(pages).set({ published: null, publishedMeta: null, publishedAt: null }).where(and(eq(pages.storeId, storeId), eq(pages.id, id))).returning({ draft: pages.draft })
    if (!row) throw fail(404, 'notFound')
    await syncMedia(t, storeId, id, row.draft as Content, null)
    return c.json(await loadPage(t, storeId, id))
  }))

  app.post('/stores/:handle/pages/:id/duplicate', pageRoute(async (c, t, storeId, id) => {
    const [source] = await t.select().from(pages).where(and(eq(pages.storeId, storeId), eq(pages.id, id)))
    if (!source) throw fail(404, 'notFound')
    await t.execute(sql`select pg_advisory_xact_lock(hashtext(${`pages:${storeId}`}))`)
    const [{ count }] = await t.select({ count: sql<number>`count(*)::int` }).from(pages).where(eq(pages.storeId, storeId))
    if (count >= maxPages) throw fail(409, 'pageLimit')
    const title = `${source.title} (কপি)`.slice(0, 200)
    const [row] = await t.insert(pages).values({ storeId, title, handle: await chooseHandle(t, storeId, title, ''), seoTitle: source.seoTitle, seoDescription: source.seoDescription, draft: source.draft }).returning({ id: pages.id })
    await syncMedia(t, storeId, row.id, source.draft as Content, null)
    return c.json(await loadPage(t, storeId, row.id), 201)
  }))

  app.delete('/stores/:handle/pages/:id', pageRoute(async (c, t, storeId, id) => {
    const removed = await t.delete(pages).where(and(eq(pages.storeId, storeId), eq(pages.id, id))).returning({ id: pages.id })
    if (removed.length === 0) throw fail(403, 'forbidden')
    return c.json({ ok: true })
  }))
}
