import { createHash, randomUUID } from 'node:crypto'
import { serve } from '@hono/node-server'
import { sql } from 'drizzle-orm'
import { Hono, type Context } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { renderToString } from 'react-dom/server'
import { tx, type Tx } from '../../api/src/db.ts'
import { publicUrl, readLocalFile } from '../../api/src/storage.ts'
import { isReservedPageHandle, isReservedStoreHandle, pageHref } from './paths.ts'
import { cleanRichText } from './rich.ts'
import { validateRuntime } from '../../api/src/runtime.ts'
import { verifyPassword } from '../../api/src/password.ts'
import { hasCustomHtml, orderBlocks, readPhone, references, walk, type Content, type Section, type Settings } from './schema.ts'
import { isPreset, type PresetId } from './themes.ts'
import { builtInTemplates, readSiteStyle, siteCss, siteFontsHref, styleFromPreset, type SiteStyle, type TemplateType } from './site.ts'
import { catalogCss, collectionHref, type Card, type CollectionLink } from './catalog.tsx'
import { linkedIds, resolveMenu, type IdLinkType, type LinkTargets, type MenuItem, type ResolvedItem } from './menus.ts'
import { cartScript, css, pageScript, PageView, taka, type CartLine, type CartView, type CollectionCard, type Ctx, type GridData, type Img, type OrderValues, type Product, type ProductPage, type ShippingOption, type StoreInfo } from './sections.tsx'

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
// A page with a Custom HTML block runs the seller's own code (scripts, libraries, styles, embeds, outside forms), so it
// gets an open policy instead; the seller is responsible for that code. Our platform stays apart: the dashboard is
// another origin, its session cookie is never sent to stores, and the API refuses requests from other origins.
const openCsp = [
  "default-src 'self' https:", "img-src 'self' https: data: blob:", "media-src 'self' https: blob:", "script-src 'self' 'unsafe-inline' 'unsafe-eval' https:",
  "style-src 'self' 'unsafe-inline' https:", 'font-src https: data:', 'frame-src https:', "connect-src 'self' https:", "form-action 'self' https:", "frame-ancestors 'none'", "base-uri 'none'",
].join('; ')
const cspFor = (pixel: string, custom = false) => custom ? openCsp : [
  "default-src 'self'", "img-src 'self' https: data:", "media-src https:", `script-src ${hash(pageScript)} ${hash(cartScript)}${pixel ? ` ${hash(pixel)} ${pixelHosts}` : ''}`, "style-src 'unsafe-inline' https://fonts.googleapis.com",
  'font-src https://fonts.gstatic.com', "frame-src 'self' https://www.youtube-nocookie.com https://www.facebook.com",
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
    const offers = await offersFor(t, page.store_id, refs.products)
    const products = new Map<string, Product>(productRows.rows.map((p) => [p.id, {
      id: p.id,
      name: p.name,
      offers: offers.get(p.id),
      image: p.image_key ? { url: publicUrl(p.image_key), alt: p.image_alt || p.name, width: p.image_width, height: p.image_height } : null,
      variants: p.variants.map((v) => ({ id: v.id, label: v.options.join(' / ') || p.name, price: v.price, comparePrice: v.comparePrice, available: v.stock === null || v.stock > 0 })),
    }]))
    return { ...page, images, products, shipping: await shippingOptions(t, page.store_id) }
  })
}
type Loaded = NonNullable<Awaited<ReturnType<typeof loadPage>>>

// Automatic discounts running for each product, shown on its order form.
async function offersFor(t: Tx, storeId: string, productIds: string[]) {
  const found = new Map<string, string[]>()
  for (const id of productIds) {
    const rows = (await t.execute<{ title: string }>(sql`select title from storefront_offers(${storeId}::uuid, ${id}::uuid)`)).rows
    if (rows.length > 0) found.set(id, rows.map((r) => r.title))
  }
  return found
}

type VariantRow = { id: string; options: string[]; price: number; comparePrice: number | null; stock: number | null }
type StoreRow = { id: string; name: string; theme: string; site_style: unknown }

async function shippingOptions(t: Tx, storeId: string): Promise<ShippingOption[]> {
  const rows = await t.execute<{ id: string; name: string; note: string; price: number; free_over: number | null; free_min_qty: number | null; free_products: string[] }>(
    sql`select * from storefront_shipping(${storeId}::uuid)`)
  return rows.rows.map((r) => ({ id: r.id, name: r.name, note: r.note, price: r.price, freeOver: r.free_over, freeMinQty: r.free_min_qty, freeProducts: r.free_products }))
}
const image = (key: string | null, alt: string, width: number, height: number): Img | null => (key ? { url: publicUrl(key), alt, width, height } : null)
const toVariants = (rows: VariantRow[], name: string) => rows.map((v) => ({ id: v.id, label: v.options.join(' / ') || name, price: v.price, comparePrice: v.comparePrice, available: v.stock === null || v.stock > 0 }))
const listPageSize = 24

