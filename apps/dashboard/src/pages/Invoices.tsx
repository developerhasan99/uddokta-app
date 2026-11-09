import { useEffect, useState, type FormEvent } from 'react'
import { CircleCheck } from 'lucide-react'
import { useCurrentStore, useStorePath } from '../account-context'
import { api, errorCode } from '../api'
import { Button, LinkButton, Notice, PageHeader, Skeleton } from '../components/ui'
import { errorLabel, useLang } from '../i18n'
import type { StoreSettingsData } from './StoreSettings'

// What a printed order shows beyond the order itself. The header comes from the business details in Settings › Store.
export function Invoices() {
  const { t } = useLang()
  const current = useCurrentStore()!
  const path = useStorePath()
  const base = `/stores/${current.store.handle}/settings`
  const canEdit = current.role !== 'staff'
  const [note, setNote] = useState<string | null>(null)
  const [saved, setSaved] = useState('')
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const show = (data: StoreSettingsData) => {
    setNote(data.invoiceNote)
    setSaved(data.invoiceNote)
  }

  const load = async () => {
    setFailed(false)
    try {
      show(await api<StoreSettingsData>(base))
    } catch {
      setFailed(true)
    }
  }

  useEffect(() => {
    void load()
  }, [base])

  useEffect(() => {
    if (!done) return
    const timer = setTimeout(() => setDone(false), 4000)
    return () => clearTimeout(timer)
  }, [done])

  const save = async (e: FormEvent) => {
    e.preventDefault()
    if (note === null) return
    setError(null)
    setBusy(true)
    try {
      show(await api<StoreSettingsData>(base, { method: 'PUT', body: { invoiceNote: note } }))
      setDone(true)
    } catch (err) {
      setError(errorCode(err))
    } finally {
      setBusy(false)
    }
  }

  if (failed) return <div className="page page--narrow"><section className="card card--flush"><Notice role="alert" title={t('storeSettingsLoadFailed')} action={<Button onClick={() => void load()}>{t('retry')}</Button>} /></section></div>
  if (note === null) return <div className="page page--narrow" role="status" aria-label={t('loading')}><Skeleton width="16rem" /><section className="card"><Skeleton /></section></div>

  return (
    <form className="page page--narrow" onSubmit={(e) => void save(e)} noValidate>
      <PageHeader title={t('invoices')} description={t('invoices.d')} action={canEdit ? <Button type="submit" variant="primary" disabled={busy || note === saved} aria-busy={busy}>{t('productSave')}</Button> : undefined} />
      {error && <p className="form-error" role="alert">{t(errorLabel(error))}</p>}
      {!canEdit && <p className="muted">{t('storeSettingsStaff')}</p>}
      <section className="card">
        <div>
          <h2>{t('invoiceHeader')}</h2>
          <p className="muted">{t('invoiceHeaderHelp')}</p>
        </div>
        <div><LinkButton to={path('/settings')}>{t('invoiceEditStore')}</LinkButton></div>
      </section>
      <section className="card card--form">
        <div className="field">
          <label htmlFor="invoice-note">{t('storeInvoiceNote')}</label>
          <textarea id="invoice-note" className="input input--area" rows={2} maxLength={300} disabled={!canEdit} aria-describedby="invoice-note-help" value={note} onChange={(e) => setNote(e.target.value)} />
          <p id="invoice-note-help" className="field__help">{t('storeInvoiceNoteHelp')}</p>
        </div>
      </section>
      <div className="toast-anchor" role="status">
        {done && <p className="toast"><CircleCheck size={18} aria-hidden="true" />{t('storeSettingsSaved')}</p>}
      </div>
    </form>
  )
}
