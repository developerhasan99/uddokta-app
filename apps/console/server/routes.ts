import { sql } from 'drizzle-orm'
import type { Context, Hono } from 'hono'
import { getCookie } from 'hono/cookie'
import { databaseCode, fail, hash, newToken } from '../../api/src/http.ts'
import { one, tx } from '../../api/src/db.ts'
import { appUrl, emailReady, readLang, resetEmail, sendEmail } from '../../api/src/email.ts'
import { isPlanFeature } from '../../storefront/src/plans.ts'
import { consoleCookie, type Env } from './app.ts'

// The console's API. Every request needs a console session (console_session: signed in to the console within 12
// hours by a platform administrator). Every read and change goes through the console_* functions in migration 0097,
// which check the administrator again and write the audit log; this file only validates input.

const isId = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f-]{36}$/.test(v)
async function body(c: Context) {
  const value = await c.req.json().catch(() => null)
  if (!value || typeof value !== 'object') throw fail(400, 'invalidRequest')
  return value as Record<string, unknown>
}
const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
// Suspending and other changes say why; the reason goes into the audit log.
const reason = (b: Record<string, unknown>) => {
  const r = text(b.reason, 500)
  if (!r) throw fail(400, 'reasonRequired')
  return r
}
const page = (c: Context) => ({ q: text(c.req.query('q'), 100), offset: Math.max(Number(c.req.query('offset')) || 0, 0) })
const limit = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 1_000_000 ? v as number : NaN)

// The limits and tools of a plan, public or custom. Blank limits are unlimited; features are known tool keys.
function readLimits(b: Record<string, unknown>) {
  const features = Array.isArray(b.features) ? [...new Set(b.features)] : null
  const plan = {
    priceBdt: Number(b.priceBdt), storageMb: Number(b.storageMb), billingNote: text(b.billingNote, 300),
    maxLandingPages: limit(b.maxLandingPages), maxMembers: limit(b.maxMembers), maxProducts: limit(b.maxProducts), features: features ?? [],
  }
  // Every paid plan includes the seller's own domain (the database refuses one without it, plans_paid_domain).
  if (plan.priceBdt > 0 && !plan.features.includes('customDomain')) plan.features = [...plan.features, 'customDomain']
  const bad = [plan.maxLandingPages, plan.maxMembers, plan.maxProducts].some((n) => Number.isNaN(n))
  if (bad || !features || !features.every(isPlanFeature) || !Number.isInteger(plan.priceBdt) || plan.priceBdt < 0 || plan.priceBdt > 1_000_000
    || !Number.isInteger(plan.storageMb) || plan.storageMb < 1 || plan.storageMb > 10_000_000 || plan.maxMembers === 0) throw fail(400, 'planInvalid')
  return plan
}
function readPlan(b: Record<string, unknown>) {
  const plan = { ...readLimits(b), name: text(b.name, 40), isDefault: b.isDefault === true, archived: b.archived === true }
  if (!plan.name) throw fail(400, 'nameRequired')
  if (plan.isDefault && plan.archived) throw fail(400, 'planInvalid')
  return plan
}

