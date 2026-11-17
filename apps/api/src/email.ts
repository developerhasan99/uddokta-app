import { createVerify } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { sql } from 'drizzle-orm'
import { AwsClient } from 'aws4fetch'
import type { Hono } from 'hono'
import { tx } from './db.ts'

// Account email (password reset, verification). Emails are queued in outbox_emails inside the request and sent by
// drainOutbox: through Amazon SES when AWS keys are set, otherwise written to .emails/ in development.

export type Lang = 'bn' | 'en'
export const readLang = (value: unknown): Lang => (value === 'en' ? 'en' : 'bn')

// Where links in emails point (the dashboard). Never taken from the request, so a forged Host cannot redirect a link.
export function appUrl(env = process.env) {
  if (env.APP_URL) return env.APP_URL.replace(/\/$/, '')
  return env.NODE_ENV === 'production' ? null : 'http://localhost:5173'
}

// Whether account email can reach anyone: links have somewhere to point, and SES keys are set (or this is development).
export const emailReady = (env = process.env) => Boolean(appUrl(env)) && (Boolean(env.AWS_ACCESS_KEY_ID) || env.NODE_ENV !== 'production')

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

type Message = { subject: string; text: string; html: string }

// One plain layout for every email: greeting, a line or two, one button, a closing line.
function layout(lang: Lang, o: { subject: string; name: string; lines: string[]; action: string; link: string; after: string }): Message {
  const hello = lang === 'bn' ? `প্রিয় ${o.name},` : `Hello ${o.name},`
  const brand = lang === 'bn' ? 'উদ্যোক্তা' : 'Uddokta'
  const text = [hello, '', ...o.lines, '', `${o.action}: ${o.link}`, '', o.after, '', `— ${brand}`].join('\n')
  const p = (s: string) => `<p style="margin:0 0 16px">${escape(s)}</p>`
  const html = `<!doctype html><html lang="${lang}"><body style="margin:0;background:#f4f4f2;font-family:'Hind Siliguri',Arial,sans-serif;color:#1a1a1a">
<div style="max-width:520px;margin:0 auto;padding:32px 20px">
<div style="background:#ffffff;border-radius:12px;padding:28px;font-size:15px;line-height:1.6">
<p style="margin:0 0 20px;font-weight:700;font-size:17px;color:#15803d">${brand}</p>
${p(hello)}${o.lines.map(p).join('')}
<p style="margin:24px 0"><a href="${escape(o.link)}" style="display:inline-block;background:#15803d;color:#ffffff;text-decoration:none;font-weight:600;padding:10px 22px;border-radius:999px">${escape(o.action)}</a></p>
<p style="margin:0 0 16px;font-size:13px;color:#666666">${escape(lang === 'bn' ? 'বোতাম কাজ না করলে এই লিংকটি ব্রাউজারে খুলুন:' : 'If the button does not work, open this link in your browser:')}<br><span style="word-break:break-all">${escape(o.link)}</span></p>
${p(o.after)}
</div></div></body></html>`
  return { subject: o.subject, text, html }
}

export const resetEmail = (lang: Lang, name: string, link: string) => layout(lang, lang === 'bn'
  ? { subject: 'উদ্যোক্তা: পাসওয়ার্ড বদলানোর লিংক', name, link, action: 'নতুন পাসওয়ার্ড দিন',
    lines: ['আপনার উদ্যোক্তা অ্যাকাউন্টের পাসওয়ার্ড বদলানোর অনুরোধ পেয়েছি। নিচের বোতামে চাপ দিয়ে নতুন পাসওয়ার্ড দিন। লিংকটি একবারই কাজ করবে, ৩০ মিনিট পর্যন্ত।'],
    after: 'আপনি অনুরোধ না করে থাকলে এই ইমেইলটি এড়িয়ে যান। আপনার পাসওয়ার্ড বদলাবে না।' }
  : { subject: 'Reset your Uddokta password', name, link, action: 'Reset password',
    lines: ['We received a request to reset the password for your Uddokta account. Click the button below to choose a new password. The link works once and expires in 30 minutes.'],
    after: 'If you did not ask for this, you can ignore this email; your password will not change.' })

