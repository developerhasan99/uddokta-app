import { and, asc, eq, sql } from 'drizzle-orm'
import type { Hono } from 'hono'
import { type Tx, tx } from './db.ts'
import { likePattern } from './media.ts'
import { readPhone } from 'storefront/schema'
import { manualOrderSources, readOrderFilters } from 'storefront/order-filters'
import { csvCell, orderWhere } from './order-query.ts'
import { registerOrderViews } from './order-views.ts'
import { isId, readTags } from './products.ts'
import { blockedPhones, checkoutDrafts, orderItems, shipments, orders, orderStatuses, pages, warehouses } from './schema.ts'
import { databaseCode, fail, storeByHandle, type Env } from './app.ts'

const pageSize = 50

// Two orders from one number for the same product within a day: often a buyer who pressed twice, or a test. Marked, never refused.
const duplicateOf = (o: ReturnType<typeof sql.raw>) => sql`exists (
  select 1 from orders d join order_items di on di.order_id = d.id join order_items oi on oi.order_id = ${o}.id and oi.variant_id = di.variant_id
  where d.store_id = ${o}.store_id and d.phone = ${o}.phone and d.id <> ${o}.id and abs(extract(epoch from d.created_at - ${o}.created_at)) < 86400)`
const isBlocked = (o: ReturnType<typeof sql.raw>) => sql`exists (select 1 from blocked_phones b where b.store_id = ${o}.store_id and b.phone = ${o}.phone)`
export const manualSources = manualOrderSources
export const maxOrderExport = 10_000
export const maxOrderTags = 10

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
  const [shipment] = await t.select({ courier: shipments.courier, consignmentId: shipments.consignmentId, trackingCode: shipments.trackingCode, courierStatus: shipments.courierStatus, checkedAt: shipments.checkedAt }).from(shipments).where(eq(shipments.orderId, id))
  const [flags] = (await t.execute<{ duplicate: boolean; blocked: boolean }>(sql`select ${duplicateOf(sql.raw('o'))} as duplicate, ${isBlocked(sql.raw('o'))} as blocked from orders o where o.id = ${id}::uuid`)).rows
  return {
    id: order.id, number: order.number, status: order.status, customerName: order.customerName, phone: order.phone, address: order.address, area: order.area,
    subtotal: order.subtotal, deliveryCharge: order.deliveryCharge, discount: order.discount, discountCode: order.discountCode, total: order.total, source: order.source, note: order.note, tags: order.tags, createdAt: order.createdAt, updatedAt: order.updatedAt,
    items, page: page ?? null, warehouse: warehouse ?? null, history, ...flags, shipment: shipment ?? null,
  }
}

const orderRoute = (c: { req: { param: (k: string) => string } }) => {
  const id = c.req.param('id')
  if (!isId(id)) throw fail(404, 'notFound')
  return id
}

