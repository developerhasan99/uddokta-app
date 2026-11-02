import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import type { Hono } from 'hono'
import { type Tx, tx } from './db.ts'
import { likePattern, present as presentMedia } from './media.ts'
import { cleanDescription, firstFreeHandle, isId, isName, slugify } from './products.ts'
import { collectionProducts, collections, media, products } from './schema.ts'
import { publicUrl } from './storage.ts'
import { databaseCode, fail, storeByHandle, type Env } from './app.ts'

const pageSize = 50
const maxOptions = 500
// ponytail: a save replaces the whole product list; page and patch it if collections pass this size.
const maxProducts = 1000

function readCollection(body: any) {
  if (!body || typeof body !== 'object') throw fail(400, 'invalidRequest')
  if (!isName(body.name, 200)) throw fail(400, 'nameRequired')
  const { description = '', handle = '', seoTitle = '', seoDescription = '', mediaId = null, productIds = [] } = body
  const shortText = (v: unknown, max: number) => typeof v === 'string' && v.length <= max
  const validProducts = Array.isArray(productIds) && productIds.length <= maxProducts && productIds.every(isId) && new Set(productIds).size === productIds.length
  if (!shortText(description, 50_000) || !shortText(handle, 200) || !shortText(seoTitle, 300) || !shortText(seoDescription, 1000) || !(mediaId === null || isId(mediaId)) || !validProducts) throw fail(400, 'invalidRequest')
  return {
    name: body.name.trim() as string, description: cleanDescription(description), handle: slugify(handle), seoTitle: seoTitle.trim() as string, seoDescription: seoDescription.trim() as string,
    mediaId: mediaId as string | null, productIds: productIds as string[],
  }
}
type Input = ReturnType<typeof readCollection>

const fields = ({ name, description, seoTitle, seoDescription, mediaId }: Input) => ({ name, description, seoTitle, seoDescription, mediaId })

// A handle the seller typed is used as it is, and refused if taken. Otherwise the name gives one, numbered if needed.
async function chooseHandle(t: Tx, storeId: string, input: Input, collectionId?: string) {
  if (input.handle) return input.handle
  return firstFreeHandle(slugify(input.name) || 'collection', async (handle) => {
    const [taken] = await t.select({ id: collections.id }).from(collections).where(and(eq(collections.storeId, storeId), eq(collections.handle, handle)))
    return Boolean(taken) && taken.id !== collectionId
  })
}

const refuseTakenHandle = (err: unknown) => {
  throw databaseCode(err) === '23505' ? fail(409, 'collectionHandleTaken') : err
}

async function checkImage(t: Tx, storeId: string, mediaId: string | null) {
  if (!mediaId) return
  const [found] = await t.select({ id: media.id }).from(media).where(and(eq(media.storeId, storeId), eq(media.id, mediaId)))
  if (!found) throw fail(400, 'invalidRequest')
}

async function saveProducts(t: Tx, storeId: string, collectionId: string, productIds: string[]) {
  if (productIds.length > 0) {
    const found = await t.select({ id: products.id }).from(products).where(and(eq(products.storeId, storeId), inArray(products.id, productIds)))
    if (found.length !== productIds.length) throw fail(400, 'invalidRequest')
  }
  await t.delete(collectionProducts).where(eq(collectionProducts.collectionId, collectionId))
  if (productIds.length > 0) {
    await t.insert(collectionProducts).values(productIds.map((productId, position) => ({ storeId, collectionId, productId, position })))
  }
}

async function loadCollection(t: Tx, storeId: string, id: string) {
  const [row] = await t.select().from(collections).where(and(eq(collections.storeId, storeId), eq(collections.id, id)))
  if (!row) throw fail(404, 'notFound')
  const [image] = row.mediaId ? await t.select().from(media).where(eq(media.id, row.mediaId)) : []
  const rows = await t.execute<{ id: string; name: string; status: string; thumb_key: string | null; min_price: number; max_price: number }>(sql`
    select p.id, p.name, p.status, i.thumb_key, v.min_price, v.max_price
    from collection_products cp
    join products p on p.id = cp.product_id
    cross join lateral (select min(price) as min_price, max(price) as max_price from product_variants where product_id = p.id) v
    left join lateral (
      select m.thumb_key from product_media pm join media m on m.id = pm.media_id
      where pm.product_id = p.id order by pm.position limit 1
    ) i on true
    where cp.collection_id = ${id}::uuid
    order by cp.position`)
  return {
    id: row.id, name: row.name, description: row.description, handle: row.handle, seoTitle: row.seoTitle, seoDescription: row.seoDescription,
    media: image ? presentMedia(image) : null,
    products: rows.rows.map((r) => ({ id: r.id, name: r.name, status: r.status, thumbUrl: r.thumb_key && publicUrl(r.thumb_key), minPrice: r.min_price, maxPrice: r.max_price })),
  }
}

