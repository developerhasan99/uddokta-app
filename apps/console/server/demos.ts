import { randomUUID } from 'node:crypto'
import { sql } from 'drizzle-orm'
import type { Context, Hono } from 'hono'
import { fail } from '../../api/src/http.ts'
import { one, tx } from '../../api/src/db.ts'
import { deleteFile, getFile, publicUrl, putFile } from '../../api/src/storage.ts'
import { readContent, references, type Content } from '../../storefront/src/schema.ts'
import { readTemplateContent } from '../../storefront/src/site.ts'
import type { Env } from './app.ts'

// Console › Demos. The team designs a landing page or template (or one section of one) in an ordinary store with the
// page builder; here it becomes a demo: a snapshot of the saved draft, with its images copied under the demo's own key
// prefix so the source can keep changing (or lose images) without breaking the demo. "Update from source" takes a new
// snapshot. Every change goes through console_* functions (migration 0101), which check the administrator and log it.

type Kind = 'landing' | 'template' | 'section'
type File = { id: string; key: string; thumbKey: string; name: string; alt: string; width: number; height: number; sourceFormat: string }
const isId = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f-]{36}$/.test(v)
const isKind = (v: unknown): v is Kind => v === 'landing' || v === 'template' || v === 'section'
const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
async function body(c: Context) {
  const value = await c.req.json().catch(() => null)
  if (!value || typeof value !== 'object') throw fail(400, 'invalidRequest')
  return value as Record<string, unknown>
}

// Names, category, preview link, status and order: what every save carries.
function readDetails(b: Record<string, unknown>) {
  const details = {
    nameBn: text(b.nameBn, 80), nameEn: text(b.nameEn, 80), category: text(b.category, 40),
    previewUrl: text(b.previewUrl, 500), status: b.status === 'published' ? 'published' : 'draft', sort: Number(b.sort ?? 0),
  }
  if (!details.nameBn || !details.nameEn) throw fail(400, 'nameRequired')
  if (details.previewUrl && !/^https?:\/\/\S+$/.test(details.previewUrl)) throw fail(400, 'demoPreviewUrl')
  if (!Number.isInteger(details.sort) || Math.abs(details.sort) > 10_000) throw fail(400, 'invalidRequest')
  return details
}