export const verifyEmail = (lang: Lang, name: string, link: string) => layout(lang, lang === 'bn'
  ? { subject: 'উদ্যোক্তা: আপনার ইমেইল নিশ্চিত করুন', name, link, action: 'ইমেইল নিশ্চিত করুন',
    lines: ['উদ্যোক্তায় অ্যাকাউন্ট খোলার জন্য ধন্যবাদ। এই ইমেইল ঠিকানাটি আপনার কিনা নিশ্চিত করতে নিচের বোতামে চাপ দিন। লিংকটি ৭ দিন কাজ করবে।'],
    after: 'আপনি অ্যাকাউন্ট না খুলে থাকলে এই ইমেইলটি এড়িয়ে যান।' }
  : { subject: 'Confirm your email for Uddokta', name, link, action: 'Confirm email',
    lines: ['Thanks for creating an Uddokta account. Click the button below to confirm that this email address is yours. The link works for 7 days.'],
    after: 'If you did not create an account, you can ignore this email.' })

// Queues an email and starts sending at once (without waiting, so a request answers in the same time either way).
export async function sendEmail(to: string, kind: string, message: Message) {
  await tx(null, (t) => t.execute(sql`select queue_email(${to}, ${kind}, ${message.subject}, ${message.text}, ${message.html})`))
  kickOutbox()
}

type Claimed = { id: string; to_email: string; subject: string; text_body: string; html_body: string; attempts: number }
type Result = { sent: true } | { sent: false; error: string; final: boolean }

async function deliver(email: Claimed, env = process.env): Promise<Result> {
  if (env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY) {
    const region = env.AWS_REGION ?? 'ap-southeast-1'
    const ses = new AwsClient({ accessKeyId: env.AWS_ACCESS_KEY_ID, secretAccessKey: env.AWS_SECRET_ACCESS_KEY, service: 'ses', region })
    const data = (value: string) => ({ Data: value, Charset: 'UTF-8' })
    const response = await ses.fetch(`https://email.${region}.amazonaws.com/v2/email/outbound-emails`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        FromEmailAddress: env.EMAIL_FROM ?? 'Uddokta <no-reply@uddokta.co>',
        Destination: { ToAddresses: [email.to_email] },
        Content: { Simple: { Subject: data(email.subject), Body: { Text: data(email.text_body), Html: data(email.html_body) } } },
        ...(env.SES_CONFIGURATION_SET ? { ConfigurationSetName: env.SES_CONFIGURATION_SET } : {}),
      }),
    }).catch((err: Error) => err)
    if (response instanceof Error) return { sent: false, error: response.message, final: false }
    if (response.ok) return { sent: true }
    // Throttling and server errors are retried; anything else (bad address, account paused) will not get better.
    const retry = response.status === 429 || response.status >= 500
    return { sent: false, error: `SES ${response.status}: ${(await response.text()).slice(0, 300)}`, final: !retry }
  }
  if (env.NODE_ENV === 'production') return { sent: false, error: 'notConfigured', final: true }
  // Development: the email lands in a folder, and the console says where (links included, for testing).
  const dir = env.EMAIL_DIR ?? new URL('../../../.emails', import.meta.url).pathname
  await mkdir(dir, { recursive: true })
  const file = `${dir}/${new Date().toISOString().replace(/[:.]/g, '-')}-${email.id.slice(0, 8)}`
  await writeFile(`${file}.txt`, `To: ${email.to_email}\nSubject: ${email.subject}\n\n${email.text_body}\n`)
  await writeFile(`${file}.html`, email.html_body)
  if (!env.EMAIL_DIR) console.log(`Email to ${email.to_email}: "${email.subject}" → ${file}.html`)
  return { sent: true }
}

