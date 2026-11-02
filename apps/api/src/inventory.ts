import { and, eq, inArray, sql } from 'drizzle-orm'
import type { Hono } from 'hono'
import { type Tx, tx } from './db.ts'
import { likePattern } from './media.ts'
import { isAmount, isId } from './products.ts'
import { productVariants, warehouses } from './schema.ts'
import { firstWarehouseId, setStock } from './stock.ts'
import { publicUrl } from './storage.ts'
import { fail, storeByHandle, type Env } from './app.ts'

const pageSize = 50
const maxChanges = 200

// How many are in the chosen warehouse. A variant tracked only elsewhere has none here; one tracked nowhere has no number at all.
const quantity = sql`coalesce(ws.quantity, case when v.stock is not null then 0 end)`
const filters = {
  in: sql`and ${quantity} > 0`,
  out: sql`and ${quantity} = 0`,
  untracked: sql`and v.stock is null`,
}

async function chosenWarehouse(t: Tx, storeId: string, requested: unknown) {
  if (requested === undefined || requested === '') return firstWarehouseId(t, storeId)
  if (!isId(requested)) throw fail(404, 'notFound')
  const [found] = await t.select({ id: warehouses.id }).from(warehouses).where(and(eq(warehouses.storeId, storeId), eq(warehouses.id, requested)))
  if (!found) throw fail(404, 'notFound')
  return found.id
}

function readChanges(body: any) {
  const changes = body?.changes
  const valid = Array.isArray(changes) && changes.length >= 1 && changes.length <= maxChanges
    && changes.every((c) => isId(c?.variantId) && (c.stock === null || isAmount(c.stock)))
    && new Set(changes.map((c) => c.variantId)).size === changes.length
  if (!valid) throw fail(400, 'invalidRequest')
  return changes as { variantId: string; stock: number | null }[]
}

export function registerInventory(app: Hono<Env>) {
  app.get('/stores/:handle/inventory', async (c) => {
    const offset = Math.max(Number(c.req.query('offset')) || 0, 0)
    const q = (c.req.query('q') ?? '').trim().slice(0, 200)
    const filter = filters[c.req.query('filter') as keyof typeof filters] ?? sql``
    return tx(c.get('userId'), async (t) => {
      const store = await storeByHandle(t, c.req.param('handle'))
      const warehouseId = await chosenWarehouse(t, store.id, c.req.query('warehouse'))
      const inWarehouse = sql`left join warehouse_stock ws on ws.variant_id = v.id and ws.warehouse_id = ${warehouseId}::uuid`
      const search = q ? sql`and (p.name ilike ${likePattern(q)} or v.sku ilike ${likePattern(q)})` : sql``
      const [counts] = (await t.execute<{ all: number; in: number; out: number; untracked: number }>(sql`
        select count(*)::int as all, count(*) filter (where ${quantity} > 0)::int as in, count(*) filter (where ${quantity} = 0)::int as out, count(*) filter (where v.stock is null)::int as untracked
        from product_variants v join products p on p.id = v.product_id ${inWarehouse}
        where v.store_id = ${store.id}::uuid ${search}`)).rows
      // ponytail: offset paging, like products; switch to a cursor if catalogues reach tens of thousands of variants.
      const rows = await t.execute<{ id: string; product_id: string; name: string; status: string; options: string[]; sku: string; stock: number | null; total: number | null; thumb_key: string | null }>(sql`
        select v.id, v.product_id, p.name, p.status, v.options, v.sku, ${quantity} as stock, v.stock as total, coalesce(own.thumb_key, i.thumb_key) as thumb_key
        from product_variants v
        join products p on p.id = v.product_id
        ${inWarehouse}
        left join media own on own.id = v.media_id
        left join lateral (
          select m.thumb_key from product_media pm join media m on m.id = pm.media_id
          where pm.product_id = p.id order by pm.position limit 1
        ) i on true
        where v.store_id = ${store.id}::uuid ${search} ${filter}
        order by p.created_at desc, p.id desc, v.position
        limit ${pageSize + 1} offset ${offset}`)
      return c.json({
        items: rows.rows.slice(0, pageSize).map((r) => ({
          variantId: r.id, productId: r.product_id, productName: r.name, status: r.status, options: r.options, sku: r.sku, stock: r.stock, total: r.total, thumbUrl: r.thumb_key && publicUrl(r.thumb_key),
        })),
        hasMore: rows.rows.length > pageSize,
        counts,
        warehouseId,
      })
    })
  })

  // ponytail: last save wins if two people count the same item; send the number each edit started from if teams report lost counts.
  app.patch('/stores/:handle/inventory', async (c) => {
    const body = await c.req.json().catch(() => null)
    const changes = readChanges(body)
    return tx(c.get('userId'), async (t) => {
      const store = await storeByHandle(t, c.req.param('handle'))
      const found = await t.select({ id: productVariants.id }).from(productVariants).where(and(eq(productVariants.storeId, store.id), inArray(productVariants.id, changes.map((x) => x.variantId))))
      if (found.length !== changes.length) throw fail(404, 'notFound')
      const warehouseId = await chosenWarehouse(t, store.id, body.warehouseId)
      for (const { variantId, stock } of changes) await setStock(t, store.id, warehouseId, variantId, stock)
      return c.json({ ok: true })
    })
  })
}
