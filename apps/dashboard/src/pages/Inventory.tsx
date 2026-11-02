import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { CircleCheck, Package } from 'lucide-react'
import { useCurrentStore, useStorePath } from '../account-context'
import { api, errorCode } from '../api'
import { Badge, Button, LinkButton, Notice, PageHeader, SearchInput, Skeleton } from '../components/ui'
import { errorLabel, useLang, type Key } from '../i18n'
import { parseAmount, statusInfo, type ProductStatus } from '../product-form'
import { useUrlSearch } from '../use-url-search'

type Row = { variantId: string; productId: string; productName: string; status: ProductStatus; options: string[]; sku: string; stock: number | null; total: number | null; thumbUrl: string | null }
type Counts = { all: number; in: number; out: number; untracked: number }
type Page = { items: Row[]; hasMore: boolean; counts: Counts; warehouseId: string }
type WarehouseOption = { id: string; name: string }

const tabs: { value: '' | 'in' | 'out' | 'untracked'; label: Key }[] = [
  { value: '', label: 'statusAll' },
  { value: 'in', label: 'inventoryIn' },
  { value: 'out', label: 'inventoryOut' },
  { value: 'untracked', label: 'inventoryUntracked' },
]
const maxChanges = 200
const bad = (value: string) => value.trim() !== '' && parseAmount(value) === null
const toStock = (value: string) => (value.trim() === '' ? null : parseAmount(value))

