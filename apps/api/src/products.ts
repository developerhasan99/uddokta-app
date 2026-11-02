import { and, asc, eq, inArray, notInArray, sql } from 'drizzle-orm'
import type { Hono } from 'hono'
import { type Tx, tx } from './db.ts'
import { likePattern, present as presentMedia } from './media.ts'
import { media, productMedia, products, productStatuses, productVariantCosts, productVariants, type ProductOption } from './schema.ts'
import { publicUrl } from './storage.ts'
import { databaseCode, fail, storeByHandle, type Env } from './app.ts'

const pageSize = 50
const maxOptions = 3
const maxValues = 50
const maxVariants = 100
const maxImages = 20
const maxAmount = 1_000_000_000
const maxDescription = 50_000
const maxTags = 30
const descriptionTags: Record<string, string> = { p: 'p', div: 'p', br: 'br', b: 'strong', strong: 'strong', i: 'em', em: 'em', u: 'u', ul: 'ul', ol: 'ol', li: 'li', h2: 'h2' }

const isId = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
const isAmount = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= maxAmount
const isOptionalAmount = (v: unknown) => v === null || isAmount(v)
const isName = (v: unknown, max: number): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= max

type VariantInput = { id?: string; options: string[]; price: number; comparePrice: number | null; cost?: number | null; sku: string; stock: number | null; mediaId: string | null }

// Descriptions are shown as HTML, so this is the safety boundary: afterwards every "<" starts a known tag,
// and the only attribute left is a link's href, limited to schemes that cannot run code.
export function cleanDescription(html: string) {
  return html.replace(/<(\/?)([a-z][a-z0-9]*)\b[^<>]*>|</gi, (match, close: string, tag?: string) => {
    if (!tag) return '&lt;'
    if (tag.toLowerCase() === 'a') {
      if (close) return '</a>'
      const href = /\shref="((?:https?:\/\/|mailto:|tel:)[^"<>\s]*)"/i.exec(match)?.[1]
      return href ? `<a href="${href}">` : ''
    }
    const known = descriptionTags[tag.toLowerCase()]
    return known ? `<${close}${known}>` : ''
  })
}

// Letters of any language stay, so a Bangla name gets a Bangla address. The joiners are part of how Bangla is spelled.
export const slugify = (text: string) => text.normalize('NFC').toLowerCase().replace(/[^\p{L}\p{M}\p{N}\u200c\u200d]+/gu, '-').slice(0, 100).replace(/^-+|-+$/g, '')

function readTags(value: unknown) {
  const valid = Array.isArray(value) && value.length <= maxTags && value.every((v) => isName(v, 50))
  if (!valid) throw fail(400, 'invalidRequest')
  return [...new Set((value as string[]).map((v) => v.trim()))]
}

function readOptions(value: unknown): ProductOption[] {
  if (!Array.isArray(value) || value.length > maxOptions) throw fail(400, 'invalidRequest')
  const options = value.map((option) => {
    const values = option?.values
    const valid = isName(option?.name, 50) && Array.isArray(values) && values.length > 0 && values.length <= maxValues && values.every((v: unknown) => isName(v, 100))
    if (!valid) throw fail(400, 'invalidRequest')
    return { name: option.name.trim() as string, values: values.map((v: string) => v.trim()) }
  })
  const unique = (list: string[]) => new Set(list).size === list.length
  if (!unique(options.map((o) => o.name)) || !options.every((o) => unique(o.values))) throw fail(400, 'invalidRequest')
  return options
}

