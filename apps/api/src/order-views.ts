import { and, eq, sql } from 'drizzle-orm'
import type { Hono } from 'hono'
import { readOrderFilters } from 'storefront/order-filters'
import { databaseCode, fail, storeByHandle, type Env } from './app.ts'
import { tx } from './db.ts'
import { isId, isName } from './products.ts'
import { orderViews } from './schema.ts'

const duplicateName = (err: unknown): never => {
  if (databaseCode(err) === '23505') throw fail(409, 'orderViewNameTaken')
  throw err
}

export function registerOrderViews(app: Hono<Env>) {
  app.get('/stores/:handle/order-views', async (c) => tx(c.get('userId'), async (t) => {
    const store = await storeByHandle(t, c.req.param('handle'))
    return c.json(await t.select({ id: orderViews.id, name: orderViews.name, filters: orderViews.filters }).from(orderViews).where(and(eq(orderViews.storeId, store.id), eq(orderViews.userId, c.get('userId')))).orderBy(orderViews.createdAt, orderViews.id))
  }))

  for (const method of ['post', 'put'] as const) {
    app[method](`/stores/:handle/order-views${method === 'put' ? '/:id' : ''}`, async (c) => {
      const body = await c.req.json().catch(() => null)
      const filters = readOrderFilters(body?.filters)
      if (!filters || !isName(body?.name, 80)) throw fail(400, 'invalidOrderView')
      const id = method === 'put' ? c.req.param('id') : null
      if (method === 'put' && !isId(id)) throw fail(404, 'notFound')
      return tx(c.get('userId'), async (t) => {
        const store = await storeByHandle(t, c.req.param('handle'))
        const userId = c.get('userId')
        await t.execute(sql`select pg_advisory_xact_lock(hashtext(${`order-views:${store.id}:${userId}`}))`)
        let row
        if (id) {
          ;[row] = await t.update(orderViews).set({ name: body.name.trim(), filters }).where(and(eq(orderViews.id, id), eq(orderViews.storeId, store.id), eq(orderViews.userId, userId))).returning()
          if (!row) throw fail(404, 'notFound')
        } else {
          const [{ count }] = await t.select({ count: sql<number>`count(*)::int` }).from(orderViews).where(and(eq(orderViews.storeId, store.id), eq(orderViews.userId, userId)))
          if (count >= 20) throw fail(409, 'orderViewLimit')
          ;[row] = await t.insert(orderViews).values({ storeId: store.id, userId, name: body.name.trim(), filters }).returning()
        }
        return c.json({ id: row.id, name: row.name, filters: row.filters }, id ? 200 : 201)
      }).catch(duplicateName)
    })
  }

  app.delete('/stores/:handle/order-views/:id', async (c) => {
    const id = c.req.param('id')
    if (!isId(id)) throw fail(404, 'notFound')
    return tx(c.get('userId'), async (t) => {
      const store = await storeByHandle(t, c.req.param('handle'))
      const removed = await t.delete(orderViews).where(and(eq(orderViews.id, id), eq(orderViews.storeId, store.id), eq(orderViews.userId, c.get('userId')))).returning({ id: orderViews.id })
      if (!removed.length) throw fail(404, 'notFound')
      return c.json({ ok: true })
    })
  })
}
