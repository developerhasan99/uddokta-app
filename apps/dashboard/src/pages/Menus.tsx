import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { ListTree, Plus } from 'lucide-react'
import { useCurrentStore, useStorePath } from '../account-context'
import { api, errorCode } from '../api'
import { DialogHead } from '../components/DialogHead'
import { useDialog } from '../components/dialog'
import { Badge, Button, Field, Notice, PageHeader, Skeleton } from '../components/ui'
import { errorLabel, useLang } from '../i18n'

export type MenuRow = { id: string; handle: string; title: string; fixed: boolean; items: number; broken: number; updatedAt: string }

export function Menus() {
  const { t, num, ago } = useLang()
  const path = useStorePath()
  const navigate = useNavigate()
  const handle = useCurrentStore()!.store.handle
  const [rows, setRows] = useState<MenuRow[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [adding, setAdding] = useState(false)

  const load = useCallback(async () => {
    setFailed(false)
    try {
      setRows(await api<MenuRow[]>(`/stores/${handle}/menus`))
    } catch {
      setFailed(true)
    }
  }, [handle])

  useEffect(() => {
    void load()
  }, [load])

  const open = (id: string) => navigate(path(`/online-store/menus/${id}`))

  return (
    <div className="page">
      <PageHeader title={t('menus')} description={t('menus.d')} action={<Button variant="primary" onClick={() => setAdding(true)}><Plus size={16} aria-hidden="true" />{t('menuAddMenu')}</Button>} />
      {failed && <section className="card card--flush"><Notice role="alert" title={t('menuLoadFailed')} action={<Button onClick={() => void load()}>{t('retry')}</Button>} /></section>}
      {!failed && (
        <div className="data-list">
          {!rows && <div role="status" aria-label={t('loading')}>{Array.from({ length: 2 }, (_, i) => <div key={i} className="skeleton-row"><Skeleton width="14rem" /><Skeleton width="5rem" /></div>)}</div>}
          {rows && rows.length === 0 && <Notice title={t('menuListEmpty')} action={<Button onClick={() => setAdding(true)}>{t('menuAddMenu')}</Button>} />}
          {rows && rows.length > 0 && (
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">{t('menuTitle')}</th>
                  <th scope="col" className="data-table__meta">{t('menuHandle')}</th>
                  <th scope="col" className="data-table__meta">{t('menuItems')}</th>
                  <th scope="col" className="data-table__meta">{t('pageUpdated')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="data-table__row" onClick={() => open(row.id)}>
                    <td>
                      <Link className="data-table__file" to={path(`/online-store/menus/${row.id}`)} onClick={(e) => e.stopPropagation()}>
                        <span className="data-table__thumb data-table__thumb--icon"><ListTree size={16} aria-hidden="true" /></span>
                        <span className="data-table__text">
                          <span className="data-table__name" title={row.title}>{row.title}</span>
                          <span className="menu-row__badges">
                            {row.fixed && <Badge>{t('menuFixedBadge')}</Badge>}
                            {row.broken > 0 && <Badge tone="warning">{t('menuBrokenCount', { n: num(row.broken) })}</Badge>}
                          </span>
                        </span>
                      </Link>
                    </td>
                    <td className="data-table__meta"><code>{row.handle}</code></td>
                    <td className="data-table__meta">{num(row.items)}</td>
                    <td className="data-table__meta muted">{ago(row.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
      {adding && <NewMenuDialog handle={handle} onClose={() => setAdding(false)} onMade={open} />}
    </div>
  )
}

function NewMenuDialog({ handle, onClose, onMade }: { handle: string; onClose: () => void; onMade: (id: string) => void }) {
  const { t } = useLang()
  const { ref, close, props } = useDialog(onClose)
  const [title, setTitle] = useState('')
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    ref.current?.showModal()
  }, [])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setTried(true)
    if (!title.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      const made = await api<{ id: string }>(`/stores/${handle}/menus`, { method: 'POST', body: { title } })
      close(() => onMade(made.id))
    } catch (err) {
      setError(errorCode(err))
      setBusy(false)
    }
  }

  return (
    <dialog {...props} className="modal" aria-labelledby="new-menu-heading" onCancel={(e) => { e.preventDefault(); if (!busy) close() }}>
      <form onSubmit={(e) => void submit(e)} noValidate>
        <DialogHead id="new-menu-heading" title={t('menuNewTitle')} disabled={busy} onClose={() => close()} />
        <div className="dialog__body">
          <Field id="new-menu-title" label={t('menuTitle')} placeholder={t('menuTitleHint')} maxLength={60} autoComplete="off" autoFocus value={title} disabled={busy} error={tried && !title.trim() ? t('errNameRequired') : undefined} onChange={(e) => setTitle(e.target.value)} />
          {error && <p className="form-error" role="alert">{t(errorLabel(error))}</p>}
        </div>
        <footer className="dialog__foot dialog__foot--split">
          <Button disabled={busy} onClick={() => close()}>{t('cancel')}</Button>
          <Button type="submit" variant="primary" disabled={busy} aria-busy={busy}>{t('menuAddMenu')}</Button>
        </footer>
      </form>
    </dialog>
  )
}
