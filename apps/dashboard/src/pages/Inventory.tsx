import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { ArrowDown, ArrowUp, CircleCheck, Package } from 'lucide-react'
import { useCurrentStore, useStorePath } from '../account-context'
import { api, errorCode } from '../api'
import { Badge, Button, LinkButton, Notice, PageHeader, SearchInput, Skeleton } from '../components/ui'
import { errorLabel, useLang, type Key } from '../i18n'
import { parseAmount, statusInfo, type ProductStatus } from '../product-form'
import { useUrlSearch } from '../use-url-search'

type Row = {
  variantId: string; productId: string; productName: string; status: ProductStatus; options: string[]; sku: string; barcode: string; lowStock: number | null
  stock: number | null; total: number | null; reserved: number; createdAt: string; thumbUrl: string | null
}
type Counts = { all: number; in: number; out: number; untracked: number; low: number }
type Page = { items: Row[]; hasMore: boolean; counts: Counts; warehouseId: string }
type WarehouseOption = { id: string; name: string }

const tabs: { value: '' | 'in' | 'low' | 'out' | 'untracked'; label: Key }[] = [
  { value: '', label: 'statusAll' },
  { value: 'in', label: 'inventoryIn' },
  { value: 'low', label: 'inventoryLow' },
  { value: 'out', label: 'inventoryOut' },
  { value: 'untracked', label: 'inventoryUntracked' },
]
const maxChanges = 200
const bad = (value: string) => value.trim() !== '' && parseAmount(value) === null
const toStock = (value: string) => (value.trim() === '' ? null : parseAmount(value))
type Field = 'stock' | 'sku' | 'barcode' | 'lowStock'
type Edit = { field: Field; warehouseId: string; variantId: string; value: string; was: string }
const numeric = (field: Field) => field === 'stock' || field === 'lowStock'
const isBad = (edit: Edit) => numeric(edit.field) && bad(edit.value)
const changed = (edit: Edit) => numeric(edit.field) ? isBad(edit) || toStock(edit.value) !== toStock(edit.was) : edit.value.trim() !== edit.was
const asText = (n: number | null) => (n === null ? '' : String(n))
const saved = (row: Row, field: Field) => (field === 'stock' ? asText(row.stock) : field === 'lowStock' ? asText(row.lowStock) : row[field])
type Edits = Record<string, Edit>
type Fill = { row: number; field: Field; to: number }
const maxUndo = 100

