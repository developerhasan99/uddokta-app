import { and, desc, eq, ilike, or, sql } from 'drizzle-orm'
import type { Hono } from 'hono'
import { cleanRichText } from 'storefront/rich'
import { fail, storeByHandle, type Env } from './app.ts'
import { tx, type Tx } from './db.ts'
import { chooseHandle, refuseTakenHandle } from './pages.ts'
import { draftFor } from './policy-drafts.ts'
import { isId, slugify } from './products.ts'
import { storePagePolicies, storePages } from './schema.ts'

type Policy = typeof storePagePolicies[number]
const isPolicy = (v: unknown): v is Policy => (storePagePolicies as readonly unknown[]).includes(v)
const maxBody = 100_000
const maxPages = 200
const str = (v: unknown, max: number) => (typeof v === 'string' && v.length <= max ? v.trim() : null)

function readPage(body: Record<string, unknown>) {
  const title = str(body.title, 200)
  const handle = str(body.handle ?? '', 200)
  const text = typeof body.body === 'string' && body.body.length <= maxBody ? cleanRichText(body.body) : null
  const seoTitle = str(body.seoTitle ?? '', 300)
  const seoDescription = str(body.seoDescription ?? '', 1000)
  const template = str(body.template ?? '', 60)
  const publishAt = body.publishAt === null || body.publishAt === undefined || body.publishAt === '' ? null : typeof body.publishAt === 'string' && !Number.isNaN(Date.parse(body.publishAt)) ? new Date(body.publishAt) : undefined
  if (!title) throw fail(400, 'nameRequired')
  if (handle === null || text === null || seoTitle === null || seoDescription === null || template === null || !/^[a-z0-9-]*$/.test(template)
    || publishAt === undefined || typeof (body.visible ?? true) !== 'boolean') throw fail(400, 'invalidRequest')
  return { title, handle: slugify(handle), body: text, seoTitle, seoDescription, template, publishAt, visible: (body.visible ?? true) as boolean }
}

const present = (r: typeof storePages.$inferSelect) => ({
  id: r.id, title: r.title, handle: r.handle, body: r.body, visible: r.visible, publishAt: r.publishAt, policy: r.policy, template: r.template,
  seoTitle: r.seoTitle, seoDescription: r.seoDescription, revision: r.revision, updatedAt: r.updatedAt,
})

// Adds a link to the page at the end of the footer menu (the built-in one every store has).
async function linkInFooter(t: Tx, storeId: string, pageId: string, title: string) {
  await t.execute(sql`update menus set items = items || ${JSON.stringify([{ id: `p${pageId.slice(0, 8)}`, title: title.slice(0, 60), link: { type: 'storePage', id: pageId }, children: [] }])}::jsonb,
    revision = revision + 1, updated_at = now() where store_id = ${storeId}::uuid and handle = 'footer' and jsonb_array_length(items) < 150`)
}

