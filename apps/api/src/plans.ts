import { sql } from 'drizzle-orm'
import type { Context, Hono } from 'hono'
import type { PlanFeature } from 'storefront/plans'
import { fail, type Env } from './app.ts'
import { one, tx, type Tx } from './db.ts'

// What a store's plan allows right now (store_limits(): its own or custom plan while paid, else the default plan).
// A null limit is unlimited; `features` are the seller tools it includes (storefront/src/plans.ts).
export type Limits = {
  planId: string; planName: string; planUntil: string | null; priceBdt: number; isCustom: boolean; billingNote: string
  maxLandingPages: number | null; storageMb: number; maxMembers: number | null; maxProducts: number | null
  features: PlanFeature[]; customDomain: boolean; suspended: boolean
}
type Row = { plan_id: string; plan_name: string; plan_until: string | null; price_bdt: number; is_custom: boolean; billing_note: string; max_landing_pages: number | null; storage_mb: number; max_members: number | null; max_products: number | null; features: PlanFeature[]; custom_domain: boolean; suspended: boolean }

export async function storeLimits(t: Tx, storeId: string): Promise<Limits> {
  const r = await one<Row>(t, sql`select * from store_limits(${storeId}::uuid)`)
  if (!r) throw fail(404, 'notFound')
  return {
    planId: r.plan_id, planName: r.plan_name, planUntil: r.plan_until, priceBdt: r.price_bdt, isCustom: r.is_custom, billingNote: r.billing_note,
    maxLandingPages: r.max_landing_pages, storageMb: r.storage_mb, maxMembers: r.max_members, maxProducts: r.max_products,
    features: r.features, customDomain: r.custom_domain, suspended: r.suspended,
  }
}

export const over = (count: number, limit: number | null) => limit !== null && count >= limit
export async function requireFeature(t: Tx, storeId: string, feature: PlanFeature) {
  if (!(await storeLimits(t, storeId)).features.includes(feature)) throw fail(403, `planFeature:${feature}`)
}

// Seller tools that belong to a plan feature, by the address under /stores/:handle/. Without the feature every
// request there (reading too) answers 403 planFeature:<feature>; the dashboard shows what the plan leaves out.
// Online store templates, Site settings and the store preview stay open: landing pages use them too.
const featureRoutes: [RegExp, PlanFeature][] = [
  [/^discounts(\/|$)/, 'discounts'],
  [/^blocked(\/|$)/, 'fakeOrderProtection'],
  [/^drafts(\/|$)/, 'incompleteOrders'],
  [/^(repeat|calls)(\/|$)/, 'repeatSales'],
  [/^analytics(\/|$)/, 'analytics'],
  [/^tracking(\/|$)/, 'adTracking'],
  [/^couriers\/steadfast(\/|$)/, 'courierBooking'],
  [/^(store-pages|menus)(\/|$)/, 'onlineStore'],
]

// A suspended store can still be looked at by its team, but nothing in it changes until it is restored. And a tool
// its plan leaves out is closed.
export function guardStores(app: Hono<Env>) {
  const guard = async (c: Context<Env>, next: () => Promise<void>) => {
    const rest = c.req.path.replace(/^\/api\/stores\/[^/]+\/?/, '')
    const feature = featureRoutes.find(([pattern]) => pattern.test(rest))?.[1]
    const writes = c.req.method !== 'GET' && c.req.method !== 'HEAD'
    if (feature || writes) {
      const row = await tx(c.get('userId'), (t) => one<{ suspended: boolean; deleting: boolean; features: string[] }>(t, sql`
        select l.suspended, s.deletion_due_at is not null as deleting, l.features from stores s, store_limits(s.id) l where s.handle = ${c.req.param('handle')}`))
      if (row && writes && row.suspended) throw fail(423, 'storeSuspended')
      // Waiting to be deleted: read-only too, except restoring it (DELETE /stores/:handle/deletion).
      if (row && writes && row.deleting && rest !== 'deletion') throw fail(423, 'storeDeleting')
      if (row && feature && !row.features.includes(feature)) throw fail(403, `planFeature:${feature}`)
    }
    await next()
  }
  app.use('/stores/:handle', guard)
  app.use('/stores/:handle/*', guard)
}

export function registerPlans(app: Hono<Env>) {
  // Every member sees what the plan includes (the dashboard marks closed tools); only owners and admins see Billing.
  app.get('/stores/:handle/plan', async (c) => tx(c.get('userId'), async (t) => {
    const [store] = (await t.execute<{ id: string }>(sql`select id from stores where handle = ${c.req.param('handle')}`)).rows
    if (!store) throw fail(404, 'notFound')
    const { billingNote, ...limits } = await storeLimits(t, store.id)
    return c.json(limits)
  }))
  app.get('/stores/:handle/billing', async (c) => tx(c.get('userId'), async (t) => {
    const [store] = (await t.execute<{ id: string; role: string | null }>(sql`select id, my_role(id) as role from stores where handle = ${c.req.param('handle')}`)).rows
    if (!store) throw fail(404, 'notFound')
    if (store.role !== 'owner' && store.role !== 'admin') throw fail(403, 'forbidden')
    return c.json((await one<{ b: unknown }>(t, sql`select store_billing(${store.id}::uuid) as b`))!.b)
  }))
}
