import { useEffect, useState, type FormEvent } from 'react'
import { CircleCheck, ImagePlus } from 'lucide-react'
import { useAccount, useCurrentStore } from '../account-context'
import { api, errorCode, type MediaItem } from '../api'
import { MediaPicker } from '../components/MediaPicker'
import { Button, Field, Notice, PageHeader, Skeleton } from '../components/ui'
import { errorLabel, useLang, type Key } from '../i18n'

// Business details, printed on invoices. Blank means not given.
export type StoreDetails = { phone: string; whatsapp: string; email: string; facebook: string; address: string; legalName: string; tradeLicence: string; bin: string; invoiceNote: string }
export type StoreSettingsData = StoreDetails & { name: string; theme: string; metaPixel: string; tiktokPixel: string; menu: { label: string; href: string }[]; logo: MediaItem | null }

// Which field each API error belongs to, so the message shows under it.
const fieldOf: Record<string, keyof StoreDetails | 'name'> = { nameRequired: 'name', emailInvalid: 'email', facebookInvalid: 'facebook' }

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
  const [error, setError] = useState<{ code: string; field?: string } | null>(null)
  const [done, setDone] = useState(false)
  const [picking, setPicking] = useState(false)

  const show = (data: StoreSettingsData) => {
    setForm(data)
    setSaved(JSON.stringify(data))
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

  const save = async (e: FormEvent) => {
    e.preventDefault()
    if (!form) return
    setError(null)
    if (!form.name.trim()) {
      setError({ code: 'nameRequired', field: 'name' })
      return
    }
    setBusy(true)
    try {
      const { name, phone, whatsapp, email, facebook, address, legalName, tradeLicence, bin, invoiceNote, logo } = form
      show(await api<StoreSettingsData>(base, { method: 'PUT', body: { name, phone, whatsapp, email, facebook, address, legalName, tradeLicence, bin, invoiceNote, logoId: logo?.id ?? null } }))
      setDone(true)
      void refresh()
    } catch (err) {
      const code = errorCode(err)
      // Both phones share one error; the API checks the hotline first.
      setError({ code, field: code === 'phoneInvalid' ? (/^(\+?[0-9][0-9 -]{5,19})?$/.test(form.phone.trim()) ? 'whatsapp' : 'phone') : fieldOf[code] })
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
  const fieldError = (field: string) => (error?.field === field ? t(errorLabel(error.code)) : undefined)
  const text = (key: keyof StoreDetails, label: Key, max: number, extra: Partial<Parameters<typeof Field>[0]> = {}) => (
    <Field id={`store-${key}`} label={t(label)} maxLength={max} disabled={!canEdit} value={form[key]} error={fieldError(key)} onChange={(e) => setForm({ ...form, [key]: e.target.value })} {...extra} />
  )
  const area = (key: 'address' | 'invoiceNote', label: Key, help: Key) => (
    <div className="field">
      <label htmlFor={`store-${key}`}>{t(label)}</label>
      <textarea id={`store-${key}`} className="input input--area" rows={2} maxLength={300} disabled={!canEdit} aria-describedby={`store-${key}-help`} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
      <p id={`store-${key}-help`} className="field__help">{t(help)}</p>
    </div>
  )

  return (
    <form className="page page--narrow" onSubmit={(e) => void save(e)} noValidate>
      <PageHeader title={t('sStore')} description={t('sStore.d')} action={canEdit ? <Button type="submit" variant="primary" disabled={busy || !dirty} aria-busy={busy}>{t('productSave')}</Button> : undefined} />
      {error && !error.field && <p className="form-error" role="alert">{t(errorLabel(error.code))}</p>}
      {!canEdit && <p className="muted">{t('storeSettingsStaff')}</p>}

      <section className="card card--form" aria-labelledby="store-profile">
        <h2 id="store-profile">{t('storeProfile')}</h2>
        <Field id="store-name" label={t('storeSettingsName')} maxLength={100} disabled={!canEdit} value={form.name} error={fieldError('name') && t('errNameRequired')} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <div className="field">
          <span className="field__label">{t('storeLogo')}</span>
          {form.logo
            ? <div className="store-logo">
                <img src={form.logo.thumbUrl} alt={form.logo.alt || form.logo.name} />
                {canEdit && <div className="row"><Button onClick={() => setPicking(true)}>{t('storeLogoChange')}</Button><Button onClick={() => setForm({ ...form, logo: null })}>{t('storeLogoRemove')}</Button></div>}
              </div>
            : <button type="button" className="media__empty store-logo__empty" disabled={!canEdit} onClick={() => setPicking(true)}>
                <ImagePlus size={20} strokeWidth={1.5} aria-hidden="true" />
                <strong>{t('storeLogoPick')}</strong>
              </button>}
          <p className="field__help">{t('storeLogoHelp')}</p>
        </div>
      </section>

      <section className="card card--form" aria-labelledby="store-contact">
        <div>
          <h2 id="store-contact">{t('storeContact')}</h2>
          <p className="muted">{t('storeContactHelp')}</p>
        </div>
        <div className="price-grid price-grid--two">
          {text('phone', 'storePhone', 20, { type: 'tel', inputMode: 'tel', placeholder: '01XXXXXXXXX' })}
          {text('whatsapp', 'storeWhatsapp', 20, { type: 'tel', inputMode: 'tel', placeholder: '01XXXXXXXXX' })}
          {text('email', 'storeEmail', 200, { type: 'email', inputMode: 'email', placeholder: 'shop@example.com' })}
          {text('facebook', 'storeFacebook', 300, { type: 'url', inputMode: 'url', placeholder: 'https://facebook.com/' })}
        </div>
        {area('address', 'storeBusinessAddress', 'storeBusinessAddressHelp')}
      </section>

      <section className="card card--form" aria-labelledby="store-legal">
        <div>
          <h2 id="store-legal">{t('storeLegal')}</h2>
          <p className="muted">{t('storeLegalHelp')}</p>
        </div>
        {text('legalName', 'storeLegalName', 100)}
        <div className="price-grid price-grid--two">
          {text('tradeLicence', 'storeTradeLicence', 50)}
          {text('bin', 'storeBin', 50)}
        </div>
      </section>

      <section className="card card--form" aria-labelledby="store-invoice">
        <h2 id="store-invoice">{t('storeInvoice')}</h2>
        {area('invoiceNote', 'storeInvoiceNote', 'storeInvoiceNoteHelp')}
      </section>

      {picking && (
        <MediaPicker
          selected={form.logo ? [form.logo] : []}
          max={1}
          onClose={() => setPicking(false)}
          onDone={(items) => {
            setForm({ ...form, logo: items[0] ?? null })
            setPicking(false)
          }}
        />
      )}
      <div className="toast-anchor" role="status">
        {done && <p className="toast"><CircleCheck size={18} aria-hidden="true" />{t('storeSettingsSaved')}</p>}
      </div>
    </form>
  )
}