function readVariants(value: unknown, options: ProductOption[]): VariantInput[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > maxVariants) throw fail(400, 'invalidRequest')
  const combinations = new Set<string>()
  const expected = options.reduce((n, o) => n * o.values.length, 1)
  const variants = value.map((v) => {
    const fits = Array.isArray(v?.options) && v.options.length === options.length && options.every((o, i) => o.values.includes(v.options[i]))
    const valid = fits && (v.id === undefined || isId(v.id)) && isAmount(v.price) && isOptionalAmount(v.comparePrice ?? null) && isOptionalAmount(v.stock ?? null)
      && (v.cost === undefined || isOptionalAmount(v.cost)) && (v.sku === undefined || (typeof v.sku === 'string' && v.sku.length <= 100))
      && (v.mediaId === undefined || v.mediaId === null || isId(v.mediaId))
    if (!valid) throw fail(400, 'invalidRequest')
    combinations.add(JSON.stringify(v.options))
    return { id: v.id, options: v.options, price: v.price, comparePrice: v.comparePrice ?? null, cost: v.cost, sku: (v.sku ?? '').trim(), stock: v.stock ?? null, mediaId: v.mediaId ?? null }
  })
  // Every combination exactly once, so a buyer can always pick any mix of options.
  if (combinations.size !== variants.length || variants.length !== expected) throw fail(400, 'invalidRequest')
  return variants
}

function readProduct(body: any) {
  if (!body || typeof body !== 'object') throw fail(400, 'invalidRequest')
  if (!isName(body.name, 200)) throw fail(400, 'nameRequired')
  const description = body.description ?? ''
  const status = body.status ?? 'active'
  const mediaIds = body.mediaIds ?? []
  const validIds = Array.isArray(mediaIds) && mediaIds.length <= maxImages && mediaIds.every(isId) && new Set(mediaIds).size === mediaIds.length
  const productType = body.productType ?? ''
  const brand = body.brand ?? ''
  const shortText = (v: unknown, max = 100) => typeof v === 'string' && v.length <= max
  const seoTitle = body.seoTitle ?? ''
  const seoDescription = body.seoDescription ?? ''
  const handle = body.handle ?? ''
  if (!shortText(seoTitle, 300) || !shortText(seoDescription, 1000) || !shortText(handle, 200)) throw fail(400, 'invalidRequest')
  if (typeof description !== 'string' || description.length > maxDescription || !productStatuses.includes(status) || !validIds || !shortText(productType) || !shortText(brand)) throw fail(400, 'invalidRequest')
  const options = readOptions(body.options ?? [])
  const variants = readVariants(body.variants, options)
  // A variant's image must be one of the product's images, which also keeps it from being deleted while in use.
  if (variants.some((v) => v.mediaId && !mediaIds.includes(v.mediaId))) throw fail(400, 'invalidRequest')
  return {
    name: body.name.trim() as string, description: cleanDescription(description), status: status as (typeof productStatuses)[number],
    productType: productType.trim() as string, brand: brand.trim() as string, tags: readTags(body.tags ?? []), seoTitle: seoTitle.trim() as string, seoDescription: seoDescription.trim() as string, handle: slugify(handle), options, variants, mediaIds: mediaIds as string[],
  }
}

const productFields = ({ name, description, status, productType, brand, tags, seoTitle, seoDescription, options }: ReturnType<typeof readProduct>) => ({ name, description, status, productType, brand, tags, seoTitle, seoDescription, options })

// A handle the seller typed is used as it is, and refused if taken. Otherwise the name gives one, numbered if needed.
async function chooseHandle(t: Tx, storeId: string, input: ReturnType<typeof readProduct>, productId?: string) {
  if (input.handle) return input.handle
  const base = slugify(input.name) || 'product'
  for (let n = 1; ; n++) {
    const handle = n === 1 ? base : `${base}-${n}`
    const [taken] = await t.select({ id: products.id }).from(products).where(and(eq(products.storeId, storeId), eq(products.handle, handle)))
    if (!taken || taken.id === productId) return handle
  }
}

// The only unique value a save can break is the handle.
const refuseTakenHandle = (err: unknown) => {
  throw databaseCode(err) === '23505' ? fail(409, 'productHandleTaken') : err
}

