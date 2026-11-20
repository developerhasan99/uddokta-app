import { cleanRichText, isRich, toRich } from 'storefront/rich'

// Reads a Shopify or WooCommerce product export (CSV) into our product shape. Best effort: whatever maps cleanly
// comes in, anything that cannot is left blank or skipped with a reason, and the seller finishes it by hand.

export type ImportVariant = { options: string[]; price: number; comparePrice: number | null; cost: number | null; sku: string; stock: number | null; image: string | null }
export type ImportImage = { url: string; alt: string }
// noPrice: saved as a draft at ৳0; addedVariants: combinations the file lacked were added out of stock;
// imagesCut: only the first 20 images; descriptionDropped: too long to keep.
export type ImportNote = 'noPrice' | 'addedVariants' | 'imagesCut' | 'descriptionDropped'
export type ImportProduct = {
  // Sent as the product's address: an existing product with it means "already in the store", so a second run skips it.
  handle: string; name: string; description: string; status: 'active' | 'unlisted' | 'draft'
  productType: string; brand: string; tags: string[]; seoTitle: string; seoDescription: string
  options: { name: string; values: string[] }[]; variants: ImportVariant[]; images: ImportImage[]; notes: ImportNote[]
}
export type SkipReason = 'tooManyVariants' | 'unsupportedType' | 'noName'
export type ImportFile = { source: 'shopify' | 'woocommerce'; products: ImportProduct[]; skipped: { name: string; reason: SkipReason }[] }

// The same limits as the product API (apps/api/src/products.ts).
const maxVariants = 100
const maxValues = 50
const maxOptions = 3
const maxImages = 20
const maxDescription = 50_000

// RFC 4180: quoted fields may hold commas, doubled quotes and line breaks.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = text.charCodeAt(0) === 0xfeff ? 1 : 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c !== '"') field += c
      else if (text[i + 1] === '"') { field += '"'; i++ } else quoted = false
    } else if (c === '"') quoted = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field); rows.push(row); row = []; field = ''
    } else field += c
  }
  if (field || row.length) { row.push(field); rows.push(row) }
  return rows.filter((r) => r.some((f) => f.trim()))
}

type Row = (column: string) => string

const cut = (text: string, max: number) => text.trim().slice(0, max).trim()
const unique = (list: string[]) => [...new Set(list.filter(Boolean))]
const amount = (text: string) => {
  const n = Number(text.trim())
  return text.trim() && Number.isFinite(n) && n >= 0 ? Math.min(Math.round(n), 1_000_000_000) : null
}
const count = (text: string) => {
  const n = Number(text.trim())
  return text.trim() && Number.isFinite(n) ? Math.max(0, Math.min(Math.round(n), 1_000_000_000)) : null
}
const tagList = (text: string) => unique(text.split(',').map((t) => cut(t, 50))).slice(0, 30)
const httpUrl = (text: string) => (/^https?:\/\/\S+$/i.test(text.trim()) ? text.trim() : '')

// Our rich text keeps a few tags (storefront/rich.ts). Headings shift to the two we have; scripts and styles go
// with their contents. WooCommerce writes plain paragraphs separated by blank lines, like WordPress does.
function richText(text: string, paragraphs: boolean) {
  let html = text.replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, '').replace(/<(\/?)h1\b/gi, '<$1h2').replace(/<(\/?)h[4-6]\b/gi, '<$1h3')
  if (!isRich(html)) return toRich(html.trim())
  if (paragraphs) html = html.split(/\n\s*\n/).map((p) => (/^\s*<(p|ul|ol|h\d|div|table|blockquote)\b/i.test(p) ? p : `<p>${p.trim().replace(/\n/g, '<br>')}</p>`)).join('')
  return cleanRichText(html).replace(/<p>\s*<\/p>/g, '').trim()
}

type RawVariant = Omit<ImportVariant, 'price'> & { price: number | null }