export function registerStorePages(app: Hono<Env>) {
  app.get('/stores/:handle/store-pages', async (c) => tx(c.get('userId'), async (t) => {
    const store = await storeByHandle(t, c.req.param('handle'))
    const q = (c.req.query('q') ?? '').trim().slice(0, 100)
    const like = `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`
    const rows = await t.select({ id: storePages.id, title: storePages.title, handle: storePages.handle, visible: storePages.visible, publishAt: storePages.publishAt, policy: storePages.policy, template: storePages.template, updatedAt: storePages.updatedAt })
      .from(storePages).where(and(eq(storePages.storeId, store.id), q ? or(ilike(storePages.title, like), ilike(storePages.handle, like)) : undefined)).orderBy(desc(storePages.updatedAt)).limit(maxPages)
    return c.json(rows)
  }))

  app.get('/stores/:handle/store-pages/:id', async (c) => {
    const id = c.req.param('id')
    if (!isId(id)) throw fail(404, 'notFound')
    return tx(c.get('userId'), async (t) => {
      const store = await storeByHandle(t, c.req.param('handle'))
      const [row] = await t.select().from(storePages).where(and(eq(storePages.storeId, store.id), eq(storePages.id, id)))
      if (!row) throw fail(404, 'notFound')
      return c.json(present(row))
    })
  })

  // A new page: blank, or a policy from our starting text (hidden until the seller has read it). Optionally linked in the footer menu.
  app.post('/stores/:handle/store-pages', async (c) => {
    const body = await c.req.json().catch(() => null)
    if (!body || typeof body !== 'object') throw fail(400, 'invalidRequest')
    const policy = body.policy ?? null
    if (policy !== null && !isPolicy(policy)) throw fail(400, 'invalidRequest')
    return tx(c.get('userId'), async (t) => {
      const store = await storeByHandle(t, c.req.param('handle'))
      await t.execute(sql`select pg_advisory_xact_lock(hashtext(${`store-pages:${store.id}`}))`)
      const [{ n }] = await t.select({ n: sql<number>`count(*)::int` }).from(storePages).where(eq(storePages.storeId, store.id))
      if (n >= maxPages) throw fail(409, 'storePageLimit')
      if (policy && (await t.select({ id: storePages.id }).from(storePages).where(and(eq(storePages.storeId, store.id), eq(storePages.policy, policy)))).length) throw fail(409, 'policyExists')
      const draft = policy ? draftFor(policy, store.name) : null
      const input = readPage({ ...body, title: body.title || draft?.title, body: body.body ?? draft?.body ?? '', visible: policy ? false : body.visible })
      const handle = await chooseHandle(t, store.id, input.title, input.handle || draft?.handle || '')
      const [row] = await t.insert(storePages).values({ storeId: store.id, ...input, handle, policy }).returning()
      if (body.addToFooter === true) await linkInFooter(t, store.id, row.id, row.title)
      return c.json(present(row), 201)
    }).catch(refuseTakenHandle)
  })

  // Saves the whole page. A stale revision means someone else saved first: 409, never a silent overwrite.
  app.put('/stores/:handle/store-pages/:id', async (c) => {
    const id = c.req.param('id')
    if (!isId(id)) throw fail(404, 'notFound')
    const body = await c.req.json().catch(() => null)
    if (!body || typeof body !== 'object' || !Number.isInteger(body.revision)) throw fail(400, 'invalidRequest')
    const input = readPage(body)
    return tx(c.get('userId'), async (t) => {
      const store = await storeByHandle(t, c.req.param('handle'))
      const handle = await chooseHandle(t, store.id, input.title, input.handle, { storePage: id })
      const [row] = await t.update(storePages).set({ ...input, handle, revision: sql`${storePages.revision} + 1`, updatedAt: sql`now()` })
        .where(and(eq(storePages.storeId, store.id), eq(storePages.id, id), eq(storePages.revision, body.revision))).returning()
      if (!row) {
        const [exists] = await t.select({ id: storePages.id }).from(storePages).where(and(eq(storePages.storeId, store.id), eq(storePages.id, id)))
        throw exists ? fail(409, 'storePageChanged') : fail(404, 'notFound')
      }
      return c.json(present(row))
    }).catch(refuseTakenHandle)
  })

  // Show or hide only, for bulk actions on the list.
  app.patch('/stores/:handle/store-pages/:id', async (c) => {
    const id = c.req.param('id')
    const body = await c.req.json().catch(() => null)
    if (!isId(id) || typeof body?.visible !== 'boolean') throw fail(400, 'invalidRequest')
    return tx(c.get('userId'), async (t) => {
      const store = await storeByHandle(t, c.req.param('handle'))
      const [row] = await t.update(storePages).set({ visible: body.visible, revision: sql`${storePages.revision} + 1`, updatedAt: sql`now()` })
        .where(and(eq(storePages.storeId, store.id), eq(storePages.id, id))).returning()
      if (!row) throw fail(404, 'notFound')
      return c.json(present(row))
    })
  })

  app.delete('/stores/:handle/store-pages/:id', async (c) => {
    const id = c.req.param('id')
    if (!isId(id)) throw fail(404, 'notFound')
    return tx(c.get('userId'), async (t) => {
      const store = await storeByHandle(t, c.req.param('handle'))
      const [row] = await t.select({ id: storePages.id }).from(storePages).where(and(eq(storePages.storeId, store.id), eq(storePages.id, id)))
      if (!row) throw fail(404, 'notFound')
      const gone = await t.delete(storePages).where(and(eq(storePages.storeId, store.id), eq(storePages.id, id))).returning({ id: storePages.id })
      if (!gone.length) throw fail(403, 'forbidden')
      return c.body(null, 204)
    })
  })
}

