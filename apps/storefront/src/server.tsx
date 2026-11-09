import { createHash, randomUUID } from 'node:crypto'
import { serve } from '@hono/node-server'
import { sql } from 'drizzle-orm'
import { Hono, type Context } from 'hono'
import { renderToString } from 'react-dom/server'
import { tx, type Tx } from '../../api/src/db.ts'
import { publicUrl, readLocalFile } from '../../api/src/storage.ts'
import { isReservedPageHandle, isReservedStoreHandle, pageHref } from './paths.ts'
import { validateRuntime } from '../../api/src/runtime.ts'
import { readPhone, references, type Content } from './schema.ts'
import { isPreset, presetCss, presetFontsHref, type PresetId } from './themes.ts'
import { catalogCss, collectionHref, Gallery, Pager, Price, ProductGrid, StoreLayout, type Card, type CollectionLink, type MenuLink } from './catalog.tsx'
import { css, pageScript, PageView, SectionView, taka, type Ctx, type Img, type OrderValues, type Product, type ShippingOption } from './sections.tsx'

// Stores live at {handle}.{STOREFRONT_DOMAIN}; in development that is {handle}.localhost:8788.
// A seller's own domain arrives through the domains proxy (deploy/proxy) as Host domains.{STOREFRONT_DOMAIN}, with the buyer's host in X-Store-Host.
const domain = process.env.STOREFRONT_DOMAIN ?? 'localhost'
const proxyHost = `domains.${domain}`

// Set for every request by the middleware below: the store being shown, and the address its links and canonical URLs use.
declare module 'hono' {
  interface ContextVariableMap { handle: string | null; origin: string }
}
const hash = (script: string) => `'sha256-${createHash('sha256').update(script).digest('base64')}'`
const pixelHosts = 'https://connect.facebook.net https://analytics.tiktok.com'
// Each response allows exactly its own inline scripts by hash: the page script, and the store's pixel loader if it has one.
const cspFor = (pixel: string) => [
  "default-src 'self'", "img-src 'self' https: data:", `script-src ${hash(pageScript)}${pixel ? ` ${hash(pixel)} ${pixelHosts}` : ''}`, "style-src 'unsafe-inline' https://fonts.googleapis.com",
  'font-src https://fonts.gstatic.com', 'frame-src https://www.youtube-nocookie.com https://www.facebook.com',
  `connect-src 'self'${pixel ? ' https://www.facebook.com https://*.tiktok.com https://*.tiktokw.us' : ''}`, "form-action 'self'", "frame-ancestors 'none'", "base-uri 'none'",
].join('; ')

// Meta and TikTok's standard loaders. The IDs were checked when saved and are checked again here, since they go into a script.
// ponytail: browser pixels only; add server-side events (Meta Conversions API) when sellers bring an access token.
function pixelScript(tracking: { meta_pixel: string; tiktok_pixel: string } | undefined, order?: { total: number; receipt: string }) {
  const meta = /^[0-9]{5,20}$/.test(tracking?.meta_pixel ?? '') ? tracking!.meta_pixel : ''
  const tiktok = /^[A-Z0-9]{5,30}$/.test(tracking?.tiktok_pixel ?? '') ? tracking!.tiktok_pixel : ''
  const value = order && Number.isInteger(order.total) && order.total > 0 ? order.total : 0
  const parts: string[] = []
  if (meta) {
    parts.push(`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${meta}');fbq('track','PageView');${order ? `if(purchaseOnce('meta:${order.receipt}'))fbq('track','Purchase',{value:${value},currency:'BDT'},{eventID:'${order.receipt}'});` : ''}`)
  }
  if (tiktok) {
    parts.push(`!function(w,d,t){w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"];ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e};ttq.load=function(e,n){var i="https://analytics.tiktok.com/i18n/pixel/events.js";ttq._i=ttq._i||{};ttq._i[e]=[];ttq._i[e]._u=i;ttq._t=ttq._t||{};ttq._t[e]=+new Date;ttq._o=ttq._o||{};ttq._o[e]=n||{};var o=d.createElement("script");o.type="text/javascript";o.async=!0;o.src=i+"?sdkid="+e+"&lib="+t;var a=d.getElementsByTagName("script")[0];a.parentNode.insertBefore(o,a)};ttq.load('${tiktok}');ttq.page();${order ? `if(purchaseOnce('tiktok:${order.receipt}'))ttq.track('PlaceAnOrder',{value:${value},currency:'BDT'},{event_id:'${order.receipt}'});` : ''}}(window,document,'ttq');`)
  }
  const once = order ? "function purchaseOnce(k){try{if(sessionStorage.getItem(k))return false;sessionStorage.setItem(k,'1')}catch(e){}return true}" : ''
  return once + parts.join('')
}

