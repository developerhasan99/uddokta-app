import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { LayoutTemplate, Plus, X } from 'lucide-react'
import { useCurrentStore, useStorePath } from '../account-context'
import { api, errorCode } from '../api'
import { Badge, Button, Field, Notice, PageHeader, Skeleton } from '../components/ui'
import { errorLabel, useLang } from '../i18n'

export type PageRow = { id: string; title: string; handle: string; isPublished: boolean; hasChanges: boolean; updatedAt: string }

export function PageStatus({ page }: { page: Pick<PageRow, 'isPublished' | 'hasChanges'> }) {
  const { t } = useLang()
  if (!page.isPublished) return <Badge>{t('pageDraft')}</Badge>
  return page.hasChanges ? <Badge tone="warning">{t('pageHasChanges')}</Badge> : <Badge tone="success">{t('pageLive')}</Badge>
}

// Asks only for a name; the page starts with a full landing page layout to edit.
function NewPageDialog({ onClose }: { onClose: () => void }) {
  const { t } = useLang()
  const navigate = useNavigate()
  const path = useStorePath()
  const base = `/stores/${useCurrentStore()!.store.handle}/pages`
  const dialog = useRef<HTMLDialogElement>(null)
  const [title, setTitle] = useState('')
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    dialog.current?.showModal()
    // showModal focuses the first control, which is the close button; the name is what the seller wants first.
    dialog.current?.querySelector('input')?.focus()
  }, [])

  const create = async (e: FormEvent) => {
    e.preventDefault()
    setTried(true)
    if (!title.trim()) return
    setBusy(true)
    setError(null)
    try {
      const page = await api<{ id: string }>(base, { method: 'POST', body: { title } })
      navigate(path(`/landing-pages/${page.id}`))
    } catch (err) {
      setError(errorCode(err))
      setBusy(false)
    }
  }

  return (
    <dialog ref={dialog} className="modal" aria-labelledby="new-page-title" onClose={onClose}>
      <form className="modal__body" onSubmit={(e) => void create(e)} noValidate>
        <div className="picker__head">
          <h2 id="new-page-title">{t('pageAdd')}</h2>
          <button type="button" className="media__dismiss" aria-label={t('mediaClose')} onClick={onClose}><X size={18} aria-hidden="true" /></button>
        </div>
        <Field id="new-page-name" label={t('pageTitle')} placeholder={t('pageTitleHint')} help={t('pageTitleHelp')} maxLength={200} autoComplete="off" value={title} error={tried && !title.trim() ? t('errNameRequired') : undefined} onChange={(e) => setTitle(e.target.value)} />
        {error && <p className="form-error" role="alert">{t(errorLabel(error))}</p>}
        <div className="row row--end">
          <Button onClick={onClose}>{t('cancel')}</Button>
          <Button type="submit" variant="primary" aria-busy={busy} disabled={busy}>{t('pageCreate')}</Button>
        </div>
      </form>
    </dialog>
  )
}

export function Pages() {
  const { t, time } = useLang()
  const path = useStorePath()
  const navigate = useNavigate()
  const base = `/stores/${useCurrentStore()!.store.handle}/pages`
  const [rows, setRows] = useState<PageRow[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    setFailed(false)
    try {
      setRows(await api<PageRow[]>(base))
    } catch {
      setFailed(true)
    }
  }, [base])

  useEffect(() => {
    void load()
  }, [load])

  const addButton = <Button variant="primary" onClick={() => setCreating(true)}><Plus size={16} aria-hidden="true" />{t('pageAdd')}</Button>
  const none = rows !== null && rows.length === 0

  return (
    <div className="page">
      <PageHeader title={t('landingPages')} description={t('landingPages.d')} action={none ? undefined : addButton} />

      {failed && <section className="card card--flush"><Notice role="alert" title={t('pagesLoadFailed')} action={<Button onClick={() => void load()}>{t('retry')}</Button>} /></section>}

      {!failed && none && (
        <section className="empty-card">
          <LayoutTemplate size={32} strokeWidth={1.5} aria-hidden="true" />
          <h2>{t('pageEmptyTitle')}</h2>
          <p className="muted">{t('pageEmptyBody')}</p>
          {addButton}
        </section>
      )}

      {!failed && !rows && (
        <div className="data-list" role="status" aria-label={t('loading')}>
          {Array.from({ length: 3 }, (_, i) => <div key={i} className="skeleton-row"><Skeleton width="16rem" /><Skeleton width="5rem" /></div>)}
        </div>
      )}

      {rows && rows.length > 0 && (
        <div className="data-list">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">{t('pageTitle')}</th>
                <th scope="col">{t('pageStatus')}</th>
                <th scope="col" className="data-table__meta">{t('pageUpdated')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="data-table__row" onClick={() => navigate(path(`/landing-pages/${row.id}`))}>
                  <td>
                    <Link className="data-table__text" to={path(`/landing-pages/${row.id}`)} onClick={(e) => e.stopPropagation()}>
                      <span className="data-table__name" title={row.title}>{row.title}</span>
                      <span className="muted data-table__sub">/pages/{row.handle}</span>
                    </Link>
                  </td>
                  <td><PageStatus page={row} /></td>
                  <td className="data-table__meta">{time(row.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {creating && <NewPageDialog onClose={() => setCreating(false)} />}
    </div>
  )
}
