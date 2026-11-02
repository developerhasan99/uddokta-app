import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { FolderOpen, Plus } from 'lucide-react'
import { useCurrentStore, useStorePath } from '../account-context'
import { api } from '../api'
import { Button, LinkButton, Notice, PageHeader, SearchInput, Skeleton } from '../components/ui'
import { useLang } from '../i18n'
import { useUrlSearch } from '../use-url-search'

type Row = { id: string; name: string; thumbUrl: string | null; productCount: number }
type Page = { items: Row[]; hasMore: boolean }

export function Collections() {
  const { t, num } = useLang()
  const path = useStorePath()
  const navigate = useNavigate()
  const base = `/stores/${useCurrentStore()!.store.handle}/collections`
  const { query, text, setText } = useUrlSearch()
  const latest = useRef(0)
  const [page, setPage] = useState<Page | null>(null)
  const [failed, setFailed] = useState(false)
  const list = `${base}?q=${encodeURIComponent(query)}`

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

  const none = page !== null && !query && page.items.length === 0
  const addButton = <LinkButton to={path('/products/collections/new')} variant="primary"><Plus size={16} aria-hidden="true" />{t('collectionAdd')}</LinkButton>

  return (
    <div className="page">
      <PageHeader title={t('collections')} description={t('collections.d')} action={none ? undefined : addButton} />

      {failed && (
        <section className="card card--flush">
          <Notice role="alert" title={t('collectionLoadFailed')} action={<Button onClick={() => void load()}>{t('retry')}</Button>} />
        </section>
      )}

      {!failed && none && (
        <section className="empty-card">
          <FolderOpen size={32} strokeWidth={1.5} aria-hidden="true" />
          <h2>{t('collectionEmptyTitle')}</h2>
          <p className="muted">{t('collectionEmptyBody')}</p>
          {addButton}
        </section>
      )}

      {!failed && !none && (
        <div className="data-list">
          <div className="filter-bar">
            <div className="tabs" />
            <SearchInput label={t('collectionSearch')} value={text} onChange={(e) => setText(e.target.value)} />
          </div>

          {!page && (
            <div role="status" aria-label={t('loading')}>
              {Array.from({ length: 4 }, (_, i) => <div key={i} className="skeleton-row"><Skeleton width="16rem" /><Skeleton width="5rem" /></div>)}
            </div>
          )}

          {page && page.items.length === 0 && <Notice title={t('collectionNoMatch')} body={t('productNoMatchBody')} action={<Button onClick={() => setText('')}>{t('clearFilters')}</Button>} />}

          {page && page.items.length > 0 && (
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">{t('collections')}</th>
                  <th scope="col" className="data-table__meta data-table__meta--price">{t('collectionProducts')}</th>
                </tr>
              </thead>
              <tbody>
                {page.items.map((row) => (
                  <tr key={row.id} className="data-table__row" onClick={() => navigate(path(`/products/collections/${row.id}`))}>
                    <td>
                      <Link className="data-table__file" to={path(`/products/collections/${row.id}`)} onClick={(e) => e.stopPropagation()}>
                        <span className="data-table__thumb">{row.thumbUrl && <img src={row.thumbUrl} alt="" loading="lazy" />}</span>
                        <span className="data-table__text">
                          <span className="data-table__name" title={row.name}>{row.name}</span>
                          <span className="muted data-table__sub">{t('collectionProductCount', { n: num(row.productCount) })}</span>
                        </span>
                      </Link>
                    </td>
                    <td className="data-table__meta data-table__meta--price">{num(row.productCount)}</td>
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