export function Inventory() {
  const { t, num } = useLang()
  const path = useStorePath()
  const base = `/stores/${useCurrentStore()!.store.handle}/inventory`
  const [params, setParams] = useSearchParams()
  const warehouse = params.get('warehouse') ?? ''
  const filter = params.get('filter') ?? ''
  const { query, text, setText } = useUrlSearch()
  const latest = useRef(0)
  const [page, setPage] = useState<Page | null>(null)
  const [failed, setFailed] = useState(false)
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([])
  // What was typed, by warehouse and variant. Survives changing tab or search, so a count in progress is not lost.
  const [edits, setEdits] = useState<Record<string, { warehouseId: string; variantId: string; value: string; was: number | null }>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [justSaved, setJustSaved] = useState(false)
  const list = `${base}?q=${encodeURIComponent(query)}&filter=${filter}&warehouse=${warehouse}`

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

  // Only for choosing between warehouses, so the list works without it.
  useEffect(() => {
    api<WarehouseOption[]>(base.replace(/inventory$/, 'warehouses')).then(setWarehouses).catch(() => {})
  }, [base])

  useEffect(() => {
    if (!justSaved) return
    const timer = setTimeout(() => setJustSaved(false), 5000)
    return () => clearTimeout(timer)
  }, [justSaved])

  const changes = Object.values(edits).filter((edit) => bad(edit.value) || toStock(edit.value) !== edit.was)
  const dirty = changes.length > 0
  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const more = async () => {
    if (!page) return
    const next = await api<Page>(`${list}&offset=${page.items.length}`)
    setPage({ ...next, items: [...page.items, ...next.items] })
  }

  const tabLink = (value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set('filter', value)
    else next.delete('filter')
    const search = next.toString()
    return search ? `?${search}` : path('/products/inventory')
  }

  const save = async () => {
    setError(null)
    if (changes.some((edit) => bad(edit.value))) {
      setError('inventoryFix')
      return
    }
    setBusy(true)
    try {
      for (const warehouseId of new Set(changes.map((edit) => edit.warehouseId))) {
        const here = changes.filter((edit) => edit.warehouseId === warehouseId)
        // The API takes a limited number at once, and a long stock count can pass it.
        for (let i = 0; i < here.length; i += maxChanges) {
          const body = { warehouseId, changes: here.slice(i, i + maxChanges).map((edit) => ({ variantId: edit.variantId, stock: toStock(edit.value) })) }
          await api(base, { method: 'PATCH', body })
        }
      }
      setEdits({})
      setJustSaved(true)
      await load()
    } catch (err) {
      setError(errorCode(err))
    } finally {
      setBusy(false)
    }
  }

  const none = page !== null && !query && page.counts.all === 0

  return (
    <div className="page">
      <PageHeader title={t('inventory')} description={t('inventory.d')} />

      {failed && (
        <section className="card card--flush">
          <Notice role="alert" title={t('inventoryLoadFailed')} action={<Button onClick={() => void load()}>{t('retry')}</Button>} />
        </section>
      )}

      {!failed && none && (
        <section className="empty-card">
          <Package size={32} strokeWidth={1.5} aria-hidden="true" />
          <h2>{t('inventoryEmptyTitle')}</h2>
          <p className="muted">{t('inventoryEmptyBody')}</p>
          <LinkButton to={path('/products/new')} variant="primary">{t('productAdd')}</LinkButton>
        </section>
      )}

      {!failed && !none && (
        <div className="data-list">
          <div className="filter-bar">
            <nav className="tabs" aria-label={t('inventory')}>
              {tabs.map((tab) => (
                <Link key={tab.value} to={tabLink(tab.value)} className="tab" aria-current={filter === tab.value ? 'page' : undefined}>
                  {t(tab.label)} {page && <span className="tab__count">{num(page.counts[tab.value || 'all'])}</span>}
                </Link>
              ))}
            </nav>
            {warehouses.length > 1 && page && (
              <select
                className="input input--compact"
                aria-label={t('productStockAt')}
                value={page.warehouseId}
                onChange={(e) => {
                  const next = new URLSearchParams(params)
                  next.set('warehouse', e.target.value)
                  setParams(next, { replace: true })
                }}
              >
                {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            )}
            <SearchInput label={t('inventorySearch')} value={text} onChange={(e) => setText(e.target.value)} />
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
                  <th scope="col">{t('productVariant')}</th>
                  <th scope="col" className="data-table__sku">{t('productSku')}</th>
                  {warehouses.length > 1 && <th scope="col" className="data-table__meta data-table__total">{t('inventoryTotal')}</th>}
                  <th scope="col" className="data-table__stock">{t('productStock')}</th>
                </tr>
              </thead>
              <tbody>
                {page.items.map((row) => {
                  const label = row.options.length > 0 ? `${row.productName}: ${row.options.join(' / ')}` : row.productName
                  const key = `${page.warehouseId}:${row.variantId}`
                  const value = edits[key]?.value ?? (row.stock === null ? '' : String(row.stock))
                  return (
                    <tr key={row.variantId}>
                      <td>
                        <Link className="data-table__file" to={path(`/products/${row.productId}`)}>
                          <span className="data-table__thumb">{row.thumbUrl && <img src={row.thumbUrl} alt="" loading="lazy" />}</span>
                          <span className="data-table__text">
                            <span className="data-table__name" title={row.productName}>{row.productName}</span>
                            {row.options.length > 0 && <span className="muted">{row.options.join(' / ')}</span>}
                          </span>
                          {row.status !== 'active' && <Badge tone={statusInfo[row.status].tone}>{t(statusInfo[row.status].label)}</Badge>}
                        </Link>
                      </td>
                      <td className="data-table__sku" title={row.sku}>{row.sku || '-'}</td>
                      {warehouses.length > 1 && <td className="data-table__meta data-table__total">{row.total === null ? '-' : num(row.total)}</td>}
                      <td className="data-table__stock">
                        <input
                          className="input"
                          inputMode="numeric"
                          autoComplete="off"
                          aria-label={`${label}: ${t('productStock')}`}
                          aria-invalid={bad(value) ? true : undefined}
                          placeholder={t('productUntracked')}
                          value={value}
                          onChange={(e) => {
                            setEdits({ ...edits, [key]: { warehouseId: page.warehouseId, variantId: row.variantId, value: e.target.value, was: edits[key]?.was ?? row.stock } })
                            setJustSaved(false)
                            setError(null)
                          }}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {page?.hasMore && <div className="media__more"><Button onClick={() => void more()}>{t('mediaLoadMore')}</Button></div>}

      {error && <p className="form-error" role="alert">{t(error === 'inventoryFix' ? 'inventoryFix' : errorLabel(error))}</p>}

      {dirty && (
        <div className="save-bar">
          <strong>{t('inventoryChanges', { n: num(changes.length) })}</strong>
          <div className="row">
            <Button onClick={() => { setEdits({}); setError(null) }}>{t('productDiscard')}</Button>
            <Button variant="primary" aria-busy={busy} disabled={busy} onClick={() => void save()}>{t('productSave')}</Button>
          </div>
        </div>
      )}

      <div className="toast-anchor" role="status">
        {justSaved && <p className="toast"><CircleCheck size={18} aria-hidden="true" />{t('inventorySaved')}</p>}
      </div>
    </div>
  )
}