// Everything a store's pages need besides the page itself: its look (Site settings), menus by handle with links
// resolved, logo and contact details, preferences, visible policies and delivery options. Templates are read per page.
// ponytail: loaded on every request; cache per store once the storefront sits behind a CDN.
async function loadStore(handle: string) {
  return tx(null, async (t) => {
    const store = (await t.execute<StoreRow>(sql`select * from storefront_store(${handle})`)).rows[0]
    if (!store) return null
    const collections = (await t.execute<CollectionLink & { id: string; description: string; seo_title: string; seo_description: string; template_id: string | null }>(sql`select * from storefront_collections(${store.id}::uuid)`)).rows
    const style: SiteStyle = (store.site_style ? readSiteStyle(store.site_style) : null) ?? styleFromPreset(themeOf(store.theme))
    const rows = (await t.execute<{ handle: string; items: MenuItem[] }>(sql`select * from storefront_menus(${store.id}::uuid)`)).rows
    const ids = linkedIds(rows.flatMap((r) => r.items))
    const targets: LinkTargets = new Map(ids.length
      ? (await t.execute<{ id: string; type: IdLinkType; handle: string }>(sql`select * from storefront_link_targets(${store.id}::uuid, ${`{${ids.join(',')}}`}::uuid[])`)).rows.map((r) => [r.id, { type: r.type, handle: r.handle }])
      : [])
    const menus: Record<string, ResolvedItem[]> = Object.fromEntries(rows.map((r) => [r.handle, resolveMenu(r.items, targets)]))
    // Until the seller builds a main menu, the header lists their collections.
    if (!menus['main-menu']?.length) menus['main-menu'] = collections.map((x) => ({ title: x.name, href: collectionHref(x.handle), children: [] }))
    const info = (await t.execute<{ logo_key: string | null; logo_width: number; logo_height: number; phone: string; whatsapp: string; email: string; address: string; facebook: string }>(sql`select * from storefront_store_info(${store.id}::uuid)`)).rows[0]
    const storeInfo: StoreInfo = { name: store.name, logo: info ? image(info.logo_key, store.name, info.logo_width, info.logo_height) : null, phone: info?.phone ?? '', whatsapp: info?.whatsapp ?? '', email: info?.email ?? '', address: info?.address ?? '', facebook: info?.facebook ?? '' }
    const prefs = (await t.execute<{ home_title: string; home_description: string; share_key: string | null; share_width: number; share_height: number; password_hash: string | null; password_message: string }>(sql`select * from storefront_preferences(${store.id}::uuid)`)).rows[0]
    const policyRows = (await t.execute<{ kind: string; handle: string | null }>(sql`select k.kind, storefront_policy(${store.id}::uuid, k.kind) as handle from unnest(array['refund', 'terms', 'privacy', 'shipping', 'contact']) as k(kind)`)).rows
    const policies = Object.fromEntries(policyRows.filter((r) => r.handle).map((r) => [r.kind, pageHref(r.handle!)])) as Ctx['policies']
    return { ...store, collections, style, menus, info: storeInfo, prefs, policies, shipping: await shippingOptions(t, store.id) }
  })
}
type LoadedStore = NonNullable<Awaited<ReturnType<typeof loadStore>>>

async function listing(storeId: string, collectionId: string | null, page: number, size = listPageSize) {
  const listPageSize = size
  const rows = await tx(null, (t) => t.execute<{ id: string; name: string; handle: string; min_price: number; compare_price: number | null; image_key: string | null; image_alt: string; image_width: number; image_height: number; in_stock: boolean }>(
    sql`select * from storefront_listing(${storeId}::uuid, ${collectionId}::uuid, ${listPageSize + 1}, ${(page - 1) * listPageSize})`))
  const cards: Card[] = rows.rows.slice(0, listPageSize).map((r) => ({ id: r.id, name: r.name, handle: r.handle, price: r.min_price, comparePrice: r.compare_price, image: image(r.image_key, r.image_alt || r.name, r.image_width, r.image_height), inStock: r.in_stock }))
  return { cards, hasMore: rows.rows.length > listPageSize }
}

async function loadProduct(storeId: string, handle: string) {
  const row = (await tx(null, (t) => t.execute<{ id: string; name: string; description: string; seo_title: string; seo_description: string; status: string; images: { key: string; alt: string; width: number; height: number }[]; variants: VariantRow[]; template_id: string | null }>(
    sql`select * from storefront_product(${storeId}::uuid, ${handle})`))).rows[0]
  if (!row) return null
  const images = row.images.map((m) => image(m.key, m.alt || row.name, m.width, m.height)!)
  const offers = await tx(null, (t) => offersFor(t, storeId, [row.id]))
  const product: Product = { id: row.id, name: row.name, image: images[0] ?? null, variants: toVariants(row.variants, row.name), offers: offers.get(row.id) }
  return { ...row, images, product }
}
type LoadedProduct = NonNullable<Awaited<ReturnType<typeof loadProduct>>>

