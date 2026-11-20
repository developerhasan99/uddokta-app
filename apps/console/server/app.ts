import { sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { csrf } from 'hono/csrf'
import { HTTPException } from 'hono/http-exception'
import { serveStatic } from '@hono/node-server/serve-static'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { databaseCode, fail, hash, newToken } from '../../api/src/http.ts'
import { one, tx } from '../../api/src/db.ts'
import { dummyHash, verifyPassword } from '../../api/src/password.ts'
import { registerConsole } from './routes.ts'
import { liveMediaUrl, readLocalFile } from '../../api/src/storage.ts'

// The platform console: its own Railway service and address, separate from the seller dashboard. It shares the
// database and its functions, never the dashboard's sessions: its cookie has its own name, and a console sign-in lasts
// 12 hours (console_session) and admits platform administrators only.

export type Env = { Variables: { userId: string } }
export const consoleCookie = 'console_sid'
const sessionHours = 12
const maxLoginFailures = 10

export const api = new Hono<Env>().basePath('/api')

api.use(csrf({
  origin: (origin, c) => {
    const host = c.req.header('x-forwarded-host') ?? c.req.header('host')
    return URL.canParse(origin) && new URL(origin).host === host
  },
}))

api.onError((err) => {
  if (err instanceof HTTPException) return err.getResponse()
  const code = databaseCode(err)
  if (code === 'UD001') return Response.json({ error: 'lastOwner' }, { status: 409 })
  if (code === 'UD100') return Response.json({ error: 'notFound' }, { status: 404 })
  if (code === 'UD101') return Response.json({ error: 'cannotSuspendSelf' }, { status: 409 })
  if (code === 'UD102') return Response.json({ error: 'planDefaultRequired' }, { status: 409 })
  if (code === 'UD103') return Response.json({ error: 'planHasStores' }, { status: 409 })
  if (code === 'UD104') return Response.json({ error: 'planHasPayments' }, { status: 409 })
  if (code === 'UD105') return Response.json({ error: 'userNotFound' }, { status: 404 })
  if (code === 'UD106') return Response.json({ error: 'alreadyMember' }, { status: 409 })
  if (code === '42501') return Response.json({ error: 'forbidden' }, { status: 403 })
  console.error(err)
  return Response.json({ error: 'server' }, { status: 500 })
})

// Same password checks and lockout as the dashboard, but the session is kept only for a platform administrator.
api.post('/auth/login', async (c) => {
  const body = await c.req.json().catch(() => null) as Record<string, unknown> | null
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  const password = typeof body?.password === 'string' ? body.password : ''
  const found = await tx(null, async (t) => {
    const attempts = await one<{ count: number }>(t, sql`select recent_login_failures(${email}) as count`)
    if ((attempts?.count ?? 0) >= maxLoginFailures) throw fail(429, 'tooManyAttempts')
    return one<{ user_id: string; password_hash: string }>(t, sql`select * from login_lookup(${email})`)
  })
  const valid = await verifyPassword(password, found?.password_hash ?? dummyHash)
  // A seller's right password gets the same answer as a wrong one, and counts towards the lockout: the console never
  // confirms a password or that an account exists, and only platform administrators get past this point.
  const refuse = async () => {
    await tx(null, (t) => t.execute(sql`select record_login_failure(${email})`))
    return fail(401, 'invalidCredentials')
  }
  if (!found || !valid) throw await refuse()
  // Not an active administrator: no session is ever made (console_check raises for anyone else).
  const admin = await tx(null, (t) => t.execute(sql`select console_check(${found.user_id}::uuid)`)).then(() => true, () => false)
  if (!admin) throw await refuse()
  const token = newToken()
  const expires = new Date(Date.now() + sessionHours * 3_600_000)
  await tx(null, (t) => t.execute(sql`select create_session(${hash(token)}, ${found.user_id}::uuid, ${expires.toISOString()}::timestamptz)`))
  await tx(null, (t) => t.execute(sql`select clear_login_failures(${email})`))
  setCookie(c, consoleCookie, token, { httpOnly: true, sameSite: 'Strict', secure: process.env.NODE_ENV === 'production', path: '/', expires })
  return c.json({ ok: true })
})

api.post('/auth/logout', async (c) => {
  const token = getCookie(c, consoleCookie)
  if (token) await tx(null, (t) => t.execute(sql`select delete_session(${hash(token)})`))
  deleteCookie(c, consoleCookie, { path: '/' })
  return c.json({ ok: true })
})

// Development stand-in for the public R2 bucket (demo thumbnails and images), as on the seller API.
api.get('/media-files/:store/:file', async (c) => {
  const key = `${c.req.param('store')}/${c.req.param('file')}`
  const data = await readLocalFile(key)
  if (!data) { const live = liveMediaUrl(key); return live ? c.redirect(live, 302) : c.json({ error: 'notFound' }, 404) }
  return c.body(new Uint8Array(data), 200, { 'content-type': 'image/webp', 'x-content-type-options': 'nosniff' })
})
registerConsole(api)
api.all('*', (c) => c.json({ error: 'notFound' }, 404))

const root = fileURLToPath(new URL('../dist/', import.meta.url))
export function createConsole(options: { production?: boolean } = {}) {
  const app = new Hono<Env>()
  app.get('/_health', async (c) => {
    c.header('Cache-Control', 'no-store')
    try { await tx(null, (t) => t.execute(sql`select 1`)); return c.json({ status: 'ok' }) }
    catch { return c.json({ status: 'unavailable' }, 503) }
  })
  // Nothing of the console is ever framed or indexed.
  app.use('*', async (c, next) => {
    await next()
    c.header('X-Frame-Options', 'DENY')
    c.header('X-Robots-Tag', 'noindex, nofollow')
    c.header('Referrer-Policy', 'no-referrer')
  })
  app.route('/', api)
  if (options.production) {
    app.use('/assets/*', async (c, next) => { await next(); if (c.res.status === 200) c.header('Cache-Control', 'public, max-age=31536000, immutable') })
    app.use('*', serveStatic({ root }))
    // Any other path is a screen of the single-page app.
    const page = readFileSync(`${root}index.html`, 'utf8')
    app.get('*', (c) => {
      if (c.req.path.includes('.')) return c.notFound()
      c.header('Cache-Control', 'no-cache')
      return c.html(page)
    })
  }
  return app
}