async function trackingFor(storeId: string) {
  return (await tx(null, (t) => t.execute<{ meta_pixel: string; tiktok_pixel: string }>(sql`select * from storefront_tracking(${storeId}::uuid)`))).rows[0]
}

function subdomainHandle(host: string) {
  const handle = host.endsWith(`.${domain}`) ? host.slice(0, -domain.length - 1) : ''
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(handle) && handle.length <= 63 && !isReservedStoreHandle(handle) ? handle : null
}

const storeHandle = (c: Context) => c.get('handle')

const domainStore = async (host: string) =>
  (await tx(null, (t) => t.execute<{ handle: string | null }>(sql`select storefront_domain_store(${host}) as handle`))).rows[0].handle
const liveDomain = async (handle: string) =>
  (await tx(null, (t) => t.execute<{ domain: string | null }>(sql`select storefront_live_domain(${handle}) as domain`))).rows[0].domain

type PageRow = { store_id: string; store_name: string; theme: string; page_id: string; title: string; seo_title: string; seo_description: string; content: Content }

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
    return { ...page, images, products, shipping: await shippingOptions(t, page.store_id) }
  })
}
type Loaded = NonNullable<Awaited<ReturnType<typeof loadPage>>>

type VariantRow = { id: string; options: string[]; price: number; comparePrice: number | null; stock: number | null }
type StoreRow = { id: string; name: string; theme: string }

async function shippingOptions(t: Tx, storeId: string): Promise<ShippingOption[]> {
  const rows = await t.execute<{ id: string; name: string; note: string; price: number; free_over: number | null; free_min_qty: number | null; free_products: string[] }>(
    sql`select * from storefront_shipping(${storeId}::uuid)`)
  return rows.rows.map((r) => ({ id: r.id, name: r.name, note: r.note, price: r.price, freeOver: r.free_over, freeMinQty: r.free_min_qty, freeProducts: r.free_products }))
}
const image = (key: string | null, alt: string, width: number, height: number): Img | null => (key ? { url: publicUrl(key), alt, width, height } : null)
const toVariants = (rows: VariantRow[], name: string) => rows.map((v) => ({ id: v.id, label: v.options.join(' / ') || name, price: v.price, comparePrice: v.comparePrice, available: v.stock === null || v.stock > 0 }))
const listPageSize = 24

async function loadStore(handle: string) {
  return tx(null, async (t) => {
    const store = (await t.execute<StoreRow>(sql`select * from storefront_store(${handle})`)).rows[0]
    if (!store) return null
    const collections = (await t.execute<CollectionLink & { id: string; description: string; seo_title: string; seo_description: string }>(sql`select * from storefront_collections(${store.id}::uuid)`)).rows
    const [{ menu }] = (await t.execute<{ menu: MenuLink[] }>(sql`select storefront_menu(${store.id}::uuid) as menu`)).rows
    const links: MenuLink[] = menu.length > 0 ? menu : collections.map((x) => ({ label: x.name, href: collectionHref(x.handle) }))
    return { ...store, collections, links, shipping: await shippingOptions(t, store.id) }
  })
}
type LoadedStore = NonNullable<Awaited<ReturnType<typeof loadStore>>>

async function listing(storeId: string, collectionId: string | null, page: number) {
  const rows = await tx(null, (t) => t.execute<{ id: string; name: string; handle: string; min_price: number; compare_price: number | null; image_key: string | null; image_alt: string; image_width: number; image_height: number; in_stock: boolean }>(
    sql`select * from storefront_listing(${storeId}::uuid, ${collectionId}::uuid, ${listPageSize + 1}, ${(page - 1) * listPageSize})`))
  const cards: Card[] = rows.rows.slice(0, listPageSize).map((r) => ({ id: r.id, name: r.name, handle: r.handle, price: r.min_price, comparePrice: r.compare_price, image: image(r.image_key, r.image_alt || r.name, r.image_width, r.image_height), inStock: r.in_stock }))
  return { cards, hasMore: rows.rows.length > listPageSize }
}