export function registerDemos(app: Hono<Env>) {
  const admin = (c: Context<Env>) => c.get('userId')
  const run = <T>(work: Parameters<typeof tx<T>>[1]) => tx(null, work)
  const files = async (c: Context<Env>, store: string, ids: string[]) =>
    ids.length ? (await run((t) => one<{ f: File[] }>(t, sql`select console_demo_files(${admin(c)}::uuid, ${store}::uuid, ${`{${ids.join(",")}}`}::uuid[]) as f`)))!.f : []

  // Copies the source's draft (or one section of it) into a snapshot with the images under `<demo>/`.
  async function snapshot(c: Context<Env>, demo: string, kind: Kind, store: string, source: string, section: string | null) {
    const src = (await run((t) => one<{ s: { type: string | null; content: Content } | null }>(t,
      sql`select console_demo_source(${admin(c)}::uuid, ${store}::uuid, ${kind === 'template' ? 'template' : 'page'}, ${source}::uuid) as s`)))?.s
      ?? (kind === 'section' ? (await run((t) => one<{ s: { type: string | null; content: Content } | null }>(t, sql`select console_demo_source(${admin(c)}::uuid, ${store}::uuid, 'template', ${source}::uuid) as s`)))?.s : null)
    if (!src) throw fail(404, 'notFound')
    let content: Content | null
    if (kind === 'section') {
      const picked = Array.isArray(src.content?.sections) ? src.content.sections.find((s) => s.id === section) : undefined
      if (!picked) throw fail(404, 'notFound')
      // A section must work on landing pages too, so store-only blocks (product grid, cart, …) are refused.
      content = readContent({ version: 2, sections: [picked] })
      if (!content) throw fail(400, readTemplateContent({ version: 2, sections: [picked] }) ? 'demoStoreBlocks' : 'demoInvalid')
    } else {
      content = kind === 'template' ? readTemplateContent(src.content) : readContent(src.content)
      if (!content) throw fail(400, 'demoInvalid')
    }
    if (content.sections.length === 0) throw fail(400, 'demoEmpty')
    const media = await Promise.all((await files(c, store, references(content).media)).map(async (f) => {
      const copy = { ...f, key: `${demo}/${f.id}.webp`, thumbKey: `${demo}/${f.id}-thumb.webp` }
      const [full, thumb] = await Promise.all([getFile(f.key), getFile(f.thumbKey)]).catch(() => [null, null])
      if (!full || !thumb) return null
      await Promise.all([putFile(copy.key, full), putFile(copy.thumbKey, thumb)])
      return copy
    }))
    return { content, media: media.filter(Boolean), templateType: kind === 'template' ? src.type : null, sourceStoreId: store, sourceId: source, sourceSection: kind === 'section' ? section : null }
  }

  // The chosen thumbnail (an image in the source store's gallery, usually a screenshot) is copied under `<demo>/` too.
  async function thumbnail(c: Context<Env>, demo: string, store: unknown, image: unknown) {
    if (image === null) return { thumbKey: null }
    if (image === undefined || image === '') return {}
    if (!isId(store) || !isId(image)) throw fail(400, 'invalidRequest')
    const [file] = await files(c, store, [image])
    if (!file) throw fail(404, 'notFound')
    const key = `${demo}/${randomUUID()}.webp`
    // ponytail: the previous thumbnail file stays in storage when it is replaced; sweep `<demo>/` keys if it adds up.
    await putFile(key, await getFile(file.key))
    return { thumbKey: key }
  }

  app.get('/console/demos', async (c) => {
    const rows = (await run((t) => one<{ d: Record<string, unknown>[] }>(t, sql`select console_demos(${admin(c)}::uuid) as d`)))!.d
    return c.json(rows.map((r) => ({ ...r, thumb: r.thumbKey ? publicUrl(r.thumbKey as string) : null })))
  })

  // What a store (by its address) offers: landing pages and templates with their sections, and its newest images.
  app.get('/console/demos/sources', async (c) => {
    const found = (await run((t) => one<{ s: { images: { key: string; thumbKey: string }[] } | null }>(t, sql`select console_demo_sources(${admin(c)}::uuid, ${text(c.req.query('store'), 60)}) as s`)))?.s
    if (!found) throw fail(404, 'storeNotFound')
    return c.json({ ...found, images: found.images.map((m) => ({ ...m, url: publicUrl(m.thumbKey) })) })
  })

  app.post('/console/demos', async (c) => {
    const b = await body(c)
    const details = readDetails(b)
    if (!isKind(b.kind) || !isId(b.sourceStoreId) || !isId(b.sourceId) || (b.kind === 'section' && typeof b.sourceSection !== 'string')) throw fail(400, 'invalidRequest')
    const id = randomUUID()
    const taken = await snapshot(c, id, b.kind, b.sourceStoreId, b.sourceId, b.kind === 'section' ? b.sourceSection as string : null)
    // No thumbnail picked: the demo's first image (already copied under `<demo>/`) stands in.
    const thumb = b.thumbImageId === undefined || b.thumbImageId === '' ? { thumbKey: taken.media[0]?.key ?? null } : await thumbnail(c, id, b.sourceStoreId, b.thumbImageId)
    await run((t) => t.execute(sql`select console_save_demo(${admin(c)}::uuid, ${id}::uuid, ${JSON.stringify({ ...details, kind: b.kind, ...taken, ...thumb })}::jsonb)`))
    return c.json({ id }, 201)
  })

  // Names, category, preview, status, order and thumbnail; the content stays as it was.
  app.put('/console/demos/:id', async (c) => {
    const id = c.req.param('id')
    if (!isId(id)) throw fail(404, 'notFound')
    const b = await body(c)
    const details = readDetails(b)
    const thumb = await thumbnail(c, id, b.sourceStoreId, b.thumbImageId)
    await run((t) => t.execute(sql`select console_save_demo(${admin(c)}::uuid, ${id}::uuid, ${JSON.stringify({ ...details, ...thumb })}::jsonb)`))
    return c.json({ ok: true })
  })

  // Takes the source again (after the team changed it). Stores that already used the demo keep their copies.
  app.post('/console/demos/:id/snapshot', async (c) => {
    const id = c.req.param('id')
    if (!isId(id)) throw fail(404, 'notFound')
    const rows = (await run((t) => one<{ d: Record<string, any>[] }>(t, sql`select console_demos(${admin(c)}::uuid) as d`)))!.d
    const demo = rows.find((r) => r.id === id)
    if (!demo) throw fail(404, 'notFound')
    if (!demo.sourceStoreId || !demo.sourceId) throw fail(409, 'demoSourceGone')
    const taken = await snapshot(c, id, demo.kind, demo.sourceStoreId, demo.sourceId, demo.sourceSection)
    const details = { nameBn: demo.nameBn, nameEn: demo.nameEn, category: demo.category, previewUrl: demo.previewUrl, status: demo.status, sort: demo.sort }
    await run((t) => t.execute(sql`select console_save_demo(${admin(c)}::uuid, ${id}::uuid, ${JSON.stringify({ ...details, ...taken })}::jsonb)`))
    return c.json({ ok: true })
  })

  app.delete('/console/demos/:id', async (c) => {
    const id = c.req.param('id')
    if (!isId(id)) throw fail(404, 'notFound')
    const b = await c.req.json().catch(() => ({}))
    const gone = (await run((t) => one<{ g: { media: File[]; thumbKey: string | null } | null }>(t, sql`select console_delete_demo(${admin(c)}::uuid, ${id}::uuid, ${text(b?.reason, 500)}) as g`)))?.g
    if (!gone) throw fail(404, 'notFound')
    await Promise.allSettled([...gone.media.flatMap((f) => [deleteFile(f.key), deleteFile(f.thumbKey)]), ...(gone.thumbKey ? [deleteFile(gone.thumbKey)] : [])])
    return c.json({ ok: true })
  })
}
