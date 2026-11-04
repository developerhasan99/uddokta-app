import { and, eq, sql } from 'drizzle-orm'
import type { Hono } from 'hono'
import { type Tx, tx } from './db.ts'
import { isId } from './products.ts'
import { expenseCategories, expenses } from './schema.ts'
import { fail, storeByHandle, type Env } from './app.ts'

const periods = [7, 30, 90, 365]

// Buying prices and spending are for owners and admins. Row-level security already hides them; this says so plainly.
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
      const spent = (await t.execute<{ category: string; amount: number }>(sql`
        select category, sum(amount)::int as amount from expenses where store_id = ${store.id}::uuid and spent_on >= ${since} group by category`)).rows
      const series = (await t.execute<{ day: string; revenue: number; profit: number }>(sql`
        select to_char(d.day, 'YYYY-MM-DD') as day,
          coalesce(sum(i.price * i.quantity), 0)::int as revenue,
          (coalesce(sum((i.price - coalesce(ic.cost, 0)) * i.quantity), 0) - coalesce((select sum(amount) from expenses e where e.store_id = ${store.id}::uuid and e.spent_on = d.day::date), 0))::int as profit
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
      const expenseTotal = spent.reduce((sum, e) => sum + e.amount, 0)
      return c.json({
        days,
        revenue: totals.revenue, cost: totals.cost, expenses: expenseTotal, profit: totals.revenue - totals.cost - expenseTotal,
        missingCost: totals.missing_cost, delivered: totals.delivered, returned: totals.returned, cancelled: totals.cancelled, orders: totals.orders,
        expensesByCategory: Object.fromEntries(spent.map((e) => [e.category, e.amount])),
        series, top,
      })
    })
  })

  app.get('/stores/:handle/expenses', async (c) => {
    return tx(c.get('userId'), async (t) => {
      const store = await managedStore(t, c.req.param('handle'))
      return c.json(await t.select({ id: expenses.id, spentOn: expenses.spentOn, category: expenses.category, amount: expenses.amount, note: expenses.note })
        .from(expenses).where(eq(expenses.storeId, store.id)).orderBy(sql`${expenses.spentOn} desc, ${expenses.createdAt} desc`).limit(200))
    })
  })

  app.post('/stores/:handle/expenses', async (c) => {
    const body = await c.req.json().catch(() => null)
    const { spentOn, category, amount, note = '' } = body ?? {}
    const validDate = typeof spentOn === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(spentOn) && !Number.isNaN(Date.parse(spentOn))
    if (!validDate || !expenseCategories.includes(category) || !Number.isInteger(amount) || amount <= 0 || amount > 100_000_000 || typeof note !== 'string' || note.length > 500) throw fail(400, 'invalidRequest')
    return tx(c.get('userId'), async (t) => {
      const store = await managedStore(t, c.req.param('handle'))
      const [row] = await t.insert(expenses).values({ storeId: store.id, spentOn, category, amount, note: note.trim() }).returning({ id: expenses.id, spentOn: expenses.spentOn, category: expenses.category, amount: expenses.amount, note: expenses.note })
      return c.json(row, 201)
    })
  })

  app.delete('/stores/:handle/expenses/:id', async (c) => {
    const id = c.req.param('id')
    if (!isId(id)) throw fail(404, 'notFound')
    return tx(c.get('userId'), async (t) => {
      const store = await managedStore(t, c.req.param('handle'))
      const removed = await t.delete(expenses).where(and(eq(expenses.storeId, store.id), eq(expenses.id, id))).returning({ id: expenses.id })
      if (removed.length === 0) throw fail(404, 'notFound')
      return c.json({ ok: true })
    })
  })
}