async function loadProduct(storeId: string, handle: string) {
  const row = (await tx(null, (t) => t.execute<{ id: string; name: string; description: string; seo_title: string; seo_description: string; status: string; images: { key: string; alt: string; width: number; height: number }[]; variants: VariantRow[] }>(
    sql`select * from storefront_product(${storeId}::uuid, ${handle})`))).rows[0]
  if (!row) return null
  const images = row.images.map((m) => image(m.key, m.alt || row.name, m.width, m.height)!)
  const product: Product = { id: row.id, name: row.name, image: images[0] ?? null, variants: toVariants(row.variants, row.name) }
  return { ...row, images, product }
}
type LoadedProduct = NonNullable<Awaited<ReturnType<typeof loadProduct>>>

const pageNumber = (c: Context) => Math.min(Math.max(Number(c.req.query('page')) || 1, 1), 1000)

const themeOf = (theme: string | undefined): PresetId => (isPreset(theme) ? theme : 'fresh')

function Document({ title, description, noindex, canonical, shareImage, theme, pixel, children }: { title: string; description: string; noindex?: boolean; canonical?: string; shareImage?: Img; theme?: string; pixel?: string; children: React.ReactNode }) {
  return (
    <html lang="bn">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{title}</title>
        <link rel="icon" href="/favicon.ico" />
        {description && <meta name="description" content={description} />}
        {(noindex || process.env.ROBOTS_NOINDEX === 'true') && <meta name="robots" content="noindex" />}
        <meta property="og:title" content={title} />
        <meta property="og:type" content="website" />
        <meta property="og:locale" content="bn_BD" />
        {description && <meta property="og:description" content={description} />}
        {canonical && <meta property="og:url" content={canonical} />}
        {shareImage && <>
          <meta property="og:image" content={shareImage.url} />
          <meta property="og:image:alt" content={shareImage.alt} />
          <meta property="og:image:width" content={String(shareImage.width)} />
          <meta property="og:image:height" content={String(shareImage.height)} />
        </>}
        {canonical && <link rel="canonical" href={canonical} />}
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href={presetFontsHref(themeOf(theme))} />
        <style dangerouslySetInnerHTML={{ __html: css + catalogCss + presetCss(themeOf(theme)) }} />
        {pixel && <script dangerouslySetInnerHTML={{ __html: pixel }} />}
      </head>
      <body>{children}</body>
    </html>
  )
}

const html = (c: Context, body: React.ReactElement, status: 200 | 404 | 422 = 200, pixel = '') =>
  c.html(`<!doctype html>${renderToString(body)}`, status, { 'content-security-policy': cspFor(pixel), 'x-content-type-options': 'nosniff', 'referrer-policy': 'strict-origin-when-cross-origin', 'cache-control': 'no-cache' })

function notFound(c: Context) {
  return html(c, (
    <Document title="পেজটি পাওয়া যায়নি" description="">
      <main className="sf-done sf-wrap"><h1>পেজটি পাওয়া যায়নি</h1><p>লিংকটি ঠিক আছে কিনা দেখুন, অথবা দোকানের সাথে যোগাযোগ করুন।</p></main>
    </Document>
  ), 404)
}

const pagePath = (c: Context) => pageHref(c.req.param('handle')!)
const productPath = (c: Context) => `/products/${encodeURIComponent(c.req.param('handle')!)}`

async function renderPage(c: Context, page: Loaded, order?: Ctx['order']) {
  const pixel = pixelScript(await trackingFor(page.store_id))
  const ctx: Ctx = {
    preview: false,
    shipping: page.shipping,
    image: (id) => (id ? page.images.get(id) : undefined),
    product: (id) => (id ? page.products.get(id) : undefined),
    orderAction: pagePath(c),
    checkoutToken: order?.values.checkout || randomUUID(),
    order,
  }
  return html(c, (
    <Document title={page.seo_title || page.title} description={page.seo_description} canonical={`${c.get('origin')}${pagePath(c)}`} theme={page.theme} pixel={pixel}>
      <PageView content={page.content} ctx={ctx} storeName={page.store_name} />
      <script dangerouslySetInnerHTML={{ __html: pageScript }} />
    </Document>
  ), order ? 422 : 200, pixel)
}