const pageNumber = (c: Context) => Math.min(Math.max(Number(c.req.query('page')) || 1, 1), 1000)

const themeOf = (theme: string | undefined): PresetId => (isPreset(theme) ? theme : 'fresh')

// The store's colours, fonts and width (Site settings), written into every page's <head>.
type Look = { css: string; fontsHref: string | null; custom: string }
const lookOf = (style: SiteStyle): Look => ({ css: siteCss(style), fontsHref: siteFontsHref(style), custom: style.css })
const defaultLook = lookOf(styleFromPreset('fresh'))

function Document({ title, description, noindex, canonical, shareImage, look = defaultLook, pixel, children }: { title: string; description: string; noindex?: boolean; canonical?: string; shareImage?: Img; look?: Look; pixel?: string; children: React.ReactNode }) {
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
        {look.fontsHref && <link rel="stylesheet" href={look.fontsHref} />}
        <style dangerouslySetInnerHTML={{ __html: css + catalogCss + look.css }} />
        {pixel && <script dangerouslySetInnerHTML={{ __html: pixel }} />}
      </head>
      <body>{children}</body>
    </html>
  )
}

const html = (c: Context, body: React.ReactElement, status: 200 | 404 | 422 = 200, pixel = '', custom = false) =>
  c.html(`<!doctype html>${renderToString(body)}`, status, { 'content-security-policy': cspFor(pixel, custom), 'x-content-type-options': 'nosniff', 'referrer-policy': 'strict-origin-when-cross-origin', 'cache-control': 'no-cache' })

function notFound(c: Context) {
  return html(c, (
    <Document title="পেজটি পাওয়া যায়নি" description="">
      <main className="sf-done sf-wrap"><h1>পেজটি পাওয়া যায়নি</h1><p>লিংকটি ঠিক আছে কিনা দেখুন, অথবা দোকানের সাথে যোগাযোগ করুন।</p></main>
    </Document>
  ), 404)
}

const pagePath = (c: Context) => pageHref(c.req.param('handle')!)
const productPath = (c: Context) => `/products/${encodeURIComponent(c.req.param('handle')!)}`

// The template drawn for one type: the chosen one if it is published and of that type, else the store's default for the
// type, else the built-in template. Published content was checked by readContent when it was saved.
async function templateOf(storeId: string, type: TemplateType, chosen: string | null = null): Promise<Content> {
  const row = (await tx(null, (t) => t.execute<{ doc: Content | null }>(sql`select storefront_template(${storeId}::uuid, ${type}, ${chosen}::uuid) as doc`))).rows[0]
  return row?.doc ?? builtInTemplates[type]
}
// Images the given templates use, for drawing them.
async function templateImages(storeId: string, contents: Content[]) {
  const ids = [...new Set(contents.flatMap((c) => references(c).media))]
  const rows = ids.length ? (await tx(null, (t) => t.execute<{ id: string; key: string; alt: string; width: number; height: number }>(sql`select * from storefront_media(${storeId}::uuid, ${`{${ids.join(',')}}`}::uuid[])`))).rows : []
  return new Map<string, Img>(rows.map((m) => [m.id, { url: publicUrl(m.key), alt: m.alt, width: m.width, height: m.height }]))
}

// Store context for any page drawn with the store's header and footer: the store, menus, theme images.
const storeCtx = (store: LoadedStore, path: string) => ({
  store: store.info,
  menus: store.menus,
  current: { path },
})

async function renderPage(c: Context, page: Loaded, order?: Ctx['order']) {
  const pixel = pixelScript(await trackingFor(page.store_id))
  const store = await loadStore(storeHandle(c)!)
  const canvas = page.content.canvas
  // The page's chosen header and footer templates (or the store's defaults), when its canvas shows them.
  const header = store && canvas?.header !== false ? (await templateOf(store.id, 'header', canvas?.headerId ?? null)).sections : []
  const footer = store && canvas?.footer !== false ? (await templateOf(store.id, 'footer', canvas?.footerId ?? null)).sections : []
  const frameImages = store ? await templateImages(store.id, [{ version: 2, sections: [...header, ...footer] }]) : new Map<string, Img>()
  const ctx: Ctx = {
    preview: false,
    live: true,
    shipping: page.shipping,
    image: (id) => (id ? page.images.get(id) ?? frameImages.get(id) : undefined),
    product: (id) => (id ? page.products.get(id) : undefined),
    orderAction: pagePath(c),
    checkoutToken: order?.values.checkout || randomUUID(),
    order,
    ...(store ? storeCtx(store, pagePath(c)) : {}),
    cartCount: cartItems(c).reduce((n, [, q]) => n + q, 0),
    policies: store?.policies,
  }
  const frame = store ? { header, footer } : undefined
  return html(c, (
    <Document title={page.seo_title || page.title} description={page.seo_description} canonical={`${c.get('origin')}${pagePath(c)}`} look={store ? lookOf(store.style) : undefined} pixel={pixel}>
      <PageView content={page.content} ctx={ctx} storeName={page.store_name} frame={frame} themeCss={store?.style.css} />
      <script dangerouslySetInnerHTML={{ __html: pageScript }} />
    </Document>
  ), order ? 422 : 200, pixel, hasCustomHtml(page.content) || Boolean(frame && hasCustomHtml({ version: 2, sections: [...frame.header, ...frame.footer] })))
}