// Our products have one variant for every combination of option values. Variants the file has are matched by their
// values (a blank value, WooCommerce's "any", matches every value); missing combinations are added out of stock.
function buildProduct(base: Omit<ImportProduct, 'options' | 'variants' | 'images' | 'notes'>, rawOptions: { name: string; values: string[] }[], raw: RawVariant[], gallery: ImportImage[]): ImportProduct | SkipReason {
  const options = rawOptions.map((o) => ({ name: cut(o.name, 50), values: unique(o.values.map((v) => cut(v, 100))) })).filter((o) => o.name && o.values.length > 0)
  const total = options.reduce((n, o) => n * o.values.length, 1)
  if (options.length > maxOptions || options.some((o) => o.values.length > maxValues) || total > maxVariants) return 'tooManyVariants'
  const notes: ImportNote[] = []
  const variants: ImportVariant[] = []
  const usedSku = new Set<string>()
  const first = raw[0]
  const known = raw.map((v) => ({ v, options: v.options.map((x) => cut(x, 100)) }))
  const combos = options.reduce<string[][]>((list, o) => list.flatMap((combo) => o.values.map((v) => [...combo, v])), [[]])
  for (const combo of combos) {
    const exact = known.find((x) => combo.every((value, i) => x.options[i] === value))
    const match = exact ?? known.find((x) => combo.every((value, i) => !x.options[i] || x.options[i] === value))
    if (!match && options.length) notes.push('addedVariants')
    const from = match?.v ?? first
    if (from?.price == null) notes.push('noPrice')
    const sku = from && !usedSku.has(from.sku) ? from.sku : ''
    usedSku.add(sku)
    variants.push({
      options: combo, price: from?.price ?? 0, comparePrice: from?.comparePrice ?? null, cost: from?.cost ?? null, sku,
      stock: match ? match.v.stock : 0, image: match ? match.v.image : null,
    })
  }
  const images = unique([...gallery.map((i) => i.url), ...variants.map((v) => v.image ?? '')])
  if (images.length > maxImages) notes.push('imagesCut')
  const kept = images.slice(0, maxImages)
  for (const v of variants) if (v.image && !kept.includes(v.image)) v.image = null
  let description = base.description
  if (description.length > maxDescription) { description = ''; notes.push('descriptionDropped') }
  return {
    ...base, description, status: notes.includes('noPrice') ? 'draft' : base.status, options, variants, notes: unique(notes) as ImportNote[],
    images: kept.map((url) => ({ url, alt: gallery.find((i) => i.url === url)?.alt ?? '' })),
  }
}

function readShopify(header: string[], rows: Row[]): ImportFile {
  const file: ImportFile = { source: 'shopify', products: [], skipped: [] }
  const groups = new Map<string, Row[]>()
  for (const row of rows) {
    const handle = row('Handle').trim()
    if (handle) groups.set(handle, [...(groups.get(handle) ?? []), row])
  }
  const tracksStock = header.includes('Variant Inventory Qty')
  for (const [handle, group] of groups) {
    const head = group[0]
    const name = cut(head('Title'), 200)
    if (!name) { file.skipped.push({ name: handle, reason: 'noName' }); continue }
    const slots = [1, 2, 3].filter((n) => head(`Option${n} Name`).trim())
    const variantRows = group.filter((r) => r('Option1 Value').trim() || r('Variant Price').trim())
    const isDefault = slots.length === 1 && head('Option1 Name').trim() === 'Title' && variantRows.every((r) => ['Default Title', ''].includes(r('Option1 Value').trim()))
    const used = isDefault ? [] : slots
    const raw: RawVariant[] = variantRows.map((r) => {
      const price = amount(r('Variant Price'))
      const compare = amount(r('Variant Compare At Price'))
      const tracked = tracksStock && r('Variant Inventory Qty').trim() && r('Variant Inventory Tracker').trim() !== ''
      return {
        options: used.map((n) => r(`Option${n} Value`)), price, comparePrice: compare !== null && price !== null && compare > price ? compare : null,
        cost: amount(r('Cost per item')), sku: cut(r('Variant SKU'), 100), stock: tracked ? count(r('Variant Inventory Qty')) : null, image: httpUrl(r('Variant Image')) || null,
      }
    })
    const gallery = group.map((r) => ({ url: httpUrl(r('Image Src')), alt: cut(r('Image Alt Text'), 500), position: Number(r('Image Position')) || 0 }))
      .filter((i) => i.url).sort((a, b) => a.position - b.position)
    const status = head('Status').trim().toLowerCase()
    const published = (head('Published') || head('Published on online store')).trim().toLowerCase()
    const product = buildProduct({
      handle: cut(handle, 200), name, description: richText(head('Body (HTML)'), false),
      status: status && status !== 'active' ? 'draft' : published === 'false' ? 'unlisted' : 'active',
      productType: cut(head('Type') || head('Product Category').split('>').pop() || '', 100), brand: cut(head('Vendor'), 100), tags: tagList(head('Tags')),
      seoTitle: cut(head('SEO Title'), 300), seoDescription: cut(head('SEO Description'), 1000),
    }, used.map((n) => ({ name: head(`Option${n} Name`), values: variantRows.map((r) => r(`Option${n} Value`)) })), raw, gallery.map(({ url, alt }) => ({ url, alt })))
    if (typeof product === 'string') file.skipped.push({ name, reason: product })
    else file.products.push(product)
  }
  return file
}

// WooCommerce escapes commas inside list cells as "\,".
const wooList = (text: string) => text.split(/(?<!\\),/).map((v) => v.replace(/\\,/g, ',').trim()).filter(Boolean)

