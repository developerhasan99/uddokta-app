import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { FileText, Plus } from 'lucide-react'
import { useCurrentStore, useStorePath } from '../account-context'
import { api, errorCode } from '../api'
import { DialogHead } from '../components/DialogHead'
import { useDialog } from '../components/dialog'
import { BulkBar, BulkDelete, SelectAllCell, SelectCell, useSelection } from '../components/Selection'
import { Badge, Button, Field, Notice, PageHeader, SearchInput, Skeleton } from '../components/ui'
import { errorLabel, useLang, type Key } from '../i18n'
import { useUrlSearch } from '../use-url-search'

export const policyKinds = ['refund', 'privacy', 'shipping', 'terms', 'contact'] as const
export type PolicyKind = typeof policyKinds[number]
export const policyLabels: Record<PolicyKind, Key> = { refund: 'policyRefund', privacy: 'policyPrivacy', shipping: 'policyShipping', terms: 'policyTerms', contact: 'policyContact' }
type Row = { id: string; title: string; handle: string; visible: boolean; publishAt: string | null; policy: PolicyKind | null; updatedAt: string }

// Visible now, waiting for its date, or hidden: what a buyer gets on the page's address.
export function pageState(row: { visible: boolean; publishAt: string | null }): 'visible' | 'scheduled' | 'hidden' {
  if (!row.visible) return 'hidden'
  return row.publishAt && new Date(row.publishAt) > new Date() ? 'scheduled' : 'visible'
}
export const stateBadge = { visible: ['success', 'storePageVisible'], scheduled: ['info', 'storePageScheduled'], hidden: ['neutral', 'storePageHidden'] } as const

