import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { X } from 'lucide-react'
import { useCurrentStore } from '../account-context'
import { api, errorCode } from '../api'
import { AreaChart } from '../components/charts'
import { Button, Field, Notice, PageHeader, Skeleton } from '../components/ui'
import { errorLabel, useLang, type Key } from '../i18n'

type Report = {
  days: number; revenue: number; cost: number; expenses: number; profit: number; missingCost: number
  delivered: number; returned: number; cancelled: number; orders: number
  series: { day: string; revenue: number; profit: number }[]; top: { name: string; quantity: number; revenue: number }[]
}
type Expense = { id: string; spentOn: string; category: string; amount: number; note: string }
const categories = ['ads', 'packaging', 'courier', 'salary', 'rent', 'other'] as const

function ManagersOnly() {
  const { t } = useLang()
  return <section className="card card--flush"><Notice title={t('anManagersOnly')} /></section>
}

export function Analytics() {
  const { t, num, money, date } = useLang()
  const current = useCurrentStore()!
  const [days, setDays] = useState(30)
  const [report, setReport] = useState<Report | null>(null)
  const [failed, setFailed] = useState(false)

  const load = useCallback(async () => {
    setFailed(false)
    try {
      setReport(await api<Report>(`/stores/${current.store.handle}/analytics?days=${days}`))
    } catch {
      setFailed(true)
    }
  }, [current.store.handle, days])

  useEffect(() => {
    if (current.role !== 'staff') void load()
  }, [load, current.role])

  const period = (
    <select className="input input--compact" aria-label={t('anPeriod')} value={days} onChange={(e) => setDays(Number(e.target.value))}>
      {[7, 30, 90, 365].map((d) => <option key={d} value={d}>{t('anLastDays', { n: num(d) })}</option>)}
    </select>
  )

  if (current.role === 'staff') return <div className="page"><PageHeader title={t('analytics')} description={t('analytics.d')} /><ManagersOnly /></div>

  const finished = report ? report.delivered + report.returned : 0
  return (
    <div className="page">
      <PageHeader title={t('analytics')} description={t('analytics.d')} action={period} />
      {failed && <section className="card card--flush"><Notice role="alert" title={t('anLoadFailed')} action={<Button onClick={() => void load()}>{t('retry')}</Button>} /></section>}
      {!failed && !report && <section className="card"><Skeleton /><Skeleton width="60%" /></section>}
      {report && (
        <>
          {report.missingCost > 0 && <p className="notice-line notice-line--warning">{t('anMissingCost', { n: num(report.missingCost) })}</p>}
          <div className="stats">
            {([['anRevenue', report.revenue], ['anCost', report.cost], ['anExpenses', report.expenses], ['anProfit', report.profit]] as [Key, number][]).map(([label, value]) => (
              <section key={label} className="stat">
                <h2 className="stat__label">{t(label)}</h2>
                <p className={value < 0 ? 'stat__value readout--loss' : 'stat__value'}>{money(value)}</p>
              </section>
            ))}
          </div>
          <p className="muted">{t('anHow')}</p>
          <div className="home-grid">
            <section className="card">
              <div>
                <h2>{t('anProfitChart')}</h2>
                <p className="muted">{t('anProfitChartD')}</p>
              </div>
              <AreaChart values={report.series.map((d) => d.revenue)} labels={report.series.map((d) => date(new Date(`${d.day}T00:00:00Z`)))} format={money} label={t('anProfitChart')} />
            </section>
            <section className="card home-grid__side">
              <div>
                <h2>{t('anReturnRate')}</h2>
                <p className="stat__value">{num(finished ? Math.round((report.returned / finished) * 100) : 0)}%</p>
                <p className="muted">{t('anOrdersLine', { orders: num(report.orders), delivered: num(report.delivered), returned: num(report.returned), cancelled: num(report.cancelled) })}</p>
              </div>
              <h2>{t('anTop')}</h2>
              {report.top.length === 0
                ? <p className="muted">{t('anTopEmpty')}</p>
                : <ul className="bars">{report.top.map((p) => (
                  <li key={p.name} className="bars__row">
                    <span>{p.name} × {num(p.quantity)}</span>
                    <strong className="bars__value">{money(p.revenue)}</strong>
                    <span className="bars__track"><span className="bars__fill" style={{ width: `${(p.revenue / report.top[0].revenue) * 100}%` }} /></span>
                  </li>
                ))}</ul>}
            </section>
          </div>
        </>
      )}
    </div>
  )
}

