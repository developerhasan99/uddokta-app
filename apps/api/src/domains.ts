import { promises as dns } from 'node:dns'
import { and, eq, sql } from 'drizzle-orm'
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

// The TXT record proves the seller controls the domain's DNS. Without it, anyone could claim a domain still pointed here
// by a store that removed it, and be served on it with a certificate.
const txtName = '_uddokta'
const txtValue = (storeId: string) => `uddokta=${storeId}`

const readTxt = async (domain: string) => (await dns.resolveTxt(`${txtName}.${domain}`).catch(() => [] as string[][])).map((chunks) => chunks.join(''))
const proves = (found: string[], storeId: string) => (found.length === 0 ? 'missing' : found.includes(txtValue(storeId)) ? 'ok' : 'wrong')

async function reachable(host: string) {
  const res = await fetch(`https://${host}/_health`, { redirect: 'manual', signal: AbortSignal.timeout(10_000) }).catch(() => null)
  return res?.status === 200
}

const shown = { id: stores.id, domain: stores.domain, verifiedAt: stores.domainVerifiedAt, liveAt: stores.domainLiveAt, primary: stores.domainPrimary }
const view = ({ id, ...row }: { id: string; domain: string | null; verifiedAt: Date | null; liveAt: Date | null; primary: boolean }) =>
  ({ ...row, ip: proxyIp(), txt: { name: txtName, value: txtValue(id) } })

export function registerDomains(app: Hono<Env>) {
  app.get('/stores/:handle/domain', async (c) => {
    return tx(c.get('userId'), async (t) => {
      const s = await storeByHandle(t, c.req.param('handle'))
      return c.json(view({ id: s.id, domain: s.domain, verifiedAt: s.domainVerifiedAt, liveAt: s.domainLiveAt, primary: s.domainPrimary }))
    })
  })

  // Setting or replacing the domain starts it over as unverified and not live. Claims are free even for a domain another store holds:
  // the check decides, by TXT record. Owners and admins only, by the stores update policy.
  app.put('/stores/:handle/domain', async (c) => {
    const domain = readDomain((await c.req.json().catch(() => null))?.domain)
    if (!domain) throw fail(400, 'domainInvalid')
    return tx(c.get('userId'), async (t) => {
      const store = await storeByHandle(t, c.req.param('handle'))
      const [row] = await t.update(stores).set({ domain, domainVerifiedAt: null, domainLiveAt: null, domainPrimary: true }).where(eq(stores.id, store.id)).returning(shown)
      if (!row) throw fail(403, 'forbidden')
      return c.json(view(row))
    })
  })

  // Main address: the own domain (uddokta.live redirects there) or the uddokta.live address (both serve the store, no redirect).
  app.patch('/stores/:handle/domain', async (c) => {
    const primary = (await c.req.json().catch(() => null))?.primary
    if (typeof primary !== 'boolean') throw fail(400, 'invalidRequest')
    return tx(c.get('userId'), async (t) => {
      const store = await storeByHandle(t, c.req.param('handle'))
      if (!store.domain) throw fail(404, 'notFound')
      const [row] = await t.update(stores).set({ domainPrimary: primary }).where(eq(stores.id, store.id)).returning(shown)
      if (!row) throw fail(403, 'forbidden')
      return c.json(view(row))
    })
  })

  app.delete('/stores/:handle/domain', async (c) => {
    return tx(c.get('userId'), async (t) => {
      const store = await storeByHandle(t, c.req.param('handle'))
      const [row] = await t.update(stores).set({ domain: null, domainVerifiedAt: null, domainLiveAt: null, domainPrimary: true }).where(eq(stores.id, store.id)).returning(shown)
      if (!row) throw fail(403, 'forbidden')
      return c.json(view(row))
    })
  })

  // Looks the domain up from outside and records whether it is verified and live; a broken domain stops being live, so buyers are not sent to it,
  // and a removed TXT record gives the domain up, so its real owner can connect it elsewhere.
  // ponytail: runs when the seller opens or refreshes the page; add a pg-boss job if domains break without anyone looking.
  app.post('/stores/:handle/domain/check', async (c) => {
    const ip = proxyIp()
    if (!ip) throw fail(503, 'domainsUnavailable')
    const handle = c.req.param('handle')
    const before = await tx(c.get('userId'), (t) => storeByHandle(t, handle))
    const domain = before.domain
    if (!domain) throw fail(404, 'notFound')
    const [found, root, www] = await Promise.all([readTxt(domain), pointsHere(domain, ip), pointsHere(`www.${domain}`, ip)])
    const txt = proves(found, before.id)
    // The certificate is only issued once verified, so the first passing check usually finds https still being set up.
    const https = txt === 'ok' && before.domainVerifiedAt !== null && root === 'ok' && www === 'ok' && await reachable(domain)
    return tx(c.get('userId'), async (t) => {
      const store = await storeByHandle(t, handle)
      // Still taken after this means the other store's TXT record is in DNS too: the seller deletes the old one.
      if (txt === 'ok') await t.execute(sql`select release_stale_domain(${domain}, ${sql.param(found)}::text[])`)
      // Only for the domain that was looked at, in case it changed meanwhile. No row: staff, or a changed domain.
      const [row] = await t.update(stores).set({ domainVerifiedAt: txt === 'ok' ? (store.domainVerifiedAt ?? new Date()) : null, domainLiveAt: https ? new Date() : null })
        .where(and(eq(stores.id, store.id), eq(stores.domain, domain))).returning(shown)
      if (!row) throw fail(403, 'forbidden')
      return c.json({ ...view(row), records: { txt, root, www }, https })
    }).catch((err) => { throw databaseCode(err) === '23505' ? fail(409, 'domainTaken') : err })
  })
}
