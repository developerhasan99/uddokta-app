import { sql } from 'drizzle-orm'
import type { Hono } from 'hono'
import { tx } from './db.ts'
import { callOutcomes, customerCalls } from './schema.ts'
import { fail, storeByHandle, type Env } from './app.ts'

// Repeat sales: buyers whose last order was delivered at least `days` ago and who have not ordered since.
// A call hides them for a week, or for 90 days if they said they are not interested.
export function registerRepeat(app: Hono<Env>) {
  app.get('/stores/:handle/repeat', async (c) => {
    const days = [7, 15, 30, 45, 60, 90].includes(Number(c.req.query('days'))) ? Number(c.req.query('days')) : 30
    return tx(c.get('userId'), async (t) => {
      const store = await storeByHandle(t, c.req.param('handle'))
      const rows = await t.execute<{ phone: string; name: string; delivered_at: string; product: string; delivered_orders: number; spent: number; last_call: string | null; last_outcome: string | null }>(sql`
        with last_order as (
          select distinct on (phone) phone, id, customer_name, status, updated_at
          from orders where store_id = ${store.id}::uuid and status <> 'cancelled'
          order by phone, created_at desc
        )
        select l.phone, l.customer_name as name, l.updated_at as delivered_at,
          (select string_agg(i.product_name, ', ') from order_items i where i.order_id = l.id) as product,
          (select count(*)::int from orders o where o.store_id = ${store.id}::uuid and o.phone = l.phone and o.status = 'delivered') as delivered_orders,
          (select coalesce(sum(total), 0)::int from orders o where o.store_id = ${store.id}::uuid and o.phone = l.phone and o.status = 'delivered') as spent,
          lc.created_at as last_call, lc.outcome as last_outcome
        from last_order l
        left join lateral (select created_at, outcome from customer_calls cc where cc.store_id = ${store.id}::uuid and cc.phone = l.phone order by created_at desc limit 1) lc on true
        where l.status = 'delivered' and l.updated_at < now() - make_interval(days => ${days})
          and not exists (select 1 from blocked_phones b where b.store_id = ${store.id}::uuid and b.phone = l.phone)
          and (lc.created_at is null or lc.created_at < now() - case when lc.outcome = 'not_interested' then interval '90 days' else interval '7 days' end)
        order by l.updated_at
        limit 200`)
      return c.json(rows.rows.map((r) => ({ phone: r.phone, name: r.name, deliveredAt: r.delivered_at, product: r.product ?? '', deliveredOrders: r.delivered_orders, spent: r.spent, lastCall: r.last_call, lastOutcome: r.last_outcome })))
    })
  })

  app.get('/stores/:handle/calls', async (c) => {
    return tx(c.get('userId'), async (t) => {
      const store = await storeByHandle(t, c.req.param('handle'))
      const rows = await t.execute<{ id: string; phone: string; outcome: string; note: string; created_at: string; user_name: string | null }>(sql`
        select cc.id, cc.phone, cc.outcome, cc.note, cc.created_at, u.name as user_name
        from customer_calls cc left join users u on u.id = cc.user_id
        where cc.store_id = ${store.id}::uuid order by cc.created_at desc limit 100`)
      return c.json(rows.rows.map((r) => ({ id: r.id, phone: r.phone, outcome: r.outcome, note: r.note, createdAt: r.created_at, by: r.user_name ?? '' })))
    })
  })

  app.post('/stores/:handle/calls', async (c) => {
    const body = await c.req.json().catch(() => null)
    const phone = typeof body?.phone === 'string' ? body.phone : ''
    const note = typeof body?.note === 'string' ? body.note.trim() : ''
    if (!/^01\d{9}$/.test(phone) || !callOutcomes.includes(body?.outcome) || note.length > 1000) throw fail(400, 'invalidRequest')
    return tx(c.get('userId'), async (t) => {
      const store = await storeByHandle(t, c.req.param('handle'))
      const [row] = await t.insert(customerCalls).values({ storeId: store.id, phone, outcome: body.outcome, note, userId: c.get('userId') }).returning({ id: customerCalls.id })
      return c.json(row, 201)
    })
  })
}
