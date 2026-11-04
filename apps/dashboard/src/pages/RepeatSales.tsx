import { useCallback, useEffect, useState } from 'react'
import { CircleCheck, Phone } from 'lucide-react'
import { useCurrentStore } from '../account-context'
import { api, errorCode } from '../api'
import { Button, Notice, PageHeader, Skeleton } from '../components/ui'
import { errorLabel, useLang, type Key } from '../i18n'

type Due = { phone: string; name: string; deliveredAt: string; product: string; deliveredOrders: number; spent: number; lastCall: string | null; lastOutcome: string | null }
type Call = { id: string; phone: string; outcome: string; note: string; createdAt: string; by: string }
const outcomes = ['ordered', 'later', 'no_answer', 'not_interested'] as const
const dayChoices = [7, 15, 30, 45, 60, 90]

function DueRow({ row, base, onLogged }: { row: Due; base: string; onLogged: () => void }) {
  const { t, num, money, date } = useLang()
  const [logging, setLogging] = useState(false)
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  const log = async (outcome: (typeof outcomes)[number]) => {
    setError(null)
    try {
      await api(`${base}/calls`, { method: 'POST', body: { phone: row.phone, outcome, note } })
      onLogged()
    } catch (err) {
      setError(errorCode(err))
    }
  }

  return (
    <li className="repeat-row">
      <div className="repeat-row__main">
        <span className="repeat-row__text">
          <strong>{row.name}</strong>
          <span className="table__sub num">{row.phone} · {row.product}</span>
          <span className="table__sub">{t('repeatDelivered', { date: date(new Date(row.deliveredAt)) })} · {t('repeatBought', { n: num(row.deliveredOrders), money: money(row.spent) })}</span>
        </span>
        <div className="row">
          <a className="btn" href={`tel:${row.phone}`}><Phone size={16} aria-hidden="true" />{t('orderCall')}</a>
          <a className="btn" href={`https://wa.me/88${row.phone}`} target="_blank" rel="noopener">{t('orderWhatsApp')}</a>
          <Button variant={logging ? 'default' : 'primary'} aria-expanded={logging} onClick={() => setLogging(!logging)}>{t('repeatLog')}</Button>
        </div>
      </div>
      {logging && (
        <div className="repeat-row__log">
          <input className="input" aria-label={t('repeatNoteHint')} placeholder={t('repeatNoteHint')} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="row">{outcomes.map((o) => <Button key={o} onClick={() => void log(o)}>{t(`outcome_${o}` as Key)}</Button>)}</div>
          {error && <p className="form-error" role="alert">{t(errorLabel(error))}</p>}
        </div>
      )}
    </li>
  )
}

export function RepeatSales() {
  const { t, num, time } = useLang()
  const base = `/stores/${useCurrentStore()!.store.handle}`
  const [days, setDays] = useState(30)
  const [due, setDue] = useState<Due[] | null>(null)
  const [calls, setCalls] = useState<Call[]>([])
  const [failed, setFailed] = useState(false)
  const [toast, setToast] = useState(false)

  const load = useCallback(async () => {
    setFailed(false)
    try {
      const [list, log] = await Promise.all([api<Due[]>(`${base}/repeat?days=${days}`), api<Call[]>(`${base}/calls`)])
      setDue(list)
      setCalls(log)
    } catch {
      setFailed(true)
    }
  }, [base, days])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(false), 3000)
    return () => clearTimeout(timer)
  }, [toast])

  return (
    <div className="page">
      <PageHeader title={t('repeatSales')} description={t('repeatSales.d')} />
      <section className="card">
        <div className="card__head">
          <div>
            <h2>{t('repeatDue')}{due && <span className="tab__count"> {num(due.length)}</span>}</h2>
            <p className="muted">{t('repeatDueHelp')}</p>
          </div>
          <label className="row">
            <span className="muted">{t('repeatAfter')}</span>
            <select className="input input--compact" value={days} onChange={(e) => setDays(Number(e.target.value))}>
              {dayChoices.map((d) => <option key={d} value={d}>{t('repeatDays', { n: num(d) })}</option>)}
            </select>
          </label>
        </div>
        {failed && <Notice role="alert" title={t('repeatLoadFailed')} action={<Button onClick={() => void load()}>{t('retry')}</Button>} />}
        {!failed && !due && <Skeleton />}
        {due && due.length === 0 && <p className="muted">{t('repeatEmpty')}</p>}
        {due && due.length > 0 && (
          <ul className="repeat-list">
            {due.map((row) => <DueRow key={row.phone} row={row} base={base} onLogged={() => { setToast(true); void load() }} />)}
          </ul>
        )}
      </section>

      <section className="card">
        <h2>{t('repeatRecent')}</h2>
        {calls.length === 0
          ? <p className="muted">{t('repeatRecentEmpty')}</p>
          : (
            <ul className="repeat-list">
              {calls.map((call) => (
                <li key={call.id} className="repeat-row__main">
                  <span className="repeat-row__text">
                    <strong className="num">{call.phone}</strong>
                    <span className="table__sub">{t(`outcome_${call.outcome}` as Key)}{call.note && ` · ${call.note}`}</span>
                  </span>
                  <span className="muted">{[call.by, time(call.createdAt)].filter(Boolean).join(' · ')}</span>
                </li>
              ))}
            </ul>
          )}
      </section>

      <div className="toast-anchor" role="status">
        {toast && <p className="toast"><CircleCheck size={18} aria-hidden="true" />{t('repeatLogged')}</p>}
      </div>
    </div>
  )
}
