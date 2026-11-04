import { useEffect, useState, type FormEvent } from 'react'
import { CircleCheck } from 'lucide-react'
import { useAccount, useCurrentStore } from '../account-context'
import { api, errorCode } from '../api'
import { Button, Field, Notice, PageHeader, Skeleton } from '../components/ui'
import { errorLabel, useLang } from '../i18n'

export type StoreSettingsData = { name: string; deliveryInside: number; deliveryOutside: number; theme: string; metaPixel: string; tiktokPixel: string; menu: { label: string; href: string }[] }

const toNumber = (text: string) => Math.min(Number(text.replace(/[০-৯]/g, (d) => String('০১২৩৪৫৬৭৮৯'.indexOf(d))).replace(/\D/g, '') || 0), 100_000)

export function StoreSettings() {
  const { t } = useLang()
  const { refresh } = useAccount()
  const current = useCurrentStore()!
  const base = `/stores/${current.store.handle}/settings`
  const canEdit = current.role !== 'staff'
  const [form, setForm] = useState<StoreSettingsData | null>(null)
  const [saved, setSaved] = useState('')
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const load = async () => {
    setFailed(false)
    try {
      const data = await api<StoreSettingsData>(base)
      setForm(data)
      setSaved(JSON.stringify(data))
    } catch {
      setFailed(true)
    }
  }

  useEffect(() => {
    void load()
  }, [base])

  const save = async (e: FormEvent) => {
    e.preventDefault()
    if (!form) return
    setError(null)
    if (!form.name.trim()) {
      setError('nameRequired')
      return
    }
    setBusy(true)
    try {
      const data = await api<StoreSettingsData>(base, { method: 'PUT', body: form })
      setForm(data)
      setSaved(JSON.stringify(data))
      setDone(true)
      void refresh()
    } catch (err) {
      setError(errorCode(err))
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (!done) return
    const timer = setTimeout(() => setDone(false), 4000)
    return () => clearTimeout(timer)
  }, [done])

  if (failed) return <div className="page page--narrow"><section className="card card--flush"><Notice role="alert" title={t('storeSettingsLoadFailed')} action={<Button onClick={() => void load()}>{t('retry')}</Button>} /></section></div>
  if (!form) return <div className="page page--narrow" role="status" aria-label={t('loading')}><Skeleton width="16rem" /><section className="card"><Skeleton /></section></div>

  const dirty = JSON.stringify(form) !== saved

  return (
    <form className="page page--narrow" onSubmit={(e) => void save(e)} noValidate>
      <PageHeader title={t('sStore')} description={t('sStore.d')} action={canEdit ? <Button type="submit" variant="primary" disabled={busy || !dirty} aria-busy={busy}>{t('productSave')}</Button> : undefined} />
      {error && <p className="form-error" role="alert">{t(errorLabel(error))}</p>}
      {!canEdit && <p className="muted">{t('storeSettingsStaff')}</p>}
      <section className="card card--form">
        <Field id="store-name" label={t('storeSettingsName')} maxLength={100} disabled={!canEdit} value={form.name} error={error === 'nameRequired' && !form.name.trim() ? t('errNameRequired') : undefined} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </section>
      <section className="card card--form">
        <div>
          <h2>{t('storeSettingsDelivery')}</h2>
          <p className="muted">{t('storeSettingsDeliveryHelp')}</p>
        </div>
        <div className="price-grid price-grid--two">
          <Field id="delivery-inside" label={t('orderInside')} unit="৳" inputMode="numeric" disabled={!canEdit} value={String(form.deliveryInside)} onChange={(e) => setForm({ ...form, deliveryInside: toNumber(e.target.value) })} />
          <Field id="delivery-outside" label={t('orderOutside')} unit="৳" inputMode="numeric" disabled={!canEdit} value={String(form.deliveryOutside)} onChange={(e) => setForm({ ...form, deliveryOutside: toNumber(e.target.value) })} />
        </div>
      </section>
      <div className="toast-anchor" role="status">
        {done && <p className="toast"><CircleCheck size={18} aria-hidden="true" />{t('storeSettingsSaved')}</p>}
      </div>
    </form>
  )
}