// The product page's order form is the same component as a landing page's, given this product.
const buySection = (productId: string) => ({ id: 'buy', type: 'order' as const, hidden: false, settings: { heading: 'অর্ডার করুন', product: productId, button: 'অর্ডার নিশ্চিত করুন' } })

async function renderProduct(c: Context, store: LoadedStore, item: LoadedProduct, order?: Ctx['order']) {
  const pixel = pixelScript(await trackingFor(store.id))
  const ctx: Ctx = {
    preview: false,
    shipping: store.shipping,
    image: () => undefined,
    product: (id) => (id === item.id ? item.product : undefined),
    orderAction: productPath(c),
    checkoutToken: order?.values.checkout || randomUUID(),
    order,
  }
  const prices = item.product.variants.map((v) => v.price)
  const compare = Math.max(...item.product.variants.map((v) => v.comparePrice ?? 0))
  // Description HTML was cleaned by cleanDescription when it was saved, which is what makes it safe to show here.
  const plain = item.description.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160)
  return html(c, (
    <Document title={item.seo_title || item.name} description={item.seo_description || plain} canonical={`${c.get('origin')}${productPath(c)}`} shareImage={item.images[0]} noindex={item.status === 'unlisted'} theme={store.theme} pixel={pixel}>
      <StoreLayout storeName={store.name} links={store.links}>
        <div className="sf-wrap sf-product">
          <Gallery images={item.images} name={item.name} />
          <div>
            <h1>{item.name}</h1>
            <Price price={Math.min(...prices)} comparePrice={compare > 0 ? compare : null} />
            {item.product.variants.some((v) => v.available) ? <a className="sf-button" href="#buy">এখনই অর্ডার করুন</a> : <p className="sf-error">এখন স্টকে নেই</p>}
            {item.description && <div className="sf-description" dangerouslySetInnerHTML={{ __html: item.description }} />}
          </div>
        </div>
        <SectionView s={buySection(item.id)} ctx={ctx} />
      </StoreLayout>
      <script dangerouslySetInnerHTML={{ __html: pageScript }} />
    </Document>
  ), order ? 422 : 200, pixel)
}