// Product list blocks in a template and the theme's header and footer, with their settings.
function gridBlocks(sections: Section[]) {
  const found: { id: string; settings: Settings }[] = []
  for (const s of sections) {
    if (s.type === 'productGrid') found.push({ id: s.id, settings: s.settings })
    for (const n of walk(s.children ?? [])) if (n.block?.type === 'productGrid') found.push({ id: n.id, settings: n.block.settings })
  }
  return found
}
const usesBlock = (sections: Section[], type: string) => sections.some((s) => s.type === type || [...walk(s.children ?? [])].some((n) => n.block?.type === type))

type Here = { path: string; product?: ProductPage; collection?: { id: string; name: string; handle: string; description: string }; page?: { title: string; body: string; policy: string | null }; cart?: CartView; search?: { query: string; cards: Card[] } }

// A store page drawn with templates: the page's own template (the item's choice or the default), inside the header and
// footer templates, with the data its store blocks need loaded first.
async function renderThemed(c: Context, store: LoadedStore, kind: TemplateType, here: Here, meta: { title: string; description: string; canonical?: string; shareImage?: Img; noindex?: boolean; status?: 200 | 404 | 422; templateId?: string | null; order?: Ctx['order']; orderAction?: string }) {
  if (locked(c, store)) return passwordPage(c, store)
  // The template's chosen header and footer (blank: the store's defaults; switched off: none).
  const template = await templateOf(store.id, kind, meta.templateId ?? null)
  const canvas = template.canvas
  const none: Content = { version: 2, sections: [] }
  const [header, footer] = await Promise.all([
    canvas?.header === false ? none : templateOf(store.id, 'header', canvas?.headerId ?? null),
    canvas?.footer === false ? none : templateOf(store.id, 'footer', canvas?.footerId ?? null),
  ])
  const all = [...header.sections, ...template.sections, ...footer.sections]
  const images = await templateImages(store.id, [template, header, footer])
  const page = pageNumber(c)
  const grids = new Map<string, GridData>()
  for (const block of gridBlocks(all)) {
    const limit = typeof block.settings.limit === 'number' ? block.settings.limit : listPageSize
    const source = block.settings.source
    if (source === 'collection') {
      const picked = store.collections.find((x) => x.id === block.settings.collection)
      const data = picked ? await listing(store.id, picked.id, 1, limit) : { cards: [], hasMore: false }
      grids.set(block.id, { ...data, page: 1, base: picked ? collectionHref(picked.handle) : '/products' })
    } else if (source === 'all') {
      grids.set(block.id, { ...(await listing(store.id, null, 1, limit)), page: 1, base: '/products' })
    } else {
      grids.set(block.id, { ...(await listing(store.id, here.collection?.id ?? null, page, limit)), page, base: here.path })
    }
  }
  const collections: CollectionCard[] | undefined = usesBlock(all, 'collectionList')
    ? (await tx(null, (t) => t.execute<{ id: string; name: string; handle: string; image_key: string | null; image_width: number; image_height: number }>(sql`select * from storefront_collection_cards(${store.id}::uuid)`))).rows.map((r) => ({ id: r.id, name: r.name, handle: r.handle, image: image(r.image_key, r.name, r.image_width, r.image_height) }))
    : undefined
  const pixel = pixelScript(await trackingFor(store.id))
  const ctx: Ctx = {
    preview: false,
    live: true,
    shipping: store.shipping,
    image: (id) => (id ? images.get(id) : undefined),
    product: (id) => (id && here.product?.id === id ? here.product.product : undefined),
    orderAction: meta.orderAction,
    checkoutToken: meta.order?.values.checkout || randomUUID(),
    order: meta.order,
    store: store.info,
    menus: store.menus,
    current: here,
    grid: (id) => grids.get(id),
    collections,
    cartCount: cartItems(c).reduce((n, [, q]) => n + q, 0),
    policies: store.policies,
    cart: here.cart,
    search: here.search,
  }
  return html(c, (
    <Document title={meta.title} description={meta.description} canonical={meta.canonical} shareImage={meta.shareImage} noindex={meta.noindex} look={lookOf(store.style)} pixel={pixel}>
      <PageView content={{ ...template, canvas: { header: true, footer: true } }} ctx={ctx} storeName={store.name} frame={{ header: header.sections, footer: footer.sections }} themeCss={store.style.css} />
      {here.product && <script dangerouslySetInnerHTML={{ __html: pageScript }} />}
      {here.cart && here.cart.lines.length > 0 && <script dangerouslySetInnerHTML={{ __html: cartScript }} />}
    </Document>
  ), meta.status ?? 200, pixel, hasCustomHtml({ version: 2, sections: all }))
}