let draining: Promise<void> | null = null
// Sends every due email. One run at a time per process; other API instances skip claimed rows.
export function drainOutbox() {
  draining ??= (async () => {
    try {
      for (;;) {
        const batch = (await tx(null, (t) => t.execute<Claimed>(sql`select * from claim_emails(10)`))).rows
        if (!batch.length) return
        for (const email of batch) {
          const result = await deliver(email)
          if (!result.sent && result.error === 'notConfigured') console.warn('Email not sent: set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY')
          await tx(null, (t) => t.execute(sql`select finish_email(${email.id}::uuid, ${result.sent}, ${result.sent ? null : result.error}, ${!result.sent && result.final})`))
        }
      }
    } finally {
      draining = null
    }
  })()
  return draining
}
// ponytail: retries run on a one-minute timer in the API process (index.ts); move to a pg-boss worker when workers are deployed.
export function kickOutbox() {
  drainOutbox().catch((err) => console.error('Email outbox:', err))
}

// ---- Bounces and complaints from SES, through an SNS topic ----

// Signing certificates by URL. Tests put a public key here for a made-up URL.
export const snsCerts = new Map<string, string>()
const snsHost = /^https:\/\/sns\.[a-z0-9-]+\.amazonaws\.com\//

async function snsCert(url: string) {
  if (!snsCerts.has(url)) {
    if (!snsHost.test(url) || !url.endsWith('.pem')) throw new Error('certificate url')
    const response = await fetch(url)
    if (!response.ok) throw new Error('certificate fetch')
    snsCerts.set(url, await response.text())
  }
  return snsCerts.get(url)!
}

// The string SNS signs: the listed fields that are present, each as "Name\nvalue\n".
export function snsSigned(m: Record<string, string>) {
  const keys = m.Type === 'Notification'
    ? ['Message', 'MessageId', 'Subject', 'Timestamp', 'TopicArn', 'Type']
    : ['Message', 'MessageId', 'SubscribeURL', 'Timestamp', 'Token', 'TopicArn', 'Type']
  return keys.filter((k) => typeof m[k] === 'string').map((k) => `${k}\n${m[k]}\n`).join('')
}

async function snsValid(m: Record<string, string>) {
  const algorithm = m.SignatureVersion === '2' ? 'RSA-SHA256' : m.SignatureVersion === '1' ? 'RSA-SHA1' : null
  if (!algorithm || typeof m.Signature !== 'string' || typeof m.SigningCertURL !== 'string') return false
  const cert = await snsCert(m.SigningCertURL).catch(() => null)
  return cert !== null && createVerify(algorithm).update(snsSigned(m)).verify(cert, m.Signature, 'base64')
}

// Addresses to stop sending to, from an SES event (configuration-set events use eventType, identity notifications
// notificationType). Only permanent bounces count: a full mailbox may work tomorrow.
export function suppressedBy(event: any): { email: string; reason: 'bounce' | 'complaint' }[] {
  const type = event?.eventType ?? event?.notificationType
  if (type === 'Bounce' && event.bounce?.bounceType === 'Permanent') return (event.bounce.bouncedRecipients ?? []).map((r: any) => ({ email: String(r.emailAddress), reason: 'bounce' as const }))
  if (type === 'Complaint') return (event.complaint?.complainedRecipients ?? []).map((r: any) => ({ email: String(r.emailAddress), reason: 'complaint' as const }))
  return []
}

// Registered before the CSRF check: SNS posts as text/plain with no Origin. Only signed messages from the topic in
// SES_EVENTS_TOPIC_ARN are accepted.
export function registerEmailEvents(app: Hono<any>) {
  app.post('/ses/events', async (c) => {
    const topic = process.env.SES_EVENTS_TOPIC_ARN
    const m = await c.req.json().catch(() => null) as Record<string, string> | null
    if (!topic || !m || m.TopicArn !== topic || !(await snsValid(m))) return c.json({ error: 'forbidden' }, 403)
    if (m.Type === 'SubscriptionConfirmation') {
      if (!snsHost.test(m.SubscribeURL)) return c.json({ error: 'forbidden' }, 403)
      await fetch(m.SubscribeURL)
    } else if (m.Type === 'Notification') {
      let event: unknown = null
      try { event = JSON.parse(m.Message) } catch { /* not an SES event */ }
      for (const s of suppressedBy(event)) await tx(null, (t) => t.execute(sql`select suppress_email(${s.email}, ${s.reason})`))
    }
    return c.json({ ok: true })
  })
}
