// Store filters and product attributes as the buyer sees them. The panel is a plain GET form (works without script);
// filterScript only applies a change at once and leaves empty fields out of the address.
import type { ReactNode } from 'react'
import { activeFilters, selectionQuery, without, type FilterAttribute, type Filtered, type Selection } from './filters.ts'
import { num, taka, tr, type Lang, type Pair } from './words.ts'

export type FilterView = { path: string; q: string; total: number; filtered: Filtered; sel: Selection; attrs: FilterAttribute[] }
export type ProductAttribute = { name: string; kind: string; unit: string; choices: string[]; number: number | null; flag: boolean | null }

const href = (path: string, query: string) => (query ? `${path}?${query}` : path)
// How many choices show before "more" opens the rest.
const shownChoices = 8

export function FilterPanel({ view, lang }: { view: FilterView; lang?: Lang }) {
  const L = (pair: Pair) => tr(lang, pair)
  const { filtered, sel } = view
  const active = activeFilters(sel)
  if (!filtered.facets.length && !filtered.price) return null
  const range = (key: string, value: [number | null, number | null], low: number, high: number, label: string) => (
    <div className="sf-range">
      <input type="number" name={`min.${key}`} min={0} step="any" inputMode="decimal" placeholder={num(lang, low)} defaultValue={value[0] ?? ''} aria-label={`${label}: ${L(['সর্বনিম্ন', 'from'])}`} />
      <span aria-hidden="true">–</span>
      <input type="number" name={`max.${key}`} min={0} step="any" inputMode="decimal" placeholder={num(lang, high)} defaultValue={value[1] ?? ''} aria-label={`${label}: ${L(['সর্বোচ্চ', 'to'])}`} />
    </div>
  )
  const check = (name: string, value: string, on: boolean, label: ReactNode, count?: number) => (
    <label key={`${name}=${value}`} className="sf-check"><input type="checkbox" name={name} value={value} defaultChecked={on} /><span>{label}</span>{count !== undefined && <span className="sf-check__count">{num(lang, count)}</span>}</label>
  )
  return (
    <details className="sf-filters" open data-filters-panel data-active={active || undefined}>
      <summary>{L(['ফিল্টার', 'Filters'])}{active > 0 && ` (${num(lang, active)})`}</summary>
      <form method="get" action={view.path} data-filters>
        {view.q && <input type="hidden" name="q" value={view.q} />}
        {filtered.price && <fieldset><legend>{L(['দাম', 'Price'])} (৳)</legend>{range('price', filtered.price.value, filtered.price.low, filtered.price.high, L(['দাম', 'Price']))}</fieldset>}
        <fieldset><legend className="sf-visually-hidden">{L(['স্টক', 'Stock'])}</legend>{check('stock', '1', sel.inStock, L(['শুধু স্টকে আছে', 'In stock only']))}</fieldset>
        {filtered.facets.map((f) => (
          <fieldset key={f.attr.id}>
            <legend>{f.attr.name}{f.kind === 'number' && f.attr.unit && ` (${f.attr.unit})`}</legend>
            {f.kind === 'choice' && <>
              {f.choices.slice(0, shownChoices).map((c) => check(f.attr.name, c.label, c.on, c.label, c.count))}
              {f.choices.length > shownChoices && <details className="sf-filters__more" open={f.choices.slice(shownChoices).some((c) => c.on) || undefined}>
                <summary>{lang === 'en' ? `${f.choices.length - shownChoices} more` : `আরও ${num(lang, f.choices.length - shownChoices)}টি`}</summary>
                {f.choices.slice(shownChoices).map((c) => check(f.attr.name, c.label, c.on, c.label, c.count))}
              </details>}
            </>}
            {f.kind === 'number' && range(f.attr.name, f.value, f.low, f.high, f.attr.name)}
            {f.kind === 'flag' && check(f.attr.name, '1', f.on, L(['হ্যাঁ', 'Yes']), f.count)}
          </fieldset>
        ))}
        <div className="sf-filters__actions">
          <button type="submit" className="sf-button">{L(['ফিল্টার করুন', 'Apply'])}</button>
          {active > 0 && <a href={href(view.path, view.q ? new URLSearchParams({ q: view.q }).toString() : '')}>{L(['সব মুছুন', 'Clear all'])}</a>}
        </div>
      </form>
    </details>
  )
}

