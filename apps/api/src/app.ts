import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { and, asc, eq, sql } from 'drizzle-orm'
import { Hono, type Context } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { csrf } from 'hono/csrf'
import { HTTPException } from 'hono/http-exception'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { one, tx, type Tx } from './db.ts'
import { dummyHash, hashPassword, verifyPassword } from './password.ts'
import { registerCollections } from './collections.ts'
import { registerMedia } from './media.ts'
import { registerProducts } from './products.ts'
import { readLocalFile } from './storage.ts'
import { roles, storeInvites, storeMembers, stores, users, type Role } from './schema.ts'

const sessionDays = 30
const inviteDays = 7
const maxLoginFailures = 10
const cookieName = 'sid'

const hash = (token: string) => createHash('sha256').update(token).digest('hex')
const newToken = () => randomBytes(32).toString('base64url')
const daysFromNow = (days: number) => new Date(Date.now() + days * 86_400_000)

export const fail = (status: ContentfulStatusCode, error: string) =>
  new HTTPException(status, { res: Response.json({ error }, { status }) })

export function databaseCode(err: unknown) {
  const e = err as { code?: string; cause?: { code?: string } }
  return e.cause?.code ?? e.code
}

const databaseConstraint = (err: unknown) => {
  const e = err as { constraint?: string; cause?: { constraint?: string } }
  return e.cause?.constraint ?? e.constraint
}

export type Env = { Variables: { userId: string } }

function text(body: Record<string, unknown>, key: string) {
  const value = body[key]
  return typeof value === 'string' ? value.trim() : ''
}

async function readBody(c: Context) {
  const body = await c.req.json().catch(() => null)
  if (!body || typeof body !== 'object') throw fail(400, 'invalidRequest')
  return body as Record<string, unknown>
}

function readRole(body: Record<string, unknown>): Role {
  const role = body.role
  if (!roles.includes(role as Role)) throw fail(400, 'invalidRequest')
  return role as Role
}

async function startSession(c: Context, userId: string) {
  const token = newToken()
  const expires = daysFromNow(sessionDays)
  await tx(null, (t) => t.execute(sql`select create_session(${hash(token)}, ${userId}::uuid, ${expires.toISOString()}::timestamptz)`))
  setCookie(c, cookieName, token, {
    httpOnly: true,
    sameSite: 'Lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires,
  })
}

// The store the current user can see, or 404: other stores are indistinguishable from missing ones.
export async function storeByHandle(t: Tx, handle: string) {
  const [store] = await t.select().from(stores).where(eq(stores.handle, handle))
  if (!store) throw fail(404, 'notFound')
  return store
}

export const app = new Hono<Env>().basePath('/api')

// Compares hosts, not full origins: behind Railway's proxy the app sees http while browsers send https.
app.use(csrf({
  origin: (origin, c) => {
    const host = c.req.header('x-forwarded-host') ?? c.req.header('host')
    return URL.canParse(origin) && new URL(origin).host === host
  },
}))

app.onError((err) => {
  if (err instanceof HTTPException) return err.getResponse()
  const code = databaseCode(err)
  if (code === 'UD001') return Response.json({ error: 'lastOwner' }, { status: 409 })
  if (databaseConstraint(err) === 'product_media_media_fk' || databaseConstraint(err) === 'collections_media_fk') return Response.json({ error: 'mediaInUse' }, { status: 409 })
  if (code === '42501') return Response.json({ error: 'forbidden' }, { status: 403 })
  console.error(err)
  return Response.json({ error: 'server' }, { status: 500 })
})

app.post('/auth/signup', async (c) => {
  const body = await readBody(c)
  const name = text(body, 'name')
  const email = text(body, 'email').toLowerCase()
  const password = typeof body.password === 'string' ? body.password : ''
  if (!name) throw fail(400, 'nameRequired')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw fail(400, 'emailInvalid')
  if (password.length < 8) throw fail(400, 'weakPassword')

  const id = randomUUID()
  const passwordHash = await hashPassword(password)
  try {
    await tx(null, (t) => t.execute(sql`select register_user(${id}::uuid, ${email}, ${name}, ${passwordHash})`))
  } catch (err) {
    if (databaseCode(err) === '23505') throw fail(409, 'emailTaken')
    throw err
  }
  await startSession(c, id)
  return c.json({ ok: true }, 201)
})

app.post('/auth/login', async (c) => {
  const body = await readBody(c)
  const email = text(body, 'email').toLowerCase()
  const password = typeof body.password === 'string' ? body.password : ''

  const found = await tx(null, async (t) => {
    const attempts = await one<{ count: number }>(t, sql`select recent_login_failures(${email}) as count`)
    if ((attempts?.count ?? 0) >= maxLoginFailures) throw fail(429, 'tooManyAttempts')
    return one<{ user_id: string; password_hash: string }>(t, sql`select * from login_lookup(${email})`)
  })

  const valid = await verifyPassword(password, found?.password_hash ?? dummyHash)
  if (!found || !valid) {
    await tx(null, (t) => t.execute(sql`select record_login_failure(${email})`))
    throw fail(401, 'invalidCredentials')
  }
  await tx(null, (t) => t.execute(sql`select clear_login_failures(${email})`))
  await startSession(c, found.user_id)
  return c.json({ ok: true })
})

app.post('/auth/logout', async (c) => {
  const token = getCookie(c, cookieName)
  if (token) await tx(null, (t) => t.execute(sql`select delete_session(${hash(token)})`))
  deleteCookie(c, cookieName, { path: '/' })
  return c.json({ ok: true })
})

// Open: the person following an invite link may not have an account yet.
app.get('/invites/:token', async (c) => {
  const invite = await tx(null, (t) =>
    one<{ store_name: string; role: Role }>(t, sql`select * from invite_preview(${hash(c.req.param('token'))})`))
  if (!invite) throw fail(404, 'inviteInvalid')
  return c.json({ storeName: invite.store_name, role: invite.role })
})

