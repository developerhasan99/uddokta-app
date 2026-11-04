import { useEffect, useState, type FormEvent } from 'react'
import { X } from 'lucide-react'
import { readPhone } from 'storefront/schema'
import { useCurrentStore } from '../account-context'
import { api, errorCode } from '../api'
import { Button, Field, Notice, PageHeader, Skeleton } from '../components/ui'
import { errorLabel, useLang } from '../i18n'

type Blocked = { phone: string; reason: string; createdAt: string }

export function Protection() {
  const { t, time } = useLang()
  const base = `/stores/${useCurrentStore()!.store.handle}/blocked`
  const [rows, setRows] = useState<Blocked[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [phone, setPhone] = useState('')
  const [reason, setReason] = useState('')
  const [tried, setTried] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setFailed(false)
    try {
      setRows(await api<Blocked[]>(base))
    } catch {
      setFailed(true)
    }
  }

  useEffect(() => {
    void load()
  }, [base])

  const add = async (e: FormEvent) => {
    e.preventDefault()
    setTried(true)
    setError(null)
    if (!readPhone(phone)) return
    try {
      await api(base, { method: 'POST', body: { phone, reason } })
      setPhone('')
      setReason('')
      setTried(false)
      await load()
    } catch (err) {
      setError(errorCode(err))
    }
  }

  const remove = async (number: string) => {
    try {
      await api(`${base}/${number}`, { method: 'DELETE' })
      setRows((all) => all && all.filter((r) => r.phone !== number))
    } catch (err) {
      setError(errorCode(err))
    }
  }

  return (
    <div className="page page--narrow">
      <PageHeader title={t('fraud')} description={t('fraud.d')} />
      <section className="card">
        <h2>{t('protectionTitle')}</h2>
        <p className="muted">{t('protectionHelp')}</p>
        <form className="blocked-form" onSubmit={(e) => void add(e)} noValidate>
          <Field id="block-phone" label={t('protectionPhone')} type="tel" inputMode="tel" placeholder="01XXXXXXXXX" maxLength={20} value={phone} error={tried && !readPhone(phone) ? t('errPhoneInvalid') : undefined} onChange={(e) => setPhone(e.target.value)} />
          <Field id="block-reason" label={t('protectionReason')} placeholder={t('protectionReasonHint')} maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} />
          <Button type="submit" variant="danger">{t('protectionAdd')}</Button>
        </form>
        {error && <p className="form-error" role="alert">{t(errorLabel(error))}</p>}
        {failed && <Notice role="alert" title={t('protectionLoadFailed')} action={<Button onClick={() => void load()}>{t('retry')}</Button>} />}
        {!failed && !rows && <Skeleton />}
        {rows && rows.length === 0 && <p className="muted">{t('protectionEmpty')}</p>}
        {rows && rows.length > 0 && (
          <ul className="blocked-list">
            {rows.map((r) => (
              <li key={r.phone}>
                <span className="blocked-list__text">
                  <strong className="num">{r.phone}</strong>
                  <span className="muted">{[r.reason, time(r.createdAt)].filter(Boolean).join(' · ')}</span>
                </span>
                <button type="button" className="media__dismiss" aria-label={t('protectionRemove', { value: r.phone })} title={t('protectionRemove', { value: r.phone })} onClick={() => void remove(r.phone)}><X size={16} aria-hidden="true" /></button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="card">
        <h2>{t('protectionRules')}</h2>
        <ul className="stack">
          <li>{t('protectionDuplicates')}</li>
          <li>{t('protectionLimits')}</li>
        </ul>
      </section>
    </div>
  )
}
