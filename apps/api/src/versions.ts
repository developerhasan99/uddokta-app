import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import type { Hono } from 'hono'
import { readContent, references, type Content } from 'storefront/schema'
import { readTheme, themeReferences, type ThemeDoc } from 'storefront/theme'
import { fail, storeByHandle, type Env } from './app.ts'
import { tx, type Tx } from './db.ts'
import { remap, syncMedia } from './pages.ts'
import { isId } from './products.ts'
import { collections, media, pages, products, themes, versions } from './schema.ts'
import { syncThemeMedia } from './themes.ts'

type Owner = { pageId: string } | { themeId: string }
const keepSaves = 20
const keepDays = 30
const mergeMinutes = 10

const ownerWhere = (owner: Owner) => ('pageId' in owner ? eq(versions.pageId, owner.pageId) : eq(versions.themeId, owner.themeId))

// Keeps a copy of what was just saved or published. A save right after the same person's last save replaces it, so
// typing all afternoon is one version per ten minutes, not hundreds. Old versions are pruned here.
export async function recordVersion(t: Tx, storeId: string, owner: Owner, label: 'save' | 'publish' | 'restore', content: unknown, userId: string) {
  const [last] = await t.select().from(versions).where(ownerWhere(owner)).orderBy(desc(versions.createdAt)).limit(1)
  if (label === 'save' && last?.label === 'save' && last.createdBy === userId && Date.now() - last.createdAt.getTime() < mergeMinutes * 60_000) {
    await t.update(versions).set({ content, createdAt: sql`now()` }).where(eq(versions.id, last.id))
  } else {
    await t.insert(versions).values({ storeId, ...owner, label, content, createdBy: userId })
  }
  const saves = await t.select({ id: versions.id }).from(versions).where(and(ownerWhere(owner), eq(versions.label, 'save'))).orderBy(desc(versions.createdAt)).offset(keepSaves)
  if (saves.length) await t.delete(versions).where(inArray(versions.id, saves.map((v) => v.id)))
  await t.delete(versions).where(and(ownerWhere(owner), sql`${versions.label} <> 'save'`, sql`${versions.createdAt} < now() - ${`${keepDays} days`}::interval`))
}

// Images, products and collections a version points at that the store no longer has become blank, as on import.
async function missing(t: Tx, storeId: string, refs: { media: string[]; products: string[]; collections: string[] }) {
  const have = async (table: typeof media | typeof products | typeof collections, ids: string[]) =>
    new Set(ids.length ? (await t.select({ id: table.id }).from(table).where(and(eq(table.storeId, storeId), inArray(table.id, ids)))).map((r) => r.id) : [])
  const swap = new Map<string, string | null>()
  for (const [table, ids] of [[media, refs.media], [products, refs.products], [collections, refs.collections]] as const) {
    const found = await have(table, ids)
    for (const id of ids) if (!found.has(id)) swap.set(id, null)
  }
  return swap
}

const present = (v: typeof versions.$inferSelect) => ({ id: v.id, label: v.label, createdAt: v.createdAt, createdBy: v.createdBy })

export function registerVersions(app: Hono<Env>) {
  for (const kind of ['pages', 'themes'] as const) {
    app.get(`/stores/:handle/${kind}/:id/versions`, async (c) => {
      const id = c.req.param('id')
      if (!isId(id)) throw fail(404, 'notFound')
      return tx(c.get('userId'), async (t) => {
        const store = await storeByHandle(t, c.req.param('handle'))
        const owner: Owner = kind === 'pages' ? { pageId: id } : { themeId: id }
        const rows = await t.select().from(versions).where(and(eq(versions.storeId, store.id), ownerWhere(owner))).orderBy(desc(versions.createdAt)).limit(60)
        return c.json(rows.map(present))
      })
    })
  }

  // Restore: a version becomes the draft again (the live copy changes only when it is published). The page keeps its
  // current address; anything the store no longer has is left blank. A stale revision is refused like any save.
  app.post('/stores/:handle/versions/:id/restore', async (c) => {
    const id = c.req.param('id')
    const body = await c.req.json().catch(() => null)
    if (!isId(id) || !body || !Number.isInteger(body.revision)) throw fail(400, 'invalidRequest')
    const userId = c.get('userId')
    return tx(userId, async (t) => {
      const store = await storeByHandle(t, c.req.param('handle'))
      const [version] = await t.select().from(versions).where(and(eq(versions.storeId, store.id), eq(versions.id, id)))
      if (!version) throw fail(404, 'notFound')
      if (version.pageId) {
        const saved = version.content as { title: string; seoTitle: string; seoDescription: string; draft: Content }
        const source = readContent(saved.draft)
        const draft = source && readContent(remap(source, await missing(t, store.id, { ...references(source), collections: [] })))
        if (!draft) throw fail(400, 'invalidRequest')
        const [row] = await t.update(pages).set({ title: saved.title, seoTitle: saved.seoTitle, seoDescription: saved.seoDescription, draft, revision: sql`${pages.revision} + 1`, updatedAt: sql`now()` })
          .where(and(eq(pages.storeId, store.id), eq(pages.id, version.pageId), eq(pages.revision, body.revision))).returning()
        if (!row) throw fail(409, 'pageChanged')
        await syncMedia(t, store.id, row.id, draft, row.published as Content | null)
        await recordVersion(t, store.id, { pageId: row.id }, 'restore', saved, userId)
        return c.json({ kind: 'page', id: row.id })
      }
      const saved = version.content as { name: string; draft: ThemeDoc }
      const source = readTheme(saved.draft)
      const draft = source && readTheme(remap(source as unknown as Content, await missing(t, store.id, themeReferences(source))))
      if (!draft) throw fail(400, 'themeInvalid')
      const [current] = await t.select({ revision: themes.revision }).from(themes).where(and(eq(themes.storeId, store.id), eq(themes.id, version.themeId!)))
      if (!current) throw fail(404, 'notFound')
      if (current.revision !== body.revision) throw fail(409, 'themeChanged')
      const [row] = await t.update(themes).set({ name: saved.name, draft, revision: sql`${themes.revision} + 1`, updatedAt: sql`now()` })
        .where(and(eq(themes.storeId, store.id), eq(themes.id, version.themeId!), eq(themes.revision, body.revision))).returning()
      if (!row) throw fail(403, 'forbidden')
      await syncThemeMedia(t, store.id, row.id, draft, row.published as ThemeDoc | null)
      await recordVersion(t, store.id, { themeId: row.id }, 'restore', saved, userId)
      return c.json({ kind: 'theme', id: row.id })
    })
  })
}