export function registerCollections(app: Hono<Env>) {
  app.get('/stores/:handle/collections', async (c) => {
    const offset = Math.max(Number(c.req.query('offset')) || 0, 0)
    const q = (c.req.query('q') ?? '').trim().slice(0, 200)
    return tx(c.get('userId'), async (t) => {
      const store = await storeByHandle(t, c.req.param('handle'))
      const rows = await t.execute<{ id: string; name: string; thumb_key: string | null; product_count: number }>(sql`
        select c.id, c.name, m.thumb_key, (select count(*)::int from collection_products cp where cp.collection_id = c.id) as product_count
        from collections c
        left join media m on m.id = c.media_id
        where c.store_id = ${store.id}::uuid ${q ? sql`and c.name ilike ${likePattern(q)}` : sql``}
        order by c.created_at desc, c.id desc
        limit ${pageSize + 1} offset ${offset}`)
      return c.json({
        items: rows.rows.slice(0, pageSize).map((r) => ({ id: r.id, name: r.name, thumbUrl: r.thumb_key && publicUrl(r.thumb_key), productCount: r.product_count })),
        hasMore: rows.rows.length > pageSize,
      })
    })
  })

  // Every collection by name, for the product form.
  app.get('/stores/:handle/collections/options', async (c) => {
    return tx(c.get('userId'), async (t) => {
      const store = await storeByHandle(t, c.req.param('handle'))
      return c.json(await t.select({ id: collections.id, name: collections.name }).from(collections).where(eq(collections.storeId, store.id)).orderBy(asc(collections.name)).limit(maxOptions))
    })
  })

  app.post('/stores/:handle/collections', async (c) => {
    const input = readCollection(await c.req.json().catch(() => null))
    return tx(c.get('userId'), async (t) => {
      const store = await storeByHandle(t, c.req.param('handle'))
      await checkImage(t, store.id, input.mediaId)
      const [row] = await t.insert(collections).values({ storeId: store.id, ...fields(input), handle: await chooseHandle(t, store.id, input) }).returning({ id: collections.id })
      await saveProducts(t, store.id, row.id, input.productIds)
      return c.json(await loadCollection(t, store.id, row.id), 201)
    }).catch(refuseTakenHandle)
  })

  app.get('/stores/:handle/collections/:id', async (c) => {
    const id = c.req.param('id')
    if (!isId(id)) throw fail(404, 'notFound')
    return tx(c.get('userId'), async (t) => {
      const store = await storeByHandle(t, c.req.param('handle'))
      return c.json(await loadCollection(t, store.id, id))
    })
  })

  app.put('/stores/:handle/collections/:id', async (c) => {
    const id = c.req.param('id')
    if (!isId(id)) throw fail(404, 'notFound')
    const input = readCollection(await c.req.json().catch(() => null))
    return tx(c.get('userId'), async (t) => {
      const store = await storeByHandle(t, c.req.param('handle'))
      await checkImage(t, store.id, input.mediaId)
      const [row] = await t.update(collections).set({ ...fields(input), handle: await chooseHandle(t, store.id, input, id) }).where(and(eq(collections.storeId, store.id), eq(collections.id, id))).returning({ id: collections.id })
      if (!row) throw fail(404, 'notFound')
      await saveProducts(t, store.id, id, input.productIds)
      return c.json(await loadCollection(t, store.id, id))
    }).catch(refuseTakenHandle)
  })

  app.delete('/stores/:handle/collections/:id', async (c) => {
    const id = c.req.param('id')
    if (!isId(id)) throw fail(404, 'notFound')
    return tx(c.get('userId'), async (t) => {
      const store = await storeByHandle(t, c.req.param('handle'))
      const removed = await t.delete(collections).where(and(eq(collections.storeId, store.id), eq(collections.id, id))).returning({ id: collections.id })
      if (removed.length === 0) throw fail(403, 'forbidden')
      return c.json({ ok: true })
    })
  })
}
