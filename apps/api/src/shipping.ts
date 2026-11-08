import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import type { Hono } from 'hono'
import { databaseCode, fail, storeByHandle, type Env } from './app.ts'
import { tx, type Tx } from './db.ts'
import { isId } from './products.ts'
import { products, shippingRateProducts, shippingRates } from './schema.ts'

export const defaultRateNames = { inside: 'ঢাকার ভেতরে', outside: 'ঢাকার বাইরে' }
export const isPrice = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 100_000
const isWhole = (v: unknown, min: number, max: number) => v === null || (Number.isInteger(v) && (v as number) >= min && (v as number) <= max)
const maxRates = 20
const maxFreeProducts = 50

type RateInput = { name: string; note: string; price: number; active: boolean; freeOver: number | null; freeMinQty: number | null; productIds: string[] }

function readRate(body: unknown): RateInput {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  const name = typeof b.name === 'string' ? b.name.trim() : ''
  const note = typeof b.note === 'string' ? b.note.trim() : ''
  const freeOver = b.freeOver ?? null, freeMinQty = b.freeMinQty ?? null, productIds = b.productIds ?? []
  if (!name || name.length > 60) throw fail(400, 'shippingNameRequired')
  if (note.length > 120 || !isPrice(b.price) || typeof (b.active ?? true) !== 'boolean'
    || !isWhole(freeOver, 1, 10_000_000) || !isWhole(freeMinQty, 2, 1000)
    || !Array.isArray(productIds) || productIds.length > maxFreeProducts || !productIds.every(isId)) throw fail(400, 'invalidRequest')
  return { name, note, price: b.price, active: (b.active ?? true) as boolean, freeOver: freeOver as number | null, freeMinQty: freeMinQty as number | null, productIds: [...new Set(productIds as string[])] }
}

// Every option with the products that make it free, in the seller's order.
export async function listRates(t: Tx, storeId: string) {
  const rates = await t.select().from(shippingRates).where(eq(shippingRates.storeId, storeId)).orderBy(asc(shippingRates.position), asc(shippingRates.createdAt), asc(shippingRates.id))
  const free = rates.length
    ? await t.select({ rateId: shippingRateProducts.rateId, id: products.id, name: products.name }).from(shippingRateProducts)
      .innerJoin(products, eq(products.id, shippingRateProducts.productId)).where(inArray(shippingRateProducts.rateId, rates.map((r) => r.id))).orderBy(asc(products.name))
    : []
  return rates.map((r) => ({
    id: r.id, name: r.name, note: r.note, price: r.price, active: r.active, freeOver: r.freeOver, freeMinQty: r.freeMinQty,
    freeProducts: free.filter((f) => f.rateId === r.id).map(({ id, name }) => ({ id, name })),
  }))
}

// One store's option changes run one at a time, so two people cannot switch off the last two options together.
const lockRates = (t: Tx, storeId: string) => t.execute(sql`select pg_advisory_xact_lock(hashtext(${`shipping:${storeId}`}))`)
const activeCount = async (t: Tx, storeId: string) =>
  (await t.select({ n: sql<number>`count(*)::int` }).from(shippingRates).where(and(eq(shippingRates.storeId, storeId), eq(shippingRates.active, true))))[0].n

async function setFreeProducts(t: Tx, storeId: string, rateId: string, productIds: string[]) {
  await t.delete(shippingRateProducts).where(eq(shippingRateProducts.rateId, rateId))
  if (productIds.length) await t.insert(shippingRateProducts).values(productIds.map((productId) => ({ storeId, rateId, productId })))
}

// A product id from another store fails the composite foreign key.
const badProduct = (err: unknown): never => {
  if (databaseCode(err) === '23503') throw fail(400, 'invalidRequest')
  throw err
}

export function registerShipping(app: Hono<Env>) {
  app.get('/stores/:handle/shipping-rates', async (c) => tx(c.get('userId'), async (t) => {
    const store = await storeByHandle(t, c.req.param('handle'))
    return c.json(await listRates(t, store.id))
  }))

  app.post('/stores/:handle/shipping-rates', async (c) => {
    const input = readRate(await c.req.json().catch(() => null))
    return tx(c.get('userId'), async (t) => {
      const store = await storeByHandle(t, c.req.param('handle'))
      await lockRates(t, store.id)
      const [{ n, next }] = await t.select({ n: sql<number>`count(*)::int`, next: sql<number>`coalesce(max(${shippingRates.position}) + 1, 0)::int` }).from(shippingRates).where(eq(shippingRates.storeId, store.id))
      if (n >= maxRates) throw fail(409, 'shippingRateLimit')
      const { productIds, ...fields } = input
      const [row] = await t.insert(shippingRates).values({ storeId: store.id, ...fields, position: next }).returning({ id: shippingRates.id })
      await setFreeProducts(t, store.id, row.id, productIds)
      return c.json((await listRates(t, store.id)).find((r) => r.id === row.id), 201)
    }).catch(badProduct)
  })

  app.put('/stores/:handle/shipping-rates/:id', async (c) => {
    const id = c.req.param('id')
    if (!isId(id)) throw fail(404, 'notFound')
    const input = readRate(await c.req.json().catch(() => null))
    return tx(c.get('userId'), async (t) => {
      const store = await storeByHandle(t, c.req.param('handle'))
      await lockRates(t, store.id)
      const { productIds, ...fields } = input
      const [row] = await t.update(shippingRates).set(fields).where(and(eq(shippingRates.id, id), eq(shippingRates.storeId, store.id))).returning({ id: shippingRates.id })
      if (!row) throw fail(403, 'forbidden')
      if (await activeCount(t, store.id) === 0) throw fail(409, 'lastShippingRate')
      await setFreeProducts(t, store.id, id, productIds)
      return c.json((await listRates(t, store.id)).find((r) => r.id === id))
    }).catch(badProduct)
  })

  // The ids in their new order; any the store does not have are ignored.
  app.put('/stores/:handle/shipping-rates-order', async (c) => {
    const ids = (await c.req.json().catch(() => null))?.ids
    if (!Array.isArray(ids) || ids.length > maxRates || !ids.every(isId)) throw fail(400, 'invalidRequest')
    return tx(c.get('userId'), async (t) => {
      const store = await storeByHandle(t, c.req.param('handle'))
      await lockRates(t, store.id)
      for (const [position, id] of (ids as string[]).entries()) {
        const [row] = await t.update(shippingRates).set({ position }).where(and(eq(shippingRates.id, id), eq(shippingRates.storeId, store.id))).returning({ id: shippingRates.id })
        if (!row && (await t.select({ id: shippingRates.id }).from(shippingRates).where(eq(shippingRates.id, id))).length) throw fail(403, 'forbidden')
      }
      return c.json(await listRates(t, store.id))
    })
  })

  // Orders that used it keep the name and charge they were placed with.
  app.delete('/stores/:handle/shipping-rates/:id', async (c) => {
    const id = c.req.param('id')
    if (!isId(id)) throw fail(404, 'notFound')
    return tx(c.get('userId'), async (t) => {
      const store = await storeByHandle(t, c.req.param('handle'))
      await lockRates(t, store.id)
      const removed = await t.delete(shippingRates).where(and(eq(shippingRates.id, id), eq(shippingRates.storeId, store.id))).returning({ id: shippingRates.id })
      if (!removed.length) throw fail(403, 'forbidden')
      if (await activeCount(t, store.id) === 0) throw fail(409, 'lastShippingRate')
      return c.json({ ok: true })
    })
  })
}
