import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { Clock, Repeat2, ShieldBan } from 'lucide-react'
import { readPhone } from 'storefront/schema'
import { useCurrentStore, useStorePath } from '../account-context'
import { api, errorCode } from '../api'
import { BulkBar, SelectAllCell, SelectCell, useSelection } from '../components/Selection'
import { Button, Field, Notice, PageHeader, SearchInput, Skeleton } from '../components/ui'
import { errorLabel, useLang } from '../i18n'

type Blocked = { phone: string; reason: string; createdAt: string }

export function Protection() {
  const { t, time, num } = useLang()
  const path = useStorePath()
  const base = `/stores/${useCurrentStore()!.store.handle}/blocked`
  const [rows, setRows] = useState<Blocked[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [phone, setPhone] = useState('')
  const [reason, setReason] = useState('')
  const [tried, setTried] = useState(false)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const shown = rows?.filter((r) => !q || r.phone.includes(q) || r.reason.toLowerCase().includes(q)) ?? []
  const picked = useSelection(shown.map((r) => r.phone))

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
    setAdding(true)
    try {
      await api(base, { method: 'POST', body: { phone, reason } })
      setPhone('')
      setReason('')
      setTried(false)
      await load()
    } catch (err) {
      setError(errorCode(err))
    } finally {
      setAdding(false)
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

  const removePicked = async () => {
    await picked.run((number) => api(`${base}/${number}`, { method: 'DELETE' }))
    await load()
  }

  return (
    <div className="page page--narrow">
      <PageHeader title={t('fraud')} description={t('fraud.d')} />
      <section className="card">
        <h2>{t('protectionAddTitle')}</h2>
        <p className="muted">{t('protectionHelp')}</p>
        <form className="blocked-form" onSubmit={(e) => void add(e)} noValidate>
          <Field id="block-phone" label={t('protectionPhone')} type="tel" inputMode="tel" placeholder="01XXXXXXXXX" maxLength={20} value={phone} error={tried && !readPhone(phone) ? t('errPhoneInvalid') : undefined} onChange={(e) => setPhone(e.target.value)} />
          <Field id="block-reason" label={t('protectionReason')} placeholder={t('protectionReasonHint')} maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} />
          <Button type="submit" variant="danger" disabled={adding} aria-busy={adding}>{t('protectionAdd')}</Button>
        </form>
        {error && <p className="form-error" role="alert">{t(errorLabel(error))}</p>}
      </section>

      {failed && <section className="card"><Notice role="alert" title={t('protectionLoadFailed')} action={<Button onClick={() => void load()}>{t('retry')}</Button>} /></section>}
      {!failed && !rows && <div className="data-list" role="status" aria-label={t('loading')}>{Array.from({ length: 3 }, (_, i) => <div key={i} className="skeleton-row"><Skeleton width="10rem" /><Skeleton width="5rem" /></div>)}</div>}
      {rows && rows.length === 0 && (
        <div className="data-list blocked-empty">
          <ShieldBan size={28} strokeWidth={1.5} aria-hidden="true" />
          <strong>{t('protectionTitle')}</strong>
          <p className="muted">{t('protectionEmpty')}</p>
        </div>
      )}
      {rows && rows.length > 0 && (
        <section className="data-list" aria-label={t('protectionTitle')}>
          <div className="filter-bar">
            <h2 className="data-list__title">{t('protectionTitle')}</h2>
            <SearchInput label={t('protectionSearch')} value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <BulkBar selection={picked}>
            <button type="button" className="btn btn--default" disabled={picked.busy} aria-busy={picked.busy} onClick={() => void removePicked()}>{t(picked.busy ? 'loading' : 'protectionUnblock')}</button>
          </BulkBar>
          {shown.length === 0 && <Notice title={t('protectionNoMatch')} action={<Button onClick={() => setQuery('')}>{t('clearFilters')}</Button>} />}
          {shown.length > 0 && (
            <table className="data-table blocked-table">
              <thead>
                <tr>
                  <SelectAllCell selection={picked} />
                  <th scope="col" className="blocked-table__phone">{t('colPhone')}</th>
                  <th scope="col" className="data-table__meta blocked-table__reason">{t('colReason')}</th>
                  <th scope="col" className="data-table__meta">{t('colBlockedOn')}</th>
                  <th scope="col" className="end"><span className="visually-hidden">{t('protectionUnblock')}</span></th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.phone} data-selected={picked.has(r.phone) || undefined}>
                    <SelectCell selection={picked} id={r.phone} name={r.phone} />
                    <td className="blocked-table__phone">
                      <Link className="num" to={path(`/orders?q=${r.phone}`)} title={t('protectionOrders')}>{r.phone}</Link>
                      <span className="data-table__sub">{[r.reason, time(r.createdAt)].filter(Boolean).join(' · ')}</span>
                    </td>
                    <td className="data-table__meta blocked-table__reason" title={r.reason}>{r.reason || <span className="muted">—</span>}</td>
                    <td className="data-table__meta muted">{time(r.createdAt)}</td>
                    <td className="end"><button type="button" className="btn btn--default" aria-label={t('protectionRemove', { value: r.phone })} disabled={picked.busy} onClick={() => void remove(r.phone)}>{t('protectionUnblock')}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <footer className="data-list__footer"><span className="muted">{t('protectionCount', { n: num(rows.length) })}</span><span /></footer>
        </section>
      )}

      <section className="card">
        <h2>{t('protectionRules')}</h2>
        <ul className="blocked-rules">
          <li><Repeat2 size={18} aria-hidden="true" /><span>{t('protectionDuplicates')}</span></li>
          <li><Clock size={18} aria-hidden="true" /><span>{t('protectionLimits')}</span></li>
        </ul>
      </section>
    </div>
  )
}