async function loadProduct(t: Tx, storeId: string, id: string) {
  const [product] = await t.select().from(products).where(and(eq(products.storeId, storeId), eq(products.id, id)))
  if (!product) throw fail(404, 'notFound')
  const variants = await t
    .select({
      id: productVariants.id, options: productVariants.options, price: productVariants.price, comparePrice: productVariants.comparePrice,
      cost: productVariantCosts.cost, sku: productVariants.sku, stock: productVariants.stock, mediaId: productVariants.mediaId,
    })
    .from(productVariants)
    .leftJoin(productVariantCosts, eq(productVariantCosts.variantId, productVariants.id))
    .where(eq(productVariants.productId, id))
    .orderBy(asc(productVariants.position))
  const images = await t.select({ media }).from(productMedia).innerJoin(media, eq(media.id, productMedia.mediaId)).where(eq(productMedia.productId, id)).orderBy(asc(productMedia.position))
  return { id: product.id, name: product.name, description: product.description, status: product.status, productType: product.productType, brand: product.brand, tags: product.tags, handle: product.handle, seoTitle: product.seoTitle, seoDescription: product.seoDescription, options: product.options, variants, media: images.map((row) => presentMedia(row.media)) }
}

// Replaces the variants and images with what the seller sent. Variants keep their ids, so later orders can point at them.
// ponytail: last save wins if two people edit one product; add a version check if teams report lost edits.
async function saveDetails(t: Tx, storeId: string, productId: string, input: ReturnType<typeof readProduct>) {
  if (input.mediaIds.length > 0) {
    const found = await t.select({ id: media.id }).from(media).where(and(eq(media.storeId, storeId), inArray(media.id, input.mediaIds)))
    if (found.length !== input.mediaIds.length) throw fail(400, 'invalidRequest')
  }
  const existing = await t.select({ id: productVariants.id }).from(productVariants).where(eq(productVariants.productId, productId))
  const known = new Set(existing.map((v) => v.id))
  if (input.variants.some((v) => v.id && !known.has(v.id))) throw fail(400, 'invalidRequest')

  const kept = input.variants.flatMap((v) => v.id ?? [])
  await t.delete(productVariants).where(and(eq(productVariants.productId, productId), kept.length > 0 ? notInArray(productVariants.id, kept) : undefined))
  for (const [position, { id, cost, ...fields }] of input.variants.entries()) {
    const values = { ...fields, position }
    const [variant] = id
      ? await t.update(productVariants).set(values).where(eq(productVariants.id, id)).returning({ id: productVariants.id })
      : await t.insert(productVariants).values({ ...values, storeId, productId }).returning({ id: productVariants.id })
    // Left out by staff, whose save must not touch buying prices. Row-level security refuses them if they send one.
    if (typeof cost === 'number') {
      await t.insert(productVariantCosts).values({ variantId: variant.id, storeId, cost }).onConflictDoUpdate({ target: productVariantCosts.variantId, set: { cost } })
    } else if (cost === null) {
      await t.delete(productVariantCosts).where(eq(productVariantCosts.variantId, variant.id))
    }
  }

  await t.delete(productMedia).where(eq(productMedia.productId, productId))
  if (input.mediaIds.length > 0) {
    await t.insert(productMedia).values(input.mediaIds.map((mediaId, position) => ({ storeId, productId, mediaId, position })))
  }
}

