import { and, asc, eq, sql } from 'drizzle-orm'
import type { Hono } from 'hono'
import { type Tx, tx } from './db.ts'
import { likePattern } from './media.ts'
import { readPhone } from 'storefront/schema'
import { isId } from './products.ts'
import { orderItems, orders, orderStatuses, pages, warehouses } from './schema.ts'
import { databaseCode, fail, storeByHandle, type Env } from './app.ts'

const pageSize = 50
export const manualSources = ['messenger', 'whatsapp', 'phone', 'facebook_comment', 'instagram', 'shop', 'other'] as const

async function loadOrder(t: Tx, storeId: string, id: string) {
  const [order] = await t.select().from(orders).where(and(eq(orders.storeId, storeId), eq(orders.id, id)))
  if (!order) throw fail(404, 'notFound')
  const items = await t.select({ id: orderItems.id, productName: orderItems.productName, variantLabel: orderItems.variantLabel, price: orderItems.price, quantity: orderItems.quantity }).from(orderItems).where(eq(orderItems.orderId, id)).orderBy(asc(orderItems.productName))
  const [page] = order.pageId ? await t.select({ id: pages.id, title: pages.title }).from(pages).where(eq(pages.id, order.pageId)) : []
  const [warehouse] = order.warehouseId ? await t.select({ id: warehouses.id, name: warehouses.name }).from(warehouses).where(eq(warehouses.id, order.warehouseId)) : []
  // Earlier orders from the same number: the first check before confirming a COD order.
  const [history] = (await t.execute<{ total: number; delivered: number; returned: number; cancelled: number }>(sql`
    select count(*)::int as total, count(*) filter (where status = 'delivered')::int as delivered, count(*) filter (where status = 'returned')::int as returned, count(*) filter (where status = 'cancelled')::int as cancelled
    from orders where store_id = ${storeId}::uuid and phone = ${order.phone} and id <> ${id}::uuid`)).rows
  return {
    id: order.id, number: order.number, status: order.status, customerName: order.customerName, phone: order.phone, address: order.address, area: order.area,
    subtotal: order.subtotal, deliveryCharge: order.deliveryCharge, total: order.total, source: order.source, note: order.note, createdAt: order.createdAt, updatedAt: order.updatedAt,
    items, page: page ?? null, warehouse: warehouse ?? null, history,
  }
}

const orderRoute = (c: { req: { param: (k: string) => string } }) => {
  const id = c.req.param('id')
  if (!isId(id)) throw fail(404, 'notFound')
  return id
}

