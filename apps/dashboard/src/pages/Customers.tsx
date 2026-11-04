import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { Users } from 'lucide-react'
import { useCurrentStore, useStorePath } from '../account-context'
import { api } from '../api'
import { Badge, Button, Notice, PageHeader, SearchInput, Skeleton } from '../components/ui'
import { useLang } from '../i18n'
import { useUrlSearch } from '../use-url-search'

type Row = { phone: string; name: string; address: string; orders: number; delivered: number; returned: number; spent: number; lastOrder: string }
type Page = { items: Row[]; hasMore: boolean }

export function Customers() {
  const { t, num, money, time } = useLang()
  const path = useStorePath()
  const base = `/stores/${useCurrentStore()!.store.handle}/customers`
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

  return (
    <div className="page">
      <PageHeader title={t('customers')} description={t('customers.d')} />
      {failed && <section className="card card--flush"><Notice role="alert" title={t('customersLoadFailed')} action={<Button onClick={() => void load()}>{t('retry')}</Button>} /></section>}
      {!failed && none && (
        <section className="empty-card">
          <Users size={32} strokeWidth={1.5} aria-hidden="true" />
          <h2>{t('customersEmptyTitle')}</h2>
          <p className="muted">{t('customersEmptyBody')}</p>
          <Link className="btn btn--primary" to={path('/landing-pages')}>{t('pageAdd')}</Link>
        </section>
      )}
      {!failed && !none && (
        <div className="data-list">
          <div className="filter-bar">
            <div className="tabs" />
            <SearchInput label={t('customersSearch')} value={text} onChange={(e) => setText(e.target.value)} />
          </div>
          {!page && <div role="status" aria-label={t('loading')}>{Array.from({ length: 4 }, (_, i) => <div key={i} className="skeleton-row"><Skeleton width="16rem" /><Skeleton width="5rem" /></div>)}</div>}
          {page && page.items.length === 0 && <Notice title={t('customersNoMatch')} body={t('productNoMatchBody')} action={<Button onClick={() => setText('')}>{t('clearFilters')}</Button>} />}
          {page && page.items.length > 0 && (
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">{t('colCustomer')}</th>
                  <th scope="col" className="data-table__meta">{t('colOrders')}</th>
                  <th scope="col" className="data-table__meta">{t('colDelivered')}</th>
                  <th scope="col" className="data-table__meta">{t('colReturned')}</th>
                  <th scope="col" className="data-table__meta data-table__meta--price">{t('colSpent')}</th>
                  <th scope="col" className="data-table__meta">{t('colLastOrder')}</th>
                </tr>
              </thead>
              <tbody>
                {page.items.map((row) => (
                  <tr key={row.phone}>
                    <td>
                      <Link className="data-table__file" to={path(`/orders?q=${row.phone}`)}>
                        <span className="data-table__text">
                          <span className="data-table__name">{row.name}</span>
                          <span className="table__sub num">{row.phone} · {row.address}</span>
                        </span>
                      </Link>
                    </td>
                    <td className="data-table__meta num">{num(row.orders)}</td>
                    <td className="data-table__meta num">{num(row.delivered)}</td>
                    <td className="data-table__meta num">{row.returned > 0 ? <Badge tone="warning">{num(row.returned)}</Badge> : num(0)}</td>
                    <td className="data-table__meta data-table__meta--price num">{money(row.spent)}</td>
                    <td className="data-table__meta muted">{time(row.lastOrder)}</td>
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