export function registerOrders(app: Hono<Env>) {
  registerOrderViews(app)
  app.get('/stores/:handle/orders', async (c) => {
    const offset = Number(c.req.query('offset') ?? 0)
    const filters = readOrderFilters(c.req.query())
    if (!filters || !Number.isSafeInteger(offset) || offset < 0) throw fail(400, 'invalidOrderFilters')
    return tx(c.get('userId'), async (t) => {
      const store = await storeByHandle(t, c.req.param('handle'))
      const counts = await t.execute<{ status: string; count: number }>(sql`select o.status, count(*)::int as count from orders o where ${orderWhere(store.id, filters, false)} group by o.status`)
      const rows = await t.execute<{ id: string; number: number; customer_name: string; phone: string; address: string; status: string; total: number; source: string; created_at: string; items: string; tags: string[]; duplicate: boolean; blocked: boolean }>(sql`
        select o.id, o.number, o.customer_name, o.phone, o.address, o.status, o.total, o.source, o.created_at, o.tags, ${duplicateOf(sql.raw('o'))} as duplicate, ${isBlocked(sql.raw('o'))} as blocked,
          (select string_agg(i.product_name || case when i.variant_label <> '' then ' (' || i.variant_label || ')' else '' end || ' × ' || i.quantity, ', ') from order_items i where i.order_id = o.id) as items
        from orders o
        where ${orderWhere(store.id, filters)}
        order by o.created_at desc, o.number desc
        limit ${pageSize + 1} offset ${offset}`)
      return c.json({
        items: rows.rows.slice(0, pageSize).map((r) => ({ id: r.id, number: r.number, customerName: r.customer_name, phone: r.phone, address: r.address, status: r.status, total: r.total, source: r.source, createdAt: r.created_at, items: r.items ?? '', tags: r.tags, duplicate: r.duplicate, blocked: r.blocked })),
        hasMore: rows.rows.length > pageSize,
        counts: Object.fromEntries(counts.rows.map((r) => [r.status, r.count])),
      })
    })
  })

  // The export shares list filters and reads one consistent result, independent
  // of dashboard pagination. Refuse oversized exports rather than truncate them.
  app.get('/stores/:handle/orders/export', async (c) => {
    const filters = readOrderFilters(c.req.query())
    if (!filters) throw fail(400, 'invalidOrderFilters')
    return tx(c.get('userId'), async (t) => {
      const store = await storeByHandle(t, c.req.param('handle'))
      const result = await t.execute<{ number: number; status: string; source: string; customer_name: string; phone: string; address: string; area: string; items: string; tags: string; subtotal: number; delivery_charge: number; discount: number; total: number; note: string; created_at: string }>(sql`
        select o.number, o.status, o.source, o.customer_name, o.phone, o.address, o.area, array_to_string(o.tags, ', ') as tags, o.subtotal, o.delivery_charge, o.discount, o.total, o.note,
          to_char(o.created_at at time zone 'Asia/Dhaka', 'YYYY-MM-DD HH24:MI:SS') as created_at,
          (select string_agg(i.product_name || case when i.variant_label <> '' then ' (' || i.variant_label || ')' else '' end || ' × ' || i.quantity, ', ' order by i.id) from order_items i where i.order_id = o.id) as items
        from orders o where ${orderWhere(store.id, filters)} order by o.created_at desc, o.number desc limit ${maxOrderExport + 1}`)
      if (result.rows.length > maxOrderExport) throw fail(409, 'orderExportLimit')
      const headers = c.req.query('lang') === 'en'
        ? ['Order number', 'Status', 'Source', 'Customer', 'Phone', 'Address', 'Delivery area', 'Products', 'Tags', 'Subtotal (BDT)', 'Delivery (BDT)', 'Discount (BDT)', 'Total (BDT)', 'Note', 'Created (Asia/Dhaka)']
        : ['অর্ডার নম্বর', 'অবস্থা', 'মাধ্যম', 'কাস্টমার', 'মোবাইল', 'ঠিকানা', 'ডেলিভারি এলাকা', 'পণ্য', 'ট্যাগ', 'পণ্যের দাম (টাকা)', 'ডেলিভারি (টাকা)', 'ছাড় (টাকা)', 'মোট (টাকা)', 'নোট', 'সময় (Asia/Dhaka)']
      const csv = [headers.map((h) => csvCell(h)).join(','), ...result.rows.map((r) => [r.number, r.status, r.source, r.customer_name, r.phone, r.address, r.area, r.items, r.tags, r.subtotal, r.delivery_charge, r.discount, r.total, r.note, r.created_at].map((v, i) => csvCell(v, i === 4)).join(','))].join('\r\n')
      c.header('Content-Disposition', `attachment; filename="orders-${store.handle}.csv"`)
      c.header('Cache-Control', 'no-store')
      c.header('X-Content-Type-Options', 'nosniff')
      return c.body('\uFEFF' + csv + '\r\n', 200, { 'Content-Type': 'text/csv; charset=utf-8' })
    })
  })

  // Tags already used in this store, offered while typing so the team reuses the same words.
  app.get('/stores/:handle/order-tags', async (c) => {
    return tx(c.get('userId'), async (t) => {
      const store = await storeByHandle(t, c.req.param('handle'))
      const rows = await t.execute<{ tag: string }>(sql`select distinct unnest(tags) as tag from orders where store_id = ${store.id}::uuid order by 1 limit 200`)
      return c.json(rows.rows.map((r) => r.tag))
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
    const tags = body.tags === undefined ? undefined : readTags(body.tags, maxOrderTags)
    if (status !== undefined && !orderStatuses.includes(status)) throw fail(400, 'invalidRequest')
    if (note !== undefined && (typeof note !== 'string' || note.length > 2000)) throw fail(400, 'invalidRequest')
    return tx(c.get('userId'), async (t) => {
      const store = await storeByHandle(t, c.req.param('handle'))
      await loadOrder(t, store.id, id)
      if (typeof note === 'string') await t.update(orders).set({ note: note.trim(), updatedAt: sql`now()` }).where(eq(orders.id, id))
      if (tags) await t.update(orders).set({ tags, updatedAt: sql`now()` }).where(eq(orders.id, id))
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
    const { variantId, quantity, customerName, phone, address, area, source, note = '', coupon = '' } = body
    const tags = readTags(body.tags ?? [], maxOrderTags)
    // Several products as items: [{ variantId, quantity }]; a single variantId and quantity is the same as one item.
    const items: unknown = body.items ?? [{ variantId, quantity }]
    const lines = Array.isArray(items) && items.length >= 1 && items.length <= 20 && items.every((i) => i && isId(i.variantId) && Number.isInteger(i.quantity) && i.quantity >= 1 && i.quantity <= 100)
      ? items.map((i) => ({ variant: i.variantId as string, qty: i.quantity as number }))
      : null
    const name = typeof customerName === 'string' ? customerName.trim() : ''
    const where = typeof address === 'string' ? address.trim() : ''
    const mobile = typeof phone === 'string' ? readPhone(phone) : null
    if (!name || name.length > 100) throw fail(400, 'nameRequired')
    if (!mobile) throw fail(400, 'phoneInvalid')
    if (!where || where.length > 500) throw fail(400, 'addressRequired')
    if (!lines || !['inside', 'outside'].includes(area) || !manualSources.includes(source) || typeof note !== 'string' || note.length > 2000 || typeof coupon !== 'string' || coupon.length > 30) throw fail(400, 'invalidRequest')
    return tx(c.get('userId'), async (t) => {
      const store = await storeByHandle(t, c.req.param('handle'))
      const [placed] = (await t.execute<{ number: number }>(sql`select * from place_order_lines(${store.id}::uuid, null, ${JSON.stringify(lines)}::jsonb, ${name}, ${mobile}, ${where}, ${area}, ${source}, ${coupon.trim()})`)).rows
      const [row] = await t.update(orders).set({ note: note.trim(), tags }).where(and(eq(orders.storeId, store.id), eq(orders.number, placed.number))).returning({ id: orders.id })
      return c.json(await loadOrder(t, store.id, row.id), 201)
    }).catch((err) => {
      if (databaseCode(err) === 'UD011') throw fail(409, 'soldOut')
      if (databaseCode(err) === 'UD010') throw fail(400, 'notOnSale')
      if (databaseCode(err) === 'UD016') throw fail(400, 'couponInvalid')
      throw err
    })
  })

  app.get('/stores/:handle/blocked', async (c) => {
    return tx(c.get('userId'), async (t) => {
      const store = await storeByHandle(t, c.req.param('handle'))
      return c.json(await t.select({ phone: blockedPhones.phone, reason: blockedPhones.reason, createdAt: blockedPhones.createdAt }).from(blockedPhones).where(eq(blockedPhones.storeId, store.id)).orderBy(sql`${blockedPhones.createdAt} desc`))
    })
  })

  app.post('/stores/:handle/blocked', async (c) => {
    const body = await c.req.json().catch(() => null)
    const phone = typeof body?.phone === 'string' ? readPhone(body.phone) : null
    const reason = typeof body?.reason === 'string' ? body.reason.trim().slice(0, 200) : ''
    if (!phone) throw fail(400, 'phoneInvalid')
    return tx(c.get('userId'), async (t) => {
      const store = await storeByHandle(t, c.req.param('handle'))
      await t.insert(blockedPhones).values({ storeId: store.id, phone, reason }).onConflictDoUpdate({ target: [blockedPhones.storeId, blockedPhones.phone], set: { reason } })
      return c.json({ phone, reason }, 201)
    })
  })

  app.delete('/stores/:handle/blocked/:phone', async (c) => {
    return tx(c.get('userId'), async (t) => {
      const store = await storeByHandle(t, c.req.param('handle'))
      await t.delete(blockedPhones).where(and(eq(blockedPhones.storeId, store.id), eq(blockedPhones.phone, c.req.param('phone'))))
      return c.json({ ok: true })
    })
  })

  // One row per phone number, built from orders: COD buyers rarely have accounts, and the number is what the team calls.
  // ponytail: grouped on every request; give customers their own table once stores reach tens of thousands of orders.
  app.get('/stores/:handle/customers', async (c) => {
    const offset = Math.max(Number(c.req.query('offset')) || 0, 0)
    const q = (c.req.query('q') ?? '').trim().slice(0, 100)
    return tx(c.get('userId'), async (t) => {
      const store = await storeByHandle(t, c.req.param('handle'))
      const digits = q.replace(/[০-৯]/g, (d) => String('০১২৩৪৫৬৭৮৯'.indexOf(d)))
      const rows = await t.execute<{ phone: string; name: string; address: string; orders: number; delivered: number; returned: number; spent: number; last_order: string }>(sql`
        select phone, (array_agg(customer_name order by created_at desc))[1] as name, (array_agg(address order by created_at desc))[1] as address,
          count(*)::int as orders, count(*) filter (where status = 'delivered')::int as delivered, count(*) filter (where status = 'returned')::int as returned,
          coalesce(sum(total) filter (where status = 'delivered'), 0)::int as spent, max(created_at) as last_order
        from orders where store_id = ${store.id}::uuid
        group by phone
        ${q ? sql`having bool_or(customer_name ilike ${likePattern(q)}) or phone like ${likePattern(digits)}` : sql``}
        order by max(created_at) desc
        limit ${pageSize + 1} offset ${offset}`)
      return c.json({
        items: rows.rows.slice(0, pageSize).map((r) => ({ phone: r.phone, name: r.name, address: r.address, orders: r.orders, delivered: r.delivered, returned: r.returned, spent: r.spent, lastOrder: r.last_order })),
        hasMore: rows.rows.length > pageSize,
      })
    })
  })

  // Home: the last 14 days in Bangladesh time, and what the setup guide needs to know. Cancelled orders are not sales.
  app.get('/stores/:handle/summary', async (c) => {
    return tx(c.get('userId'), async (t) => {
      const store = await storeByHandle(t, c.req.param('handle'))
      const days = await t.execute<{ day: string; sales: number; orders: number; delivered: number; returned: number }>(sql`
        select to_char(d.day, 'YYYY-MM-DD') as day,
          coalesce(sum(o.total) filter (where o.status <> 'cancelled'), 0)::int as sales,
          count(o.id) filter (where o.status <> 'cancelled')::int as orders,
          count(o.id) filter (where o.status = 'delivered')::int as delivered,
          count(o.id) filter (where o.status = 'returned')::int as returned
        from generate_series((now() at time zone 'Asia/Dhaka')::date - 13, (now() at time zone 'Asia/Dhaka')::date, interval '1 day') as d(day)
        left join orders o on o.store_id = ${store.id}::uuid and (o.created_at at time zone 'Asia/Dhaka')::date = d.day::date
        group by d.day order by d.day`)
      const statuses = await t.execute<{ status: string; count: number }>(sql`select status, count(*)::int as count from orders where store_id = ${store.id}::uuid group by status`)
      const [setup] = (await t.execute<{ products: number; live_pages: number; orders: number }>(sql`
        select (select count(*)::int from products where store_id = ${store.id}::uuid and status <> 'draft') as products,
          (select count(*)::int from pages where store_id = ${store.id}::uuid and published is not null) as live_pages,
          (select count(*)::int from orders where store_id = ${store.id}::uuid) as orders`)).rows
      return c.json({
        days: days.rows,
        statuses: Object.fromEntries(statuses.rows.map((r) => [r.status, r.count])),
        setup: { products: setup.products, livePages: setup.live_pages, orders: setup.orders },
      })
    })
  })

  // Buyers who typed a number into an order form but did not finish.
  app.get('/stores/:handle/drafts', async (c) => {
    const status = ['open', 'ordered', 'dismissed'].includes(c.req.query('status') ?? '') ? c.req.query('status')! : 'open'
    return tx(c.get('userId'), async (t) => {
      const store = await storeByHandle(t, c.req.param('handle'))
      const rows = await t.select({ id: checkoutDrafts.id, phone: checkoutDrafts.phone, name: checkoutDrafts.name, address: checkoutDrafts.address, productName: checkoutDrafts.productName, status: checkoutDrafts.status, updatedAt: checkoutDrafts.updatedAt })
        .from(checkoutDrafts).where(and(eq(checkoutDrafts.storeId, store.id), eq(checkoutDrafts.status, status), sql`${checkoutDrafts.updatedAt} > now() - interval '90 days'`))
        .orderBy(sql`${checkoutDrafts.updatedAt} desc`).limit(200)
      const counts = await t.execute<{ status: string; count: number }>(sql`select status, count(*)::int as count from checkout_drafts where store_id = ${store.id}::uuid and updated_at > now() - interval '90 days' group by status`)
      return c.json({ items: rows, counts: Object.fromEntries(counts.rows.map((r) => [r.status, r.count])) })
    })
  })

  app.patch('/stores/:handle/drafts/:id', async (c) => {
    const id = orderRoute(c)
    const body = await c.req.json().catch(() => null)
    if (!['open', 'dismissed'].includes(body?.status)) throw fail(400, 'invalidRequest')
    return tx(c.get('userId'), async (t) => {
      const store = await storeByHandle(t, c.req.param('handle'))
      const [row] = await t.update(checkoutDrafts).set({ status: body.status }).where(and(eq(checkoutDrafts.storeId, store.id), eq(checkoutDrafts.id, id))).returning({ id: checkoutDrafts.id })
      if (!row) throw fail(404, 'notFound')
      return c.json({ ok: true })
    })
  })
}