// "12 products" and one removable chip per active filter.
export function ActiveFilters({ view, lang }: { view: FilterView; lang?: Lang }) {
  const L = (pair: Pair) => tr(lang, pair)
  const { sel, attrs } = view
  const link = (next: Selection) => href(view.path, selectionQuery(next, attrs, view.q))
  const chips: { key: string; label: string; to: string }[] = []
  const span = ([min, max]: [number | null, number | null], show: (n: number) => string) => (min !== null && max !== null ? `${show(min)}–${show(max)}` : min !== null ? `≥ ${show(min)}` : `≤ ${show(max!)}`)
  if (sel.price[0] !== null || sel.price[1] !== null) chips.push({ key: 'price', label: span(sel.price, (n) => taka(n, lang)), to: link(without(sel, { price: true })) })
  if (sel.inStock) chips.push({ key: 'stock', label: L(['স্টকে আছে', 'In stock']), to: link(without(sel, { stock: true })) })
  for (const a of attrs) {
    for (const c of a.choices) if (sel.choices.get(a.id)?.has(c.id)) chips.push({ key: c.id, label: c.label, to: link(without(sel, { choice: [a.id, c.id] })) })
    const r = sel.ranges.get(a.id)
    if (r) chips.push({ key: a.id, label: `${a.name}: ${span(r, (n) => `${num(lang, n)}${a.unit ? ` ${a.unit}` : ''}`)}`, to: link(without(sel, { range: a.id })) })
    if (sel.flags.has(a.id)) chips.push({ key: a.id, label: a.name, to: link(without(sel, { flag: a.id })) })
  }
  return (
    <div className="sf-active">
      <p className="sf-active__count">{lang === 'en' ? `${num(lang, view.total)} product${view.total === 1 ? '' : 's'}` : `${num(lang, view.total)}টি পণ্য`}</p>
      {chips.length > 0 && <ul aria-label={L(['চালু ফিল্টার', 'Active filters'])}>{chips.map((c) => <li key={c.key}><a href={c.to} aria-label={`${c.label}: ${L(['সরান', 'remove'])}`}>{c.label}<span aria-hidden="true">×</span></a></li>)}</ul>}
    </div>
  )
}

// A product's attributes as a table on its page: choices joined, numbers with their unit, yes or no.
export function AttributeTable({ attributes, lang, heading }: { attributes: ProductAttribute[]; lang?: Lang; heading?: string }) {
  const value = (a: ProductAttribute) => a.kind === 'choice' ? a.choices.join(', ')
    : a.kind === 'number' ? `${num(lang, a.number ?? 0)}${a.unit ? ` ${a.unit}` : ''}`
    : tr(lang, a.flag ? ['হ্যাঁ', 'Yes'] : ['না', 'No'])
  const rows = attributes.filter((a) => (a.kind === 'choice' ? a.choices.length > 0 : a.kind === 'number' ? a.number !== null : a.flag !== null))
  if (!rows.length) return null
  return <div className="sf-attributes">
    {heading && <h2 className="sf-attributes__title">{heading}</h2>}
    <dl>{rows.map((a) => <div key={a.name}><dt>{a.name}</dt><dd>{value(a)}</dd></div>)}</dl>
  </div>
}

// Applies a filter as soon as it changes, without empty fields in the address; on phones the panel starts closed
// unless filters are on.
export const filterScript = `document.querySelectorAll('form[data-filters]').forEach(function(f){var p=f.closest('[data-filters-panel]');if(p&&!p.dataset.active&&matchMedia('(max-width: 719px)').matches)p.open=false;function go(){var q=new URLSearchParams();new FormData(f).forEach(function(v,k){if(String(v).trim()!=='')q.append(k,v)});var s=q.toString();location.assign(f.getAttribute('action')+(s?'?'+s:''))}f.addEventListener('change',function(e){if(e.target.type==='checkbox')go()});f.addEventListener('submit',function(e){e.preventDefault();go()})})`