async function thanks(c: Context, storeId: string, storeName: string, back: string, theme: string) {
  const token = c.req.query('receipt') ?? ''
  const receipt = isCheckoutToken(token) ? (await tx(null, (t) => t.execute<{ number: number; total: number }>(sql`select * from storefront_receipt(${storeId}::uuid, ${token}::uuid)`))).rows[0] : undefined
  const number = receipt?.number ?? 0
  const total = receipt?.total ?? 0
  const pixel = pixelScript(await trackingFor(storeId), receipt ? { total, receipt: token } : undefined)
  return html(c, (
    <Document title="অর্ডার হয়েছে" description="" theme={theme} pixel={pixel}>
      <div className="sf-page">
        <header className="sf-bar"><div className="sf-wrap">{storeName}</div></header>
        <main className="sf-done sf-wrap sf-narrow">
          <h1>ধন্যবাদ, আপনার অর্ডার হয়েছে</h1>
          {Number.isInteger(number) && number > 0 && <p>অর্ডার নম্বর #{new Intl.NumberFormat('bn-BD', { useGrouping: false }).format(number)}</p>}
          {Number.isInteger(total) && total > 0 && <p>পণ্য হাতে পেয়ে দেবেন {taka(total)}</p>}
          <p>অর্ডার নিশ্চিত করতে আমরা শিগগিরই আপনাকে ফোন করব।</p>
          <a className="sf-button sf-button--outline" href={back}>ফিরে যান</a>
        </main>
      </div>
    </Document>
  ), 200, pixel)
}

export const app = new Hono()

// Works out which store a request is for. Paths starting with /_ are the service's own (health, the proxy's certificate check).
// Every storefront page is public, so trusting X-Store-Host shows nothing a buyer could not see on that store's own domain.
// ponytail: put a shared secret on the proxy's headers before a CDN cache sits in front of the storefront.
// ponytail: one database lookup per page for the live-domain redirect; cache it if it shows up in response times.
app.use('*', async (c, next) => {
  if (c.req.path.startsWith('/_')) return next()
  const url = new URL(c.req.url)
  const rest = `${url.pathname}${url.search}`
  const host = (c.req.header('x-forwarded-host') ?? c.req.header('host') ?? '').split(':')[0].toLowerCase()
  if (host === proxyHost) {
    const asked = (c.req.header('x-store-host') ?? '').split(':')[0].toLowerCase()
    const bare = asked.replace(/^www\./, '')
    if (asked !== bare) return c.redirect(`https://${bare}${rest}`, 301)
    c.set('handle', bare ? await domainStore(bare) : null)
    c.set('origin', `https://${bare}`)
    return next()
  }
  const handle = subdomainHandle(host)
  // Once a store's own domain is live, its uddokta.live pages send buyers there. Form posts stay, so open checkouts still work.
  const live = handle && c.req.method === 'GET' ? await liveDomain(handle) : null
  if (live) return c.redirect(`https://${live}${rest}`, 302)
  c.set('handle', handle)
  c.set('origin', process.env.NODE_ENV === 'production' ? `https://${host}` : `${url.protocol}//${host}${url.port ? `:${url.port}` : ''}`)
  return next()
})

// Caddy asks before getting a certificate, so only sellers' domains (and their www) get one.
app.get('/_domains/allowed', async (c) => {
  const asked = (c.req.query('domain') ?? '').toLowerCase().replace(/^www\./, '')
  return asked && await domainStore(asked) ? c.text('ok') : c.text('unknown', 404)
})

app.get('/robots.txt', (c) => c.text(process.env.ROBOTS_NOINDEX === 'true' ? 'User-agent: *\nDisallow: /\n' : 'User-agent: *\nAllow: /\n'))
// Every page links here, and browsers ask on their own: the store's favicon from Settings › Store, or nothing.
app.get('/favicon.ico', async (c) => {
  const handle = storeHandle(c)
  const key = handle && (await tx(null, (t) => t.execute<{ key: string | null }>(sql`select storefront_favicon(${handle}) as key`))).rows[0].key
  c.header('cache-control', 'public, max-age=300')
  return key ? c.redirect(publicUrl(key), 302) : c.body(null, 404)
})
app.get('/_health', async (c) => {
  c.header('Cache-Control', 'no-store')
  try { await tx(null, (t) => t.execute(sql`select 1`)); return c.json({ status: 'ok' }) }
  catch { return c.json({ status: 'unavailable' }, 503) }
})

// Development stand-in for the public R2 bucket, as in the API.
app.get('/api/media-files/:store/:file', async (c) => {
  const data = await readLocalFile(`${c.req.param('store')}/${c.req.param('file')}`)
  if (!data) return c.notFound()
  return c.body(new Uint8Array(data), 200, { 'content-type': 'image/webp', 'x-content-type-options': 'nosniff', 'cache-control': 'public, max-age=31536000, immutable' })
})

app.get('/', async (c) => {
  const handle = storeHandle(c)
  const store = handle && await loadStore(handle)
  if (!store) return notFound(c)
  const page = pageNumber(c)
  const { cards, hasMore } = await listing(store.id, null, page)
  const pixel = pixelScript(await trackingFor(store.id))
  return html(c, (
    <Document title={store.name} description="" theme={store.theme} pixel={pixel}>
      <StoreLayout storeName={store.name} links={store.links}>
        <section className="sf-section">
          <div className="sf-wrap">
            {cards.length > 0 ? <ProductGrid cards={cards} /> : <p className="sf-empty">শিগগিরই নতুন পণ্য আসছে।</p>}
            <Pager page={page} hasMore={hasMore} base="/" />
          </div>
        </section>
      </StoreLayout>
    </Document>
  ), 200, pixel)
})

app.get('/collections/:handle', async (c) => {
  const handle = storeHandle(c)
  const store = handle && await loadStore(handle)
  const collection = store && store.collections.find((x) => x.handle === c.req.param('handle'))
  if (!store || !collection) return notFound(c)
  const page = pageNumber(c)
  const { cards, hasMore } = await listing(store.id, collection.id, page)
  const pixel = pixelScript(await trackingFor(store.id))
  return html(c, (
    <Document title={collection.seo_title || collection.name} description={collection.seo_description} theme={store.theme} pixel={pixel}>
      <StoreLayout storeName={store.name} links={store.links} current={collectionHref(collection.handle)}>
        <section className="sf-section">
          <div className="sf-wrap">
            <h1 className="sf-heading">{collection.name}</h1>
            {collection.description && <div className="sf-description sf-narrow" dangerouslySetInnerHTML={{ __html: collection.description }} />}
            <ProductGrid cards={cards} />
            <Pager page={page} hasMore={hasMore} base={collectionHref(collection.handle)} />
          </div>
        </section>
      </StoreLayout>
    </Document>
  ), 200, pixel)
})

app.get('/products/:handle', async (c) => {
  const handle = storeHandle(c)
  const store = handle && await loadStore(handle)
  const item = store && await loadProduct(store.id, c.req.param('handle'))
  return store && item ? renderProduct(c, store, item) : notFound(c)
})

// Keep links shared before the short-URL rollout working. Reserved legacy handles remain accessible here.
app.get('/pages/:handle', async (c) => {
  const store = storeHandle(c)
  const handle = c.req.param('handle')
  const page = store && await loadPage(store, handle)
  if (!page) return notFound(c)
  return isReservedPageHandle(handle) ? renderPage(c, page) : c.redirect(`${pageHref(handle)}${new URL(c.req.url).search}`, 308)
})

const isCheckoutToken = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)

