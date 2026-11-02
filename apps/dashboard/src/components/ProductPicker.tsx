import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { useCurrentStore } from '../account-context'
import { api } from '../api'
import { useLang } from '../i18n'
import type { ProductStatus } from '../product-form'
import { Button, Notice, SearchInput, Skeleton } from './ui'

export type ProductRow = { id: string; name: string; status: ProductStatus; thumbUrl: string | null; minPrice: number; maxPrice: number }
type Page = { items: ProductRow[]; hasMore: boolean }

// A full-height panel on the right, like the media picker. Products already ticked stay in their order; new ones join the end.
export function ProductPicker({ selected, max, onDone, onClose }: { selected: ProductRow[]; max: number; onDone: (items: ProductRow[]) => void; onClose: () => void }) {
  const { t, num, money } = useLang()
  const base = `/stores/${useCurrentStore()!.store.handle}/products`
  const dialog = useRef<HTMLDialogElement>(null)
  const latest = useRef(0)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState<Page | null>(null)
  const [failed, setFailed] = useState(false)
  const [picked, setPicked] = useState(selected)

  useEffect(() => {
    dialog.current?.showModal()
  }, [])

  const load = async (q: string) => {
    const request = ++latest.current
    setFailed(false)
    try {
      const result = await api<Page>(`${base}?q=${encodeURIComponent(q)}`)
      if (request === latest.current) setPage(result)
    } catch {
      if (request === latest.current) setFailed(true)
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => void load(search.trim()), search ? 250 : 0)
    return () => clearTimeout(timer)
  }, [search, base])

  const more = async () => {
    if (!page) return
    const next = await api<Page>(`${base}?q=${encodeURIComponent(search.trim())}&offset=${page.items.length}`)
    setPage({ ...next, items: [...page.items, ...next.items] })
  }

  return (
    <dialog ref={dialog} className="picker" aria-labelledby="product-picker-title" onClose={onClose}>
      <div className="picker__head">
        <h2 id="product-picker-title">{t('pickerProductsTitle')}</h2>
        <button type="button" className="media__dismiss" aria-label={t('mediaClose')} onClick={onClose}><X size={18} aria-hidden="true" /></button>
      </div>
      <div className="picker__tools">
        <SearchInput label={t('productSearch')} value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <div className="picker__body">
        {failed && <Notice role="alert" title={t('productLoadFailed')} action={<Button onClick={() => void load(search.trim())}>{t('retry')}</Button>} />}
        {!failed && !page && <div role="status" aria-label={t('loading')}><Skeleton /></div>}
        {page && page.items.length === 0 && <Notice title={search ? t('productNoMatch') : t('pickerProductsEmpty')} body={search ? t('productNoMatchBody') : undefined} />}
        {page && page.items.length > 0 && (
          <ul className="picker-rows">
            {page.items.map((row) => {
              const isPicked = picked.some((x) => x.id === row.id)
              return (
                <li key={row.id}>
                  <label className="picker-row">
                    <input type="checkbox" checked={isPicked} disabled={!isPicked && picked.length >= max} onChange={() => setPicked(isPicked ? picked.filter((x) => x.id !== row.id) : [...picked, row])} />
                    <span className="data-table__thumb">{row.thumbUrl && <img src={row.thumbUrl} alt="" loading="lazy" />}</span>
                    <span className="picker-row__name" title={row.name}>{row.name}</span>
                    <span className="collection-products__price">{money(row.minPrice)}</span>
                  </label>
                </li>
              )
            })}
          </ul>
        )}
        {page?.hasMore && <div className="media__more"><Button onClick={() => void more()}>{t('mediaLoadMore')}</Button></div>}
      </div>
      <div className="picker__foot">
        <span className="muted">{t('collectionProductCount', { n: num(picked.length) })}</span>
        <div className="row">
          <Button onClick={onClose}>{t('cancel')}</Button>
          <Button variant="primary" onClick={() => onDone(picked)}>{t('pickerDone')}</Button>
        </div>
      </div>
    </dialog>
  )
}
