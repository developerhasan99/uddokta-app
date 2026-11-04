import { and, eq, isNull, sql } from 'drizzle-orm'
import type { Hono } from 'hono'
import { tx } from './db.ts'
import { isId } from './products.ts'
import { shifts, tasks } from './schema.ts'
import { databaseCode, fail, storeByHandle, type Env } from './app.ts'

const readDate = (v: unknown) => (v === null || v === undefined || v === '' ? null : typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) ? v : undefined)

export function registerTeam(app: Hono<Env>) {
  app.get('/stores/:handle/tasks', async (c) => {
    const done = c.req.query('done') === '1'
    return tx(c.get('userId'), async (t) => {
      const store = await storeByHandle(t, c.req.param('handle'))
      const rows = await t.execute<{ id: string; title: string; due_on: string | null; assignee_id: string | null; assignee: string | null; done_at: string | null; created_at: string }>(sql`
        select t.id, t.title, to_char(t.due_on, 'YYYY-MM-DD') as due_on, t.assignee_id, u.name as assignee, t.done_at, t.created_at
        from tasks t left join users u on u.id = t.assignee_id
        where t.store_id = ${store.id}::uuid and ${done ? sql`t.done_at is not null` : sql`t.done_at is null`}
        order by ${done ? sql`t.done_at desc` : sql`t.due_on nulls last, t.created_at`} limit 200`)
      return c.json(rows.rows.map((r) => ({ id: r.id, title: r.title, dueOn: r.due_on, assigneeId: r.assignee_id, assignee: r.assignee, doneAt: r.done_at, createdAt: r.created_at })))
    })
  })

  app.post('/stores/:handle/tasks', async (c) => {
    const body = await c.req.json().catch(() => null)
    const title = typeof body?.title === 'string' ? body.title.trim() : ''
    const dueOn = readDate(body?.dueOn)
    const assigneeId = body?.assigneeId ?? null
    if (!title || title.length > 300) throw fail(400, 'nameRequired')
    if (dueOn === undefined || !(assigneeId === null || isId(assigneeId))) throw fail(400, 'invalidRequest')
    return tx(c.get('userId'), async (t) => {
      const store = await storeByHandle(t, c.req.param('handle'))
      const [row] = await t.insert(tasks).values({ storeId: store.id, title, dueOn, assigneeId, createdBy: c.get('userId') }).returning({ id: tasks.id })
      return c.json(row, 201)
    }).catch((err) => {
      // Row-level security refuses giving a task to someone outside the store.
      throw databaseCode(err) === '42501' ? fail(400, 'invalidRequest') : err
    })
  })

  app.patch('/stores/:handle/tasks/:id', async (c) => {
    const id = c.req.param('id')
    const body = await c.req.json().catch(() => null)
    if (!isId(id) || typeof body?.done !== 'boolean') throw fail(400, 'invalidRequest')
    return tx(c.get('userId'), async (t) => {
      const store = await storeByHandle(t, c.req.param('handle'))
      const [row] = await t.update(tasks).set({ doneAt: body.done ? sql`now()` : null }).where(and(eq(tasks.storeId, store.id), eq(tasks.id, id))).returning({ id: tasks.id })
      if (!row) throw fail(404, 'notFound')
      return c.json({ ok: true })
    })
  })

  app.delete('/stores/:handle/tasks/:id', async (c) => {
    const id = c.req.param('id')
    if (!isId(id)) throw fail(404, 'notFound')
    return tx(c.get('userId'), async (t) => {
      const store = await storeByHandle(t, c.req.param('handle'))
      await t.delete(tasks).where(and(eq(tasks.storeId, store.id), eq(tasks.id, id)))
      return c.json({ ok: true })
    })
  })

  // Who is on shift now, and everyone's hours over the last 14 days in Bangladesh time.
  app.get('/stores/:handle/shifts', async (c) => {
    return tx(c.get('userId'), async (t) => {
      const store = await storeByHandle(t, c.req.param('handle'))
      const open = await t.execute<{ user_id: string; name: string; started_at: string }>(sql`
        select s.user_id, u.name, s.started_at from shifts s join users u on u.id = s.user_id
        where s.store_id = ${store.id}::uuid and s.ended_at is null order by s.started_at`)
      const days = await t.execute<{ user_id: string; name: string; day: string; minutes: number }>(sql`
        select s.user_id, u.name, to_char((s.started_at at time zone 'Asia/Dhaka')::date, 'YYYY-MM-DD') as day,
          (sum(extract(epoch from coalesce(s.ended_at, now()) - s.started_at)) / 60)::int as minutes
        from shifts s join users u on u.id = s.user_id
        where s.store_id = ${store.id}::uuid and s.started_at > now() - interval '14 days'
        group by s.user_id, u.name, 3 order by 3 desc, u.name`)
      return c.json({
        open: open.rows.map((r) => ({ userId: r.user_id, name: r.name, startedAt: r.started_at })),
        days: days.rows.map((r) => ({ userId: r.user_id, name: r.name, day: r.day, minutes: r.minutes })),
      })
    })
  })

  app.post('/stores/:handle/shifts/start', async (c) => {
    return tx(c.get('userId'), async (t) => {
      const store = await storeByHandle(t, c.req.param('handle'))
      await t.insert(shifts).values({ storeId: store.id, userId: c.get('userId') }).onConflictDoNothing()
      return c.json({ ok: true })
    })
  })

  app.post('/stores/:handle/shifts/end', async (c) => {
    return tx(c.get('userId'), async (t) => {
      const store = await storeByHandle(t, c.req.param('handle'))
      await t.update(shifts).set({ endedAt: sql`now()` }).where(and(eq(shifts.storeId, store.id), eq(shifts.userId, c.get('userId')), isNull(shifts.endedAt)))
      return c.json({ ok: true })
    })
  })
}
