import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Bookmark, MoreHorizontal, Save, Trash2, X } from 'lucide-react'
import * as Dropdown from '@radix-ui/react-dropdown-menu'
import { emptyOrderFilters, orderFilterParams, type OrderFilters } from 'storefront/order-filters'
import { api, errorCode } from '../api'
import { errorLabel, useLang } from '../i18n'
import { Button, Field } from './ui'

type SavedView = { id: string; name: string; filters: OrderFilters }

export function OrderViews({ handle, filters, onApply }: { handle: string; filters: OrderFilters | null; onApply: (filters: OrderFilters) => void }) {
  const { t } = useLang()
  const base = `/stores/${handle}/order-views`
  const latest = useRef(0)
  const [views, setViews] = useState<SavedView[] | null>(null)
  const [selected, setSelected] = useState('')
  const [failed, setFailed] = useState(false)
  const [mode, setMode] = useState<'save' | 'delete' | null>(null)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const saving = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)
  const viewTrigger = useRef<HTMLButtonElement>(null)
  const dialogWasOpen = useRef(false)
  const current = views?.find((v) => v.id === selected)
  const changed = !!current && !!filters && orderFilterParams(current.filters).toString() !== orderFilterParams(filters).toString()

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
    if (mode) {
      dialog.current?.showModal()
      if (mode === 'save') dialog.current?.querySelector<HTMLInputElement>('#order-view-name')?.focus()
      dialogWasOpen.current = true
    }
    else if (dialogWasOpen.current) { viewTrigger.current?.focus(); dialogWasOpen.current = false }
  }, [mode])

  const mutate = async (action: 'save' | 'update' | 'delete', e?: FormEvent) => {
    e?.preventDefault()
    if (saving.current || !filters || (action !== 'save' && !current)) return
    if (action === 'save' && !name.trim()) { setError('nameRequired'); return }
    saving.current = true
    setBusy(true)
    setError(null)
    setDone(false)
    try {
      if (action === 'delete') {
        await api(`${base}/${current!.id}`, { method: 'DELETE' })
        setViews((previous) => previous?.filter((v) => v.id !== current!.id) ?? [])
        setSelected('')
      } else {
        const result = await api<SavedView>(action === 'save' ? base : `${base}/${current!.id}`, { method: action === 'save' ? 'POST' : 'PUT', body: { name: action === 'save' ? name : current!.name, filters } })
        setViews((previous) => action === 'save' ? [...(previous ?? []), result] : (previous ?? []).map((v) => v.id === result.id ? result : v))
        setSelected(result.id)
      }
      setMode(null)
      setDone(true)
    } catch (err) { setError(errorCode(err)) }
    finally { saving.current = false; setBusy(false) }
  }

  const hasFilters = !!filters && Object.values(filters).some(Boolean)
  const pickerValue = selected || (hasFilters ? 'custom' : 'all')
  return <div className="order-view-picker">
    <label className="order-view-picker__select"><span className="visually-hidden">{t('orderViews')}</span>
      <select className="input" value={pickerValue} disabled={!views || busy} onChange={(e) => {
        const view = views?.find((v) => v.id === e.target.value)
        setSelected(view?.id ?? ''); setError(null); setDone(false)
        if (view) onApply(view.filters)
        else if (e.target.value === 'all') onApply({ ...emptyOrderFilters })
      }}><option value="all">{t('orderAllOrders')}</option>{hasFilters && !selected && <option value="custom" disabled>{t('orderCustomView')}</option>}{views?.map((v) => <option key={v.id} value={v.id}>{v.name}{v.id === selected && changed ? ' *' : ''}</option>)}</select>
    </label>
    <Dropdown.Root>
      <Dropdown.Trigger ref={viewTrigger} className="btn btn--icon order-view-picker__menu" aria-label={t('orderViewActions')} disabled={busy}><MoreHorizontal size={16} aria-hidden="true" /></Dropdown.Trigger>
      <Dropdown.Portal><Dropdown.Content className="menu" align="start" sideOffset={6} collisionPadding={8}>
        <Dropdown.Label className="menu__label">{t('orderViews')}</Dropdown.Label>
        <Dropdown.Item className="menu__item menu__action" disabled={!filters || !views || busy} onSelect={() => { setMode('save'); setName(''); setError(null); setDone(false) }}><Bookmark size={14} aria-hidden="true" />{t('orderViewSave')}</Dropdown.Item>
        {current && <>
          <Dropdown.Item className="menu__item menu__action" disabled={!changed || busy || !filters} onSelect={() => void mutate('update')}><Save size={14} aria-hidden="true" />{t('orderViewUpdate')}</Dropdown.Item>
          <Dropdown.Item className="menu__item menu__action menu__item--danger" disabled={busy} onSelect={() => { setMode('delete'); setError(null) }}><Trash2 size={14} aria-hidden="true" />{t('orderViewRemove')}</Dropdown.Item>
        </>}
      </Dropdown.Content></Dropdown.Portal>
    </Dropdown.Root>
    {failed && <div className="order-view-picker__feedback" role="alert">{t('orderViewsLoadFailed')} <Button onClick={() => void load()}>{t('retry')}</Button></div>}
    {!mode && error && <p className="form-error order-view-picker__feedback" role="alert">{t(errorLabel(error))}</p>}
    {done && <span className="visually-hidden" role="status">{t('orderViewDone')}</span>}
    {changed && <span className="visually-hidden" role="status">{t('orderViewChanged')}</span>}
    {mode && <dialog ref={dialog} className="modal order-view-dialog" aria-labelledby="order-view-title" aria-describedby="order-view-description" onClose={() => setMode(null)} onCancel={(e) => { if (saving.current) e.preventDefault() }}>
      <form className="order-view-dialog__form" onSubmit={(e) => void mutate(mode, e)} noValidate>
        <header className="order-view-dialog__head">
          <h2 id="order-view-title">{t(mode === 'save' ? 'orderViewSaveTitle' : 'orderViewRemove')}</h2>
          <button type="button" className="media__dismiss" disabled={busy} aria-label={t('mediaClose')} onClick={() => setMode(null)}><X size={16} aria-hidden="true" /></button>
        </header>
        <div className="order-view-dialog__body">
          <p id="order-view-description" className="muted">{t(mode === 'save' ? 'orderViewSaveHelp' : 'orderViewRemoveHelp', { name: current?.name ?? '' })}</p>
          {mode === 'save' && <Field id="order-view-name" label={t('orderViewName')} placeholder={t('orderViewNameHint')} value={name} maxLength={80} disabled={busy} onChange={(e) => { setName(e.target.value); if (error === 'nameRequired') setError(null) }} autoComplete="off" autoFocus />}
          {error && <p className="form-error" role="alert">{t(errorLabel(error))}</p>}
        </div>
        <footer className="order-view-dialog__footer"><Button disabled={busy} onClick={() => setMode(null)}>{t('cancel')}</Button><Button type="submit" variant={mode === 'delete' ? 'danger' : 'primary'} disabled={busy || (mode === 'save' && !name.trim())} aria-busy={busy}>{t(mode === 'delete' ? 'orderViewRemove' : 'orderViewSaveAction')}</Button></footer>
      </form>
    </dialog>}
  </div>
}