export function Expenses() {
  const { t, money, date } = useLang()
  const current = useCurrentStore()!
  const base = `/stores/${current.store.handle}/expenses`
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Dhaka' })
  const [rows, setRows] = useState<Expense[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [form, setForm] = useState({ spentOn: today, category: 'ads', amount: '', note: '' })
  const [tried, setTried] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setFailed(false)
    try {
      setRows(await api<Expense[]>(base))
    } catch {
      setFailed(true)
    }
  }, [base])

  useEffect(() => {
    if (current.role !== 'staff') void load()
  }, [load, current.role])

  if (current.role === 'staff') return <div className="page page--narrow"><PageHeader title={t('expenses')} description={t('expenses.d')} /><ManagersOnly /></div>

  const amount = Number(form.amount.replace(/[০-৯]/g, (d) => String('০১২৩৪৫৬৭৮৯'.indexOf(d))).replace(/\D/g, ''))
  const add = async (e: FormEvent) => {
    e.preventDefault()
    setTried(true)
    setError(null)
    if (!amount) return
    try {
      await api(base, { method: 'POST', body: { ...form, amount } })
      setForm({ ...form, amount: '', note: '' })
      setTried(false)
      await load()
    } catch (err) {
      setError(errorCode(err))
    }
  }
  const remove = async (row: Expense) => {
    await api(`${base}/${row.id}`, { method: 'DELETE' })
    setRows((all) => all && all.filter((r) => r.id !== row.id))
  }

  return (
    <div className="page page--narrow">
      <PageHeader title={t('expenses')} description={t('expenses.d')} />
      <form className="card card--form" onSubmit={(e) => void add(e)} noValidate>
        <h2>{t('expAdd')}</h2>
        <div className="price-grid price-grid--two">
          <Field id="exp-date" type="date" label={t('expDate')} max={today} value={form.spentOn} onChange={(e) => setForm({ ...form, spentOn: e.target.value })} />
          <div className="field">
            <label htmlFor="exp-category">{t('expCategory')}</label>
            <select id="exp-category" className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {categories.map((c) => <option key={c} value={c}>{t(`exp_${c}` as Key)}</option>)}
            </select>
          </div>
          <Field id="exp-amount" label={t('expAmount')} unit="৳" inputMode="numeric" value={form.amount} error={tried && !amount ? t('expAmountInvalid') : undefined} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          <Field id="exp-note" label={t('expNote')} placeholder={t('expNoteHint')} maxLength={500} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
        </div>
        {error && <p className="form-error" role="alert">{t(errorLabel(error))}</p>}
        <div className="row"><Button type="submit" variant="primary">{t('expAdd')}</Button></div>
      </form>
      <section className="card">
        {failed && <Notice role="alert" title={t('anLoadFailed')} action={<Button onClick={() => void load()}>{t('retry')}</Button>} />}
        {!failed && !rows && <Skeleton />}
        {rows && rows.length === 0 && <p className="muted">{t('expEmpty')}</p>}
        {rows && rows.length > 0 && (
          <ul className="blocked-list">
            {rows.map((r) => (
              <li key={r.id}>
                <span className="blocked-list__text">
                  <strong>{t(`exp_${r.category}` as Key)} · {money(r.amount)}</strong>
                  <span className="muted">{[date(new Date(`${r.spentOn}T00:00:00Z`)), r.note].filter(Boolean).join(' · ')}</span>
                </span>
                <button type="button" className="media__dismiss" aria-label={t('expDelete', { value: money(r.amount) })} title={t('expDelete', { value: money(r.amount) })} onClick={() => void remove(r)}><X size={16} aria-hidden="true" /></button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
