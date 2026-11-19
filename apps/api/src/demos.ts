import { sql } from 'drizzle-orm'
import type { Hono } from 'hono'
import { readContent, type Content } from 'storefront/schema'
import { isTemplateType } from 'storefront/site'
import { fail, storeByHandle, type Env } from './app.ts'
import { tx } from './db.ts'
import { bringIn, type FileRef } from './pages.ts'
import { isId } from './products.ts'
import { publicUrl } from './storage.ts'

// Demos made by the Uddokta team in the console (migration 0101). Sellers only read published ones, through demo_list
// and demo_take; nothing here can change a demo. Every use copies the content and images into the seller's store.

export type DemoKind = 'landing' | 'template' | 'section'

// A published demo's content and images; 404 for drafts, other kinds and unknown ids. Counts the use.
export async function takeDemo(userId: string, id: string, kind: DemoKind) {
  const row = (await tx(userId, (t) => t.execute<{ template_type: string | null; content: Content; media: FileRef[] }>(sql`select * from demo_take(${id}::uuid, ${kind})`))).rows[0]
  if (!row) throw fail(404, 'notFound')
  return { templateType: row.template_type, content: row.content, media: Array.isArray(row.media) ? row.media : [] }
}

export function registerDemos(app: Hono<Env>) {
  // The galleries: ?kind=landing|template|section, and ?type= for one template type.
  app.get('/demos', async (c) => {
    const kind = c.req.query('kind')
    const type = c.req.query('type')
    if (kind !== 'landing' && kind !== 'template' && kind !== 'section') throw fail(400, 'invalidRequest')
    if (type !== undefined && !isTemplateType(type)) throw fail(400, 'invalidRequest')
    const rows = (await tx(c.get('userId'), (t) => t.execute<{ id: string; kind: string; template_type: string | null; name_bn: string; name_en: string; category: string; thumb_key: string | null; preview_url: string }>(
      sql`select * from demo_list(${kind}, ${type ?? null})`))).rows
    return c.json(rows.map((r) => ({ id: r.id, kind: r.kind, templateType: r.template_type, name: [r.name_bn, r.name_en], category: r.category, thumb: r.thumb_key ? publicUrl(r.thumb_key) : null, previewUrl: r.preview_url || null })))
  })

  // A demo section for the editor: its images are copied into the store now; the editor gives it fresh ids and the
  // page or template keeps it once saved. Returns the section and the images it added.
  app.post('/stores/:handle/demos/:id/section', async (c) => {
    const id = c.req.param('id')
    if (!isId(id)) throw fail(404, 'notFound')
    const userId = c.get('userId')
    const storeId = await tx(userId, async (t) => (await storeByHandle(t, c.req.param('handle'))).id)
    const demo = await takeDemo(userId, id, 'section')
    const brought = await bringIn(userId, storeId, demo.content, demo.media)
    const content = readContent(brought.content)
    if (!content || content.sections.length !== 1) throw fail(400, 'invalidRequest')
    return c.json({ section: content.sections[0], media: brought.media })
  })
}
