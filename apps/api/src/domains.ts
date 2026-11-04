import { promises as dns } from 'node:dns'
import { and, eq } from 'drizzle-orm'
import type { Hono } from 'hono'
import { tx } from './db.ts'
import { stores } from './schema.ts'
import { databaseCode, fail, storeByHandle, type Env } from './app.ts'

// Sellers point their domain at the domains proxy (deploy/proxy) with two A records, both to this address.
const proxyIp = () => process.env.DOMAINS_IP?.trim() || null
const ours = ['uddokta.live', 'uddokta.studio', 'localhost']

// What a seller types, cut down to a bare hostname: "https://www.Rina.com/shop" → "rina.com". Bangla domains become punycode.
export function readDomain(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return null
  let host: string
  try { host = new URL(`http://${value.trim().replace(/^[a-z]+:\/\//i, '')}`).hostname } catch { return null }
  host = host.replace(/\.$/, '').replace(/^www\./, '')
  if (host.length > 253 || !/^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z0-9-]{2,63}$/.test(host)) return null
  if (ours.some((d) => host === d || host.endsWith(`.${d}`))) return null
  return host
}

// Where a name points: here, nowhere, or somewhere else (an old host still listed beside ours splits traffic, so it counts as wrong).
async function pointsHere(host: string, ip: string) {
  const found = await dns.resolve4(host).catch(() => [] as string[])
  return found.length === 0 ? 'missing' : found.every((a) => a === ip) ? 'ok' : 'wrong'
}

async function reachable(host: string) {
  const res = await fetch(`https://${host}/_health`, { redirect: 'manual', signal: AbortSignal.timeout(10_000) }).catch(() => null)
  return res?.status === 200
}

const shown = { domain: stores.domain, liveAt: stores.domainLiveAt }

export function registerDomains(app: Hono<Env>) {
  app.get('/stores/:handle/domain', async (c) => {
    return tx(c.get('userId'), async (t) => {
      const store = await storeByHandle(t, c.req.param('handle'))
      return c.json({ domain: store.domain, liveAt: store.domainLiveAt, ip: proxyIp() })
    })
  })

  // Setting or replacing the domain starts it over as not live. Owners and admins only, by the stores update policy.
  app.put('/stores/:handle/domain', async (c) => {
    const domain = readDomain((await c.req.json().catch(() => null))?.domain)
    if (!domain) throw fail(400, 'domainInvalid')
    return tx(c.get('userId'), async (t) => {
      const store = await storeByHandle(t, c.req.param('handle'))
      const [row] = await t.update(stores).set({ domain, domainLiveAt: null }).where(eq(stores.id, store.id)).returning(shown)
      if (!row) throw fail(403, 'forbidden')
      return c.json({ ...row, ip: proxyIp() })
    }).catch((err) => { throw databaseCode(err) === '23505' ? fail(409, 'domainTaken') : err })
  })

  app.delete('/stores/:handle/domain', async (c) => {
    return tx(c.get('userId'), async (t) => {
      const store = await storeByHandle(t, c.req.param('handle'))
      const [row] = await t.update(stores).set({ domain: null, domainLiveAt: null }).where(eq(stores.id, store.id)).returning(shown)
      if (!row) throw fail(403, 'forbidden')
      return c.json({ ...row, ip: proxyIp() })
    })
  })

  // Looks the domain up from outside and records whether it is live; a broken domain stops being live, so buyers are not sent to it.
  // ponytail: runs when the seller opens or refreshes the page; add a pg-boss job if domains break without anyone looking.
  app.post('/stores/:handle/domain/check', async (c) => {
    const ip = proxyIp()
    if (!ip) throw fail(503, 'domainsUnavailable')
    const handle = c.req.param('handle')
    const { domain } = await tx(c.get('userId'), (t) => storeByHandle(t, handle))
    if (!domain) throw fail(404, 'notFound')
    const [root, www] = await Promise.all([pointsHere(domain, ip), pointsHere(`www.${domain}`, ip)])
    const https = root === 'ok' && www === 'ok' && await reachable(domain)
    return tx(c.get('userId'), async (t) => {
      const store = await storeByHandle(t, handle)
      // Only for the domain that was looked at, in case it changed meanwhile. No row: staff, or a changed domain.
      const [row] = await t.update(stores).set({ domainLiveAt: https ? new Date() : null })
        .where(and(eq(stores.id, store.id), eq(stores.domain, domain))).returning(shown)
      if (!row) throw fail(403, 'forbidden')
      return c.json({ ...row, ip, records: { root, www }, https })
    })
  })
}