export function registerOrders(app: Hono<Env>) {
  app.get('/stores/:handle/orders', async (c) => {
    const offset = Math.max(Number(c.req.query('offset')) || 0, 0)
    const q = (c.req.query('q') ?? '').trim().slice(0, 100)
    const status = c.req.query('status') ?? ''
    return tx(c.get('userId'), async (t) => {
      const store = await storeByHandle(t, c.req.param('handle'))
      const digits = q.replace(/[০-৯]/g, (d) => String('০১২৩৪৫৬৭৮৯'.indexOf(d))).replace(/^#/, '')
      const search = q
        ? sql`and (o.customer_name ilike ${likePattern(q)} or o.phone like ${likePattern(digits)} ${/^\d+$/.test(digits) ? sql`or o.number = ${Number(digits)}` : sql``})`
        : sql``
      const counts = await t.execute<{ status: string; count: number }>(sql`select o.status, count(*)::int as count from orders o where o.store_id = ${store.id}::uuid ${search} group by o.status`)
      const rows = await t.execute<{ id: string; number: number; customer_name: string; phone: string; address: string; status: string; total: number; source: string; created_at: string; items: string }>(sql`
        select o.id, o.number, o.customer_name, o.phone, o.address, o.status, o.total, o.source, o.created_at,
          (select string_agg(i.product_name || case when i.variant_label <> '' then ' (' || i.variant_label || ')' else '' end || ' × ' || i.quantity, ', ') from order_items i where i.order_id = o.id) as items
        from orders o
        where o.store_id = ${store.id}::uuid ${search} ${orderStatuses.includes(status as never) ? sql`and o.status = ${status}` : sql``}
        order by o.created_at desc, o.number desc
        limit ${pageSize + 1} offset ${offset}`)
      return c.json({
        items: rows.rows.slice(0, pageSize).map((r) => ({ id: r.id, number: r.number, customerName: r.customer_name, phone: r.phone, address: r.address, status: r.status, total: r.total, source: r.source, createdAt: r.created_at, items: r.items ?? '' })),
        hasMore: rows.rows.length > pageSize,
        counts: Object.fromEntries(counts.rows.map((r) => [r.status, r.count])),
      })
    })
  })

  app.get('/stores/:handle/orders/:id', async (c) => {
    const id = orderRoute(c)
    return tx(c.get('userId'), async (t) => {
      const store = await storeByHandle(t, c.req.param('handle'))
      return c.json(await loadOrder(t, store.id, id))
    })
  })

  // Status and the team's note. The database decides which status changes are allowed and puts stock back.
  app.patch('/stores/:handle/orders/:id', async (c) => {
    const id = orderRoute(c)
    const body = await c.req.json().catch(() => null)
    if (!body || typeof body !== 'object') throw fail(400, 'invalidRequest')
    const { status, note } = body
    if (status !== undefined && !orderStatuses.includes(status)) throw fail(400, 'invalidRequest')
    if (note !== undefined && (typeof note !== 'string' || note.length > 2000)) throw fail(400, 'invalidRequest')
    return tx(c.get('userId'), async (t) => {
      const store = await storeByHandle(t, c.req.param('handle'))
      await loadOrder(t, store.id, id)
      if (typeof note === 'string') await t.update(orders).set({ note: note.trim(), updatedAt: sql`now()` }).where(eq(orders.id, id))
      if (status) await t.execute(sql`select set_order_status(${id}::uuid, ${status})`)
      return c.json(await loadOrder(t, store.id, id))
    }).catch((err) => {
      if (databaseCode(err) === 'UD012') throw fail(409, 'statusNotAllowed')
      throw err
    })
  })

  // An order the team types in. It goes through place_order like a storefront order, so the price and stock are the database's.
  // place_order runs with the database's own rights, so the store is first looked up as this member, which proves they belong to it.
  app.post('/stores/:handle/orders', async (c) => {
    const body = await c.req.json().catch(() => null)
    if (!body || typeof body !== 'object') throw fail(400, 'invalidRequest')
    const { variantId, quantity, customerName, phone, address, area, source, note = '' } = body
    const name = typeof customerName === 'string' ? customerName.trim() : ''
    const where = typeof address === 'string' ? address.trim() : ''
    const mobile = typeof phone === 'string' ? readPhone(phone) : null
    if (!name || name.length > 100) throw fail(400, 'nameRequired')
    if (!mobile) throw fail(400, 'phoneInvalid')
    if (!where || where.length > 500) throw fail(400, 'addressRequired')
    if (!isId(variantId) || !Number.isInteger(quantity) || quantity < 1 || quantity > 100 || !['inside', 'outside'].includes(area) || !manualSources.includes(source) || typeof note !== 'string' || note.length > 2000) throw fail(400, 'invalidRequest')
    return tx(c.get('userId'), async (t) => {
      const store = await storeByHandle(t, c.req.param('handle'))
      const [placed] = (await t.execute<{ number: number }>(sql`select place_order(${store.id}::uuid, null, ${variantId}::uuid, ${quantity}, ${name}, ${mobile}, ${where}, ${area}, ${source}) as number`)).rows
      const [row] = await t.update(orders).set({ note: note.trim() }).where(and(eq(orders.storeId, store.id), eq(orders.number, placed.number))).returning({ id: orders.id })
      return c.json(await loadOrder(t, store.id, row.id), 201)
    }).catch((err) => {
      if (databaseCode(err) === 'UD011') throw fail(409, 'soldOut')
      if (databaseCode(err) === 'UD010') throw fail(400, 'notOnSale')
      throw err
    })
  })
}
