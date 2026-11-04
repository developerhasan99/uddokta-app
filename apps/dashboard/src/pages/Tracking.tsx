import { useEffect, useState, type FormEvent } from 'react'
import { CircleCheck } from 'lucide-react'
import { useCurrentStore } from '../account-context'
import { api, errorCode } from '../api'
import { Button, Field, PageHeader, Skeleton } from '../components/ui'
import { errorLabel, useLang } from '../i18n'
import type { StoreSettingsData } from './StoreSettings'

export function Tracking() {
  const { t } = useLang()
  const current = useCurrentStore()!
  const handle = current.store.handle
  const canEdit = current.role !== 'staff'
  const [form, setForm] = useState<{ metaPixel: string; tiktokPixel: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    api<StoreSettingsData>(`/stores/${handle}/settings`).then((s) => setForm({ metaPixel: s.metaPixel, tiktokPixel: s.tiktokPixel })).catch((err) => setError(errorCode(err)))
  }, [handle])

  useEffect(() => {
    if (!done) return
    const timer = setTimeout(() => setDone(false), 4000)
    return () => clearTimeout(timer)
  }, [done])

  const save = async (e: FormEvent) => {
    e.preventDefault()
    if (!form) return
    setBusy(true)
    setError(null)
    try {
      setForm(await api(`/stores/${handle}/tracking`, { method: 'PUT', body: form }))
      setDone(true)
    } catch (err) {
      setError(errorCode(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="page page--narrow" onSubmit={(e) => void save(e)} noValidate>
      <PageHeader title={t('tracking')} description={t('tracking.d')} action={canEdit ? <Button type="submit" variant="primary" disabled={busy || !form} aria-busy={busy}>{t('productSave')}</Button> : undefined} />
      {error && <p className="form-error" role="alert">{t(errorLabel(error))}</p>}
      {!form && !error && <section className="card"><Skeleton /></section>}
      {form && (
        <>
          <section className="card card--form">
            <Field id="meta-pixel" label={t('trackMeta')} help={t('trackMetaHelp')} inputMode="numeric" maxLength={20} disabled={!canEdit} value={form.metaPixel} onChange={(e) => setForm({ ...form, metaPixel: e.target.value.replace(/\D/g, '') })} />
            <Field id="tiktok-pixel" label={t('trackTiktok')} help={t('trackTiktokHelp')} maxLength={30} disabled={!canEdit} value={form.tiktokPixel} onChange={(e) => setForm({ ...form, tiktokPixel: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })} />
          </section>
          <section className="card">
            <h2>{t('trackWhat')}</h2>
            <p className="muted">{t('trackWhatBody')}</p>
            <p className="muted">{t('trackServerLater')}</p>
          </section>
        </>
      )}
      <div className="toast-anchor" role="status">
        {done && <p className="toast"><CircleCheck size={18} aria-hidden="true" />{t('trackSaved')}</p>}
      </div>
    </form>
  )
}