export function registerConsole(app: Hono<Env>) {
  app.use('/console/*', async (c, next) => {
    const admin = await tx(null, (t) => one<{ id: string | null }>(t, sql`select console_session(${hash(getCookie(c, consoleCookie) ?? '')}) as id`))
    if (!admin?.id) throw fail(401, 'consoleSignIn')
    c.set('userId', admin.id)
    await next()
  })
  const admin = (c: Context<Env>) => c.get('userId')
  const run = <T>(work: Parameters<typeof tx<T>>[1]) => tx(null, work)

  app.get('/console/me', async (c) => c.json(await tx(admin(c), async (t) => (await t.execute(sql`select id, name, email from users where id = ${admin(c)}::uuid`)).rows[0])))

  app.get('/console/overview', async (c) => c.json((await run((t) => one<{ o: unknown }>(t, sql`select console_overview(${admin(c)}::uuid) as o`)))!.o))

  app.get('/console/users', async (c) => {
    const { q, offset } = page(c)
    const rows = (await run((t) => t.execute<Record<string, unknown> & { total: string }>(sql`select * from console_users(${admin(c)}::uuid, ${q}, 50, ${offset})`))).rows
    return c.json({ total: Number(rows[0]?.total ?? 0), items: rows.map(({ total, ...r }) => r) })
  })
  app.get('/console/users/:id', async (c) => {
    if (!isId(c.req.param('id'))) throw fail(404, 'notFound')
    const user = (await run((t) => one<{ u: unknown }>(t, sql`select console_user(${admin(c)}::uuid, ${c.req.param('id')}::uuid) as u`)))?.u
    if (!user) throw fail(404, 'notFound')
    return c.json(user)
  })
  app.post('/console/users/:id/suspend', async (c) => {
    const b = await body(c)
    if (!isId(c.req.param('id'))) throw fail(404, 'notFound')
    await run((t) => t.execute(sql`select console_suspend_user(${admin(c)}::uuid, ${c.req.param('id')}::uuid, ${b.suspend === true}, ${reason(b)})`))
    return c.json({ ok: true })
  })
  app.post('/console/users/:id/sign-out', async (c) => {
    const b = await body(c)
    if (!isId(c.req.param('id'))) throw fail(404, 'notFound')
    await run((t) => t.execute(sql`select console_sign_out_user(${admin(c)}::uuid, ${c.req.param('id')}::uuid, ${reason(b)})`))
    return c.json({ ok: true })
  })
  // Sends the user the same reset link as "Forgot password" (the console never sees or sets a password).
  app.post('/console/users/:id/password-reset', async (c) => {
    const b = await body(c)
    const id = c.req.param('id')
    if (!isId(id)) throw fail(404, 'notFound')
    const base = appUrl()
    if (!emailReady() || !base) throw fail(503, 'emailUnavailable')
    const why = reason(b)
    const token = newToken()
    const sent = await run(async (t) => {
      const [user] = (await t.execute<{ email: string; language: string }>(sql`select email, language from users where id = ${id}::uuid`)).rows
      if (!user) throw fail(404, 'notFound')
      const started = await one<{ name: string }>(t, sql`select * from start_password_reset(${user.email}, ${hash(token)}, ${'30 minutes'}::interval)`)
      await t.execute(sql`select console_log(${admin(c)}::uuid, 'user.passwordReset', 'user', ${id}::uuid, ${user.email}, ${JSON.stringify({ sent: Boolean(started) })}::jsonb, ${why})`)
      return started ? { ...user, name: started.name } : null
    })
    if (!sent) throw fail(429, 'tooManyEmails')
    await sendEmail(sent.email, 'reset', resetEmail(readLang(sent.language), sent.name, `${base}/reset-password/${token}`))
    return c.json({ ok: true })
  })

  app.get('/console/stores', async (c) => {
    const { q, offset } = page(c)
    const rows = (await run((t) => t.execute<Record<string, unknown> & { total: string; storage_bytes: string }>(sql`select * from console_stores(${admin(c)}::uuid, ${q}, 50, ${offset})`))).rows
    return c.json({ total: Number(rows[0]?.total ?? 0), items: rows.map(({ total, storage_bytes, ...r }) => ({ ...r, storage_bytes: Number(storage_bytes) })) })
  })
  app.get('/console/stores/:id', async (c) => {
    if (!isId(c.req.param('id'))) throw fail(404, 'notFound')
    const store = (await run((t) => one<{ s: unknown }>(t, sql`select console_store(${admin(c)}::uuid, ${c.req.param('id')}::uuid) as s`)))?.s
    if (!store) throw fail(404, 'notFound')
    return c.json(store)
  })
  app.post('/console/stores/:id/suspend', async (c) => {
    const b = await body(c)
    if (!isId(c.req.param('id'))) throw fail(404, 'notFound')
    await run((t) => t.execute(sql`select console_suspend_store(${admin(c)}::uuid, ${c.req.param('id')}::uuid, ${b.suspend === true}, ${reason(b)})`))
    return c.json({ ok: true })
  })
  app.put('/console/stores/:id/plan', async (c) => {
    const b = await body(c)
    if (!isId(c.req.param('id')) || !(b.planId === null || isId(b.planId))) throw fail(400, 'invalidRequest')
    const until = b.until === null || b.until === undefined || b.until === '' ? null : text(b.until, 10)
    if (until !== null && !/^\d{4}-\d{2}-\d{2}$/.test(until)) throw fail(400, 'invalidRequest')
    await run((t) => t.execute(sql`select console_set_plan(${admin(c)}::uuid, ${c.req.param('id')}::uuid, ${b.planId as string | null}::uuid, ${until}::date, ${reason(b)})`))
    return c.json({ ok: true })
  })
  app.post('/console/stores/:id/payments', async (c) => {
    const b = await body(c)
    const amount = Number(b.amount)
    const months = Number(b.months)
    const method = text(b.method, 30)
    if (!isId(c.req.param('id')) || !isId(b.planId) || !Number.isInteger(amount) || amount < 0 || amount > 10_000_000 || !Number.isInteger(months) || months < 1 || months > 36 || !method) throw fail(400, 'invalidRequest')
    const until = await run((t) => one<{ d: string }>(t, sql`select console_record_payment(${admin(c)}::uuid, ${c.req.param('id')}::uuid, ${b.planId}::uuid, ${amount}, ${months}, ${method}, ${text(b.reference, 100)}, ${text(b.reason, 500)}) as d`))
    return c.json({ until: until?.d })
  })

  app.get('/console/plans', async (c) => c.json((await run((t) => one<{ p: unknown }>(t, sql`select console_plans(${admin(c)}::uuid) as p`)))!.p))
  const savePlan = async (c: Context<Env>, id: string | null) => {
    const b = await body(c)
    const plan = readPlan(b)
    const saved = await run((t) => one<{ id: string }>(t, sql`select console_save_plan(${admin(c)}::uuid, ${id}::uuid, ${JSON.stringify(plan)}::jsonb, ${text(b.reason, 500)}) as id`))
      .catch((err) => { throw databaseCode(err) === '23505' ? fail(409, 'planNameTaken') : err })
    return c.json({ id: saved?.id }, id ? 200 : 201)
  }
  app.post('/console/plans', (c) => savePlan(c, null))
  app.put('/console/plans/:id', (c) => {
    if (!isId(c.req.param('id'))) throw fail(404, 'notFound')
    return savePlan(c, c.req.param('id'))
  })

  // A store's own plan: its limits, tools, price and billing note, until a date (blank: no end). Ending it puts the
  // store back on the default plan.
  app.put('/console/stores/:id/custom-plan', async (c) => {
    const b = await body(c)
    if (!isId(c.req.param('id'))) throw fail(404, 'notFound')
    const until = b.until === null || b.until === undefined || b.until === '' ? null : text(b.until, 10)
    if (until !== null && !/^\d{4}-\d{2}-\d{2}$/.test(until)) throw fail(400, 'invalidRequest')
    const details = readLimits(b)
    await run((t) => t.execute(sql`select console_save_custom_plan(${admin(c)}::uuid, ${c.req.param('id')}::uuid, ${JSON.stringify(details)}::jsonb, ${until}::date, ${reason(b)})`))
    return c.json({ ok: true })
  })
  app.delete('/console/stores/:id/custom-plan', async (c) => {
    const b = await body(c)
    if (!isId(c.req.param('id'))) throw fail(404, 'notFound')
    await run((t) => t.execute(sql`select console_end_custom_plan(${admin(c)}::uuid, ${c.req.param('id')}::uuid, ${reason(b)})`))
    return c.json({ ok: true })
  })

  // How sellers pay: shown on every store's Billing page.
  app.get('/console/settings', async (c) => c.json((await run((t) => one<{ s: unknown }>(t, sql`select console_settings(${admin(c)}::uuid) as s`)))!.s))
  app.put('/console/settings', async (c) => {
    const b = await body(c)
    const details = { whatsapp: text(b.whatsapp, 30), bkash: text(b.bkash, 30), nagad: text(b.nagad, 30), bank: text(b.bank, 500), note: text(b.note, 1000) }
    await run((t) => t.execute(sql`select console_save_settings(${admin(c)}::uuid, ${JSON.stringify(details)}::jsonb, ${text(b.reason, 500)})`))
    return c.json({ ok: true })
  })

  app.get('/console/audit', async (c) => {
    const { offset } = page(c)
    const rows = (await run((t) => t.execute<Record<string, unknown> & { total: string }>(sql`select * from console_audit_log(${admin(c)}::uuid, 50, ${offset})`))).rows
    return c.json({ total: Number(rows[0]?.total ?? 0), items: rows.map(({ total, ...r }) => r) })
  })
}
