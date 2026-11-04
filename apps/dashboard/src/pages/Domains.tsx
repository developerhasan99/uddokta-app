import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Copy } from 'lucide-react'
import { useCurrentStore } from '../account-context'
import { api, errorCode } from '../api'
import { Badge, Button, Field, IconButton, Notice, PageHeader, Skeleton } from '../components/ui'
import { errorLabel, useLang, type Key } from '../i18n'

type Domain = { domain: string | null; liveAt: string | null; ip: string | null }
type Check = Domain & { records: { root: Found; www: Found }; https: boolean }
type Found = 'ok' | 'missing' | 'wrong'

const foundLabel: Record<Found, Key> = { ok: 'domainFoundOk', missing: 'domainFoundMissing', wrong: 'domainFoundWrong' }
const tone = (found: Found) => (found === 'ok' ? 'success' : found === 'wrong' ? 'danger' : 'warning')

export function Domains() {
  const { t } = useLang()
  const current = useCurrentStore()!
  const base = `/stores/${current.store.handle}/domain`
  const canEdit = current.role !== 'staff'
  const [data, setData] = useState<Domain | null>(null)
  const [check, setCheck] = useState<Check | null>(null)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [checking, setChecking] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const runCheck = useCallback(async () => {
    setChecking(true)
    try {
      const result = await api<Check>(`${base}/check`, { method: 'POST' })
      setCheck(result)
      setData(result)
    } catch (err) {
      setError(errorCode(err))
    } finally {
      setChecking(false)
    }
  }, [base])

  useEffect(() => {
    api<Domain>(base).then((d) => {
      setData(d)
      // Owners and admins see where things stand as soon as they open the page.
      if (d.domain && d.ip && canEdit) void runCheck()
    }).catch((err) => setError(errorCode(err)))
  }, [base, canEdit, runCheck])

  const save = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      setData(await api<Domain>(base, { method: 'PUT', body: { domain: typed } }))
      setCheck(null)
      setTyped('')
    } catch (err) {
      setError(errorCode(err))
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    setBusy(true)
    setError(null)
    try {
      setData(await api<Domain>(base, { method: 'DELETE' }))
      setCheck(null)
      setConfirming(false)
    } catch (err) {
      setError(errorCode(err))
    } finally {
      setBusy(false)
    }
  }

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(value)
    } catch {
      setCopied(null)
    }
  }

  const live = Boolean(data?.liveAt)
  const records = data?.domain && data.ip ? [
    { name: '@', host: data.domain, found: check?.records.root },
    { name: 'www', host: `www.${data.domain}`, found: check?.records.www },
  ] : []

  return (
    <div className="page page--narrow">
      <PageHeader title={t('domains')} description={t('domains.d')} />
      {error && <p className="form-error" role="alert">{t(errorLabel(error))}</p>}
      {!data && !error && <section className="card"><Skeleton /></section>}

      {data && !data.ip && <Notice title={t('domainSoon')} body={t('domainSoonBody')} />}

      {data && data.ip && !data.domain && (
        canEdit
          ? (
            <form className="card card--form" onSubmit={(e) => void save(e)} noValidate>
              <Field id="domain" label={t('domainYours')} help={t('domainYoursHelp')} placeholder="rinafashion.com" inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={253} value={typed} onChange={(e) => setTyped(e.target.value)} />
              <div className="row--end"><Button type="submit" variant="primary" disabled={busy || !typed.trim()} aria-busy={busy}>{t('domainAdd')}</Button></div>
            </form>
          )
          : <Notice title={t('domainNone')} body={t('domainOwnersOnly')} />
      )}

      {data?.domain && (
        <>
          <section className="card">
            <div className="row">
              <h2>{data.domain}</h2>
              {live ? <Badge tone="success">{t('domainLive')}</Badge> : <Badge tone="warning">{t('domainWaiting')}</Badge>}
            </div>
            <p className="muted">{live ? t('domainLiveBody') : t('domainWaitingBody')}</p>
          </section>

          {data.ip && (
            <section className="card">
              <h2>{t('domainStepsTitle')}</h2>
              <ol className="steps">
                <li>{t('domainStep1')}</li>
                <li>{t('domainStep2')}</li>
              </ol>
              <table className="data-table domain-records">
                <thead>
                  <tr>
                    <th scope="col" className="data-table__meta domain-records__type">{t('domainType')}</th>
                    <th scope="col">{t('domainName')}</th>
                    <th scope="col" className="domain-records__value">{t('domainValue')}</th>
                    {check && <th scope="col" className="data-table__meta domain-records__status">{t('domainStatus')}</th>}
                  </tr>
                </thead>
                <tbody>
                  {records.map((r) => (
                    <tr key={r.name}>
                      <td className="data-table__meta">A</td>
                      <td><span className="data-table__name">{r.name}</span><br /><span className="muted">{r.host}</span>
                        {check && r.found && <span className="domain-records__phone-status"><Badge tone={tone(r.found)}>{t(foundLabel[r.found])}</Badge></span>}</td>
                      <td className="domain-records__value">
                        <span className="row">
                          <code>{data.ip}</code>
                          <IconButton label={copied === data.ip ? t('copied') : t('orderCopy')} onClick={() => void copy(data.ip!)}><Copy size={16} aria-hidden="true" /></IconButton>
                        </span>
                      </td>
                      {check && <td className="data-table__meta domain-records__status">{r.found && <Badge tone={tone(r.found)}>{t(foundLabel[r.found])}</Badge>}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
              <ol className="steps" start={3}>
                <li>{t('domainStep3')}</li>
              </ol>
              {check && !live && check.records.root === 'ok' && check.records.www === 'ok' && <p className="muted">{t('domainHttpsPending')}</p>}
              {check?.records.root === 'wrong' || check?.records.www === 'wrong' ? <p className="form-error">{t('domainWrongHelp')}</p> : null}
              {canEdit && <div className="row--end"><Button onClick={() => void runCheck()} disabled={checking} aria-busy={checking}>{t('domainCheck')}</Button></div>}
            </section>
          )}

          {canEdit && (
            <section className="card">
              {confirming
                ? (
                  <>
                    <p className="muted">{t('domainRemoveWarning')}</p>
                    <div className="row">
                      <Button onClick={() => setConfirming(false)}>{t('cancel')}</Button>
                      <Button variant="danger" disabled={busy} onClick={() => void remove()}>{t('domainRemove')}</Button>
                    </div>
                  </>
                )
                : <button type="button" className="media-details__delete" onClick={() => setConfirming(true)}>{t('domainRemove')}</button>}
            </section>
          )}
        </>
      )}
    </div>
  )
}
