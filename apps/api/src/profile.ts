import { sql } from 'drizzle-orm'
import type { Context, Hono } from 'hono'
import { deleteCookie, getCookie } from 'hono/cookie'
import { cookieName, databaseCode, fail, hash, newToken, type Env } from './app.ts'
import { one, tx } from './db.ts'
import { appUrl, emailChangedNotice, emailChangeEmail, emailReady, readLang, sendEmail } from './email.ts'
import { hashPassword, verifyPassword } from './password.ts'

// The signed-in user's own account: name, language, password, devices, email and deletion. Every change goes through
// a definer function with the session's user; the ones that matter ask for the current password again.

const maxWrongPasswords = 10
const emailChangeHours = 24
const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)

async function body(c: Context) {
  const value = await c.req.json().catch(() => null)
  if (!value || typeof value !== 'object') throw fail(400, 'invalidRequest')
  return value as Record<string, unknown>
}

// Checks the current password, counting wrong ones like log in does (10 in 15 minutes locks for a while).
async function confirmPassword(userId: string, password: unknown) {
  const { email, stored, failures } = await tx(userId, async (t) => {
    const [row] = (await t.execute<{ email: string }>(sql`select email from users where id = ${userId}::uuid`)).rows
    const failed = await one<{ n: number }>(t, sql`select recent_login_failures(${row.email}) as n`)
    const credential = await one<{ hash: string }>(t, sql`select account_password_hash(${userId}::uuid) as hash`)
    return { email: row.email, stored: credential!.hash, failures: failed?.n ?? 0 }
  })
  if (failures >= maxWrongPasswords) throw fail(429, 'tooManyAttempts')
  if (typeof password !== 'string' || !(await verifyPassword(password, stored))) {
    await tx(null, (t) => t.execute(sql`select record_login_failure(${email})`))
    throw fail(401, 'wrongPassword')
  }
}

const session = (c: Context) => hash(getCookie(c, cookieName) ?? '')

export function registerProfile(app: Hono<Env>) {
  app.get('/me/sessions', async (c) => {
    const row = await tx(null, (t) => one<{ n: number }>(t, sql`select account_session_count(${c.get('userId')}::uuid) as n`))
    return c.json({ count: row?.n ?? 1 })
  })

  // Name and/or language; a field left out keeps its value.
  app.put('/me', async (c) => {
    const b = await body(c)
    const name = b.name === undefined ? null : typeof b.name === 'string' ? b.name.trim() : ''
    if (name !== null && (!name || name.length > 80)) throw fail(400, 'nameRequired')
    const language = b.language === undefined ? null : readLang(b.language)
    await tx(null, (t) => t.execute(sql`select update_profile(${c.get('userId')}::uuid, ${name}, ${language})`))
    return c.json({ ok: true })
  })

  app.put('/me/password', async (c) => {
    const b = await body(c)
    const password = typeof b.password === 'string' ? b.password : ''
    if (password.length < 8) throw fail(400, 'weakPassword')
    await confirmPassword(c.get('userId'), b.current)
    const newHash = await hashPassword(password)
    await tx(null, (t) => t.execute(sql`select change_password(${c.get('userId')}::uuid, ${newHash}, ${session(c)})`))
    return c.json({ ok: true })
  })

  app.post('/me/sessions/end-others', async (c) => {
    await tx(null, (t) => t.execute(sql`select end_other_sessions(${c.get('userId')}::uuid, ${session(c)})`))
    return c.json({ ok: true })
  })

  // Sends a link to the new address; nothing changes until it is used (POST /auth/email-change).
  app.post('/me/email', async (c) => {
    const b = await body(c)
    const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : ''
    if (!isEmail(email)) throw fail(400, 'emailInvalid')
    const base = appUrl()
    if (!emailReady() || !base) throw fail(503, 'emailUnavailable')
    await confirmPassword(c.get('userId'), b.password)
    const userId = c.get('userId')
    const token = newToken()
    const { result, name, language } = await tx(userId, async (t) => {
      const [me] = (await t.execute<{ name: string; language: string; email: string }>(sql`select name, language, email from users where id = ${userId}::uuid`)).rows
      if (me.email === email) return { result: 'sameEmail', name: me.name, language: me.language }
      const started = await one<{ r: string }>(t, sql`select start_email_change(${userId}::uuid, ${email}, ${hash(token)}, ${`${emailChangeHours} hours`}::interval) as r`)
      return { result: started!.r, name: me.name, language: me.language }
    })
    if (result === 'sameEmail') throw fail(400, 'sameEmail')
    if (result === 'emailTaken') throw fail(409, 'emailTaken')
    if (result === 'tooManyEmails') throw fail(429, 'tooManyEmails')
    await sendEmail(email, 'email-change', emailChangeEmail(readLang(language), name, `${base}/change-email/${token}`))
    return c.json({ ok: true })
  })

  // Refused while the account is the only owner of a store; the answer names those stores.
  app.delete('/me', async (c) => {
    const b = await body(c)
    const userId = c.get('userId')
    await confirmPassword(userId, b.password)
    const blocking = await tx(userId, async (t) => (await t.execute<{ name: string }>(sql`
      select s.name from store_members m join stores s on s.id = m.store_id
      where m.user_id = ${userId}::uuid and m.role = 'owner'
        and not exists (select 1 from store_members o where o.store_id = m.store_id and o.role = 'owner' and o.user_id <> m.user_id)
      order by s.name`)).rows.map((r) => r.name))
    if (blocking.length) return c.json({ error: 'soleOwner', stores: blocking }, 409)
    await tx(null, (t) => t.execute(sql`select delete_account(${userId}::uuid)`)).catch((err) => {
      throw databaseCode(err) === 'UD001' ? fail(409, 'soleOwner') : err
    })
    deleteCookie(c, cookieName, { path: '/' })
    return c.body(null, 204)
  })
}

// Open: the link to the new address may be opened in a browser that is not signed in. The old address gets a notice.
export function registerEmailChange(app: Hono<Env>) {
  app.post('/auth/email-change', async (c) => {
    const b = await body(c)
    const token = typeof b.token === 'string' ? b.token : ''
    const done = token ? await tx(null, (t) => one<{ old_email: string; new_email: string; name: string; language: string }>(t, sql`select * from finish_email_change(${hash(token)})`)) : undefined
    if (!done) throw fail(400, 'linkInvalid')
    await sendEmail(done.old_email, 'email-changed', emailChangedNotice(readLang(done.language), done.name, done.new_email))
    return c.json({ ok: true, email: done.new_email })
  })
}
