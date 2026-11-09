import { and, desc, eq, sql } from 'drizzle-orm'
import type { Hono } from 'hono'
import { tx, type Tx } from './db.ts'
import { isId } from './products.ts'
import { publicUrl } from './storage.ts'
import { discountKinds, discountProducts, discounts, discountTypes } from './schema.ts'
import { databaseCode, fail, storeByHandle, type Env } from './app.ts'

// What a discount takes off is worked out only by discount_amount() in the database (migration 0075); this file stores the rules.
const fields = {
  id: discounts.id, type: discounts.type, code: discounts.code, title: discounts.title, kind: discounts.kind, value: discounts.value,
  minSubtotal: discounts.minSubtotal, minQty: discounts.minQty, maxUses: discounts.maxUses, uses: discounts.uses, oncePerPhone: discounts.oncePerPhone,
  appliesAll: discounts.appliesAll, buysAll: discounts.buysAll, buyQty: discounts.buyQty, getQty: discounts.getQty, maxPerOrder: discounts.maxPerOrder,
  startsAt: discounts.startsAt, endsAt: discounts.endsAt, active: discounts.active, createdAt: discounts.createdAt,
}
const counts = {
  getCount: sql<number>`(select count(*)::int from discount_products dp where dp.discount_id = ${discounts.id} and dp.role = 'get')`,
  buyCount: sql<number>`(select count(*)::int from discount_products dp where dp.discount_id = ${discounts.id} and dp.role = 'buy')`,
}
const maxListed = 100

const whole = (v: unknown, min: number, max: number): v is number => Number.isInteger(v) && (v as number) >= min && (v as number) <= max
const optional = (v: unknown, min: number, max: number) => v === null || v === undefined || whole(v, min, max)
const ids = (v: unknown) => v === undefined ? [] : Array.isArray(v) && v.length <= maxListed && v.every(isId) && new Set(v).size === v.length ? v as string[] : null
const date = (v: unknown) => typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? new Date(v) : null

function readDiscount(body: any) {
  if (!body || typeof body !== 'object') throw fail(400, 'invalidRequest')
  const type = body.type ?? 'order'
  if (!discountTypes.includes(type)) throw fail(400, 'invalidRequest')
  const automatic = body.method === 'automatic'
  const code = automatic ? null : typeof body.code === 'string' ? body.code.trim().toUpperCase() : ''
  if (code !== null && !/^[A-Z0-9]{2,30}$/.test(code)) throw fail(400, 'couponCodeInvalid')
  const title = typeof body.title === 'string' ? body.title.trim() : ''
  if (title.length > 100) throw fail(400, 'invalidRequest')
  if (automatic && !title) throw fail(400, 'discountTitleRequired')

  // Buy X get Y is a percentage off what is given (100 = free); free delivery has no value of its own.
  const kind = type === 'bxgy' || type === 'shipping' ? 'percent' : body.kind
  const value = type === 'shipping' ? 100 : body.value
  if (!discountKinds.includes(kind) || !whole(value, 1, kind === 'percent' ? 100 : 1_000_000)) throw fail(400, 'invalidRequest')

  const { minSubtotal = 0, minQty = 0, maxUses = null, oncePerPhone = false } = body
  if (!whole(minSubtotal, 0, 1_000_000) || !whole(minQty, 0, 1000) || !optional(maxUses, 1, 1_000_000) || typeof oncePerPhone !== 'boolean') throw fail(400, 'invalidRequest')

  const startsAt = body.startsAt === undefined || body.startsAt === null ? new Date() : date(body.startsAt)
  const endsAt = body.endsAt === undefined || body.endsAt === null ? null : date(body.endsAt)
  if (!startsAt || (body.endsAt && !endsAt)) throw fail(400, 'invalidRequest')
  if (endsAt && endsAt <= startsAt) throw fail(400, 'discountDatesInvalid')

  const listed = type === 'products' || type === 'bxgy'
  const appliesAll = listed ? body.appliesAll ?? true : true
  const buysAll = type === 'bxgy' ? body.buysAll ?? true : true
  const getProducts = listed && !appliesAll ? ids(body.getProducts) : []
  const buyProducts = type === 'bxgy' && !buysAll ? ids(body.buyProducts) : []
  if (typeof appliesAll !== 'boolean' || typeof buysAll !== 'boolean' || !getProducts || !buyProducts) throw fail(400, 'invalidRequest')
  if ((!appliesAll && getProducts.length === 0) || (!buysAll && buyProducts.length === 0)) throw fail(400, 'discountProductsRequired')

  const bxgy = type === 'bxgy'
  const { buyQty = null, getQty = null, maxPerOrder = null } = body
  if (bxgy ? !whole(buyQty, 1, 100) || !whole(getQty, 1, 100) || !optional(maxPerOrder, 1, 100) : false) throw fail(400, 'invalidRequest')

  return {
    row: {
      type, code, title, kind, value, minSubtotal, minQty, maxUses, oncePerPhone, appliesAll, buysAll, startsAt, endsAt,
      buyQty: bxgy ? buyQty : null, getQty: bxgy ? getQty : null, maxPerOrder: bxgy ? maxPerOrder : null,
    },
    getProducts, buyProducts,
  }
}

