import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { Search } from 'lucide-react'
import { useCurrentStore, useStorePath } from '../account-context'
import { api } from '../api'
import { Badge, Button, LinkButton, Notice, PageHeader, Skeleton, type Tone } from '../components/ui'
import { useLang, type Key } from '../i18n'

export type Status = 'new' | 'hold' | 'confirmed' | 'packed' | 'courier' | 'delivered' | 'returned' | 'cancelled'

export const statuses: Record<Status, { label: Key; tone: Tone }> = {
  new: { label: 'statusNew', tone: 'info' },
  hold: { label: 'statusHold', tone: 'warning' },
  confirmed: { label: 'statusConfirmed', tone: 'neutral' },
  packed: { label: 'statusPacked', tone: 'neutral' },
  courier: { label: 'statusCourier', tone: 'neutral' },
  delivered: { label: 'statusDelivered', tone: 'success' },
  returned: { label: 'statusReturned', tone: 'danger' },
  cancelled: { label: 'statusCancelled', tone: 'neutral' },
}

type Row = { id: string; number: number; customerName: string; phone: string; address: string; status: Status; total: number; createdAt: string; items: string; duplicate: boolean; blocked: boolean }
type Page = { items: Row[]; hasMore: boolean; counts: Partial<Record<Status, number>> }

export function Orders() {
  const { t, num, money, time } = useLang()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const path = useStorePath()
  const status = params.get('status') ?? ''
  const q = params.get('q') ?? ''
  const base = `/stores/${useCurrentStore()!.store.handle}/orders`
  const list = `${base}?q=${encodeURIComponent(q)}&status=${status}`
  const latest = useRef(0)
  const [page, setPage] = useState<Page | null>(null)
  const [failed, setFailed] = useState(false)

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

  const withParams = (changes: Record<string, string>) => {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value)
      else next.delete(key)
    }
    const query = next.toString()
    return query ? `${path('/orders')}?${query}` : path('/orders')
  }

  const filter = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    navigate(withParams({ q: String(new FormData(e.currentTarget).get('q') ?? '').trim() }))
  }

  const rows = page?.items ?? []
  const count = (s: Status) => page?.counts[s] ?? 0
  const all = Object.values(page?.counts ?? {}).reduce((a, b) => a + (b ?? 0), 0)

  return (
    <div className="page">
      <PageHeader title={t('orders')} description={t('orders.d')} action={<LinkButton to={path('/orders/new')} variant="primary">{t('newOrder')}</LinkButton>} />

      <section className="card card--flush">
        <div className="filter-bar">
        <nav className="tabs" aria-label={t('ordersLabel')}>
          <Link to={withParams({ status: '' })} className="tab" aria-current={!status ? 'page' : undefined}>
            {t('statusAll')} <span className="tab__count">{num(all)}</span>
          </Link>
          {(Object.keys(statuses) as Status[]).map((s) => (
            <Link key={s} to={withParams({ status: s })} className="tab" aria-current={status === s ? 'page' : undefined}>
              {t(statuses[s].label)} <span className="tab__count">{num(count(s))}</span>
            </Link>
          ))}
        </nav>
        <form className="filter-search" role="search" onSubmit={filter}>
          <Search size={16} aria-hidden="true" />
          <input key={q} name="q" type="search" aria-label={t('search')} placeholder={t('ordersFilterHint')} defaultValue={params.get('q') ?? ''} autoComplete="off" />
        </form>
        </div>

        {!page && !failed && (
          <div className="skeleton-rows" role="status" aria-label={t('loading')}>
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="skeleton-row">
                <Skeleton width="4rem" /><Skeleton width="10rem" /><Skeleton width="8rem" /><Skeleton width="5rem" /><Skeleton width="4rem" />
              </div>
            ))}
          </div>
        )}

        {failed && (
          <Notice role="alert" title={t('ordersError')} body={t('ordersErrorBody')} action={<Button onClick={() => void load()}>{t('retry')}</Button>} />
        )}

        {page && rows.length === 0 && (
          q || status
            ? <Notice title={t('ordersNoMatch')} body={t('ordersNoMatchBody')} action={<LinkButton to={withParams({ q: '', status: '' })}>{t('clearFilters')}</LinkButton>} />
            : <Notice title={t('ordersEmptyTitle')} body={t('ordersEmptyBody')} action={<LinkButton to={path('/orders/new')}>{t('newOrder')}</LinkButton>} />
        )}

        {page && rows.length > 0 && (
          <table className="table">
            <thead>
              <tr>
                <th scope="col">{t('colOrder')}</th>
                <th scope="col">{t('colCustomer')}</th>
                <th scope="col">{t('colArea')}</th>
                <th scope="col">{t('colStatus')}</th>
                <th scope="col">{t('colTime')}</th>
                <th scope="col" className="num">{t('colTotal')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id} className="data-table__row" onClick={() => navigate(path(`/orders/${o.id}`))}>
                  <th scope="row" className="num" data-label={t('colOrder')}><Link to={path(`/orders/${o.id}`)} onClick={(e) => e.stopPropagation()}>#{num(o.number).replace(/[,،]/g, '')}</Link></th>
                  <td data-label={t('colCustomer')}>
                    {o.customerName}
                    {o.duplicate && <> <Badge tone="warning">{t('orderDuplicate')}</Badge></>}
                    {o.blocked && <> <Badge tone="danger">{t('orderBlocked')}</Badge></>}
                    <span className="table__sub num">{o.phone}</span>
                    {o.items && <span className="table__sub">{o.items}</span>}
                  </td>
                  <td data-label={t('colArea')}>{o.address}</td>
                  <td data-label={t('colStatus')}><Badge tone={statuses[o.status].tone}>{t(statuses[o.status].label)}</Badge></td>
                  <td className="muted num" data-label={t('colTime')}>{time(o.createdAt)}</td>
                  <td className="num" data-label={t('colTotal')}>{money(o.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      {page?.hasMore && <div className="media__more"><Button onClick={() => void more()}>{t('mediaLoadMore')}</Button></div>}
    </div>
  )
}
