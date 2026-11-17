import { sql } from 'drizzle-orm'
import type { Hono } from 'hono'
import { fail, type Env } from './app.ts'
import { one, tx, type Tx } from './db.ts'

// What a store's plan allows right now (store_limits() in migration 0097: its own plan while paid, else the default).
// A null limit is unlimited.
export type Limits = { planName: string; planUntil: string | null; maxLandingPages: number | null; storageMb: number; maxMembers: number | null; maxProducts: number | null; customDomain: boolean; suspended: boolean }

export async function storeLimits(t: Tx, storeId: string): Promise<Limits> {
  const r = await one<{ plan_name: string; plan_until: string | null; max_landing_pages: number | null; storage_mb: number; max_members: number | null; max_products: number | null; custom_domain: boolean; suspended: boolean }>(t, sql`select * from store_limits(${storeId}::uuid)`)
  if (!r) throw fail(404, 'notFound')
  return { planName: r.plan_name, planUntil: r.plan_until, maxLandingPages: r.max_landing_pages, storageMb: r.storage_mb, maxMembers: r.max_members, maxProducts: r.max_products, customDomain: r.custom_domain, suspended: r.suspended }
}

export const over = (count: number, limit: number | null) => limit !== null && count >= limit

// A suspended store can still be looked at by its team, but nothing in it changes until it is restored.
export function guardSuspendedStores(app: Hono<Env>) {
  const guard = async (c: any, next: () => Promise<void>) => {
    if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
      const row = await tx(c.get('userId'), (t) => one<{ suspended: boolean }>(t, sql`select suspended_at is not null as suspended from stores where handle = ${c.req.param('handle')}`))
      if (row?.suspended) throw fail(423, 'storeSuspended')
    }
    await next()
  }
  app.use('/stores/:handle', guard)
  app.use('/stores/:handle/*', guard)
}

export function registerPlans(app: Hono<Env>) {
  app.get('/stores/:handle/plan', async (c) => tx(c.get('userId'), async (t) => {
    const [store] = (await t.execute<{ id: string }>(sql`select id from stores where handle = ${c.req.param('handle')}`)).rows
    if (!store) throw fail(404, 'notFound')
    return c.json(await storeLimits(t, store.id))
  }))
}