// Development stand-in for the public R2 bucket. Keys are unguessable, as they are in production.
app.get('/media-files/:store/:file', async (c) => {
  const data = await readLocalFile(`${c.req.param('store')}/${c.req.param('file')}`)
  if (!data) throw fail(404, 'notFound')
  return c.body(new Uint8Array(data), 200, { 'content-type': 'image/webp', 'x-content-type-options': 'nosniff', 'cache-control': 'public, max-age=31536000, immutable' })
})

// Everything below needs a signed-in user.
app.use('*', async (c, next) => {
  const token = getCookie(c, cookieName)
  const session = token
    ? await tx(null, (t) => one<{ id: string | null }>(t, sql`select session_owner(${hash(token)}) as id`))
    : undefined
  if (!session?.id) throw fail(401, 'signedOut')
  c.set('userId', session.id)
  await next()
})

app.get('/me', async (c) => {
  const userId = c.get('userId')
  return tx(userId, async (t) => {
    const [user] = await t.select({ id: users.id, name: users.name, email: users.email }).from(users).where(eq(users.id, userId))
    const myStores = await t
      .select({ id: stores.id, handle: stores.handle, name: stores.name, role: storeMembers.role })
      .from(storeMembers)
      .innerJoin(stores, eq(stores.id, storeMembers.storeId))
      .where(eq(storeMembers.userId, userId))
      .orderBy(asc(storeMembers.createdAt))
    return c.json({ user, stores: myStores })
  })
})

app.post('/stores', async (c) => {
  const body = await readBody(c)
  const name = text(body, 'name')
  const handle = text(body, 'handle').toLowerCase()
  if (!name) throw fail(400, 'nameRequired')
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(handle)) throw fail(400, 'handleInvalid')

  const id = randomUUID()
  const userId = c.get('userId')
  try {
    await tx(userId, async (t) => {
      await t.insert(stores).values({ id, handle, name })
      await t.insert(storeMembers).values({ storeId: id, userId, role: 'owner' })
    })
  } catch (err) {
    if (databaseCode(err) === '23505') throw fail(409, 'handleTaken')
    throw err
  }
  return c.json({ id, handle, name, role: 'owner' }, 201)
})

app.get('/stores/:handle/members', async (c) => {
  return tx(c.get('userId'), async (t) => {
    const store = await storeByHandle(t, c.req.param('handle'))
    const members = await t
      .select({ id: users.id, name: users.name, email: users.email, role: storeMembers.role })
      .from(storeMembers)
      .innerJoin(users, eq(users.id, storeMembers.userId))
      .where(eq(storeMembers.storeId, store.id))
      .orderBy(asc(storeMembers.createdAt))
    const invites = await t
      .select({ id: storeInvites.id, role: storeInvites.role, expiresAt: storeInvites.expiresAt })
      .from(storeInvites)
      .where(and(eq(storeInvites.storeId, store.id), sql`${storeInvites.expiresAt} > now()`))
      .orderBy(asc(storeInvites.createdAt))
    return c.json({ members, invites })
  })
})

app.patch('/stores/:handle/members/:userId', async (c) => {
  const role = readRole(await readBody(c))
  return tx(c.get('userId'), async (t) => {
    const store = await storeByHandle(t, c.req.param('handle'))
    const changed = await t
      .update(storeMembers)
      .set({ role })
      .where(and(eq(storeMembers.storeId, store.id), eq(storeMembers.userId, c.req.param('userId'))))
      .returning({ userId: storeMembers.userId })
    if (changed.length === 0) throw fail(403, 'forbidden')
    return c.json({ ok: true })
  })
})

app.delete('/stores/:handle/members/:userId', async (c) => {
  return tx(c.get('userId'), async (t) => {
    const store = await storeByHandle(t, c.req.param('handle'))
    const removed = await t
      .delete(storeMembers)
      .where(and(eq(storeMembers.storeId, store.id), eq(storeMembers.userId, c.req.param('userId'))))
      .returning({ userId: storeMembers.userId })
    if (removed.length === 0) throw fail(403, 'forbidden')
    return c.json({ ok: true })
  })
})

app.post('/stores/:handle/invites', async (c) => {
  const role = readRole(await readBody(c))
  const token = newToken()
  return tx(c.get('userId'), async (t) => {
    const store = await storeByHandle(t, c.req.param('handle'))
    const [invite] = await t
      .insert(storeInvites)
      .values({ storeId: store.id, tokenHash: hash(token), role, expiresAt: daysFromNow(inviteDays) })
      .returning({ id: storeInvites.id, role: storeInvites.role, expiresAt: storeInvites.expiresAt })
    return c.json({ ...invite, token }, 201)
  })
})

app.delete('/stores/:handle/invites/:id', async (c) => {
  return tx(c.get('userId'), async (t) => {
    const store = await storeByHandle(t, c.req.param('handle'))
    const removed = await t
      .delete(storeInvites)
      .where(and(eq(storeInvites.storeId, store.id), eq(storeInvites.id, c.req.param('id'))))
      .returning({ id: storeInvites.id })
    if (removed.length === 0) throw fail(403, 'forbidden')
    return c.json({ ok: true })
  })
})

app.post('/invites/:token/accept', async (c) => {
  const row = await tx(c.get('userId'), (t) =>
    one<{ handle: string | null }>(t, sql`select accept_invite(${hash(c.req.param('token'))}) as handle`))
  if (!row?.handle) throw fail(404, 'inviteInvalid')
  return c.json({ handle: row.handle })
})

registerMedia(app)
registerProducts(app)
registerCollections(app)
