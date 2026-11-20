import { randomInt } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { sql } from 'drizzle-orm'
import type { Hono } from 'hono'
import { readPhone } from 'storefront/schema'
import { one, tx, type Tx } from './db.ts'
import { databaseCode, fail, hash } from './http.ts'
import type { Lang } from './email.ts'
import type { Env } from './app.ts'

// Phone verification by SMS. Codes are sent at once, not queued: a code is only useful for a few minutes.
// With SMS_API_KEY set, messages go through Alpha SMS (sms.net.bd; optional SMS_SENDER_ID for an approved sender,
// SMS_API_URL points tests at a stand-in). Without it, development writes each SMS to .sms/ (tests: SMS_DIR) and
// production is not ready: sign-up still records the number, nothing is sent and nobody is asked for a code.

export const codeMinutes = 10

export const smsReady = (env = process.env) => Boolean(env.SMS_API_KEY) || env.NODE_ENV !== 'production'

const codeHash = (userId: string, code: string) => hash(`${userId}:${code}`)

const codeText = (lang: Lang, code: string) => (lang === 'bn'
  ? `উদ্যোক্তা কোড: ${code}। ${new Intl.NumberFormat('bn-BD').format(codeMinutes)} মিনিট কাজ করবে। কাউকে বলবেন না।`
  : `Uddokta code: ${code}. It works for ${codeMinutes} minutes. Do not share it.`)

export async function sendSms(to: string, text: string, env = process.env) {
  if (env.SMS_API_KEY) {
    const form = new URLSearchParams({ api_key: env.SMS_API_KEY, msg: text, to: `88${to}` })
    if (env.SMS_SENDER_ID) form.set('sender_id', env.SMS_SENDER_ID)
    const res = await fetch(env.SMS_API_URL ?? 'https://api.sms.net.bd/sendsms', { method: 'POST', body: form, signal: AbortSignal.timeout(15_000) })
    const answer = await res.json().catch(() => null) as { error?: number | string; msg?: string } | null
    // Alpha SMS answers {"error": 0, ...} when the message is accepted; any other code is a refusal (417: no balance).
    if (!res.ok || String(answer?.error) !== '0') throw new Error(`Alpha SMS ${res.status}: error ${answer?.error ?? '?'} ${answer?.msg ?? ''}`.trim())
    return
  }
  if (env.NODE_ENV === 'production') throw new Error('SMS provider not connected')
  const dir = env.SMS_DIR ?? new URL('../../../.sms', import.meta.url).pathname
  await mkdir(dir, { recursive: true })
  const file = `${dir}/${new Date().toISOString().replace(/[:.]/g, '-')}-${to}.txt`
  await writeFile(file, `To: ${to}\n\n${text}\n`)
  if (!env.SMS_DIR) console.log(`SMS to ${to}: ${text}`)
}

// Records the number and, within the limits in start_phone_verification, keeps a new code for it.
// Returns the code to send, or the reason none was made. Runs in the caller's transaction (sign-up uses its own).
export async function startPhone(t: Tx, userId: string, phone: string) {
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
  const row = await one<{ status: string }>(t, sql`select start_phone_verification(${userId}::uuid, ${phone}, ${codeHash(userId, code)}, ${`${codeMinutes} minutes`}::interval) as status`)
  return { status: row!.status as 'ok' | 'verified' | 'phoneTaken' | 'wait' | 'tooMany', code }
}

export const sendCode = (phone: string, code: string, lang: Lang) => sendSms(phone, codeText(lang, code))

const verifiedTaken = (err: unknown) => {
  throw databaseCode(err) === '23505' ? fail(409, 'phoneTaken') : err
}

export function registerPhone(app: Hono<Env>) {
  // Sends a code to the given number (changing it while unverified), or again to the current one.
  app.post('/me/phone', async (c) => {
    if (!smsReady()) throw fail(503, 'smsUnavailable')
    const userId = c.get('userId')
    const body = await c.req.json().catch(() => ({}))
    const given = typeof body?.phone === 'string' ? readPhone(body.phone) : null
    if (body?.phone !== undefined && !given) throw fail(400, 'phoneInvalid')
    const { status, code, phone, lang } = await tx(userId, async (t) => {
      const user = await one<{ phone: string | null; language: Lang }>(t, sql`select phone, language from users where id = ${userId}::uuid`)
      const phone = given ?? user?.phone
      if (!phone) throw fail(400, 'phoneInvalid')
      return { ...(await startPhone(t, userId, phone)), phone, lang: user!.language }
    })
    if (status === 'verified') throw fail(409, 'phoneVerified')
    if (status === 'phoneTaken') throw fail(409, 'phoneTaken')
    if (status === 'wait') throw fail(429, 'codeWait')
    if (status === 'tooMany') throw fail(429, 'tooManyCodes')
    await sendCode(phone, code, lang).catch((err) => {
      console.error('SMS failed', err)
      throw fail(502, 'smsFailed')
    })
    return c.json({ phone })
  })

  app.post('/me/phone/verify', async (c) => {
    const userId = c.get('userId')
    const body = await c.req.json().catch(() => ({}))
    const code = typeof body?.code === 'string' ? body.code.replace(/[০-৯]/g, (d: string) => String('০১২৩৪৫৬৭৮৯'.indexOf(d))).replace(/\s/g, '') : ''
    if (!/^\d{6}$/.test(code)) throw fail(400, 'codeWrong')
    const row = await tx(userId, (t) => one<{ status: string }>(t, sql`select finish_phone_verification(${userId}::uuid, ${codeHash(userId, code)}) as status`)).catch(verifiedTaken)
    if (row!.status === 'wrong') throw fail(400, 'codeWrong')
    if (row!.status === 'expired') throw fail(400, 'codeExpired')
    if (row!.status === 'phoneTaken') throw fail(409, 'phoneTaken')
    return c.json({ ok: true })
  })
}
