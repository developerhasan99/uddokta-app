import { useCallback, useEffect, useState } from 'react'
import { useCurrentStore } from '../account-context'
import { api } from '../api'
import { AreaChart } from '../components/charts'
import { Button, Notice, PageHeader, Skeleton } from '../components/ui'
import { useLang, type Key } from '../i18n'

type Report = {
  days: number; revenue: number; cost: number; profit: number; missingCost: number
  delivered: number; returned: number; cancelled: number; orders: number
  series: { day: string; revenue: number; profit: number }[]; top: { name: string; quantity: number; revenue: number }[]
}

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
            {([['anRevenue', report.revenue], ['anCost', report.cost], ['anProfit', report.profit]] as [Key, number][]).map(([label, value]) => (
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

