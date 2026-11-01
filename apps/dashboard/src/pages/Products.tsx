import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { Plus, Tag } from 'lucide-react'
import { useStorePath, useCurrentStore } from '../account-context'
import { api } from '../api'
import { Badge, Button, LinkButton, Notice, PageHeader, SearchInput, Skeleton } from '../components/ui'
import { useLang, type Key } from '../i18n'
import { useUrlSearch } from '../use-url-search'

type Row = { id: string; name: string; status: 'active' | 'draft'; thumbUrl: string | null; variantCount: number; minPrice: number; maxPrice: number; stock: number | null }
type Page = { items: Row[]; hasMore: boolean; counts: { active?: number; draft?: number } }

const tabs: { value: '' | 'active' | 'draft'; label: Key }[] = [
  { value: '', label: 'statusAll' },
  { value: 'active', label: 'productStatusActive' },
  { value: 'draft', label: 'productStatusDraft' },
]

export function Products() {
  const { t, num, money } = useLang()
  const path = useStorePath()
  const navigate = useNavigate()
  const base = `/stores/${useCurrentStore()!.store.handle}/products`
  const [params] = useSearchParams()
  const status = params.get('status') ?? ''
  const { query, text, setText } = useUrlSearch()
  const latest = useRef(0)
  const [page, setPage] = useState<Page | null>(null)
  const [failed, setFailed] = useState(false)
  const list = `${base}?q=${encodeURIComponent(query)}&status=${status}`

  const load = useCallback(async () => {
    const request = ++latest.current
    setFailed(false)
    try {
      const result = await api<Page>(list)
      if (request === latest.current) setPage(result)
    } catch {
      if (request === latest.current) setFailed(true)
    }
  }, [list])

  useEffect(() => {
    void load()
  }, [load])

  const more = async () => {
    if (!page) return
    const next = await api<Page>(`${list}&offset=${page.items.length}`)
    setPage({ ...next, items: [...page.items, ...next.items] })
  }

  const tabLink = (value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set('status', value)
    else next.delete('status')
    const search = next.toString()
    return search ? `?${search}` : path('/products')
  }

  const count = (value: string) => {
    const active = page?.counts.active ?? 0
    const draft = page?.counts.draft ?? 0
    return value === 'active' ? active : value === 'draft' ? draft : active + draft
  }
  const noProducts = page !== null && !query && count('') === 0
  const addButton = <LinkButton to={path('/products/new')} variant="primary"><Plus size={16} aria-hidden="true" />{t('productAdd')}</LinkButton>
  const priceText = (row: Row) => (row.minPrice === row.maxPrice ? money(row.minPrice) : `${money(row.minPrice)} – ${money(row.maxPrice)}`)
  const stockText = (row: Row) => (row.stock === null ? t('productUntracked') : row.stock === 0 ? t('productOutOfStock') : num(row.stock))

  return (
    <div className="page">
      <PageHeader title={t('products')} description={t('products.d')} action={noProducts ? undefined : addButton} />

      {failed && (
        <section className="card card--flush">
          <Notice role="alert" title={t('productLoadFailed')} action={<Button onClick={() => void load()}>{t('retry')}</Button>} />
        </section>
      )}

      {!failed && noProducts && (
        <section className="empty-card">
          <Tag size={32} strokeWidth={1.5} aria-hidden="true" />
          <h2>{t('productEmptyTitle')}</h2>
          <p className="muted">{t('productEmptyBody')}</p>
          {addButton}
        </section>
      )}

      {!failed && !noProducts && (
        <div className="data-list">
          <div className="filter-bar">
            <nav className="tabs" aria-label={t('products')}>
              {tabs.map((tab) => (
                <Link key={tab.value} to={tabLink(tab.value)} className="tab" aria-current={status === tab.value ? 'page' : undefined}>
                  {t(tab.label)} {page && <span className="tab__count">{num(count(tab.value))}</span>}
                </Link>
              ))}
            </nav>
            <SearchInput label={t('productSearch')} value={text} onChange={(e) => setText(e.target.value)} />
          </div>

          {!page && (
            <div role="status" aria-label={t('loading')}>
              {Array.from({ length: 6 }, (_, i) => <div key={i} className="skeleton-row"><Skeleton width="16rem" /><Skeleton width="5rem" /></div>)}
            </div>
          )}

          {page && page.items.length === 0 && (
            query
              ? <Notice title={t('productNoMatch')} body={t('productNoMatchBody')} action={<Button onClick={() => setText('')}>{t('clearFilters')}</Button>} />
              : <Notice title={t('productNoneInTab')} action={<LinkButton to={tabLink('')}>{t('productShowAll')}</LinkButton>} />
          )}

          {page && page.items.length > 0 && (
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">{t('products')}</th>
                  <th scope="col" className="data-table__meta">{t('colStatus')}</th>
                  <th scope="col" className="data-table__meta">{t('productStockCol')}</th>
                  <th scope="col" className="data-table__meta data-table__wide">{t('productVariantsCol')}</th>
                  <th scope="col" className="data-table__meta data-table__meta--price">{t('productPriceCol')}</th>
                </tr>
              </thead>
              <tbody>
                {page.items.map((row) => (
                  <tr key={row.id} className="data-table__row" onClick={() => navigate(path(`/products/${row.id}`))}>
                    <td>
                      <Link className="data-table__file" to={path(`/products/${row.id}`)} onClick={(e) => e.stopPropagation()}>
                        <span className="data-table__thumb">{row.thumbUrl && <img src={row.thumbUrl} alt="" loading="lazy" />}</span>
                        <span className="data-table__text">
                          <span className="data-table__name" title={row.name}>{row.name}</span>
                          <span className="muted data-table__sub">{priceText(row)}, {stockText(row)}</span>
                        </span>
                      </Link>
                    </td>
                    <td className="data-table__meta"><Badge tone={row.status === 'active' ? 'success' : 'neutral'}>{t(row.status === 'active' ? 'productStatusActive' : 'productStatusDraft')}</Badge></td>
                    <td className={row.stock === 0 ? 'data-table__meta data-table__meta--alert' : 'data-table__meta'}>{stockText(row)}</td>
                    <td className="data-table__meta data-table__wide">{num(row.variantCount)}</td>
                    <td className="data-table__meta data-table__meta--price">{priceText(row)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {page?.hasMore && <div className="media__more"><Button onClick={() => void more()}>{t('mediaLoadMore')}</Button></div>}
    </div>
  )
}