// A missing page inside a known store: the theme's 404 template.
const storeNotFound = (c: Context, store: LoadedStore) =>
  renderThemed(c, store, 'notFound', { path: new URL(c.req.url).pathname }, { title: 'পেজটি পাওয়া যায়নি', description: '', noindex: true, status: 404 })

async function renderProduct(c: Context, store: LoadedStore, item: LoadedProduct, order?: Ctx['order']) {
  // Description HTML was cleaned by cleanDescription when it was saved; the block cleans it again before drawing.
  const plain = item.description.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160)
  const here: Here = { path: productPath(c), product: { id: item.id, name: item.name, description: item.description, images: item.images, product: item.product } }
  return renderThemed(c, store, 'product', here, {
    title: item.seo_title || item.name, description: item.seo_description || plain, canonical: `${c.get('origin')}${productPath(c)}`,
    shareImage: item.images[0], noindex: item.status === 'unlisted', status: order ? 422 : 200, order, orderAction: productPath(c), templateId: item.template_id,
  })
}

async function thanks(c: Context, storeId: string, storeName: string, back: string, look?: Look) {
  const token = c.req.query('receipt') ?? ''
  const receipt = isCheckoutToken(token) ? (await tx(null, (t) => t.execute<{ number: number; total: number }>(sql`select * from storefront_receipt(${storeId}::uuid, ${token}::uuid)`))).rows[0] : undefined
  const number = receipt?.number ?? 0
  const total = receipt?.total ?? 0
  const pixel = pixelScript(await trackingFor(storeId), receipt ? { total, receipt: token } : undefined)
  return html(c, (
    <Document title="অর্ডার হয়েছে" description="" look={look} pixel={pixel}>
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

const storeLook = async (handle: string) => {
  const store = await loadStore(handle)
  return store ? lookOf(store.style) : undefined
}

app.get('/', async (c) => {
  const handle = storeHandle(c)
  const store = handle && await loadStore(handle)
  if (!store) return notFound(c)
  const share = store.prefs?.share_key ? image(store.prefs.share_key, store.name, store.prefs.share_width, store.prefs.share_height) ?? undefined : undefined
  return renderThemed(c, store, 'home', { path: '/' }, { title: store.prefs?.home_title || store.name, description: store.prefs?.home_description ?? '', canonical: `${c.get('origin')}/`, shareImage: share })
})

app.get('/collections/:handle', async (c) => {
  const handle = storeHandle(c)
  const store = handle && await loadStore(handle)
  if (!store) return notFound(c)
  const collection = store.collections.find((x) => x.handle === c.req.param('handle'))
  if (!collection) return storeNotFound(c, store)
  const path = collectionHref(collection.handle)
  return renderThemed(c, store, 'collection', { path, collection: { id: collection.id, name: collection.name, handle: collection.handle, description: collection.description } }, {
    title: collection.seo_title || collection.name, description: collection.seo_description, canonical: `${c.get('origin')}${path}`, templateId: collection.template_id,
  })
})

// Every listed product, and every collection a buyer can open: the targets of the "All products" and "All collections" menu links.
app.get('/products', async (c) => {
  const handle = storeHandle(c)
  const store = handle && await loadStore(handle)
  if (!store) return notFound(c)
  return renderThemed(c, store, 'products', { path: '/products' }, { title: `সব পণ্য · ${store.name}`, description: '', canonical: `${c.get('origin')}/products` })
})

app.get('/collections', async (c) => {
  const handle = storeHandle(c)
  const store = handle && await loadStore(handle)
  if (!store) return notFound(c)
  return renderThemed(c, store, 'collections', { path: '/collections' }, { title: `সব কালেকশন · ${store.name}`, description: '', canonical: `${c.get('origin')}/collections` })
})

app.get('/products/:handle', async (c) => {
  const handle = storeHandle(c)
  const store = handle && await loadStore(handle)
  if (!store) return notFound(c)
  const item = await loadProduct(store.id, c.req.param('handle'))
  return item ? renderProduct(c, store, item) : storeNotFound(c, store)
})

// Password protection (Online store › Preferences): while a store has a password, its store pages show the password page
// instead; landing pages stay open so ads keep working. The cookie holds a digest of the store and its password hash,
// so changing the password closes every open visit.
const passName = 'store_pass'
const passToken = (store: LoadedStore) => createHash('sha256').update(`${store.id}:${store.prefs?.password_hash}`).digest('base64url')
const locked = (c: Context, store: LoadedStore) => Boolean(store.prefs?.password_hash) && getCookie(c, passName) !== passToken(store)

function passwordPage(c: Context, store: LoadedStore, wrong = false) {
  return html(c, (
    <Document title={store.name} description="" noindex look={lookOf(store.style)}>
      <main className="sf-done sf-wrap sf-narrow sf-password">
        {store.info.logo ? <img className="sf-password__logo" src={store.info.logo.url} alt={store.name} /> : <h1>{store.name}</h1>}
        <p>{store.prefs?.password_message || 'দোকানটি শিগগিরই খুলছে। পাসওয়ার্ড থাকলে নিচে লিখুন।'}</p>
        <form method="post" action="/password" className="sf-search">
          <input type="password" name="password" required maxLength={100} autoComplete="current-password" aria-label="পাসওয়ার্ড" aria-invalid={wrong || undefined} placeholder="পাসওয়ার্ড" />
          <button type="submit" className="sf-button">ঢুকুন</button>
        </form>
        {wrong && <p className="sf-error" role="alert">পাসওয়ার্ডটি মেলেনি। আবার চেষ্টা করুন।</p>}
      </main>
    </Document>
  ), wrong ? 422 : 200)
}

app.get('/password', async (c) => {
  const handle = storeHandle(c)
  const store = handle && await loadStore(handle)
  if (!store) return notFound(c)
  return locked(c, store) ? passwordPage(c, store) : c.redirect('/', 302)
})

// ponytail: no attempt limit; each try costs one password hash. Add a per-store limit (or the CDN's) if stores see guessing.
app.post('/password', async (c) => {
  const handle = storeHandle(c)
  const store = handle && await loadStore(handle)
  if (!store || !store.prefs?.password_hash) return c.redirect('/', 303)
  const form = await c.req.parseBody()
  const typed = typeof form.password === 'string' ? form.password.trim().slice(0, 100) : ''
  if (!typed || !(await verifyPassword(typed, store.prefs.password_hash))) return passwordPage(c, store, true)
  setCookie(c, passName, passToken(store), { path: '/', sameSite: 'Lax', httpOnly: true, secure: process.env.NODE_ENV === 'production', maxAge: 30 * 86_400 })
  return c.redirect('/', 303)
})

// The cart lives in a cookie as [[variant id, quantity], …]: no account and no table. Prices are never in it; every
// view reads them from the database, and the order is priced by place_cart_checkout alone. At most 20 items, like the
// order form, because place_order_lines caps a storefront order there.
const cartName = 'cart'
const maxCartItems = 20
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
function cartItems(c: Context): [string, number][] {
  try {
    const raw = JSON.parse(Buffer.from(getCookie(c, cartName) ?? '', 'base64url').toString() || '[]')
    if (!Array.isArray(raw)) return []
    const items: [string, number][] = []
    for (const item of raw.slice(0, maxCartItems)) {
      if (Array.isArray(item) && typeof item[0] === 'string' && uuidPattern.test(item[0]) && Number.isInteger(item[1]) && item[1] >= 1 && item[1] <= maxCartItems) items.push([item[0], item[1]])
    }
    return items
  } catch {
    return []
  }
}
function saveCart(c: Context, items: [string, number][]) {
  let room = maxCartItems
  const kept = items.flatMap(([id, q]) => { const take = Math.min(q, room); room -= take; return take > 0 ? [[id, take] as [string, number]] : [] })
  if (!kept.length) return deleteCookie(c, cartName, { path: '/' })
  setCookie(c, cartName, Buffer.from(JSON.stringify(kept)).toString('base64url'), { path: '/', sameSite: 'Lax', httpOnly: true, secure: process.env.NODE_ENV === 'production', maxAge: 30 * 86_400 })
}
// Cart forms are posted from the store's own pages; a post from another site never changes the cart.
const fromThisSite = (c: Context) => {
  const origin = c.req.header('origin')
  if (!origin || origin === 'null') return true
  const host = URL.canParse(origin) ? new URL(origin).host : null
  return host !== null && (host === new URL(c.req.url).host || host === (c.req.header('x-forwarded-host') ?? c.req.header('host')))
}

async function cartLines(storeId: string, items: [string, number][]): Promise<CartLine[]> {
  if (!items.length) return []
  const rows = (await tx(null, (t) => t.execute<{ variant_id: string; product_id: string; product_name: string; product_handle: string; options: string[]; price: number; compare_price: number | null; stock: number | null; image_key: string | null; image_alt: string; image_width: number; image_height: number }>(
    sql`select * from storefront_cart_lines(${storeId}::uuid, ${`{${items.map(([id]) => id).join(',')}}`}::uuid[])`))).rows
  return items.flatMap(([id, qty]) => {
    const r = rows.find((x) => x.variant_id === id)
    return r ? [{ variantId: id, productId: r.product_id, name: r.product_name, handle: r.product_handle, label: r.options.join(' / '), price: r.price, comparePrice: r.compare_price, qty, image: image(r.image_key, r.image_alt || r.product_name, r.image_width, r.image_height), available: r.stock === null || r.stock >= qty }] : []
  })
}

async function renderCart(c: Context, store: LoadedStore, problem?: { error: string; values: OrderValues }) {
  const lines = await cartLines(store.id, cartItems(c))
  const cart: CartView = { lines, subtotal: lines.reduce((n, l) => n + l.price * l.qty, 0), qty: lines.reduce((n, l) => n + l.qty, 0), error: problem?.error, values: problem?.values, checkoutToken: problem?.values.checkout || randomUUID() }
  return renderThemed(c, store, 'cart', { path: '/cart', cart }, { title: `কার্ট · ${store.name}`, description: '', noindex: true, status: problem ? 422 : 200 })
}

app.get('/cart', async (c) => {
  const handle = storeHandle(c)
  const store = handle && await loadStore(handle)
  return store ? renderCart(c, store) : notFound(c)
})

app.post('/cart/add', async (c) => {
  const handle = storeHandle(c)
  const store = handle && await loadStore(handle)
  if (!store || !fromThisSite(c)) return notFound(c)
  if (locked(c, store)) return c.redirect('/password', 303)
  const form = await c.req.parseBody()
  const variant = typeof form.variant === 'string' ? form.variant : ''
  const quantity = Math.min(Math.max(Number.parseInt(String(form.quantity ?? '1'), 10) || 1, 1), maxCartItems)
  // Only a variant of this store's listed or unlisted product goes in.
  if (!uuidPattern.test(variant) || !(await cartLines(store.id, [[variant, 1]])).length) return c.redirect('/cart', 303)
  const items = cartItems(c)
  const at = items.findIndex(([id]) => id === variant)
  if (at >= 0) items[at] = [variant, Math.min(items[at][1] + quantity, maxCartItems)]
  else items.push([variant, quantity])
  saveCart(c, items)
  return c.redirect('/cart', 303)
})

app.post('/cart/update', async (c) => {
  if (!fromThisSite(c)) return notFound(c)
  const form = await c.req.parseBody()
  const variant = typeof form.variant === 'string' ? form.variant : ''
  const raw = Array.isArray(form.quantity) ? form.quantity[form.quantity.length - 1] : form.quantity
  const quantity = Math.min(Math.max(Number.parseInt(String(raw ?? ''), 10) || 0, 0), maxCartItems)
  saveCart(c, cartItems(c).flatMap(([id, q]) => (id === variant ? (quantity > 0 ? [[id, quantity] as [string, number]] : []) : [[id, q] as [string, number]])))
  return c.redirect('/cart', 303)
})

// Checkout: a plain form, so it works without JavaScript. The database prices the lines, delivery and discount, takes
// stock and gives back the receipt; on success the cart empties and the buyer sees the confirmed number and total.
app.post('/cart', async (c) => {
  const handle = storeHandle(c)
  const store = handle && await loadStore(handle)
  if (!store) return notFound(c)
  if (locked(c, store)) return c.redirect('/password', 303)
  const form = await c.req.parseBody()
  if (form.website) return c.redirect('/cart/thanks', 303)
  const values: OrderValues = {}
  for (const key of ['name', 'phone', 'address', 'rate', 'coupon', 'checkout'] as const) values[key] = typeof form[key] === 'string' ? (form[key] as string).trim() : ''
  const reject = (error: string) => renderCart(c, store, { error, values })
  const lines = await cartLines(store.id, cartItems(c))
  const phone = readPhone(values.phone ?? '')
  if (!lines.length) return c.redirect('/cart', 303)
  if (lines.some((l) => !l.available)) return reject('soldOut')
  if (!isCheckoutToken(values.checkout)) { values.checkout = ''; return reject('checkout') }
  if (!values.name || values.name.length > 100) return reject('name')
  if (!phone) return reject('phone')
  if (!values.address || values.address.length < 5 || values.address.length > 500) return reject('address')
  if (!uuidPattern.test(values.rate ?? '')) return reject('rate')
  if ((values.coupon ?? '').length > 30) return reject('coupon')
  try {
    await tx(null, (t) => t.execute(sql`select * from place_cart_checkout(${values.checkout}::uuid, ${store.id}::uuid, ${JSON.stringify(lines.map((l) => ({ variant: l.variantId, qty: l.qty })))}::jsonb, ${values.name}, ${phone}, ${values.address}, ${values.rate}::uuid, ${values.coupon ?? ''})`))
    deleteCookie(c, cartName, { path: '/' })
    return c.redirect(`/cart/thanks?receipt=${values.checkout}`, 303)
  } catch (err) {
    const code = databaseCode(err)
    if (code === 'UD017') return reject('checkout')
    if (code === 'UD011') return reject('soldOut')
    if (code === 'UD014') return reject('tooMany')
    if (code === 'UD015') return reject('blocked')
    if (code === 'UD016') return reject('coupon')
    if (code === 'UD019') return reject('rate')
    if (code !== 'UD010') console.error(err)
    return reject('server')
  }
})

app.get('/cart/thanks', async (c) => {
  const handle = storeHandle(c)
  const store = handle && await loadStore(handle)
  return store ? thanks(c, store.id, store.name, '/', lookOf(store.style)) : notFound(c)
})

app.get('/search', async (c) => {
  const handle = storeHandle(c)
  const store = handle && await loadStore(handle)
  if (!store) return notFound(c)
  const query = (c.req.query('q') ?? '').trim().slice(0, 100)
  const rows = query ? (await tx(null, (t) => t.execute<{ id: string; name: string; handle: string; min_price: number; compare_price: number | null; image_key: string | null; image_alt: string; image_width: number; image_height: number; in_stock: boolean }>(sql`select * from storefront_search(${store.id}::uuid, ${query}, 48)`))).rows : []
  const cards: Card[] = rows.map((r) => ({ id: r.id, name: r.name, handle: r.handle, price: r.min_price, comparePrice: r.compare_price, image: image(r.image_key, r.image_alt || r.name, r.image_width, r.image_height), inStock: r.in_stock }))
  return renderThemed(c, store, 'search', { path: '/search', search: { query, cards } }, { title: query ? `${query} · ${store.name}` : `খুঁজুন · ${store.name}`, description: '', noindex: true })
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
  const section = orderBlocks(page.content).find((s) => s.id === form?.get('section'))
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
  if (locked(c, store)) return c.redirect('/password', 303)
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
  return isReservedPageHandle(handle) ? thanks(c, page.store_id, page.store_name, pagePath(c), await storeLook(store)) : c.redirect(`${pageHref(handle)}/thanks${new URL(c.req.url).search}`, 308)
})

app.get('/products/:handle/thanks', async (c) => {
  const handle = storeHandle(c)
  const store = handle && await loadStore(handle)
  return store ? thanks(c, store.id, store.name, productPath(c), lookOf(store.style)) : notFound(c)
})

// Specific catalog, media and system routes above always take precedence.
// Store pages (About, policies, …): the theme's page template (or the page's chosen alternate) with the page's text.
type StorePageRow = { id: string; title: string; body: string; policy: string | null; template_id: string | null; seo_title: string; seo_description: string }
async function renderStorePage(c: Context, storeHandleValue: string, pageHandle: string) {
  const store = await loadStore(storeHandleValue)
  if (!store) return notFound(c)
  const page = (await tx(null, (t) => t.execute<StorePageRow>(sql`select * from storefront_store_page(${store.id}::uuid, ${pageHandle})`))).rows[0]
  if (!page) return storeNotFound(c, store)
  const plain = cleanRichText(page.body).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160)
  return renderThemed(c, store, 'page', { path: pageHref(pageHandle), page: { title: page.title, body: page.body, policy: page.policy } }, {
    title: page.seo_title || page.title, description: page.seo_description || plain, canonical: `${c.get('origin')}${pageHref(pageHandle)}`, templateId: page.template_id,
  })
}

// /policies/refund and friends: a stable address for each policy, whatever its page is called.
app.get('/policies/:kind', async (c) => {
  const handle = storeHandle(c)
  const store = handle && await loadStore(handle)
  if (!store) return notFound(c)
  const found = (await tx(null, (t) => t.execute<{ handle: string | null }>(sql`select storefront_policy(${store.id}::uuid, ${c.req.param('kind')}) as handle`))).rows[0]?.handle
  return found ? c.redirect(pageHref(found), 302) : notFound(c)
})

app.get('/:handle', async (c) => {
  const handle = c.req.param('handle')
  if (isReservedPageHandle(handle) || handle.includes('.')) return notFound(c)
  const store = storeHandle(c)
  const page = store && await loadPage(store, handle)
  if (page) return renderPage(c, page)
  return store ? renderStorePage(c, store, handle) : notFound(c)
})
app.post('/:handle', async (c) => isReservedPageHandle(c.req.param('handle')) ? notFound(c) : submitLandingPage(c))
app.get('/:handle/thanks', async (c) => {
  const handle = c.req.param('handle')
  if (isReservedPageHandle(handle)) return notFound(c)
  const store = storeHandle(c)
  const page = store && await loadPage(store, handle)
  return page ? thanks(c, page.store_id, page.store_name, pagePath(c), await storeLook(store)) : notFound(c)
})
app.notFound(notFound)

if (import.meta.url === `file://${process.argv[1]}`) {
  validateRuntime('storefront')
  const port = Number(process.env.PORT ?? process.env.STOREFRONT_PORT ?? 8788)
  serve({ fetch: app.fetch, hostname: '0.0.0.0', port }, () => console.log(`Storefront on http://{store}.${domain}:${port}`))
}