export const filterCss = `
.sf-filtered{display:grid;gap:24px}@media (min-width:720px){.sf-filtered{grid-template-columns:240px minmax(0,1fr);align-items:start}}
.sf-filters{border:1px solid var(--sf-rule);border-radius:var(--sf-radius);background:var(--sf-paper);padding:4px 16px}
.sf-filters>summary{display:flex;align-items:center;justify-content:space-between;padding:10px 0;font-weight:700;cursor:pointer;list-style:none}.sf-filters>summary::-webkit-details-marker{display:none}.sf-filters>summary::after{content:'';width:8px;height:8px;margin-inline-end:4px;border-right:2px solid;border-bottom:2px solid;transform:translateY(-2px) rotate(45deg)}.sf-filters[open]>summary::after{transform:translateY(2px) rotate(-135deg)}@media (min-width:720px){.sf-filters>summary{pointer-events:none;list-style:none}.sf-filters>summary::after{display:none}.sf-filters>summary::-webkit-details-marker{display:none}.sf-filtered>.sf-filters{position:sticky;top:16px}}
.sf-filters form{display:grid;gap:4px;padding-bottom:12px}.sf-filters fieldset{border:0;border-top:1px solid var(--sf-rule);margin:0;padding:12px 0;display:grid;gap:6px;min-width:0}
.sf-filters legend{float:left;width:100%;margin-bottom:6px;font-weight:600;font-size:15px}
.sf-check{display:flex;align-items:center;gap:8px;font-size:14px;cursor:pointer}.sf-check input{width:18px;height:18px;margin:0;accent-color:var(--sf-accent)}.sf-check span:nth-child(2){flex:1}.sf-check__count{color:var(--sf-muted);font-size:13px}
.sf-range{display:flex;align-items:center;gap:8px}.sf-range input{width:100%;min-width:0;min-height:40px;padding:6px 10px;border:1px solid color-mix(in srgb,var(--sf-ink) 25%,transparent);border-radius:8px;font:inherit;font-size:14px;background:var(--sf-paper);color:inherit}
.sf-filters__more>summary{color:var(--sf-accent);font-size:14px;font-weight:600;cursor:pointer;margin:2px 0 6px}.sf-filters__more{display:grid;gap:6px}
.sf-filters__actions{display:flex;align-items:center;gap:16px;padding-top:8px}.sf-filters__actions .sf-button{margin:0;min-height:40px;padding:0 18px;font-size:15px}.sf-filters__actions a{color:var(--sf-muted);font-size:14px}
.sf-active{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;margin-bottom:16px}.sf-active__count{color:var(--sf-muted);font-size:14px}.sf-active ul{display:flex;flex-wrap:wrap;gap:8px;margin:0;padding:0;list-style:none}
.sf-active a{display:inline-flex;align-items:center;gap:6px;padding:4px 12px;border-radius:999px;background:var(--sf-tint);color:var(--sf-ink);font-size:14px;text-decoration:none}.sf-active a:hover{background:color-mix(in srgb,var(--sf-accent) 14%,var(--sf-tint))}
.sf-visually-hidden{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.sf-attributes{margin-top:20px}.sf-attributes__title{font-size:18px;margin-bottom:8px}.sf-attributes dl{margin:0;border-top:1px solid var(--sf-rule)}.sf-attributes dl>div{display:grid;grid-template-columns:minmax(0,2fr) minmax(0,3fr);gap:16px;padding:10px 0;border-bottom:1px solid var(--sf-rule);font-size:15px}.sf-attributes dt{color:var(--sf-muted)}.sf-attributes dd{margin:0;font-weight:600;overflow-wrap:anywhere}
`
