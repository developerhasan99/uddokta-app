import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Copy, ExternalLink, Globe, Lock, RefreshCw, X } from 'lucide-react'
import { useCurrentStore } from '../account-context'
import { api, errorCode, storefrontUrl } from '../api'
import { Badge, Button, Field, IconButton, Notice, PageHeader, Skeleton } from '../components/ui'
import { errorLabel, useLang, type Key } from '../i18n'

type Domain = { domain: string | null; verifiedAt: string | null; liveAt: string | null; primary: boolean; ip: string | null; txt: { name: string; value: string } }
type Check = Domain & { records: { txt: Found; root: Found; www: Found }; https: boolean }
type Found = 'ok' | 'missing' | 'wrong'

const foundLabel: Record<Found, Key> = { ok: 'domainFoundOk', missing: 'domainFoundMissing', wrong: 'domainFoundWrong' }
const tone = (found: Found) => (found === 'ok' ? 'success' : found === 'wrong' ? 'danger' : 'warning')

export function Domains() {
  const { t, time } = useLang()
  const current = useCurrentStore()!
  const base = `/stores/${current.store.handle}/domain`
  const canEdit = current.role !== 'staff'
  const oldUrl = storefrontUrl(current.store.handle)
  const oldHost = new URL(oldUrl).host
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
    setError(null)
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

  const send = async (method: 'PUT' | 'PATCH' | 'DELETE', body?: unknown) => {
    setBusy(true)
    setError(null)
    try {
      setData(await api<Domain>(base, { method, body }))
      return true
    } catch (err) {
      setError(errorCode(err))
      return false
    } finally {
      setBusy(false)
    }
  }

  const save = async (e: FormEvent) => {
    e.preventDefault()
    if (await send('PUT', { domain: typed })) {
      setCheck(null)
      setTyped('')
    }
  }

  const remove = async () => {
    if (await send('DELETE')) {
      setCheck(null)
      setConfirming(false)
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
    { type: 'A', name: '@', host: data.domain, value: data.ip, found: check?.records.root },
    { type: 'A', name: 'www', host: `www.${data.domain}`, value: data.ip, found: check?.records.www },
    { type: 'TXT', name: data.txt.name, host: `${data.txt.name}.${data.domain}`, value: data.txt.value, found: check?.records.txt },
  ] : []
  const allOk = check && Object.values(check.records).every((r) => r === 'ok')

  return (
    <div className="page page--narrow">
      <PageHeader title={t('domains')} description={t('domains.d')} />
      {error && <p className="form-error" role="alert">{t(errorLabel(error))}</p>}
      {!data && !error && <section className="card"><Skeleton /></section>}

      {data && !data.ip && <Notice title={t('domainSoon')} body={t('domainSoonBody')} />}

      {data?.ip && (
        <section className="card">
          <h2>{t('domainOwnTitle')}</h2>
          <p className="muted">{t('domainOwnIntro')}</p>

          {data.domain && (
            <div className="domain-item">
              <div className="domain-item__head">
                <Globe size={20} aria-hidden="true" className="muted" />
                <div className="domain-item__title">
                  <div className="row">
                    <strong>{data.domain}</strong>
                    {live ? <Badge tone="success">{t('domainLive')}</Badge> : <Badge tone="warning">{t('domainWaiting')}</Badge>}
                    {live && data.primary && <Badge>{t('domainMain')}</Badge>}
                  </div>
                  {data.liveAt && <span className="card-note">{t('domainLastChecked', { time: time(data.liveAt) })}</span>}
                </div>
                {canEdit && !confirming && <IconButton label={t('domainRemove')} onClick={() => setConfirming(true)}><X size={16} aria-hidden="true" /></IconButton>}
              </div>

              {confirming && (
                <div className="domain-item__confirm">
                  <p className="muted">{t('domainRemoveWarning')}</p>
                  <div className="row">
                    <Button onClick={() => setConfirming(false)}>{t('cancel')}</Button>
                    <Button variant="danger" disabled={busy} onClick={() => void remove()}>{t('domainRemove')}</Button>
                  </div>
                </div>
              )}

              {live && (
                <>
                  <p className="row domain-item__note"><Lock size={16} aria-hidden="true" className="domain-item__lock" />{t('domainHttps')}</p>
                  <p className="muted">{t(data.primary ? 'domainMainBody' : 'domainNotMainBody', { old: oldHost })}</p>
                </>
              )}

              {!live && (
                <>
                  <p className="muted">{t('domainWaitingBody')}</p>
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
                        <tr key={r.host}>
                          <td className="data-table__meta">{r.type}</td>
                          <td><span className="data-table__name">{r.name}</span><br /><span className="muted">{r.host}</span>
                            {check && r.found && <span className="domain-records__phone-status"><Badge tone={tone(r.found)}>{t(foundLabel[r.found])}</Badge></span>}</td>
                          <td className="domain-records__value">
                            <span className="row">
                              <code>{r.value}</code>
                              <IconButton label={copied === r.value ? t('copied') : t('orderCopy')} onClick={() => void copy(r.value)}><Copy size={16} aria-hidden="true" /></IconButton>
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
                  {allOk && <p className="muted">{t('domainHttpsPending')}</p>}
                  {check && Object.values(check.records).includes('wrong') && <p className="form-error">{t('domainWrongHelp')}</p>}
                </>
              )}

              <div className="row">
                {live && <a className="btn btn--default" href={`https://${data.domain}`} target="_blank" rel="noreferrer"><ExternalLink size={16} aria-hidden="true" />{t('domainOpen')}</a>}
                {canEdit && <Button onClick={() => void runCheck()} disabled={checking} aria-busy={checking}><RefreshCw size={16} aria-hidden="true" />{t('domainCheck')}</Button>}
                {live && canEdit && (
                  <Button disabled={busy} onClick={() => void send('PATCH', { primary: !data.primary })}>{t(data.primary ? 'domainUseOld' : 'domainMakeMain')}</Button>
                )}
              </div>
            </div>
          )}

          {!data.domain && (canEdit
            ? (
              <form className="domain-add" onSubmit={(e) => void save(e)} noValidate>
                <Field id="domain" label={t('domainYours')} help={t('domainYoursHelp')} placeholder="rinafashion.com" inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={253} value={typed} onChange={(e) => setTyped(e.target.value)}
                  trailing={<Button type="submit" variant="primary" disabled={busy || !typed.trim()} aria-busy={busy}>{t('domainAdd')}</Button>} />
              </form>
            )
            : <p className="muted">{t('domainNone')}. {t('domainOwnersOnly')}</p>)}

          <p className="card-note domain-old">{t('domainOldAlways')} <a href={oldUrl} target="_blank" rel="noreferrer">{oldHost}</a></p>
        </section>
      )}
    </div>
  )
}
