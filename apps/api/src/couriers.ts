import { and, eq, sql } from 'drizzle-orm'
import type { Hono } from 'hono'
import { type Tx, tx } from './db.ts'
import { isId } from './products.ts'
import { courierAccounts, orders, shipments } from './schema.ts'
import { open, seal } from './secrets.ts'
import { fail, storeByHandle, type Env } from './app.ts'

type Steadfast = { apiKey: string; secretKey: string }

// Steadfast's merchant API. The address is set by STEADFAST_URL so tests can point it at a stand-in.
const steadfastUrl = () => process.env.STEADFAST_URL ?? 'https://portal.packzy.com/api/v1'

async function steadfast(creds: Steadfast, path: string, body?: unknown) {
  let res: Response
  try {
    res = await fetch(`${steadfastUrl()}${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { 'Api-Key': creds.apiKey, 'Secret-Key': creds.secretKey, 'content-type': 'application/json', accept: 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15_000),
    })
  } catch {
    throw fail(502, 'courierUnreachable')
  }
  const data = await res.json().catch(() => null) as Record<string, any> | null
  if (res.status === 401 || res.status === 403) throw fail(400, 'courierLoginFailed')
  if (!res.ok || !data || (data.status !== undefined && data.status !== 200)) throw fail(502, 'courierRefused')
  return data
}

// Steadfast's parcel states, mapped to the step an order moves to. Anything else leaves the order where it is.
const finalStates: Record<string, 'delivered' | 'returned'> = { delivered: 'delivered', partial_delivered: 'delivered', cancelled: 'returned' }

async function account(t: Tx, storeId: string) {
  const [row] = await t.select().from(courierAccounts).where(and(eq(courierAccounts.storeId, storeId), eq(courierAccounts.courier, 'steadfast')))
  if (!row) throw fail(400, 'courierNotConnected')
  return open<Steadfast>(row.credentials)
}

async function managedStore(t: Tx, handle: string) {
  const found = await storeByHandle(t, handle)
  const [role] = (await t.execute<{ role: string }>(sql`select my_role(${found.id}::uuid) as role`)).rows
  if (role.role === 'staff') throw fail(403, 'forbidden')
  return found
}

const orderId = (id: string) => {
  if (!isId(id)) throw fail(404, 'notFound')
  return id
}

// ponytail: status is checked when someone presses Refresh; add an hourly pg-boss job when stores send many parcels a day.
export function registerCouriers(app: Hono<Env>) {
  app.get('/stores/:handle/couriers', async (c) => {
    return tx(c.get('userId'), async (t) => {
      const store = await storeByHandle(t, c.req.param('handle'))
      const rows = await t.select({ courier: courierAccounts.courier, updatedAt: courierAccounts.updatedAt }).from(courierAccounts).where(eq(courierAccounts.storeId, store.id))
      return c.json(rows)
    })
  })

  // Checks the keys with Steadfast before saving them, so a typo is caught now and not at the first parcel.
  app.put('/stores/:handle/couriers/steadfast', async (c) => {
    const body = await c.req.json().catch(() => null)
    const apiKey = typeof body?.apiKey === 'string' ? body.apiKey.trim() : ''
    const secretKey = typeof body?.secretKey === 'string' ? body.secretKey.trim() : ''
    if (!apiKey || !secretKey || apiKey.length > 200 || secretKey.length > 200) throw fail(400, 'invalidRequest')
    const store = await tx(c.get('userId'), (t) => managedStore(t, c.req.param('handle')))
    const balance = await steadfast({ apiKey, secretKey }, '/get_balance')
    await tx(c.get('userId'), (t) => t.insert(courierAccounts).values({ storeId: store.id, courier: 'steadfast', credentials: seal({ apiKey, secretKey }) })
      .onConflictDoUpdate({ target: [courierAccounts.storeId, courierAccounts.courier], set: { credentials: seal({ apiKey, secretKey }), updatedAt: sql`now()` } }))
    return c.json({ courier: 'steadfast', balance: Number(balance.current_balance ?? 0) })
  })

  // Self delivery has nothing to check: turning it on is just its row.
  app.put('/stores/:handle/couriers/self', async (c) => {
    return tx(c.get('userId'), async (t) => {
      const store = await managedStore(t, c.req.param('handle'))
      await t.insert(courierAccounts).values({ storeId: store.id, courier: 'self', credentials: '' }).onConflictDoNothing()
      return c.json({ courier: 'self' })
    })
  })

  // Parcels already sent keep their record either way.
  app.delete('/stores/:handle/couriers/:courier{steadfast|self}', async (c) => {
    const courier = c.req.param('courier') as 'steadfast' | 'self'
    return tx(c.get('userId'), async (t) => {
      const store = await storeByHandle(t, c.req.param('handle'))
      const removed = await t.delete(courierAccounts).where(and(eq(courierAccounts.storeId, store.id), eq(courierAccounts.courier, courier))).returning({ storeId: courierAccounts.storeId })
      if (removed.length === 0) throw fail(403, 'forbidden')
      return c.json({ ok: true })
    })
  })

  // Books the parcel with Steadfast (or records self delivery), then moves the order to With courier. The courier collects the order's total.
  // The order row stays locked during the call, so a double click waits and then finds the parcel already booked.
  app.post('/stores/:handle/orders/:id/ship', async (c) => {
    const id = orderId(c.req.param('id'))
    const via = (await c.req.json().catch(() => null))?.courier ?? 'steadfast'
    if (via !== 'steadfast' && via !== 'self') throw fail(400, 'invalidRequest')
    return tx(c.get('userId'), async (t) => {
      const store = await storeByHandle(t, c.req.param('handle'))
      const [order] = await t.select().from(orders).where(and(eq(orders.storeId, store.id), eq(orders.id, id))).for('update')
      if (!order) throw fail(404, 'notFound')
      const [already] = await t.select({ orderId: shipments.orderId }).from(shipments).where(eq(shipments.orderId, id))
      if (already) throw fail(409, 'alreadyShipped')
      if (order.status !== 'confirmed' && order.status !== 'packed') throw fail(409, 'statusNotAllowed')
      const toCourier = async () => {
        if (order.status === 'confirmed') await t.execute(sql`select set_order_status(${id}::uuid, 'packed')`)
        await t.execute(sql`select set_order_status(${id}::uuid, 'courier')`)
      }
      if (via === 'self') {
        const [on] = await t.select({ courier: courierAccounts.courier }).from(courierAccounts).where(and(eq(courierAccounts.storeId, store.id), eq(courierAccounts.courier, 'self')))
        if (!on) throw fail(400, 'courierNotConnected')
        await t.insert(shipments).values({ orderId: id, storeId: store.id, courier: 'self', consignmentId: '' })
        await toCourier()
        return c.json({ consignmentId: '', trackingCode: '' }, 201)
      }
      const data = await steadfast(await account(t, store.id), '/create_order', {
        invoice: `${store.handle}-${order.number}`,
        recipient_name: order.customerName,
        recipient_phone: order.phone,
        recipient_address: order.address,
        cod_amount: order.total,
        note: order.note,
      })
      const consignment = data.consignment ?? {}
      const booked = { consignmentId: String(consignment.consignment_id ?? ''), trackingCode: String(consignment.tracking_code ?? '') }
      await t.insert(shipments).values({ orderId: id, storeId: store.id, courier: 'steadfast', ...booked, courierStatus: String(consignment.status ?? '') })
      await toCourier()
      return c.json(booked, 201)
    })
  })

  // Asks Steadfast where the parcel is; a delivered or cancelled parcel moves the order to Delivered or Returned.
  app.post('/stores/:handle/orders/:id/track', async (c) => {
    const id = orderId(c.req.param('id'))
    const { shipment, creds } = await tx(c.get('userId'), async (t) => {
      const found = await storeByHandle(t, c.req.param('handle'))
      const [row] = await t.select().from(shipments).where(and(eq(shipments.storeId, found.id), eq(shipments.orderId, id)))
      if (!row || row.courier !== 'steadfast') throw fail(404, 'notFound')
      return { shipment: row, creds: await account(t, found.id) }
    })
    const data = await steadfast(creds, `/status_by_cid/${encodeURIComponent(shipment.consignmentId)}`)
    const state = String(data.delivery_status ?? '')
    return tx(c.get('userId'), async (t) => {
      await t.update(shipments).set({ courierStatus: state, checkedAt: sql`now()` }).where(eq(shipments.orderId, id))
      const next = finalStates[state]
      const [order] = await t.select({ status: orders.status }).from(orders).where(eq(orders.id, id))
      if (next && order.status === 'courier') await t.execute(sql`select set_order_status(${id}::uuid, ${next})`)
      return c.json({ courierStatus: state })
    })
  })
}