const databaseCode = (err: unknown) => (err as { code?: string; cause?: { code?: string } }).cause?.code ?? (err as { code?: string }).code

// Both order forms post here as plain forms, so they work with JavaScript off and on slow phones.
// Checks what the buyer typed; the price, charge and stock are then the database's (place_order).
async function takeOrder(c: Context, o: { storeId: string; pageId: string | null; source: 'landing_page' | 'website'; product: Product; sectionId: string; back: string; reject: (order: NonNullable<Ctx['order']>) => Response | Promise<Response> }) {
  const form = await c.req.parseBody()
  // A bot that filled the hidden field is shown success, so it has no reason to try again, and nothing is saved.
  if (form.website) return c.redirect(`${o.back}/thanks`, 303)
  const values: OrderValues = {}
  for (const key of ['variant', 'quantity', 'name', 'phone', 'address', 'rate', 'coupon', 'checkout'] as const) values[key] = typeof form[key] === 'string' ? (form[key] as string).trim() : ''
  const reject = (error: string) => o.reject({ sectionId: o.sectionId, error, values })

  const variant = o.product.variants.find((v) => v.id === values.variant)
  const quantity = Number(values.quantity || 1)
  const phone = readPhone(values.phone ?? '')
  if (!variant) return reject('variant')
  if (!isCheckoutToken(values.checkout)) {
    values.checkout = ''
    return reject('checkout')
  }
  if (!values.name || values.name.length > 100) return reject('name')
  if (!phone) return reject('phone')
  if (!values.address || values.address.length < 5 || values.address.length > 500) return reject('address')
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(values.rate ?? '')) return reject('rate')
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) return reject('server')
  if ((values.coupon ?? '').length > 30) return reject('coupon')

  try {
    await tx(null, async (t) => (await t.execute<{ number: number; total: number }>(sql`
      select * from place_checkout(${values.checkout}::uuid, ${o.storeId}::uuid, ${o.pageId}::uuid, ${variant.id}::uuid, ${quantity}, ${values.name}, ${phone}, ${values.address}, ${values.rate}::uuid, ${o.source}, ${values.coupon ?? ''})`)).rows[0])
    return c.redirect(`${o.back}/thanks?receipt=${values.checkout}`, 303)
  } catch (err) {
    if (databaseCode(err) === 'UD017') return reject('checkout')
    if (databaseCode(err) === 'UD011') return reject('soldOut')
    if (databaseCode(err) === 'UD014') return reject('tooMany')
    if (databaseCode(err) === 'UD015') return reject('blocked')
    if (databaseCode(err) === 'UD016') return reject('coupon')
    if (databaseCode(err) === 'UD019') return reject('rate')
    if (databaseCode(err) !== 'UD010') console.error(err)
    return reject('server')
  }
}

