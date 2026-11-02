import { and, asc, eq, ne, sql } from 'drizzle-orm'
import type { Hono } from 'hono'
import { tx } from './db.ts'
import { isId, isName } from './products.ts'
import { warehouses, warehouseStock } from './schema.ts'
import { databaseCode, fail, storeByHandle, type Env } from './app.ts'

const maxListed = 500
// Every new store starts with this one, so stock always has somewhere to live.
export const defaultWarehouseName = 'প্রধান গুদাম'

function readWarehouse(body: any) {
  if (!body || typeof body !== 'object') throw fail(400, 'invalidRequest')
  if (!isName(body.name, 100)) throw fail(400, 'nameRequired')
  const { phone = '', address = '' } = body
  if (typeof phone !== 'string' || phone.length > 30 || typeof address !== 'string' || address.length > 500) throw fail(400, 'invalidRequest')
  return { name: body.name.trim() as string, phone: phone.trim(), address: address.trim() }
}

const refuseTakenName = (err: unknown) => {
  throw databaseCode(err) === '23505' ? fail(409, 'warehouseNameTaken') : err
}

const shown = { id: warehouses.id, name: warehouses.name, phone: warehouses.phone, address: warehouses.address }

export function registerWarehouses(app: Hono<Env>) {
  app.get('/stores/:handle/warehouses', async (c) => {
    return tx(c.get('userId'), async (t) => {
      const store = await storeByHandle(t, c.req.param('handle'))
      const rows = await t.execute<{ id: string; name: string; phone: string; address: string; units: number; has_stock: boolean }>(sql`
        select w.id, w.name, w.phone, w.address, coalesce(sum(s.quantity), 0)::bigint::float8 as units, count(s.variant_id) > 0 as has_stock
        from warehouses w left join warehouse_stock s on s.warehouse_id = w.id
        where w.store_id = ${store.id}::uuid
        group by w.id
        order by w.created_at, w.id
        limit ${maxListed}`)
      return c.json(rows.rows.map(({ has_stock, ...row }) => ({ ...row, hasStock: has_stock })))
    })
  })

  app.post('/stores/:handle/warehouses', async (c) => {
    const input = readWarehouse(await c.req.json().catch(() => null))
    return tx(c.get('userId'), async (t) => {
      const store = await storeByHandle(t, c.req.param('handle'))
      const [row] = await t.insert(warehouses).values({ storeId: store.id, ...input }).returning(shown)
      return c.json(row, 201)
    }).catch(refuseTakenName)
  })

  app.put('/stores/:handle/warehouses/:id', async (c) => {
    const id = c.req.param('id')
    if (!isId(id)) throw fail(404, 'notFound')
    const input = readWarehouse(await c.req.json().catch(() => null))
    return tx(c.get('userId'), async (t) => {
      const store = await storeByHandle(t, c.req.param('handle'))
      const [row] = await t.update(warehouses).set(input).where(and(eq(warehouses.storeId, store.id), eq(warehouses.id, id))).returning(shown)
      if (!row) throw fail(404, 'notFound')
      return c.json(row)
    }).catch(refuseTakenName)
  })

  // Its stock moves to the warehouse named in moveTo, including zero counts, so nothing silently stops being tracked.
  app.delete('/stores/:handle/warehouses/:id', async (c) => {
    const id = c.req.param('id')
    const moveTo = c.req.query('moveTo')
    if (!isId(id)) throw fail(404, 'notFound')
    if (moveTo !== undefined && (!isId(moveTo) || moveTo === id)) throw fail(400, 'invalidRequest')
    return tx(c.get('userId'), async (t) => {
      const store = await storeByHandle(t, c.req.param('handle'))
      const others = await t.select({ id: warehouses.id }).from(warehouses).where(and(eq(warehouses.storeId, store.id), ne(warehouses.id, id)))
      if (others.length === 0) throw fail(409, 'warehouseLast')
      const [held] = await t.select({ variantId: warehouseStock.variantId }).from(warehouseStock).where(eq(warehouseStock.warehouseId, id)).limit(1)
      if (held) {
        if (!moveTo) throw fail(409, 'warehouseHasStock')
        if (!others.some((w) => w.id === moveTo)) throw fail(400, 'invalidRequest')
        await t.execute(sql`
          insert into warehouse_stock (store_id, warehouse_id, variant_id, quantity)
          select store_id, ${moveTo}::uuid, variant_id, quantity from warehouse_stock where warehouse_id = ${id}::uuid
          on conflict (warehouse_id, variant_id) do update set quantity = least(warehouse_stock.quantity::bigint + excluded.quantity, 1000000000)`)
      }
      const removed = await t.delete(warehouses).where(and(eq(warehouses.storeId, store.id), eq(warehouses.id, id))).returning({ id: warehouses.id })
      if (removed.length === 0) throw fail(403, 'forbidden')
      return c.json({ ok: true })
    })
  })
}