function readWoo(header: string[], rows: Row[]): ImportFile {
  const file: ImportFile = { source: 'woocommerce', products: [], skipped: [] }
  const slots = header.flatMap((h) => /^Attribute (\d+) name$/.exec(h)?.[1] ?? [])
  const attributes = (r: Row) => slots.map((n) => ({ name: r(`Attribute ${n} name`).trim(), values: wooList(r(`Attribute ${n} value(s)`)) })).filter((a) => a.name)
  const types = (r: Row) => r('Type').split(',').map((t) => t.trim().toLowerCase())
  const children = new Map<string, Row[]>()
  for (const r of rows) {
    if (!types(r).includes('variation')) continue
    const parent = r('Parent').trim()
    children.set(parent, [...(children.get(parent) ?? []), r])
  }
  const costOf = (r: Row) => amount(r('Cost of goods') || r('Meta: _wc_cog_cost'))
  const priceOf = (r: Row) => {
    const regular = amount(r('Regular price'))
    const sale = amount(r('Sale price'))
    return sale !== null && regular !== null && sale < regular ? { price: sale, comparePrice: regular } : { price: regular ?? sale, comparePrice: null }
  }
  const stockOf = (r: Row) => count(r('Stock')) ?? (r('In stock?').trim() === '0' ? 0 : null)
  const imagesOf = (r: Row) => wooList(r('Images')).map(httpUrl).filter(Boolean)
  for (const r of rows) {
    const kind = types(r)
    if (kind.includes('variation')) continue
    const name = cut(r('Name'), 200)
    if (!name) { file.skipped.push({ name: r('SKU') || r('ID'), reason: 'noName' }); continue }
    if (!kind.includes('simple') && !kind.includes('variable')) { file.skipped.push({ name, reason: 'unsupportedType' }); continue }
    const published = r('Published').trim()
    const base = {
      handle: name, name, description: richText((r('Description') || r('Short description')).replace(/\\n/g, '\n'), true),
      status: (published === '1' ? (r('Visibility in catalog').trim() === 'hidden' ? 'unlisted' : 'active') : 'draft') as ImportProduct['status'],
      productType: cut(wooList(r('Categories'))[0]?.split('>').pop() ?? '', 100), brand: cut(wooList(r('Brands'))[0] ?? '', 100), tags: tagList(r('Tags').replace(/\\,/g, ' ')),
      seoTitle: '', seoDescription: '',
    }
    const gallery = imagesOf(r).map((url) => ({ url, alt: '' }))
    let product: ImportProduct | SkipReason
    if (kind.includes('variable')) {
      const id = r('ID').trim()
      const sku = r('SKU').trim()
      const variations = [...(id ? children.get(`id:${id}`) ?? [] : []), ...(sku ? children.get(sku) ?? [] : [])]
      const parentOptions = attributes(r)
      // Options are the attributes the variations use; their values are the ones the variations name, or every
      // value of the parent's attribute when a variation says "any".
      const names = unique(variations.flatMap((v) => attributes(v).map((a) => a.name)))
      const valueOf = (v: Row, option: string) => attributes(v).find((a) => a.name.toLowerCase() === option.toLowerCase())?.values[0] ?? ''
      const options = names.map((option) => {
        const named = variations.map((v) => valueOf(v, option))
        const all = parentOptions.find((a) => a.name.toLowerCase() === option.toLowerCase())?.values ?? []
        return { name: option, values: named.some((v) => !v) ? unique([...named, ...all]) : unique(named) }
      })
      const raw = variations.map((v) => ({ options: names.map((option) => valueOf(v, option)), ...priceOf(v), cost: costOf(v), sku: cut(v('SKU'), 100), stock: stockOf(v), image: imagesOf(v)[0] ?? null }))
      product = buildProduct(base, options, raw, gallery)
    } else {
      product = buildProduct(base, [], [{ options: [], ...priceOf(r), cost: costOf(r), sku: cut(r('SKU'), 100), stock: stockOf(r), image: null }], gallery)
    }
    if (typeof product === 'string') file.skipped.push({ name, reason: product })
    else file.products.push(product)
  }
  return file
}

// Null when the file is neither a Shopify nor a WooCommerce product export.
export function readProductFile(text: string): ImportFile | null {
  const [header, ...body] = parseCsv(text)
  if (!header) return null
  const names = header.map((h) => h.trim())
  const rows: Row[] = body.map((cells) => (column) => {
    const i = names.indexOf(column)
    return i < 0 ? '' : cells[i] ?? ''
  })
  if (names.includes('Handle') && names.includes('Title') && names.includes('Variant Price')) return readShopify(names, rows)
  if (names.includes('Type') && names.includes('Name') && names.includes('Regular price')) return readWoo(names, rows)
  return null
}
