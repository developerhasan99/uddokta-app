import { and, desc, eq } from 'drizzle-orm'
import type { Hono } from 'hono'
import { tx } from './db.ts'
import { isId } from './products.ts'
import { discountKinds, discounts } from './schema.ts'
import { databaseCode, fail, storeByHandle, type Env } from './app.ts'

const fields = { id: discounts.id, code: discounts.code, kind: discounts.kind, value: discounts.value, minSubtotal: discounts.minSubtotal, maxUses: discounts.maxUses, uses: discounts.uses, endsAt: discounts.endsAt, active: discounts.active }

function readDiscount(body: any) {
  const code = typeof body?.code === 'string' ? body.code.trim().toUpperCase() : ''
  const { kind, value, minSubtotal = 0, maxUses = null, endsAt = null } = body ?? {}
  const whole = (v: unknown, max: number) => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= max
  if (!/^[A-Z0-9]{2,30}$/.test(code)) throw fail(400, 'couponCodeInvalid')
  if (!discountKinds.includes(kind) || !whole(value, kind === 'percent' ? 100 : 1_000_000) || value === 0) throw fail(400, 'invalidRequest')
  if (!whole(minSubtotal, 1_000_000) || !(maxUses === null || (whole(maxUses, 1_000_000) && maxUses > 0)) || !(endsAt === null || (typeof endsAt === 'string' && !Number.isNaN(Date.parse(endsAt))))) throw fail(400, 'invalidRequest')
  return { code, kind, value, minSubtotal, maxUses, endsAt: endsAt ? new Date(endsAt) : null }
}

export function registerDiscounts(app: Hono<Env>) {
  app.get('/stores/:handle/discounts', async (c) => {
    return tx(c.get('userId'), async (t) => {
      const store = await storeByHandle(t, c.req.param('handle'))
      return c.json(await t.select(fields).from(discounts).where(eq(discounts.storeId, store.id)).orderBy(desc(discounts.createdAt)).limit(200))
    })
  })

  app.post('/stores/:handle/discounts', async (c) => {
    const input = readDiscount(await c.req.json().catch(() => null))
    return tx(c.get('userId'), async (t) => {
      const store = await storeByHandle(t, c.req.param('handle'))
      const [row] = await t.insert(discounts).values({ storeId: store.id, ...input }).returning(fields)
      return c.json(row, 201)
    }).catch((err) => {
      throw databaseCode(err) === '23505' ? fail(409, 'couponCodeTaken') : err
    })
  })

  app.patch('/stores/:handle/discounts/:id', async (c) => {
    const id = c.req.param('id')
    const body = await c.req.json().catch(() => null)
    if (!isId(id) || typeof body?.active !== 'boolean') throw fail(400, 'invalidRequest')
    return tx(c.get('userId'), async (t) => {
      const store = await storeByHandle(t, c.req.param('handle'))
      const [row] = await t.update(discounts).set({ active: body.active }).where(and(eq(discounts.storeId, store.id), eq(discounts.id, id))).returning(fields)
      if (!row) throw fail(404, 'notFound')
      return c.json(row)
    })
  })

  app.delete('/stores/:handle/discounts/:id', async (c) => {
    const id = c.req.param('id')
    if (!isId(id)) throw fail(404, 'notFound')
    return tx(c.get('userId'), async (t) => {
      const store = await storeByHandle(t, c.req.param('handle'))
      const removed = await t.delete(discounts).where(and(eq(discounts.storeId, store.id), eq(discounts.id, id))).returning({ id: discounts.id })
      if (removed.length === 0) throw fail(403, 'forbidden')
      return c.json({ ok: true })
    })
  })
}
