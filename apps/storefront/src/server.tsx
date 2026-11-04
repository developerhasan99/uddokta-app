import { createHash } from 'node:crypto'
import { serve } from '@hono/node-server'
import { sql } from 'drizzle-orm'
import { Hono, type Context } from 'hono'
import { renderToString } from 'react-dom/server'
import { tx } from '../../api/src/db.ts'
import { publicUrl, readLocalFile } from '../../api/src/storage.ts'
import { readPhone, references, type Content } from './schema.ts'
import { css, fontsHref, pageScript, PageView, taka, type Ctx, type Img, type OrderValues, type Product } from './sections.tsx'

// Stores live at {handle}.{STOREFRONT_DOMAIN}; in development that is {handle}.localhost:8788.
// ponytail: custom domains need a lookup table from host to store; add it with Cloudflare for SaaS.
const domain = process.env.STOREFRONT_DOMAIN ?? 'localhost'
const scriptHash = createHash('sha256').update(pageScript).digest('base64')
const csp = [
  "default-src 'self'", "img-src 'self' https: data:", `script-src 'sha256-${scriptHash}'`, "style-src 'unsafe-inline' https://fonts.googleapis.com",
  'font-src https://fonts.gstatic.com', 'frame-src https://www.youtube-nocookie.com https://www.facebook.com', "form-action 'self'", "frame-ancestors 'none'", "base-uri 'none'",
].join('; ')

function storeHandle(c: Context) {
  const host = (c.req.header('x-forwarded-host') ?? c.req.header('host') ?? '').split(':')[0].toLowerCase()
  return host.endsWith(`.${domain}`) ? host.slice(0, -domain.length - 1) : null
}

type PageRow = { store_id: string; store_name: string; delivery_inside: number; delivery_outside: number; page_id: string; title: string; seo_title: string; seo_description: string; content: Content }

export async function loadPage(store: string, handle: string) {
  return tx(null, async (t) => {
    const page = (await t.execute<PageRow>(sql`select * from storefront_page(${store}, ${handle})`)).rows[0]
    if (!page) return null
    const refs = references(page.content)
    const productRows = await t.execute<{ id: string; name: string; image_key: string | null; image_alt: string; image_width: number; image_height: number; variants: { id: string; options: string[]; price: number; comparePrice: number | null; stock: number | null }[] }>(
      sql`select * from storefront_products(${page.store_id}::uuid, ${`{${refs.products.join(',')}}`}::uuid[])`)
    const mediaRows = await t.execute<{ id: string; key: string; alt: string; width: number; height: number }>(
      sql`select * from storefront_media(${page.store_id}::uuid, ${`{${refs.media.join(',')}}`}::uuid[])`)
    const images = new Map<string, Img>(mediaRows.rows.map((m) => [m.id, { url: publicUrl(m.key), alt: m.alt, width: m.width, height: m.height }]))
    const products = new Map<string, Product>(productRows.rows.map((p) => [p.id, {
      id: p.id,
      name: p.name,
      image: p.image_key ? { url: publicUrl(p.image_key), alt: p.image_alt || p.name, width: p.image_width, height: p.image_height } : null,
      variants: p.variants.map((v) => ({ id: v.id, label: v.options.join(' / ') || p.name, price: v.price, comparePrice: v.comparePrice, available: v.stock === null || v.stock > 0 })),
    }]))
    return { ...page, images, products }
  })
}
type Loaded = NonNullable<Awaited<ReturnType<typeof loadPage>>>

function Document({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <html lang="bn">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{title}</title>
        {description && <meta name="description" content={description} />}
        <meta property="og:title" content={title} />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href={fontsHref} />
        <style dangerouslySetInnerHTML={{ __html: css }} />
      </head>
      <body>{children}</body>
    </html>
  )
}

const html = (c: Context, body: React.ReactElement, status: 200 | 404 | 422 = 200) =>
  c.html(`<!doctype html>${renderToString(body)}`, status, { 'content-security-policy': csp, 'x-content-type-options': 'nosniff', 'referrer-policy': 'strict-origin-when-cross-origin', 'cache-control': 'no-cache' })

function notFound(c: Context) {
  return html(c, (
    <Document title="পেজটি পাওয়া যায়নি" description="">
      <main className="sf-done sf-wrap"><h1>পেজটি পাওয়া যায়নি</h1><p>লিংকটি ঠিক আছে কিনা দেখুন, অথবা দোকানের সাথে যোগাযোগ করুন।</p></main>
    </Document>
  ), 404)
}

const pagePath = (c: Context) => `/pages/${encodeURIComponent(c.req.param('handle')!)}`

function renderPage(c: Context, page: Loaded, order?: Ctx['order']) {
  const ctx: Ctx = {
    preview: false,
    delivery: { inside: page.delivery_inside, outside: page.delivery_outside },
    image: (id) => (id ? page.images.get(id) : undefined),
    product: (id) => (id ? page.products.get(id) : undefined),
    orderAction: pagePath(c),
    order,
  }
  return html(c, (
    <Document title={page.seo_title || page.title} description={page.seo_description}>
      <PageView content={page.content} ctx={ctx} storeName={page.store_name} />
      <script dangerouslySetInnerHTML={{ __html: pageScript }} />
    </Document>
  ), order ? 422 : 200)
}

