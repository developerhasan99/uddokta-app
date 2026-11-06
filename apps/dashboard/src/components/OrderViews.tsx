import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router'
import { Plus, X } from 'lucide-react'
import { orderFilterParams, type OrderFilters } from 'storefront/order-filters'
import { api, errorCode } from '../api'
import { errorLabel, useLang } from '../i18n'
import { Button, Field } from './ui'

type SavedView = { id: string; name: string; filters: OrderFilters }
export type StatusTab = { status: string; label: string; count?: string; href: string }

const same = (a: OrderFilters, b: OrderFilters) => orderFilterParams(a).toString() === orderFilterParams(b).toString()

// One row of tabs: built-in statuses, then the seller's saved views. A view is active when the URL's filters match it exactly.
export function OrderViews({ handle, filters, tabs, hrefFor, applied, children }: { handle: string; filters: OrderFilters | null; tabs: StatusTab[]; hrefFor: (filters: OrderFilters) => string; applied: ReactNode; children: ReactNode }) {
  const { t } = useLang()
  const base = `/stores/${handle}/order-views`
  const latest = useRef(0)
  const [views, setViews] = useState<SavedView[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [mode, setMode] = useState<'save' | 'delete' | null>(null)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const active = filters ? views?.find((v) => same(v.filters, filters)) : undefined
  const canSave = !!filters && !!views && !active && Object.entries(filters).some(([key, value]) => key !== 'status' && value)

  const load = useCallback(async () => {
    const request = ++latest.current
    setFailed(false)
    try {
      const result = await api<SavedView[]>(base)
      if (request === latest.current) setViews(result)
    } catch { if (request === latest.current) setFailed(true) }
  }, [base])
  useEffect(() => { void load(); return () => { latest.current += 1 } }, [load])
  useEffect(() => {
    if (!mode) return
    dialog.current?.showModal()
    dialog.current?.querySelector<HTMLInputElement>('#order-view-name')?.focus()
  }, [mode])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy || !filters) return
    if (mode === 'save' && !name.trim()) { setError('nameRequired'); return }
    setBusy(true)
    setError(null)
    try {
      if (mode === 'delete' && active) {
        await api(`${base}/${active.id}`, { method: 'DELETE' })
        setViews((previous) => previous?.filter((v) => v.id !== active.id) ?? [])
      } else {
        const view = await api<SavedView>(base, { method: 'POST', body: { name, filters } })
        setViews((previous) => [...(previous ?? []), view])
      }
      setMode(null)
    } catch (err) { setError(errorCode(err)) }
    finally { setBusy(false) }
  }

  return <div className="orders-bar">
    <nav className="tabs orders-tabs" aria-label={t('ordersLabel')}>
      {tabs.map((tab) => <Link key={tab.status} className="tab" to={tab.href} aria-current={!active && filters?.status === tab.status ? 'page' : undefined}>{tab.label}{tab.count && <span className="tab__count">{tab.count}</span>}</Link>)}
      {views?.map((view) => view === active
        ? <span key={view.id} className="tab orders-tabs__view" aria-current="page">{view.name}<button type="button" className="orders-tabs__remove" aria-label={t('orderViewRemoveNamed', { name: view.name })} onClick={() => { setError(null); setMode('delete') }}><X size={12} aria-hidden="true" /></button></span>
        : <Link key={view.id} className="tab" to={hrefFor(view.filters)}>{view.name}</Link>)}
      {failed && <button type="button" className="tab orders-tabs__failed" onClick={() => void load()}>{t('orderViewsLoadFailed')} {t('retry')}</button>}
    </nav>
    {children}
    {applied && <div className="orders-applied" aria-label={t('orderAppliedFilters')}>
      {applied}
      {canSave && <button type="button" className="orders-applied__save" onClick={() => { setName(''); setError(null); setMode('save') }}><Plus size={14} aria-hidden="true" />{t('orderViewSaveTitle')}</button>}
    </div>}
    {mode && <dialog ref={dialog} className="modal order-view-dialog" aria-labelledby="order-view-title" onClose={() => setMode(null)} onCancel={(e) => { if (busy) e.preventDefault() }}>
      <form className="order-view-dialog__form" onSubmit={(e) => void submit(e)} noValidate>
        <header className="order-view-dialog__head">
          <h2 id="order-view-title">{t(mode === 'save' ? 'orderViewSaveTitle' : 'orderViewRemove')}</h2>
          <button type="button" className="media__dismiss" disabled={busy} aria-label={t('mediaClose')} onClick={() => setMode(null)}><X size={16} aria-hidden="true" /></button>
        </header>
        <div className="order-view-dialog__body">
          {mode === 'save'
            ? <Field id="order-view-name" label={t('orderViewName')} placeholder={t('orderViewNameHint')} value={name} maxLength={80} disabled={busy} onChange={(e) => { setName(e.target.value); if (error === 'nameRequired') setError(null) }} autoComplete="off" autoFocus />
            : <p className="muted">{t('orderViewRemoveHelp', { name: active?.name ?? '' })}</p>}
          {error && <p className="form-error" role="alert">{t(errorLabel(error))}</p>}
        </div>
        <footer className="order-view-dialog__footer"><Button disabled={busy} onClick={() => setMode(null)}>{t('cancel')}</Button><Button type="submit" variant={mode === 'delete' ? 'danger' : 'primary'} disabled={busy || (mode === 'save' && !name.trim())} aria-busy={busy}>{t(mode === 'delete' ? 'orderViewRemove' : 'orderViewSaveAction')}</Button></footer>
      </form>
    </dialog>}
  </div>
}
