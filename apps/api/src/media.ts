import { randomUUID } from 'node:crypto'
import { and, asc, desc, eq, ilike, or, sql } from 'drizzle-orm'
import type { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import sharp from 'sharp'
import { one, tx } from './db.ts'
import { media, productMedia, products } from './schema.ts'
import { deleteFile, getFile, publicUrl, putFile } from './storage.ts'
import { fail, storeByHandle, type Env } from './app.ts'

const maxUploadBytes = 10 * 1024 * 1024
const pageSize = 60
const allowedFormats = ['jpeg', 'png', 'webp', 'avif']
// ponytail: one limit for every store; read it from the store's plan once plans exist.
export const storeLimitBytes = 1024 * 1024 * 1024

export const present = (row: typeof media.$inferSelect) => ({
  id: row.id,
  name: row.name,
  alt: row.alt,
  width: row.width,
  height: row.height,
  sizeBytes: row.sizeBytes,
  sourceFormat: row.sourceFormat ?? 'webp',
  createdAt: row.createdAt,
  url: publicUrl(row.key),
  thumbUrl: publicUrl(row.thumbKey),
})

// Escaped so % and _ typed by a seller are searched for literally.
export const likePattern = (q: string) => `%${q.replace(/[\\%_]/g, '\\$&')}%`

// Decoding here rejects anything that is not really an image, whatever its name or type claims.
// Re-encoding drops metadata such as a phone's GPS location.
async function processImage(input: Buffer) {
  try {
    const image = sharp(input)
    const { format } = await image.metadata()
    if (!format || !allowedFormats.includes(format)) throw fail(415, 'fileNotImage')
    const full = await sharp(input).rotate().resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer({ resolveWithObject: true })
    const thumb = await sharp(input).rotate().resize({ width: 480, height: 480, fit: 'inside', withoutEnlargement: true }).webp({ quality: 75 }).toBuffer()
    return { full: full.data, width: full.info.width, height: full.info.height, thumb, sourceFormat: format }
  } catch (err) {
    if (err instanceof Error && err.name === 'HTTPException') throw err
    throw fail(415, 'fileNotImage')
  }
}

// Stores the files, then the row; if the row is refused, the files are removed again.
async function saveImage(userId: string, storeId: string, name: string, image: { full: Buffer; thumb: Buffer; width: number; height: number; sourceFormat: string }) {
  const sizeBytes = image.full.length + image.thumb.length
  const id = randomUUID()
  const key = `${storeId}/${id}.webp`
  const thumbKey = `${storeId}/${id}-thumb.webp`

  await Promise.all([putFile(key, image.full), putFile(thumbKey, image.thumb)])
  try {
    return await tx(userId, async (t) => {
      // Serialises uploads per store so parallel ones cannot pass the limit together.
      await t.execute(sql`select pg_advisory_xact_lock(hashtext(${storeId}))`)
      const used = await one<{ total: string }>(t, sql`select coalesce(sum(size_bytes), 0) as total from media where store_id = ${storeId}::uuid`)
      if (Number(used?.total ?? 0) + sizeBytes > storeLimitBytes) throw fail(413, 'storageFull')
      const [inserted] = await t.insert(media).values({
        id, storeId, name: name.slice(0, 200) || 'image', key, thumbKey, width: image.width, height: image.height, sizeBytes, sourceFormat: image.sourceFormat,
      }).returning()
      return inserted
    })
  } catch (err) {
    await Promise.allSettled([deleteFile(key), deleteFile(thumbKey)])
    throw err
  }
}

function croppedName(name: string) {
  const dot = name.lastIndexOf('.')
  const stem = dot > 0 ? name.slice(0, dot) : name
  return `${stem}-cropped.webp`
}

export function registerMedia(app: Hono<Env>) {
  app.get('/stores/:handle/media', async (c) => {
    const offset = Math.max(Number(c.req.query('offset')) || 0, 0)
    const q = (c.req.query('q') ?? '').trim().slice(0, 200)
    const pattern = likePattern(q)
    return tx(c.get('userId'), async (t) => {
      const store = await storeByHandle(t, c.req.param('handle'))
      // ponytail: offset paging; switch to a created_at cursor if galleries reach tens of thousands of files.
      const rows = await t.select().from(media).where(and(eq(media.storeId, store.id), q ? or(ilike(media.name, pattern), ilike(media.alt, pattern)) : undefined)).orderBy(desc(media.createdAt), desc(media.id)).limit(pageSize + 1).offset(offset)
      const used = await one<{ total: string }>(t, sql`select coalesce(sum(size_bytes), 0) as total from media where store_id = ${store.id}::uuid`)
      return c.json({
        items: rows.slice(0, pageSize).map(present),
        hasMore: rows.length > pageSize,
        usedBytes: Number(used?.total ?? 0),
        limitBytes: storeLimitBytes,
      })
    })
  })

  app.post(
    '/stores/:handle/media',
    bodyLimit({ maxSize: maxUploadBytes + 64 * 1024, onError: () => { throw fail(413, 'fileTooLarge') } }),
    async (c) => {
      const body = await c.req.parseBody().catch(() => null)
      const file = body?.file
      if (!(file instanceof File)) throw fail(400, 'invalidRequest')
      if (file.size > maxUploadBytes) throw fail(413, 'fileTooLarge')
      const userId = c.get('userId')

      // Check access before spending time on the image.
      const store = await tx(userId, (t) => storeByHandle(t, c.req.param('handle')))
      const image = await processImage(Buffer.from(await file.arrayBuffer()))
      return c.json(present(await saveImage(userId, store.id, file.name, image)), 201)
    },
  )

  // A crop is saved as a new image, so the original is never lost.
  app.post('/stores/:handle/media/:id/crop', async (c) => {
    const body = await c.req.json().catch(() => null)
    const { x, y, width, height } = body ?? {}
    const valid = [x, y, width, height].every(Number.isInteger) && x >= 0 && y >= 0 && width >= 1 && height >= 1
    if (!valid) throw fail(400, 'invalidRequest')
    const userId = c.get('userId')
    const source = await tx(userId, async (t) => {
      const store = await storeByHandle(t, c.req.param('handle'))
      const [row] = await t.select().from(media).where(and(eq(media.storeId, store.id), eq(media.id, c.req.param('id'))))
      if (!row) throw fail(404, 'notFound')
      return row
    })
    if (x + width > source.width || y + height > source.height) throw fail(400, 'invalidRequest')

    const cropped = await sharp(await getFile(source.key)).extract({ left: x, top: y, width, height }).toBuffer()
    const thumb = await sharp(cropped).resize({ width: 480, height: 480, fit: 'inside', withoutEnlargement: true }).webp({ quality: 75 }).toBuffer()
    const full = await sharp(cropped).webp({ quality: 82 }).toBuffer()
    const row = await saveImage(userId, source.storeId, croppedName(source.name), { full, thumb, width, height, sourceFormat: 'webp' })
    return c.json(present(row), 201)
  })

  app.get('/stores/:handle/media/:id/usage', async (c) => {
    return tx(c.get('userId'), async (t) => {
      const store = await storeByHandle(t, c.req.param('handle'))
      const used = await t
        .select({ id: products.id, name: products.name })
        .from(productMedia)
        .innerJoin(products, eq(products.id, productMedia.productId))
        .where(and(eq(productMedia.storeId, store.id), eq(productMedia.mediaId, c.req.param('id'))))
        .orderBy(asc(products.name))
      return c.json({ products: used })
    })
  })

  app.patch('/stores/:handle/media/:id', async (c) => {
    const body = await c.req.json().catch(() => null)
    if (!body || typeof body.alt !== 'string' || body.alt.length > 500) throw fail(400, 'invalidRequest')
    return tx(c.get('userId'), async (t) => {
      const store = await storeByHandle(t, c.req.param('handle'))
      const [row] = await t.update(media).set({ alt: body.alt.trim() }).where(and(eq(media.storeId, store.id), eq(media.id, c.req.param('id')))).returning()
      if (!row) throw fail(404, 'notFound')
      return c.json(present(row))
    })
  })

  app.delete('/stores/:handle/media/:id', async (c) => {
    const removed = await tx(c.get('userId'), async (t) => {
      const store = await storeByHandle(t, c.req.param('handle'))
      const [row] = await t.delete(media).where(and(eq(media.storeId, store.id), eq(media.id, c.req.param('id')))).returning()
      if (!row) throw fail(403, 'forbidden')
      return row
    })
    // ponytail: a failed delete leaves an orphan file, never a broken image; a cleanup job can sweep those later.
    await Promise.allSettled([deleteFile(removed.key), deleteFile(removed.thumbKey)])
    return c.json({ ok: true })
  })
}