export function Inventory() {
  const { t, num, day } = useLang()
  const path = useStorePath()
  const base = `/stores/${useCurrentStore()!.store.handle}/inventory`
  const [params, setParams] = useSearchParams()
  const warehouse = params.get('warehouse') ?? ''
  const filter = params.get('filter') ?? ''
  const oldest = params.get('sort') === 'oldest'
  const { query, text, setText } = useUrlSearch()
  const latest = useRef(0)
  const [page, setPage] = useState<Page | null>(null)
  const [failed, setFailed] = useState(false)
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([])
  // What was typed, by field and variant (and warehouse, for stock). Survives changing tab or search, so a count in progress is not lost.
  const [edits, setEdits] = useState<Edits>({})
  // Spreadsheet-style history: each typed cell, fill or discard is one step.
  const [past, setPast] = useState<Edits[]>([])
  const [future, setFuture] = useState<Edits[]>([])
  const typing = useRef<string | null>(null)
  const [active, setActive] = useState<{ row: number; field: Field } | null>(null)
  const [fill, setFill] = useState<Fill | null>(null)
  const fillRef = useRef<Fill | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [justSaved, setJustSaved] = useState(false)
  const list = `${base}?q=${encodeURIComponent(query)}&filter=${filter}&warehouse=${warehouse}${oldest ? '&sort=oldest' : ''}`

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

  const changes = Object.values(edits).filter(changed)
  const dirty = changes.length > 0

  // A group (one cell being typed in) records one undo step however many keys are pressed.
  const commit = (next: Edits, group: string | null = null) => {
    if (group === null || typing.current !== group) {
      setPast((p) => [...p.slice(1 - maxUndo), edits])
      setFuture([])
    }
    typing.current = group
    setEdits(next)
    setJustSaved(false)
    setError(null)
  }
  const undo = () => {
    if (past.length === 0) return
    setFuture([edits, ...future])
    setEdits(past[past.length - 1])
    setPast(past.slice(0, -1))
    typing.current = null
  }
  const redo = () => {
    if (future.length === 0) return
    setPast([...past, edits])
    setEdits(future[0])
    setFuture(future.slice(1))
    typing.current = null
  }

  const cellKey = (field: Field, variantId: string) => `${field}:${field === 'stock' ? page?.warehouseId : ''}:${variantId}`
  const valueOf = (row: Row, field: Field) => edits[cellKey(field, row.variantId)]?.value ?? saved(row, field)
  const withValue = (next: Edits, row: Row, field: Field, value: string) => {
    const key = cellKey(field, row.variantId)
    next[key] = { field, warehouseId: field === 'stock' ? page!.warehouseId : '', variantId: row.variantId, value, was: edits[key]?.was ?? saved(row, field) }
    return next
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return
      const target = e.target as HTMLElement
      // Leave other fields (like search) their own undo.
      if (target.closest('input, textarea, select') && !target.closest('.inventory-table')) return
      const key = e.key.toLowerCase()
      if (key === 'z' && !e.shiftKey) { e.preventDefault(); undo() }
      else if ((key === 'z' && e.shiftKey) || key === 'y') { e.preventDefault(); redo() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // Dragging the fill handle copies the cell's value up or down its column.
  const dragging = fill !== null
  useEffect(() => {
    if (!dragging) return
    const move = (e: PointerEvent) => {
      const cell = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-row]')
      const current = fillRef.current
      if (!cell || !current) return
      const next = { ...current, to: Number(cell.dataset.row) }
      fillRef.current = next
      setFill(next)
    }
    const up = () => {
      const done = fillRef.current
      fillRef.current = null
      setFill(null)
      if (!done || done.to === done.row || !page) return
      const value = valueOf(page.items[done.row], done.field)
      const next = { ...edits }
      for (let r = Math.min(done.row, done.to); r <= Math.max(done.row, done.to); r++) if (r !== done.row) withValue(next, page.items[r], done.field, value)
      commit(next)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up, { once: true })
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  })
  const inFill = (row: number, field: Field) => fill !== null && fill.field === field && row >= Math.min(fill.row, fill.to) && row <= Math.max(fill.row, fill.to)
  const focusCell = (row: number, field: Field) => document.querySelector<HTMLInputElement>(`[data-row="${row}"][data-field="${field}"] input`)?.select()
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

  const tabLink = (value: string, key = 'filter') => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    const search = next.toString()
    return search ? `?${search}` : path('/products/inventory')
  }

  const save = async () => {
    setError(null)
    if (changes.some(isBad)) {
      setError('inventoryFix')
      return
    }
    // One change per variant per warehouse; SKU, barcode and the alert belong to the variant, so they go with any warehouse.
    const byWarehouse = new Map<string, Map<string, Record<string, unknown>>>()
    for (const edit of changes) {
      const variants = byWarehouse.get(edit.warehouseId) ?? new Map<string, Record<string, unknown>>()
      byWarehouse.set(edit.warehouseId, variants)
      const change = variants.get(edit.variantId) ?? { variantId: edit.variantId }
      change[edit.field] = numeric(edit.field) ? toStock(edit.value) : edit.value.trim()
      variants.set(edit.variantId, change)
    }
    setBusy(true)
    try {
      for (const [warehouseId, variants] of byWarehouse) {
        const all = [...variants.values()]
        // The API takes a limited number at once, and a long stock count can pass it.
        for (let i = 0; i < all.length; i += maxChanges) {
          await api(base, { method: 'PATCH', body: { warehouseId, changes: all.slice(i, i + maxChanges) } })
        }
      }
      setEdits({})
      setPast([])
      setFuture([])
      typing.current = null
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
      <PageHeader
        title={t('inventory')}
        description={t('inventory.d')}
        action={!failed && !none && (
          <div className="row inventory-actions">
            {dirty && <span className="muted">{t('inventoryChanges', { n: num(changes.length) })}</span>}
            <Button disabled={!dirty || busy} onClick={() => commit({})}>{t('productDiscard')}</Button>
            <Button variant="primary" aria-busy={busy} disabled={!dirty || busy} onClick={() => void save()}>{t('inventoryUpdate')}</Button>
          </div>
        )}
      />

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
            <div className="data-list__scroll">
              <table className="data-table inventory-table">
                <thead>
                  <tr>
                    <th scope="col">{t('inventoryProduct')}</th>
                    <th scope="col" className="inventory-table__code">{t('productSku')}</th>
                    <th scope="col" className="inventory-table__code data-table__wide">{t('inventoryBarcode')}</th>
                    <th scope="col" className="data-table__stock" title={t('inventoryAvailableHint')}>{t('inventoryAvailable')}</th>
                    <th scope="col" className="data-table__meta end" title={t('inventoryReservedHint')}>{t('inventoryReserved')}</th>
                    {warehouses.length > 1 && <th scope="col" className="data-table__meta data-table__total">{t('inventoryTotal')}</th>}
                    <th scope="col" className="data-table__stock inventory-table__alert" title={t('inventoryAlertHint')}>{t('inventoryAlert')}</th>
                    <th scope="col" className="data-table__meta inventory-table__date" aria-sort={oldest ? 'ascending' : 'descending'}>
                      <Link to={tabLink(oldest ? '' : 'oldest', 'sort')} className="inventory-table__sort">
                        {t('inventoryCreated')} {oldest ? <ArrowUp size={12} aria-hidden="true" /> : <ArrowDown size={12} aria-hidden="true" />}
                      </Link>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {page.items.map((row, index) => {
                    const label = row.options.length > 0 ? `${row.productName}: ${row.options.join(' / ')}` : row.productName
                    const low = row.total !== null && row.lowStock !== null && row.total <= row.lowStock
                    const input = (field: Field, name: string, attrs: { className?: string; maxLength?: number } = {}) => {
                      const value = valueOf(row, field)
                      const isActive = active?.row === index && active.field === field
                      const edited = changed(edits[cellKey(field, row.variantId)] ?? { field, warehouseId: '', variantId: '', value, was: value })
                      return (
                        <td
                          data-row={index}
                          data-field={field}
                          className={`sheet__cell ${attrs.className ?? ''}${inFill(index, field) ? ' sheet__cell--fill' : ''}${edited ? ' sheet__cell--edited' : ''}`}
                        >
                          <input
                            className="input"
                            maxLength={attrs.maxLength}
                            inputMode={numeric(field) ? 'numeric' : undefined}
                            autoComplete="off"
                            aria-label={`${label}: ${name}`}
                            aria-invalid={numeric(field) && bad(value) ? true : undefined}
                            placeholder={field === 'stock' ? t('productUntracked') : undefined}
                            value={value}
                            onFocus={() => { setActive({ row: index, field }); typing.current = null }}
                            onChange={(e) => commit(withValue({ ...edits }, row, field, e.target.value), `${field}:${row.variantId}`)}
                            onKeyDown={(e) => {
                              const down = e.key === 'ArrowDown' || (e.key === 'Enter' && !e.shiftKey)
                              const up = e.key === 'ArrowUp' || (e.key === 'Enter' && e.shiftKey)
                              if (!down && !up) return
                              e.preventDefault()
                              focusCell(index + (down ? 1 : -1), field)
                            }}
                          />
                          {isActive && !busy && (
                            <span
                              className="sheet__handle"
                              aria-hidden="true"
                              title={t('inventoryFillHint')}
                              onPointerDown={(e) => {
                                e.preventDefault()
                                fillRef.current = { row: index, field, to: index }
                                setFill(fillRef.current)
                              }}
                            />
                          )}
                        </td>
                      )
                    }
                    return (
                      <tr key={row.variantId}>
                        <td>
                          <div className="data-table__file">
                            <span className="data-table__thumb">{row.thumbUrl && <img src={row.thumbUrl} alt="" loading="lazy" />}</span>
                            <span className="data-table__text inventory-table__product">
                              <Link className="data-table__name" to={path(`/products/${row.productId}`)} title={row.productName}>{row.productName}</Link>
                              {(row.options.length > 0 || row.status !== 'active' || low) && (
                                <span className="inventory-table__tags">
                                  {row.options.length > 0 && <Badge>{row.options.join(' / ')}</Badge>}
                                  {row.status !== 'active' && <Badge tone={statusInfo[row.status].tone}>{t(statusInfo[row.status].label)}</Badge>}
                                  {low && <Badge tone={row.total === 0 ? 'danger' : 'warning'}>{t(row.total === 0 ? 'inventoryOut' : 'inventoryLow')}</Badge>}
                                </span>
                              )}
                              {row.reserved > 0 && <span className="data-table__sub">{t('inventoryReservedSub', { n: num(row.reserved) })}</span>}
                            </span>
                          </div>
                        </td>
                        {input('sku', t('productSku'), { className: 'inventory-table__code', maxLength: 100 })}
                        {input('barcode', t('inventoryBarcode'), { className: 'inventory-table__code data-table__wide', maxLength: 100 })}
                        {input('stock', t('inventoryAvailable'), { className: 'data-table__stock' })}
                        <td className="data-table__meta end sheet__readonly">{num(row.reserved)}</td>
                        {warehouses.length > 1 && <td className="data-table__meta data-table__total sheet__readonly">{row.total === null ? '-' : num(row.total)}</td>}
                        {input('lowStock', t('inventoryAlert'), { className: 'data-table__stock inventory-table__alert' })}
                        <td className="data-table__meta inventory-table__date sheet__readonly">{day(row.createdAt)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          {page?.hasMore && <footer className="data-list__footer"><span /><Button onClick={() => void more()}>{t('mediaLoadMore')}</Button></footer>}
        </div>
      )}

      {error && <p className="form-error" role="alert">{t(error === 'inventoryFix' ? 'inventoryFix' : errorLabel(error))}</p>}

      <div className="toast-anchor" role="status">
        {justSaved && <p className="toast"><CircleCheck size={18} aria-hidden="true" />{t('inventorySaved')}</p>}
      </div>
    </div>
  )
}
