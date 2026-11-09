import { useCallback, useEffect, useRef, useState } from 'react'
import { DialogHead } from './DialogHead'
import { useCurrentStore } from '../account-context'
import { api } from '../api'
import { useLang } from '../i18n'
import type { ProductStatus } from '../product-form'
import { Check } from './Selection'
import { Button, Notice, SearchInput, Skeleton } from './ui'
import { useDialog } from './dialog'

export type PickerVariant = { id: string; options: string[]; price: number; stock: number | null; sku: string | null; thumbUrl: string | null }
export type ProductRow = { id: string; name: string; status: ProductStatus; thumbUrl: string | null; minPrice: number; maxPrice: number; variants?: PickerVariant[] }
export type VariantPick = { product: ProductRow & { variants: PickerVariant[] }; variant: PickerVariant }
type Page = { items: ProductRow[]; hasMore: boolean }

type Props = { sellableOnly?: boolean; max: number; onClose: () => void } & (
  | { variants?: false; selected: ProductRow[]; onDone: (items: ProductRow[]) => void }
  // Variant mode: each variant is picked on its own. `taken` variants (already in the order) show as added and cannot be picked again.
  | { variants: true; taken?: string[]; onDone: (picks: VariantPick[]) => void }
)

// The one product picker: a full-height panel on the right, like the media picker, with search, status and collection filters.
// Products already ticked stay in their order; new ones join the end.
export function ProductPicker(props: Props) {
  const { max, onClose, sellableOnly = false } = props
  const { t, num, money } = useLang()
  const base = `/stores/${useCurrentStore()!.store.handle}`
  const { ref: dialog, close, props: dialogProps } = useDialog(onClose)
  const latest = useRef(0)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [collection, setCollection] = useState('')
  const [collections, setCollections] = useState<{ id: string; name: string }[]>([])
  const [page, setPage] = useState<Page | null>(null)
  const [failed, setFailed] = useState(false)
  const [picked, setPicked] = useState<ProductRow[]>(props.variants ? [] : props.selected)
  const [pickedVariants, setPickedVariants] = useState<VariantPick[]>([])
  const [loadingMore, setLoadingMore] = useState(false)
  const [moreFailed, setMoreFailed] = useState(false)
  const moreRequest = useRef<number | null>(null)
  const taken = new Set(props.variants ? props.taken ?? [] : [])
  const query = new URLSearchParams({ q: search.trim(), ...(status && { status }), ...(collection && { collection }), ...(sellableOnly && { sellable: '1' }), ...(props.variants && { variants: '1' }) })
  const list = `${base}/products?${query}`

  useEffect(() => {
    dialog.current?.showModal()
    api<{ id: string; name: string }[]>(`${base}/collections/options`).then(setCollections).catch(() => {})
  }, [base])

  const load = useCallback(async () => {
    const request = ++latest.current
    setPage(null)
    setFailed(false)
    setLoadingMore(false)
    setMoreFailed(false)
    moreRequest.current = null
    try {
      const result = await api<Page>(list)
      if (request === latest.current) setPage(result)
    } catch {
      if (request === latest.current) setFailed(true)
    }
  }, [list])

  useEffect(() => {
    setPage(null)
    setFailed(false)
    const timer = setTimeout(() => void load(), search ? 250 : 0)
    return () => { clearTimeout(timer); latest.current += 1 }
  }, [load])

  const more = async () => {
    if (!page?.hasMore || moreRequest.current !== null) return
    const request = latest.current
    moreRequest.current = request
    setLoadingMore(true)
    setMoreFailed(false)
    try {
      const next = await api<Page>(`${list}&offset=${page.items.length}`)
      if (request === latest.current) setPage({ ...next, items: [...page.items, ...next.items] })
    } catch {
      if (request === latest.current) setMoreFailed(true)
    } finally {
      if (moreRequest.current === request) { moreRequest.current = null; setLoadingMore(false) }
    }
  }

  const count = props.variants ? pickedVariants.length : picked.length
  const full = max !== 1 && count >= max
  const isPicked = (id: string) => pickedVariants.some((p) => p.variant.id === id)
  // A variant can be picked unless it is already in the order or, when selling, has no stock.
  const open = (v: PickerVariant) => !taken.has(v.id) && !(sellableOnly && v.stock === 0)
  const toggleVariants = (row: ProductRow, variants: PickerVariant[], on: boolean) => {
    const ids = new Set(variants.map((v) => v.id))
    const rest = pickedVariants.filter((p) => !ids.has(p.variant.id))
    const product = row as VariantPick['product']
    const added = on ? variants.filter((v) => !isPicked(v.id)).map((variant) => ({ product, variant })) : []
    setPickedVariants(max === 1 ? added.slice(0, 1) : [...(on ? pickedVariants : rest), ...added].slice(0, max))
  }
  const stockText = (v: PickerVariant) => taken.has(v.id) ? t('pickerAdded') : v.stock === null ? '' : v.stock === 0 ? t('newOrderOutOfStock') : t('newOrderInStock', { n: num(v.stock) })
  const priceText = (row: ProductRow) => row.minPrice === row.maxPrice ? money(row.minPrice) : `${money(row.minPrice)} – ${money(row.maxPrice)}`
  const thumb = (url: string | null) => <span className="data-table__thumb">{url && <img src={url} alt="" loading="lazy" />}</span>

  const productRow = (row: ProductRow) => {
    if (!props.variants) {
      const on = picked.some((x) => x.id === row.id)
      return (
        <label className="picker-row">
          <input type="checkbox" checked={on} disabled={!on && full} onChange={() => setPicked(on ? picked.filter((x) => x.id !== row.id) : max === 1 ? [row] : [...picked, row])} />
          {thumb(row.thumbUrl)}
          <span className="picker-row__name" title={row.name}>{row.name}</span>
          <span className="picker-row__price num">{priceText(row)}</span>
        </label>
      )
    }
    const variants = row.variants ?? []
    const openOnes = variants.filter(open)
    const on = openOnes.length > 0 && openOnes.every((v) => isPicked(v.id))
    const some = !on && openOnes.some((v) => isPicked(v.id))
    const single = variants.length === 1 ? variants[0] : null
    const head = (
      <label className="picker-row">
        <Check checked={on || (single !== null && taken.has(single.id))} mixed={some} label={row.name} disabled={openOnes.length === 0 || (!on && !some && full)} onChange={() => toggleVariants(row, openOnes, !on)} />
        {thumb(row.thumbUrl)}
        <span className="picker-row__text">
          <span className="picker-row__name" title={row.name}>{row.name}</span>
          <span className="picker-row__meta">{single ? stockText(single) : t('pickerVariantCount', { n: num(variants.length) })}</span>
        </span>
        <span className="picker-row__price num">{priceText(row)}</span>
      </label>
    )
    if (single) return head
    return <>
      {head}
      <ul className="picker-variants">
        {variants.map((v) => {
          const vOn = isPicked(v.id) || taken.has(v.id)
          const label = v.options.join(' / ')
          return (
            <li key={v.id}>
              <label className="picker-row picker-row--variant">
                <Check checked={vOn} label={`${row.name} — ${label}`} disabled={!open(v) || (!vOn && full)} onChange={() => toggleVariants(row, [v], !vOn)} />
                {v.thumbUrl && thumb(v.thumbUrl)}
                <span className="picker-row__text">
                  <span className="picker-row__name" title={label}>{label}</span>
                  {(v.sku || stockText(v)) && <span className={v.stock === 0 && !taken.has(v.id) ? 'picker-row__meta picker-row__meta--alert' : 'picker-row__meta'}>{[stockText(v), v.sku].filter(Boolean).join(' · ')}</span>}
                </span>
                <span className="picker-row__price num">{money(v.price)}</span>
              </label>
            </li>
          )
        })}
      </ul>
    </>
  }

  return (
    <dialog {...dialogProps} className="picker" aria-labelledby="product-picker-title">
      <DialogHead id="product-picker-title" title={t('pickerProductsTitle')} onClose={() => close()} />
      <div className="picker__tools">
        <SearchInput label={t('productSearch')} value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className="input picker__filter" aria-label={t('productStatus')} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">{t('pickerAnyStatus')}</option>
          <option value="active">{t('productStatusActive')}</option>
          <option value="unlisted">{t('productStatusUnlisted')}</option>
          {!sellableOnly && <option value="draft">{t('productStatusDraft')}</option>}
        </select>
        {collections.length > 0 && (
          <select className="input picker__filter" aria-label={t('pickerCollection')} value={collection} onChange={(e) => setCollection(e.target.value)}>
            <option value="">{t('pickerAnyCollection')}</option>
            {collections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
      </div>
      <div className="dialog__body">
        {failed && <Notice role="alert" title={t('productLoadFailed')} action={<Button onClick={() => void load()}>{t('retry')}</Button>} />}
        {!failed && !page && <div role="status" aria-label={t('loading')}><Skeleton /></div>}
        {page && page.items.length === 0 && <Notice title={search || status || collection ? t('productNoMatch') : t('pickerProductsEmpty')} body={search || status || collection ? t('productNoMatchBody') : sellableOnly ? t('campaignNoProducts') : undefined} />}
        {page && page.items.length > 0 && <ul className="picker-rows">{page.items.map((row) => <li key={row.id}>{productRow(row)}</li>)}</ul>}
        {moreFailed && <p className="form-error" role="alert">{t('productLoadFailed')}</p>}
        {page?.hasMore && <div className="media__more"><Button disabled={loadingMore} aria-busy={loadingMore} onClick={() => void more()}>{t(moreFailed ? 'retry' : loadingMore ? 'loading' : 'mediaLoadMore')}</Button></div>}
      </div>
      <div className="dialog__foot dialog__foot--split">
        <span className="muted">{props.variants ? t('pickerSelected', { n: num(count) }) : t('collectionProductCount', { n: num(count) })}</span>
        <div className="row">
          <Button onClick={() => close()}>{t('cancel')}</Button>
          <Button variant="primary" disabled={(sellableOnly || props.variants) && count === 0} onClick={() => close(() => props.variants ? props.onDone(pickedVariants) : props.onDone(picked))}>{t('pickerDone')}</Button>
        </div>
      </div>
    </dialog>
  )
}