export function StorePages() {
  const { t, ago } = useLang()
  const path = useStorePath()
  const navigate = useNavigate()
  const current = useCurrentStore()!
  const base = `/stores/${current.store.handle}/store-pages`
  const { query, text, setText } = useUrlSearch()
  const latest = useRef(0)
  const [rows, setRows] = useState<Row[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [adding, setAdding] = useState(false)
  const canDelete = current.role !== 'staff'
  const selection = useSelection(rows?.map((r) => r.id) ?? [])

  const load = useCallback(async () => {
    const request = ++latest.current
    setFailed(false)
    try {
      const result = await api<Row[]>(`${base}?q=${encodeURIComponent(query)}`)
      if (request === latest.current) setRows(result)
    } catch {
      if (request === latest.current) setFailed(true)
    }
  }, [base, query])

  useEffect(() => {
    void load()
  }, [load])

  const bulk = async (action: (id: string) => Promise<unknown>) => {
    await selection.run(action)
    void load()
  }

  const none = rows !== null && !query && rows.length === 0
  const addButton = <Button variant="primary" onClick={() => setAdding(true)}><Plus size={16} aria-hidden="true" />{t('storePageAdd')}</Button>
  const open = (id: string) => navigate(path(`/online-store/pages/${id}`))

  return (
    <div className="page">
      <PageHeader title={t('pages')} description={t('pages.d')} action={none ? undefined : addButton} />
      {failed && <section className="card card--flush"><Notice role="alert" title={t('storePageLoadFailed')} action={<Button onClick={() => void load()}>{t('retry')}</Button>} /></section>}

      {!failed && none && (
        <section className="empty-card">
          <FileText size={32} strokeWidth={1.5} aria-hidden="true" />
          <h2>{t('storePageEmptyTitle')}</h2>
          <p className="muted">{t('storePageEmptyBody')}</p>
          {addButton}
        </section>
      )}

      {!failed && !none && (
        <div className="data-list">
          <div className="filter-bar">
            <div className="tabs" />
            <SearchInput label={t('storePageSearch')} value={text} onChange={(e) => setText(e.target.value)} />
          </div>
          <BulkBar selection={selection}>
            <Button disabled={selection.busy} onClick={() => void bulk((id) => api(`${base}/${id}`, { method: 'PATCH', body: { visible: true } }))}>{t('storePageShow')}</Button>
            <Button disabled={selection.busy} onClick={() => void bulk((id) => api(`${base}/${id}`, { method: 'PATCH', body: { visible: false } }))}>{t('storePageHide')}</Button>
            {canDelete && <BulkDelete selection={selection} onDelete={() => void bulk((id) => api(`${base}/${id}`, { method: 'DELETE' }))} />}
          </BulkBar>

          {!rows && <div role="status" aria-label={t('loading')}>{Array.from({ length: 4 }, (_, i) => <div key={i} className="skeleton-row"><Skeleton width="16rem" /><Skeleton width="5rem" /></div>)}</div>}
          {rows && rows.length === 0 && <Notice title={t('storePageNoMatch')} action={<Button onClick={() => setText('')}>{t('clearFilters')}</Button>} />}
          {rows && rows.length > 0 && (
            <table className="data-table">
              <thead>
                <tr>
                  <SelectAllCell selection={selection} />
                  <th scope="col">{t('storePageTitle')}</th>
                  <th scope="col" className="data-table__meta">{t('storePageState')}</th>
                  <th scope="col" className="data-table__meta">{t('storePageKind')}</th>
                  <th scope="col" className="data-table__meta">{t('pageUpdated')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const state = pageState(row)
                  return (
                    <tr key={row.id} className="data-table__row" onClick={() => open(row.id)}>
                      <SelectCell selection={selection} id={row.id} name={row.title} />
                      <td>
                        <Link className="data-table__file" to={path(`/online-store/pages/${row.id}`)} onClick={(e) => e.stopPropagation()}>
                          <span className="data-table__text">
                            <span className="data-table__name" title={row.title}>{row.title}</span>
                            <span className="muted data-table__sub">/{row.handle}</span>
                          </span>
                        </Link>
                      </td>
                      <td className="data-table__meta"><Badge tone={stateBadge[state][0]}>{t(stateBadge[state][1])}</Badge></td>
                      <td className="data-table__meta">{row.policy ? t(policyLabels[row.policy]) : t('storePageKindPage')}</td>
                      <td className="data-table__meta muted">{ago(row.updatedAt)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
      {adding && <NewPageDialog base={base} existing={new Set(rows?.flatMap((r) => (r.policy ? [r.policy] : [])))} onClose={() => setAdding(false)} onMade={open} />}
    </div>
  )
}

// A blank page with a title, or one of the policies from our starting text (one of each per store).
function NewPageDialog({ base, existing, onClose, onMade }: { base: string; existing: Set<string>; onClose: () => void; onMade: (id: string) => void }) {
  const { t } = useLang()
  const { ref, close, props } = useDialog(onClose)
  const [kind, setKind] = useState<'page' | PolicyKind>('page')
  const [title, setTitle] = useState('')
  const [footer, setFooter] = useState(true)
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    ref.current?.showModal()
  }, [])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setTried(true)
    if ((kind === 'page' && !title.trim()) || busy) return
    setBusy(true)
    setError(null)
    try {
      const body = kind === 'page' ? { title, addToFooter: footer } : { policy: kind, addToFooter: footer }
      const made = await api<{ id: string }>(base, { method: 'POST', body })
      close(() => onMade(made.id))
    } catch (err) {
      setError(errorCode(err))
      setBusy(false)
    }
  }

  return (
    <dialog {...props} className="modal" aria-labelledby="new-page-heading" onCancel={(e) => { e.preventDefault(); if (!busy) close() }}>
      <form onSubmit={(e) => void submit(e)} noValidate>
        <DialogHead id="new-page-heading" title={t('storePageAdd')} disabled={busy} onClose={() => close()} />
        <div className="dialog__body">
          <fieldset className="choice-list">
            <legend className="field__label">{t('storePageStartWith')}</legend>
            <label className="check-line"><input type="radio" className="check" name="kind" checked={kind === 'page'} onChange={() => setKind('page')} />{t('storePageBlank')}</label>
            {kind === 'page' && <Field id="new-page-title" label={t('storePageTitle')} placeholder={t('storePageTitleHint')} maxLength={200} autoComplete="off" value={title} disabled={busy} error={tried && !title.trim() ? t('errNameRequired') : undefined} onChange={(e) => setTitle(e.target.value)} />}
            {policyKinds.map((k) => (
              <label key={k} className="check-line">
                <input type="radio" className="check" name="kind" disabled={existing.has(k)} checked={kind === k} onChange={() => setKind(k)} />
                {t(policyLabels[k])}{existing.has(k) && <span className="muted"> · {t('storePagePolicyExists')}</span>}
              </label>
            ))}
            <p className="field__help">{t('storePagePolicyHelp')}</p>
          </fieldset>
          <label className="check-line"><input type="checkbox" className="check" checked={footer} onChange={(e) => setFooter(e.target.checked)} />{t('storePageAddToFooter')}</label>
          {error && <p className="form-error" role="alert">{t(errorLabel(error))}</p>}
        </div>
        <footer className="dialog__foot dialog__foot--split">
          <Button disabled={busy} onClick={() => close()}>{t('cancel')}</Button>
          <Button type="submit" variant="primary" disabled={busy} aria-busy={busy}>{t('storePageCreate')}</Button>
        </footer>
      </form>
    </dialog>
  )
}