const submitLandingPage = async (c: Context) => {
  const store = storeHandle(c)
  const page = store && await loadPage(store, c.req.param('handle')!)
  if (!page) return notFound(c)
  const form = await c.req.raw.clone().formData().catch(() => null)
  const section = page.content.sections.find((s) => s.id === form?.get('section') && s.type === 'order' && !s.hidden)
  const product = section && page.products.get(section.settings.product as string)
  if (!section || !product) return notFound(c)
  return takeOrder(c, {
    storeId: page.store_id, pageId: page.page_id, source: 'landing_page', product, sectionId: section.id,
    back: pagePath(c), reject: (order) => renderPage(c, page, order),
  })
}
app.post('/pages/:handle', submitLandingPage)

app.post('/products/:handle', async (c) => {
  const handle = storeHandle(c)
  const store = handle && await loadStore(handle)
  const item = store && await loadProduct(store.id, c.req.param('handle'))
  if (!store || !item) return notFound(c)
  return takeOrder(c, {
    storeId: store.id, pageId: null, source: 'website', product: item.product, sectionId: 'buy',
    back: productPath(c), reject: (order) => renderProduct(c, store, item, order),
  })
})

// What a buyer has typed so far, sent by the page script. Saved only with a valid number; answers the same either way.
app.post('/drafts', async (c) => {
  const handle = storeHandle(c)
  const store = handle && await loadStore(handle)
  const form = await c.req.parseBody().catch(() => ({} as Record<string, unknown>))
  const field = (key: string, max: number) => (typeof form[key] === 'string' ? (form[key] as string).trim().slice(0, max) : '')
  const phone = readPhone(field('phone', 20))
  if (store && phone) {
    await tx(null, (t) => t.execute(sql`select save_checkout_draft(${store.id}::uuid, null, ${phone}, ${field('name', 100)}, ${field('address', 500)}, ${field('product', 300)})`))
  }
  return c.body(null, 204)
})

// An opaque, store-scoped receipt supplies the confirmed number and total. URL amounts are never trusted.
app.get('/pages/:handle/thanks', async (c) => {
  const store = storeHandle(c)
  const handle = c.req.param('handle')!
  const page = store && await loadPage(store, handle)
  if (!page) return notFound(c)
  return isReservedPageHandle(handle) ? thanks(c, page.store_id, page.store_name, pagePath(c), page.theme) : c.redirect(`${pageHref(handle)}/thanks${new URL(c.req.url).search}`, 308)
})

app.get('/products/:handle/thanks', async (c) => {
  const handle = storeHandle(c)
  const store = handle && await loadStore(handle)
  return store ? thanks(c, store.id, store.name, productPath(c), store.theme) : notFound(c)
})

// Specific catalog, media and system routes above always take precedence.
app.get('/:handle', async (c) => {
  const handle = c.req.param('handle')
  if (isReservedPageHandle(handle) || handle.includes('.')) return notFound(c)
  const store = storeHandle(c)
  const page = store && await loadPage(store, handle)
  return page ? renderPage(c, page) : notFound(c)
})
app.post('/:handle', async (c) => isReservedPageHandle(c.req.param('handle')) ? notFound(c) : submitLandingPage(c))
app.get('/:handle/thanks', async (c) => {
  const handle = c.req.param('handle')
  if (isReservedPageHandle(handle)) return notFound(c)
  const store = storeHandle(c)
  const page = store && await loadPage(store, handle)
  return page ? thanks(c, page.store_id, page.store_name, pagePath(c), page.theme) : notFound(c)
})
app.notFound(notFound)

if (import.meta.url === `file://${process.argv[1]}`) {
  validateRuntime('storefront')
  const port = Number(process.env.PORT ?? process.env.STOREFRONT_PORT ?? 8788)
  serve({ fetch: app.fetch, hostname: '0.0.0.0', port }, () => console.log(`Storefront on http://{store}.${domain}:${port}`))
}
