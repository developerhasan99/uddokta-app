import { useEffect, useState, type FormEvent } from 'react'
import { useCurrentStore } from '../account-context'
import { api, errorCode } from '../api'
import { Badge, Button, Field, Notice, PageHeader, Skeleton } from '../components/ui'
import { errorLabel, useLang } from '../i18n'

type Account = { courier: string; updatedAt: string }

export function Couriers() {
  const { t, money, time } = useLang()
  const current = useCurrentStore()!
  const base = `/stores/${current.store.handle}/couriers`
  const canEdit = current.role !== 'staff'
  const [accounts, setAccounts] = useState<Account[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [editing, setEditing] = useState(false)
  const [keys, setKeys] = useState({ apiKey: '', secretKey: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const load = async () => {
    setFailed(false)
    try {
      setAccounts(await api<Account[]>(base))
    } catch {
      setFailed(true)
    }
  }

  useEffect(() => {
    void load()
  }, [base])

  const connect = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setDone(null)
    if (!keys.apiKey.trim() || !keys.secretKey.trim()) return
    setBusy(true)
    try {
      const saved = await api<{ balance: number }>(`${base}/steadfast`, { method: 'PUT', body: keys })
      setKeys({ apiKey: '', secretKey: '' })
      setEditing(false)
      setDone(t('courierSaved', { money: money(saved.balance) }))
      await load()
    } catch (err) {
      setError(errorCode(err))
    } finally {
      setBusy(false)
    }
  }

  const disconnect = async () => {
    setError(null)
    try {
      await api(`${base}/steadfast`, { method: 'DELETE' })
      setDone(null)
      await load()
    } catch (err) {
      setError(errorCode(err))
    }
  }

  const steadfast = accounts?.find((a) => a.courier === 'steadfast')
  const showForm = canEdit && (!steadfast || editing)

  return (
    <div className="page page--narrow">
      <PageHeader title={t('couriers')} description={t('couriers.d')} />
      {failed && <section className="card card--flush"><Notice role="alert" title={t('courierLoadFailed')} action={<Button onClick={() => void load()}>{t('retry')}</Button>} /></section>}
      {!failed && !accounts && <section className="card"><Skeleton /></section>}
      {accounts && (
        <section className="card card--form">
          <div className="card__head">
            <h2>{t('courierSteadfast')}</h2>
            {steadfast ? <Badge tone="success">{t('courierConnected')}</Badge> : <Badge>{t('courierNotConnectedBadge')}</Badge>}
          </div>
          {steadfast && <p className="muted">{t('courierUpdated', { time: time(steadfast.updatedAt) })}</p>}
          {done && <p className="success-note" role="status">{done}</p>}
          {!canEdit && <p className="muted">{t('courierManagersOnly')}</p>}
          {showForm && (
            <form className="stack" onSubmit={(e) => void connect(e)} noValidate>
              <p className="muted">{t('courierHelp')}</p>
              <Field id="sf-api-key" label={t('courierApiKey')} autoComplete="off" spellCheck={false} maxLength={200} value={keys.apiKey} onChange={(e) => setKeys({ ...keys, apiKey: e.target.value })} />
              <Field id="sf-secret-key" label={t('courierSecretKey')} type="password" autoComplete="off" maxLength={200} value={keys.secretKey} onChange={(e) => setKeys({ ...keys, secretKey: e.target.value })} />
              {error && <p className="form-error" role="alert">{t(errorLabel(error))}</p>}
              <div className="row">
                {editing && <Button onClick={() => setEditing(false)}>{t('cancel')}</Button>}
                <Button type="submit" variant="primary" disabled={busy || !keys.apiKey.trim() || !keys.secretKey.trim()} aria-busy={busy}>{t('courierConnect')}</Button>
              </div>
            </form>
          )}
          {canEdit && steadfast && !editing && (
            <div className="row">
              <Button onClick={() => setEditing(true)}>{t('courierReplace')}</Button>
              <Button variant="danger" onClick={() => void disconnect()}>{t('courierDisconnect')}</Button>
            </div>
          )}
          {!showForm && error && <p className="form-error" role="alert">{t(errorLabel(error))}</p>}
        </section>
      )}
    </div>
  )
}