export function registerProducts(app: Hono<Env>) {
  app.get('/stores/:handle/products', async (c) => {
    const offset = Math.max(Number(c.req.query('offset')) || 0, 0)
    const q = (c.req.query('q') ?? '').trim().slice(0, 200)
    const status = c.req.query('status') ?? ''
    const pattern = likePattern(q)
    return tx(c.get('userId'), async (t) => {
      const store = await storeByHandle(t, c.req.param('handle'))
      const search = q
        ? sql`and (p.name ilike ${pattern} or exists (select 1 from product_variants s where s.product_id = p.id and s.sku ilike ${pattern}))`
        : sql``
      const counts = await t.execute<{ status: string; count: number }>(sql`select p.status, count(*)::int as count from products p where p.store_id = ${store.id}::uuid ${search} group by p.status`)
      // ponytail: offset paging, like media; switch to a cursor if catalogues reach tens of thousands of products.
      const rows = await t.execute<{ id: string; name: string; status: string; thumb_key: string | null; variant_count: number; min_price: number; max_price: number; stock: number | null }>(sql`
        select p.id, p.name, p.status, i.thumb_key, v.variant_count, v.min_price, v.max_price, v.stock
        from products p
        cross join lateral (
          select count(*)::int as variant_count, min(price) as min_price, max(price) as max_price, sum(stock)::int as stock
          from product_variants where product_id = p.id
        ) v
        left join lateral (
          select m.thumb_key from product_media pm join media m on m.id = pm.media_id
          where pm.product_id = p.id order by pm.position limit 1
        ) i on true
        where p.store_id = ${store.id}::uuid ${search} ${productStatuses.includes(status as never) ? sql`and p.status = ${status}` : sql``}
        order by p.created_at desc, p.id desc
        limit ${pageSize + 1} offset ${offset}`)
      return c.json({
        items: rows.rows.slice(0, pageSize).map((r) => ({
          id: r.id, name: r.name, status: r.status, thumbUrl: r.thumb_key && publicUrl(r.thumb_key),
          variantCount: r.variant_count, minPrice: r.min_price, maxPrice: r.max_price, stock: r.stock,
        })),
        hasMore: rows.rows.length > pageSize,
        counts: Object.fromEntries(counts.rows.map((r) => [r.status, r.count])),
      })
    })
  })

  app.post('/stores/:handle/products', async (c) => {
    const input = readProduct(await c.req.json().catch(() => null))
    return tx(c.get('userId'), async (t) => {
      const store = await storeByHandle(t, c.req.param('handle'))
      const [product] = await t.insert(products).values({ storeId: store.id, ...productFields(input), handle: await chooseHandle(t, store.id, input) }).returning({ id: products.id })
      await saveDetails(t, store.id, product.id, input)
      return c.json(await loadProduct(t, store.id, product.id), 201)
    }).catch(refuseTakenHandle)
  })

  // What this store already uses, suggested in the form so one type is not spelled three ways.
  app.get('/stores/:handle/products/suggestions', async (c) => {
    return tx(c.get('userId'), async (t) => {
      const store = await storeByHandle(t, c.req.param('handle'))
      const values = async (column: ReturnType<typeof sql>) => {
        const rows = await t.execute<{ value: string }>(sql`select distinct ${column} as value from products where store_id = ${store.id}::uuid order by 1 limit 200`)
        return rows.rows.map((r) => r.value).filter(Boolean)
      }
      return c.json({ types: await values(sql`product_type`), brands: await values(sql`brand`), tags: await values(sql`unnest(tags)`) })
    })
  })

  app.get('/stores/:handle/products/:id', async (c) => {
    const id = c.req.param('id')
    if (!isId(id)) throw fail(404, 'notFound')
    return tx(c.get('userId'), async (t) => {
      const store = await storeByHandle(t, c.req.param('handle'))
      return c.json(await loadProduct(t, store.id, id))
    })
  })

  app.put('/stores/:handle/products/:id', async (c) => {
    const id = c.req.param('id')
    if (!isId(id)) throw fail(404, 'notFound')
    const input = readProduct(await c.req.json().catch(() => null))
    return tx(c.get('userId'), async (t) => {
      const store = await storeByHandle(t, c.req.param('handle'))
      const [product] = await t.update(products).set({ ...productFields(input), handle: await chooseHandle(t, store.id, input, id) }).where(and(eq(products.storeId, store.id), eq(products.id, id))).returning({ id: products.id })
      if (!product) throw fail(404, 'notFound')
      await saveDetails(t, store.id, id, input)
      return c.json(await loadProduct(t, store.id, id))
    }).catch(refuseTakenHandle)
  })

  app.delete('/stores/:handle/products/:id', async (c) => {
    const id = c.req.param('id')
    if (!isId(id)) throw fail(404, 'notFound')
    return tx(c.get('userId'), async (t) => {
      const store = await storeByHandle(t, c.req.param('handle'))
      const removed = await t.delete(products).where(and(eq(products.storeId, store.id), eq(products.id, id))).returning({ id: products.id })
      if (removed.length === 0) throw fail(403, 'forbidden')
      return c.json({ ok: true })
    })
  })
}