export const app = new Hono()

// Development stand-in for the public R2 bucket, as in the API.
app.get('/api/media-files/:store/:file', async (c) => {
  const data = await readLocalFile(`${c.req.param('store')}/${c.req.param('file')}`)
  if (!data) return c.notFound()
  return c.body(new Uint8Array(data), 200, { 'content-type': 'image/webp', 'x-content-type-options': 'nosniff', 'cache-control': 'public, max-age=31536000, immutable' })
})

app.get('/pages/:handle', async (c) => {
  const store = storeHandle(c)
  const page = store && await loadPage(store, c.req.param('handle'))
  return page ? renderPage(c, page) : notFound(c)
})

const databaseCode = (err: unknown) => (err as { code?: string; cause?: { code?: string } }).cause?.code ?? (err as { code?: string }).code

// The order form posts here as a plain form, so it works with JavaScript off and on slow phones.
// ponytail: no rate limit or fake-order checks yet; those arrive with fake-order protection (build step 6).
app.post('/pages/:handle', async (c) => {
  const store = storeHandle(c)
  const page = store && await loadPage(store, c.req.param('handle'))
  if (!page) return notFound(c)
  const form = await c.req.parseBody()
  const values: OrderValues = {}
  for (const key of ['variant', 'quantity', 'name', 'phone', 'address', 'area'] as const) values[key] = typeof form[key] === 'string' ? (form[key] as string).trim() : ''
  const section = page.content.sections.find((s) => s.id === form.section && s.type === 'order' && !s.hidden)
  const product = section && page.products.get(section.settings.product as string)
  if (!section || !product) return notFound(c)
  // A bot that filled the hidden field is shown success, so it has no reason to try again, and nothing is saved.
  if (form.website) return c.redirect(`${pagePath(c)}/thanks`, 303)
  const reject = (error: string) => renderPage(c, page, { sectionId: section.id, error, values })

  const variant = product.variants.find((v) => v.id === values.variant)
  const quantity = Number(values.quantity || 1)
  const phone = readPhone(values.phone ?? '')
  if (!variant) return reject('variant')
  if (!variant.available) return reject('soldOut')
  if (!values.name || values.name.length > 100) return reject('name')
  if (!phone) return reject('phone')
  if (!values.address || values.address.length < 5 || values.address.length > 500) return reject('address')
  if (values.area !== 'inside' && values.area !== 'outside') return reject('area')
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) return reject('server')
  const charge = values.area === 'outside' ? page.delivery_outside : page.delivery_inside

  try {
    const number = await tx(null, async (t) => (await t.execute<{ number: number }>(sql`
      select place_order(${page.store_id}::uuid, ${page.page_id}::uuid, ${variant.id}::uuid, ${quantity}, ${values.name}, ${phone}, ${values.address}, ${values.area}) as number`)).rows[0].number)
    return c.redirect(`${pagePath(c)}/thanks?order=${number}&total=${variant.price * quantity + charge}`, 303)
  } catch (err) {
    if (databaseCode(err) === 'UD011') return reject('soldOut')
    if (databaseCode(err) === 'UD014') return reject('tooMany')
    if (databaseCode(err) !== 'UD010') console.error(err)
    return reject('server')
  }
})

// Shows only what the redirect carried; nothing about the order is read back from the database here.
app.get('/pages/:handle/thanks', async (c) => {
  const store = storeHandle(c)
  const page = store && await loadPage(store, c.req.param('handle'))
  if (!page) return notFound(c)
  const number = Number(c.req.query('order'))
  const total = Number(c.req.query('total'))
  return html(c, (
    <Document title="অর্ডার হয়েছে" description="">
      <div className="sf-page">
        <header className="sf-bar"><div className="sf-wrap">{page.store_name}</div></header>
        <main className="sf-done sf-wrap sf-narrow">
          <h1>ধন্যবাদ, আপনার অর্ডার হয়েছে</h1>
          {Number.isInteger(number) && <p>অর্ডার নম্বর #{new Intl.NumberFormat('bn-BD', { useGrouping: false }).format(number)}</p>}
          {Number.isInteger(total) && total > 0 && <p>পণ্য হাতে পেয়ে দেবেন {taka(total)}</p>}
          <p>অর্ডার নিশ্চিত করতে আমরা শিগগিরই আপনাকে ফোন করব।</p>
          <a className="sf-button sf-button--outline" href={pagePath(c)}>পেজে ফিরে যান</a>
        </main>
      </div>
    </Document>
  ))
})

app.notFound(notFound)

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.STOREFRONT_PORT ?? 8788)
  serve({ fetch: app.fetch, port }, () => console.log(`Storefront on http://{store}.${domain}:${port}`))
}
