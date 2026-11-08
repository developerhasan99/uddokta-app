import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import type { Hono } from 'hono'
import { fail, storeByHandle, type Env } from './app.ts'
import { tx, type Tx } from './db.ts'
import { isId } from './products.ts'
import { notificationKinds, notifications, notificationSettings, type NotificationKind } from './schema.ts'

const pageSize = 30
// Joining the team is only announced to owners and admins (see notify() in the migration), so only they get the switch.
const kindsFor = (role: string) => notificationKinds.filter((k) => k !== 'member_joined' || role !== 'staff')

export function registerNotifications(app: Hono<Env>) {
  // Newest first. `before` is the id of the last one shown, to page back; the unread count covers all of them.
  app.get('/stores/:handle/notifications', async (c) => {
    const before = c.req.query('before')
    if (before !== undefined && !isId(before)) throw fail(400, 'invalidRequest')
    const userId = c.get('userId')
    return tx(userId, async (t) => {
      const store = await storeByHandle(t, c.req.param('handle'))
      await t.execute(sql`select notify_stale_drafts(${store.id}::uuid)`)
      const mine = and(eq(notifications.storeId, store.id), eq(notifications.userId, userId))
      const rows = await t
        .select({ id: notifications.id, kind: notifications.kind, data: notifications.data, createdAt: notifications.createdAt, readAt: notifications.readAt })
        .from(notifications)
        .where(before ? and(mine, sql`(${notifications.createdAt}, ${notifications.id}) < (select created_at, id from notifications where id = ${before}::uuid)`) : mine)
        .orderBy(desc(notifications.createdAt), desc(notifications.id))
        .limit(pageSize + 1)
      const [{ unread }] = await t.select({ unread: sql<number>`count(*)::int` }).from(notifications).where(and(mine, isNull(notifications.readAt)))
      return c.json({ items: rows.slice(0, pageSize), more: rows.length > pageSize, unread })
    })
  })

  // Marks the given ones read, or all of them when no ids are sent.
  app.post('/stores/:handle/notifications/read', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    const ids = body?.ids
    if (ids !== undefined && (!Array.isArray(ids) || ids.length > 100 || !ids.every(isId))) throw fail(400, 'invalidRequest')
    const userId = c.get('userId')
    return tx(userId, async (t) => {
      const store = await storeByHandle(t, c.req.param('handle'))
      const mine = and(eq(notifications.storeId, store.id), eq(notifications.userId, userId), isNull(notifications.readAt))
      await t.update(notifications).set({ readAt: new Date() }).where(ids ? and(mine, inArray(notifications.id, ids as string[])) : mine)
      const [{ unread }] = await t.select({ unread: sql<number>`count(*)::int` }).from(notifications).where(mine)
      return c.json({ unread })
    })
  })

  app.get('/stores/:handle/notification-settings', async (c) => {
    const userId = c.get('userId')
    return tx(userId, async (t) => c.json(await readSettings(t, await storeByHandle(t, c.req.param('handle')), userId)))
  })

  // Sends any of the switches the member can see; each is saved as their own choice for this store.
  app.put('/stores/:handle/notification-settings', async (c) => {
    const body = await c.req.json().catch(() => null)
    const settings = body?.settings
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) throw fail(400, 'invalidRequest')
    const entries = Object.entries(settings as Record<string, unknown>)
    if (entries.some(([kind, on]) => !notificationKinds.includes(kind as NotificationKind) || typeof on !== 'boolean')) throw fail(400, 'invalidRequest')
    const userId = c.get('userId')
    return tx(userId, async (t) => {
      const store = await storeByHandle(t, c.req.param('handle'))
      const allowed = kindsFor(await myRole(t, store.id)) as readonly string[]
      const rows = entries.filter(([kind]) => allowed.includes(kind)).map(([kind, on]) => ({ storeId: store.id, userId, kind: kind as NotificationKind, enabled: on as boolean }))
      if (rows.length) {
        await t.insert(notificationSettings).values(rows).onConflictDoUpdate({
          target: [notificationSettings.storeId, notificationSettings.userId, notificationSettings.kind],
          set: { enabled: sql`excluded.enabled` },
        })
      }
      return c.json(await readSettings(t, store, userId))
    })
  })
}

const myRole = async (t: Tx, storeId: string) => (await t.execute<{ role: string }>(sql`select my_role(${storeId}::uuid) as role`)).rows[0].role

// Every switch the member can see, with the default from the database where they have not chosen.
async function readSettings(t: Tx, store: { id: string }, userId: string) {
  const kinds = kindsFor(await myRole(t, store.id))
  const rows = (await t.execute<{ kind: NotificationKind; enabled: boolean }>(sql`
    select k.k as kind, coalesce(s.enabled, notification_default(k.k)) as enabled
    from unnest(string_to_array(${kinds.join(',')}, ',')) with ordinality as k(k, n)
    left join notification_settings s on s.store_id = ${store.id}::uuid and s.user_id = ${userId}::uuid and s.kind = k.k
    order by k.n`)).rows
  return { settings: Object.fromEntries(rows.map((r) => [r.kind, r.enabled])) as Record<NotificationKind, boolean> }
}
