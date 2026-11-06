import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { ArrowDown, Copy, Download, ShieldAlert, SlidersHorizontal, X } from 'lucide-react'
import { emptyOrderFilters, orderFilterKeys, orderFilterParams, readOrderFilters, type OrderFilters as Filters } from 'storefront/order-filters'
import { OrderFilters } from '../components/OrderFilters'
import { OrderViews } from '../components/OrderViews'
import { useUrlSearch } from '../use-url-search'
import { useCurrentStore, useStorePath } from '../account-context'
import { api, ApiError, errorCode } from '../api'
import { Badge, Button, LinkButton, Notice, PageHeader, SearchInput, Skeleton, type Tone } from '../components/ui'
import { errorLabel, useLang, type Key } from '../i18n'

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

type Row = { id: string; number: number; customerName: string; phone: string; address: string; status: Status; source: string; total: number; createdAt: string; items: string; duplicate: boolean; blocked: boolean }
type Page = { items: Row[]; hasMore: boolean; counts: Partial<Record<Status, number>> }

export function Orders() {
  const { t, num, money, time, lang } = useLang()
  const [params] = useSearchParams()
  const { text: searchText, setText: setSearchText } = useUrlSearch()
  const [filtersOpen, setFiltersOpen] = useState(false)
  const filterReturnFocus = useRef<HTMLElement | null>(null)
  const openFilters = () => { filterReturnFocus.current = document.activeElement as HTMLElement | null; setFiltersOpen(true) }
  const closeFilters = () => { setFiltersOpen(false); requestAnimationFrame(() => filterReturnFocus.current?.focus()) }
  const navigate = useNavigate()
  const path = useStorePath()
  const status = params.get('status') ?? ''
  const q = params.get('q') ?? ''
  const handle = useCurrentStore()!.store.handle
  const base = `/stores/${handle}/orders`
  const rawFilters = Object.fromEntries(orderFilterKeys.map((key) => [key, params.get(key) ?? ''])) as Filters
  const filters = readOrderFilters(rawFilters)
  const filterQuery = filters ? orderFilterParams(filters).toString() : ''
  const list = `${base}?${filterQuery}`
  const valid = filters !== null
  const activeFilters = !!filters && Object.values(filters).some(Boolean)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const [exported, setExported] = useState(false)
  const exportRequest = useRef<AbortController | null>(null)
  const latest = useRef(0)
  const [page, setPage] = useState<Page | null>(null)
  const [failed, setFailed] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [moreFailed, setMoreFailed] = useState(false)
  const moreRequest = useRef<number | null>(null)

  const load = useCallback(async () => {
    const request = ++latest.current
    exportRequest.current?.abort()
    exportRequest.current = null
    setExporting(false)
    setExportError(null)
    setExported(false)
    setFailed(false)
    setPage(null)
    setMoreFailed(false)
    setLoadingMore(false)
    moreRequest.current = null
    if (!valid) return
    try {
      const result = await api<Page>(list)
      if (request === latest.current) setPage(result)
    } catch {
      if (request === latest.current) setFailed(true)
    }
  }, [list, valid])

  useEffect(() => {
    void load()
    return () => { latest.current += 1; exportRequest.current?.abort() }
  }, [load])

  const more = async () => {
    if (!page?.hasMore || moreRequest.current !== null) return
    const request = latest.current
    moreRequest.current = request
    setLoadingMore(true)
    setMoreFailed(false)
    try {
      const next = await api<Page>(`${list}&offset=${page.items.length}`)
      if (request === latest.current) {
        setPage({ ...next, items: [...page.items, ...next.items] })
      }
    } catch {
      if (request === latest.current) setMoreFailed(true)
    } finally {
      if (moreRequest.current === request) {
        moreRequest.current = null
        setLoadingMore(false)
      }
    }
  }

  const hrefFor = (next: Filters) => { const query = orderFilterParams(next).toString(); return `${path('/orders')}${query ? `?${query}` : ''}` }
  const applyFilters = (next: Filters) => navigate(hrefFor(next))

  const exportOrders = async () => {
    if (!filters || exportRequest.current) return
    const controller = new AbortController()
    const request = latest.current
    exportRequest.current = controller
    setExporting(true)
    setExportError(null)
    setExported(false)
    try {
      const query = orderFilterParams(filters)
      query.set('lang', lang)
      const response = await fetch(`/api${base}/export?${query}`, { signal: controller.signal })
      if (!response.ok) throw new ApiError((await response.json().catch(() => null))?.error ?? 'server')
      const blob = await response.blob()
      if (controller.signal.aborted || request !== latest.current) return
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `orders-${handle}.csv`
      document.body.append(link)
      link.click()
      link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      setExported(true)
    } catch (err) {
      if (!controller.signal.aborted && request === latest.current) setExportError(errorCode(err))
    } finally {
      if (exportRequest.current === controller) { exportRequest.current = null; setExporting(false) }
    }
  }

  const rows = page?.items ?? []
  const counts = page?.counts ?? {}
  const count = (s: Status) => counts[s] ?? 0
  const all = Object.values(counts).reduce((a, b) => a + (b ?? 0), 0)
  const matching = status && status in statuses ? count(status as Status) : all
  const periodLabels: Record<string, Key> = { today: 'orderPeriodToday', '7d': 'orderPeriod7', '30d': 'orderPeriod30', custom: 'orderPeriodCustom' }
  const dateLabel = filters?.period === 'custom' && (filters.from || filters.to)
    ? `${filters.from || '…'} — ${filters.to || '…'}`
    : t(filters?.period ? periodLabels[filters.period] : 'orderPeriodAll')
  const chips = filters ? [
    ...(filters.q ? [{ key: 'q', label: filters.q }] : []),
    ...(filters.source ? [{ key: 'source', label: t(`source_${filters.source}` as Key) }] : []),
    ...(filters.period ? [{ key: 'period', label: dateLabel }] : []),
  ] : []
  const filterCount = chips.filter((chip) => chip.key !== 'q').length
  const sourceLabel = (source: string) => t(`source_${source}` as Key)
  const orderNumber = (number: number) => `#${num(number).replace(/[,،]/g, '')}`
  const tabs: { status: string; label: Key; value: number }[] = [
    { status: '', label: 'statusAll', value: all },
    ...(Object.keys(statuses) as Status[]).map((s) => ({ status: s, label: statuses[s].label, value: count(s) })),
  ]
  const flags = (order: Row) => <>
    {order.duplicate && <span className="order-row-flag" title={t('orderDuplicate')}><Copy size={14} role="img" aria-label={t('orderDuplicate')} /></span>}
    {order.blocked && <span className="order-row-flag order-row-flag--danger" title={t('orderBlocked')}><ShieldAlert size={14} role="img" aria-label={t('orderBlocked')} /></span>}
  </>

  return (
    <div className="page orders-page">
      <PageHeader title={t('orders')} description={t('orders.d')} action={<div className="row order-header-actions">
        <button type="button" className="btn btn--default" title={t('orderExportHelp')} disabled={!filters || !page || !rows.length || exporting} aria-busy={exporting} onClick={() => void exportOrders()}><Download size={14} aria-hidden="true" />{t(exporting ? 'loading' : 'orderExportShort')}</button>
        <LinkButton to={path('/orders/new')} variant="primary">{t('newOrder')}</LinkButton>
      </div>} />

      {exportError && <p className="form-error" role="alert">{t(errorLabel(exportError))}</p>}
      {exported && <p className="orders-feedback" role="status">{t('orderExportDone')}</p>}
      {!valid && <p className="form-error" role="alert">{t('errInvalidOrderFilters')} <LinkButton to={path('/orders')}>{t('orderClearFilters')}</LinkButton></p>}

      <section className="data-list" aria-label={t('ordersLabel')}>
        <OrderViews key={handle} handle={handle} filters={filters} hrefFor={hrefFor} tabs={filters ? tabs.map((tab) => ({ status: tab.status, label: t(tab.label), count: page && tab.value ? num(tab.value) : undefined, href: hrefFor({ ...filters, status: tab.status }) })) : []} applied={chips.length > 0 && <>
            {chips.map((chip) => <button type="button" key={chip.key} className="orders-applied__chip" aria-label={t('orderRemoveFilter', { value: chip.label })} onClick={() => filters && applyFilters({ ...filters, [chip.key]: '', ...(chip.key === 'period' ? { from: '', to: '' } : {}) })}><span>{chip.label}</span><X size={12} aria-hidden="true" /></button>)}
            <Link className="orders-applied__clear" to={path('/orders')}>{t('orderClearFilters')}</Link>
          </>}>
          <div className="orders-bar__tools">
            <form className="orders-search" onSubmit={(e) => { e.preventDefault(); applyFilters({ ...(filters ?? emptyOrderFilters), q: searchText.trim().slice(0, 100) }) }}>
              <SearchInput label={t('search')} value={searchText} onChange={(e) => setSearchText(e.target.value.slice(0, 100))} />
            </form>
            <button type="button" className="btn btn--default orders-toolbar__filters" aria-haspopup="dialog" aria-expanded={filtersOpen} onClick={openFilters}><SlidersHorizontal size={14} aria-hidden="true" /><span>{t('orderFiltersShort')}</span>{filterCount > 0 && <span className="orders-filter-count">{num(filterCount)}</span>}</button>
          </div>
        </OrderViews>

        {valid && !page && !failed && <div className="orders-loading" role="status" aria-label={t('loading')}>{Array.from({ length: 5 }, (_, i) => <div key={i} className="skeleton-row"><Skeleton width="5rem" /><Skeleton width="12rem" /><Skeleton width="5rem" /></div>)}</div>}
        {failed && <Notice role="alert" title={t('ordersError')} body={t('ordersErrorBody')} action={<Button onClick={() => void load()}>{t('retry')}</Button>} />}
        {page && rows.length === 0 && (activeFilters
          ? <Notice title={t('ordersNoMatch')} body={t('ordersNoMatchBody')} action={<LinkButton to={path('/orders')}>{t('orderClearFilters')}</LinkButton>} />
          : <Notice title={t('ordersEmptyTitle')} body={t('ordersEmptyBody')} action={<LinkButton to={path('/orders/new')}>{t('newOrder')}</LinkButton>} />)}

        {page && rows.length > 0 && <>
          <div className="data-list__scroll orders-table-wrap" tabIndex={0} role="region" aria-label={t('orderTableHelp')}>
            <table className="data-table orders-table">
              <thead><tr><th scope="col" className="orders-table__number">{t('colOrder')}</th><th scope="col" className="orders-table__date" aria-sort="descending">{t('orderDateColumn')} <ArrowDown size={12} aria-hidden="true" /></th><th scope="col" className="orders-table__customer">{t('colCustomer')}</th><th scope="col" className="orders-table__source">{t('orderSourceColumn')}</th><th scope="col" className="orders-table__total">{t('colTotal')}</th><th scope="col" className="orders-table__status">{t('colStatus')}</th><th scope="col" className="orders-table__items">{t('orderProductsColumn')}</th></tr></thead>
              <tbody>{rows.map((order) => <tr key={order.id} onClick={() => navigate(path(`/orders/${order.id}`))}>
                <th scope="row"><div className="orders-table__identity"><Link className="order-number" to={path(`/orders/${order.id}`)} onClick={(e) => e.stopPropagation()}>{orderNumber(order.number)}</Link>{flags(order)}</div></th>
                <td className="orders-table__date"><time dateTime={order.createdAt}>{time(order.createdAt)}</time></td>
                <td><span className="order-customer" title={order.customerName}>{order.customerName}</span><span className="order-phone">{order.phone}</span></td>
                <td className="orders-table__source">{sourceLabel(order.source)}</td>
                <td className="orders-table__total">{money(order.total)}</td>
                <td><Badge tone={statuses[order.status].tone}>{t(statuses[order.status].label)}</Badge></td>
                <td><span className="order-items" title={order.items}>{order.items || '—'}</span></td>
              </tr>)}</tbody>
            </table>
          </div>
          <ul className="order-cards">{rows.map((order) => <li key={order.id}><Link className="order-card" to={path(`/orders/${order.id}`)}>
            <span className="order-card__top"><span className="orders-table__identity"><strong className="order-number">{orderNumber(order.number)}</strong>{flags(order)}</span><Badge tone={statuses[order.status].tone}>{t(statuses[order.status].label)}</Badge></span>
            <span className="order-card__main"><span className="order-card__customer"><span className="order-customer">{order.customerName}</span><span className="order-phone">{order.phone}</span></span><strong className="order-card__total">{money(order.total)}</strong></span>
            <span className="order-items">{order.items}</span>
            <span className="order-card__meta"><time dateTime={order.createdAt}>{time(order.createdAt)}</time><span>{sourceLabel(order.source)}</span></span>
          </Link></li>)}</ul>
        </>}
        {page && <footer className="data-list__footer"><span>{t('orderShowingCount', { n: num(rows.length), total: num(matching) })}</span>{page.hasMore ? <Button disabled={loadingMore} aria-busy={loadingMore} onClick={() => void more()}>{t(moreFailed ? 'retry' : loadingMore ? 'loading' : 'mediaLoadMore')}</Button> : <span>{t('orderNewestFirst')}</span>}</footer>}
        {moreFailed && <p className="form-error orders-more-error" role="alert">{t('ordersError')}</p>}
      </section>
      {filtersOpen && <OrderFilters key={`${handle}:${filterQuery}`} filters={filters ?? { ...emptyOrderFilters, q }} counts={counts} onApply={applyFilters} onClose={closeFilters} />}
    </div>
  )
}