async function saveProducts(t: Tx, storeId: string, discountId: string, input: ReturnType<typeof readDiscount>) {
  await t.delete(discountProducts).where(and(eq(discountProducts.storeId, storeId), eq(discountProducts.discountId, discountId)))
  const rows = [...input.getProducts.map((productId) => ({ productId, role: 'get' as const })), ...input.buyProducts.map((productId) => ({ productId, role: 'buy' as const }))]
  if (rows.length > 0) await t.insert(discountProducts).values(rows.map((r) => ({ ...r, storeId, discountId })))
}

// A product from another store, or one deleted meanwhile, fails its foreign key; a taken code fails the unique one.
const refused = (err: unknown) => {
  const code = databaseCode(err)
  if (code === '23505') return fail(409, 'couponCodeTaken')
  if (code === '23503') return fail(400, 'invalidRequest')
  return err
}

async function loadDiscount(t: Tx, storeId: string, id: string) {
  const [row] = await t.select(fields).from(discounts).where(and(eq(discounts.storeId, storeId), eq(discounts.id, id)))
  if (!row) throw fail(404, 'notFound')
  const listed = await t.execute<{ id: string; name: string; status: string; role: string; thumb_key: string | null; min_price: number; max_price: number }>(sql`
    select p.id, p.name, p.status, dp.role, i.thumb_key, v.min_price, v.max_price
    from discount_products dp
    join products p on p.id = dp.product_id
    cross join lateral (select min(price) as min_price, max(price) as max_price from product_variants where product_id = p.id) v
    left join lateral (
      select m.thumb_key from product_media pm join media m on m.id = pm.media_id
      where pm.product_id = p.id order by pm.position limit 1
    ) i on true
    where dp.discount_id = ${id}::uuid and dp.store_id = ${storeId}::uuid
    order by p.name`)
  const present = (role: string) => listed.rows.filter((r) => r.role === role)
    .map((r) => ({ id: r.id, name: r.name, status: r.status, thumbUrl: r.thumb_key && publicUrl(r.thumb_key), minPrice: r.min_price, maxPrice: r.max_price }))
  return { ...row, getProducts: present('get'), buyProducts: present('buy') }
}

export function registerDiscounts(app: Hono<Env>) {
  app.get('/stores/:handle/discounts', async (c) => {
    return tx(c.get('userId'), async (t) => {
      const store = await storeByHandle(t, c.req.param('handle'))
      return c.json(await t.select({ ...fields, ...counts }).from(discounts).where(eq(discounts.storeId, store.id)).orderBy(desc(discounts.createdAt)).limit(500))
    })
  })

  app.get('/stores/:handle/discounts/:id', async (c) => {
    const id = c.req.param('id')
    if (!isId(id)) throw fail(404, 'notFound')
    return tx(c.get('userId'), async (t) => c.json(await loadDiscount(t, (await storeByHandle(t, c.req.param('handle'))).id, id)))
  })

  app.post('/stores/:handle/discounts', async (c) => {
    const input = readDiscount(await c.req.json().catch(() => null))
    return tx(c.get('userId'), async (t) => {
      const store = await storeByHandle(t, c.req.param('handle'))
      const [row] = await t.insert(discounts).values({ storeId: store.id, ...input.row }).returning({ id: discounts.id })
      await saveProducts(t, store.id, row.id, input)
      return c.json(await loadDiscount(t, store.id, row.id), 201)
    }).catch((err) => { throw refused(err) })
  })

  // Changes the rules from now on; orders already placed keep the amount they were given. Uses so far are kept.
  app.put('/stores/:handle/discounts/:id', async (c) => {
    const id = c.req.param('id')
    if (!isId(id)) throw fail(404, 'notFound')
    const input = readDiscount(await c.req.json().catch(() => null))
    return tx(c.get('userId'), async (t) => {
      const store = await storeByHandle(t, c.req.param('handle'))
      const [row] = await t.update(discounts).set(input.row).where(and(eq(discounts.storeId, store.id), eq(discounts.id, id))).returning({ id: discounts.id })
      if (!row) throw fail(404, 'notFound')
      await saveProducts(t, store.id, id, input)
      return c.json(await loadDiscount(t, store.id, id))
    }).catch((err) => { throw refused(err) })
  })

  app.patch('/stores/:handle/discounts/:id', async (c) => {
    const id = c.req.param('id')
    const body = await c.req.json().catch(() => null)
    if (!isId(id) || typeof body?.active !== 'boolean') throw fail(400, 'invalidRequest')
    return tx(c.get('userId'), async (t) => {
      const store = await storeByHandle(t, c.req.param('handle'))
      const [row] = await t.update(discounts).set({ active: body.active }).where(and(eq(discounts.storeId, store.id), eq(discounts.id, id))).returning({ ...fields, ...counts })
      if (!row) throw fail(404, 'notFound')
      return c.json(row)
    })
  })

  // Owners and admins only (row-level security). Orders that used it keep their amount and name.
  app.delete('/stores/:handle/discounts/:id', async (c) => {
    const id = c.req.param('id')
    if (!isId(id)) throw fail(404, 'notFound')
    return tx(c.get('userId'), async (t) => {
      const store = await storeByHandle(t, c.req.param('handle'))
      const removed = await t.delete(discounts).where(and(eq(discounts.storeId, store.id), eq(discounts.id, id))).returning({ id: discounts.id })
      if (removed.length === 0) throw fail(403, 'forbidden')
      return c.json({ ok: true })
    })
  })
}
