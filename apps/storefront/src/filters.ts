// Store filters for collection, all-products and search pages. Plain data and pure functions, shared by the storefront
// (reading the address, filtering, counting) and the API (attribute names may not clash with filter keys).
// The address stays readable and shareable: ?উৎস=সুন্দরবন&উৎস=রাজশাহী&min.ওজন=500&price.max=1000&stock=1

export type AttributeKind = 'choice' | 'number' | 'flag'
export const attributeKinds: readonly AttributeKind[] = ['choice', 'number', 'flag']
export const maxAttributes = 50
export const maxChoices = 100
export const maxNumber = 999_999_999

// Keys the address already uses. An attribute name may not be one of them or start like a range key.
const reservedKeys = new Set(['page', 'q', 'stock', 'sort'])
export const isAttributeName = (name: string) => {
  const n = name.trim()
  return n.length >= 1 && n.length <= 60 && !reservedKeys.has(n.toLowerCase()) && !/^(min|max|price)\./i.test(n) && !/[&=?#]/.test(n)
}

export type FilterAttribute = { id: string; name: string; kind: AttributeKind; unit: string; choices: { id: string; label: string }[] }
// A listed product as filters see it: lowest price, stock, and its filterable values [attribute, choice, number, flag].
export type FilterRow = { id: string; minPrice: number; inStock: boolean; attrs: [string, string | null, number | string | null, boolean | null][] }
export type Range = [number | null, number | null]
export type Selection = { choices: Map<string, Set<string>>; ranges: Map<string, Range>; flags: Set<string>; price: Range; inStock: boolean }

// Bangla or Latin digits, commas allowed; anything else means no bound.
const readNumber = (raw: string | null) => {
  if (raw === null) return null
  const latin = raw.replace(/[০-৯]/g, (d) => String('০১২৩৪৫৬৭৮৯'.indexOf(d))).replace(/[,\s]/g, '')
  if (!/^\d+(\.\d+)?$/.test(latin)) return null
  const n = Number(latin)
  return n <= maxNumber ? n : null
}
const range = (params: URLSearchParams, key: string): Range => [readNumber(params.get(`min.${key}`)), readNumber(params.get(`max.${key}`))]
const inRange = (n: number, [min, max]: Range) => (min === null || n >= min) && (max === null || n <= max)
const hasRange = ([min, max]: Range) => min !== null || max !== null

export function readSelection(params: URLSearchParams, attrs: FilterAttribute[]): Selection {
  const sel: Selection = { choices: new Map(), ranges: new Map(), flags: new Set(), price: range(params, 'price'), inStock: params.get('stock') === '1' }
  for (const a of attrs) {
    if (a.kind === 'choice') {
      const wanted = new Set(params.getAll(a.name).map((v) => v.trim().toLowerCase()))
      const ids = new Set(a.choices.filter((c) => wanted.has(c.label.toLowerCase())).map((c) => c.id))
      if (ids.size) sel.choices.set(a.id, ids)
    } else if (a.kind === 'number') {
      const r = range(params, a.name)
      if (hasRange(r)) sel.ranges.set(a.id, r)
    } else if (params.get(a.name) === '1') sel.flags.add(a.id)
  }
  return sel
}

export const activeFilters = (sel: Selection) =>
  [...sel.choices.values()].reduce((n, s) => n + s.size, 0) + sel.ranges.size + sel.flags.size + (hasRange(sel.price) ? 1 : 0) + (sel.inStock ? 1 : 0)

// Does a product pass every filter, leaving out one attribute's own filter (for that attribute's counts)?
function passes(row: FilterRow, sel: Selection, skip?: string) {
  if (sel.inStock && !row.inStock) return false
  if (skip !== 'price' && !inRange(row.minPrice, sel.price)) return false
  for (const [attr, ids] of sel.choices) if (attr !== skip && !row.attrs.some(([a, c]) => a === attr && c !== null && ids.has(c))) return false
  for (const [attr, r] of sel.ranges) if (attr !== skip && !row.attrs.some(([a, , n]) => a === attr && n !== null && inRange(Number(n), r))) return false
  for (const attr of sel.flags) if (attr !== skip && !row.attrs.some(([a, , , f]) => a === attr && f === true)) return false
  return true
}

export type Facet =
  | { attr: FilterAttribute; kind: 'choice'; choices: { id: string; label: string; count: number; on: boolean }[] }
  | { attr: FilterAttribute; kind: 'number'; low: number; high: number; value: Range }
  | { attr: FilterAttribute; kind: 'flag'; count: number; on: boolean }
export type Filtered = { ids: string[]; facets: Facet[]; price: { low: number; high: number; value: Range } | null }

// The products that match, and what each filter can still offer. Choices within one attribute are "any of"; different
// attributes are "all of". Each attribute's counts ignore its own filter, so picking one choice never hides the others.
export function applyFilters(rows: FilterRow[], attrs: FilterAttribute[], sel: Selection): Filtered {
  const ids = rows.filter((r) => passes(r, sel)).map((r) => r.id)
  const facets: Facet[] = []
  for (const attr of attrs) {
    const pool = rows.filter((r) => passes(r, sel, attr.id))
    if (attr.kind === 'choice') {
      const choices = attr.choices.map((c) => ({ ...c, count: pool.filter((r) => r.attrs.some(([a, ch]) => a === attr.id && ch === c.id)).length, on: sel.choices.get(attr.id)?.has(c.id) ?? false }))
      if (choices.some((c) => c.count > 0 || c.on)) facets.push({ attr, kind: 'choice', choices: choices.filter((c) => c.count > 0 || c.on) })
    } else if (attr.kind === 'number') {
      const values = pool.flatMap((r) => r.attrs.filter(([a, , n]) => a === attr.id && n !== null).map(([, , n]) => Number(n)))
      if (values.length || sel.ranges.has(attr.id)) facets.push({ attr, kind: 'number', low: values.length ? Math.min(...values) : 0, high: values.length ? Math.max(...values) : 0, value: sel.ranges.get(attr.id) ?? [null, null] })
    } else {
      const count = pool.filter((r) => r.attrs.some(([a, , , f]) => a === attr.id && f === true)).length
      if (count > 0 || sel.flags.has(attr.id)) facets.push({ attr, kind: 'flag', count, on: sel.flags.has(attr.id) })
    }
  }
  const prices = rows.filter((r) => passes(r, sel, 'price')).map((r) => r.minPrice)
  return { ids, facets, price: prices.length || hasRange(sel.price) ? { low: prices.length ? Math.min(...prices) : 0, high: prices.length ? Math.max(...prices) : 0, value: sel.price } : null }
}

// The address for a selection (search words kept), for chips, the pager and the clear link.
export function selectionQuery(sel: Selection, attrs: FilterAttribute[], q = '') {
  const params = new URLSearchParams()
  if (q) params.set('q', q)
  for (const a of attrs) {
    if (a.kind === 'choice') for (const c of a.choices) { if (sel.choices.get(a.id)?.has(c.id)) params.append(a.name, c.label) }
    const r = sel.ranges.get(a.id)
    if (r?.[0] != null) params.set(`min.${a.name}`, String(r[0]))
    if (r?.[1] != null) params.set(`max.${a.name}`, String(r[1]))
    if (sel.flags.has(a.id)) params.set(a.name, '1')
  }
  if (sel.price[0] !== null) params.set('min.price', String(sel.price[0]))
  if (sel.price[1] !== null) params.set('max.price', String(sel.price[1]))
  if (sel.inStock) params.set('stock', '1')
  return params.toString()
}

// One active filter taken out, for the chips' remove links.
export function without(sel: Selection, part: { choice?: [string, string]; range?: string; flag?: string; price?: true; stock?: true }): Selection {
  const choices = new Map([...sel.choices].map(([k, v]) => [k, new Set(v)]))
  if (part.choice) { choices.get(part.choice[0])?.delete(part.choice[1]); if (!choices.get(part.choice[0])?.size) choices.delete(part.choice[0]) }
  const ranges = new Map(sel.ranges)
  if (part.range) ranges.delete(part.range)
  const flags = new Set(sel.flags)
  if (part.flag) flags.delete(part.flag)
  return { choices, ranges, flags, price: part.price ? [null, null] : sel.price, inStock: part.stock ? false : sel.inStock }
}
