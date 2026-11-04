import { sql } from 'drizzle-orm'
import type { Hono } from 'hono'
import { type Tx, tx } from './db.ts'
import { fail, storeByHandle, type Env } from './app.ts'

const periods = [7, 30, 90, 365]

// Buying prices are for owners and admins. Row-level security already hides them; this says so plainly.
async function managedStore(t: Tx, handle: string) {
  const store = await storeByHandle(t, handle)
  const [role] = (await t.execute<{ role: string }>(sql`select my_role(${store.id}::uuid) as role`)).rows
  if (role.role === 'staff') throw fail(403, 'forbidden')
  return store
}

// Profit counts delivered orders only: a COD order is money only once the courier hands it over.
// The delivery charge is left out of sales, as it goes to the courier. All amounts are worked out here, in SQL.
export function registerAnalytics(app: Hono<Env>) {
  app.get('/stores/:handle/analytics', async (c) => {
    const days = periods.includes(Number(c.req.query('days'))) ? Number(c.req.query('days')) : 30
    return tx(c.get('userId'), async (t) => {
      const store = await managedStore(t, c.req.param('handle'))
      const since = sql`(now() at time zone 'Asia/Dhaka')::date - ${days - 1}::int`
      const [totals] = (await t.execute<{ revenue: number; cost: number; missing_cost: number; delivered: number; returned: number; cancelled: number; orders: number }>(sql`
        select coalesce(sum(i.price * i.quantity) filter (where o.status = 'delivered'), 0)::int as revenue,
          coalesce(sum(ic.cost * i.quantity) filter (where o.status = 'delivered'), 0)::int as cost,
          count(i.id) filter (where o.status = 'delivered' and ic.order_item_id is null)::int as missing_cost,
          count(distinct o.id) filter (where o.status = 'delivered')::int as delivered,
          count(distinct o.id) filter (where o.status = 'returned')::int as returned,
          count(distinct o.id) filter (where o.status = 'cancelled')::int as cancelled,
          count(distinct o.id)::int as orders
        from orders o join order_items i on i.order_id = o.id left join order_item_costs ic on ic.order_item_id = i.id
        where o.store_id = ${store.id}::uuid and (o.created_at at time zone 'Asia/Dhaka')::date >= ${since}`)).rows
      const series = (await t.execute<{ day: string; revenue: number; profit: number }>(sql`
        select to_char(d.day, 'YYYY-MM-DD') as day,
          coalesce(sum(i.price * i.quantity), 0)::int as revenue,
          coalesce(sum((i.price - coalesce(ic.cost, 0)) * i.quantity), 0)::int as profit
        from generate_series(${since}, (now() at time zone 'Asia/Dhaka')::date, interval '1 day') as d(day)
        left join orders o on o.store_id = ${store.id}::uuid and o.status = 'delivered' and (o.created_at at time zone 'Asia/Dhaka')::date = d.day::date
        left join order_items i on i.order_id = o.id
        left join order_item_costs ic on ic.order_item_id = i.id
        group by d.day order by d.day`)).rows
      const top = (await t.execute<{ name: string; quantity: number; revenue: number }>(sql`
        select i.product_name as name, sum(i.quantity)::int as quantity, sum(i.price * i.quantity)::int as revenue
        from orders o join order_items i on i.order_id = o.id
        where o.store_id = ${store.id}::uuid and o.status = 'delivered' and (o.created_at at time zone 'Asia/Dhaka')::date >= ${since}
        group by i.product_name order by revenue desc limit 5`)).rows
      return c.json({
        days,
        revenue: totals.revenue, cost: totals.cost, profit: totals.revenue - totals.cost,
        missingCost: totals.missing_cost, delivered: totals.delivered, returned: totals.returned, cancelled: totals.cancelled, orders: totals.orders,
        series, top,
      })
    })
  })
}
