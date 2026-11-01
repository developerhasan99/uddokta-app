import { Link } from 'react-router'
import { useStorePath } from '../account-context'
import { AreaChart, Sparkline } from '../components/charts'
import { Badge, Card, LinkButton, PageHeader } from '../components/ui'
import { useLang, type Key } from '../i18n'

const steps: { title: Key; body: Key; to: string }[] = [
  { title: 'stepProduct', body: 'stepProductD', to: '/products' },
  { title: 'stepLogo', body: 'stepLogoD', to: '/settings' },
  { title: 'stepTheme', body: 'stepThemeD', to: '/online-store/themes' },
  { title: 'stepDelivery', body: 'stepDeliveryD', to: '/settings' },
  { title: 'stepTest', body: 'stepTestD', to: '/orders/new' },
  { title: 'stepPublish', body: 'stepPublishD', to: '/settings/billing' },
]

// Sample figures for judging the design; replaced by the API in step 8.
const dailySales = [18400, 21200, 19800, 24600, 26100, 23300, 28900, 27400, 31200, 29800, 33500, 30100, 35200, 38700]
const dailyOrders = [14, 17, 15, 19, 21, 18, 23, 22, 25, 24, 27, 24, 28, 31]
const dailyReturns = [12, 11, 13, 12, 10, 11, 10, 9, 10, 9, 8, 9, 8, 8]
const dailyProfit = [4200, 5100, 4600, 6200, 6700, 5800, 7500, 7000, 8300, 7800, 9000, 7900, 9600, 10800]
const orderStatus: { label: Key; count: number }[] = [
  { label: 'statusDelivered', count: 584 },
  { label: 'statusCourier', count: 234 },
  { label: 'statusConfirmed', count: 127 },
  { label: 'statusNew', count: 62 },
  { label: 'statusReturned', count: 47 },
]

export function Home() {
  const { t, num, money, date } = useLang()
  const path = useStorePath()
  const last = (values: number[]) => values[values.length - 1]
  const stats: { label: Key; value: string; series: number[] }[] = [
    { label: 'statSales', value: money(last(dailySales)), series: dailySales },
    { label: 'statOrders', value: num(last(dailyOrders)), series: dailyOrders },
    { label: 'statProfit', value: money(last(dailyProfit)), series: dailyProfit },
    { label: 'statReturn', value: `${num(last(dailyReturns))}%`, series: dailyReturns },
  ]
  const dayLabels = dailySales.map((_, i) => date(new Date(Date.UTC(2026, 10, 1 - (dailySales.length - 1 - i)))))
  const maxStatus = Math.max(...orderStatus.map((s) => s.count))

  return (
    <div className="page">
      <PageHeader title={t('home')} description={t('home.d')} action={<LinkButton to={path('/orders/new')} variant="primary">{t('newOrder')}</LinkButton>} />

      <div className="sample-note">
        <Badge>{t('sampleData')}</Badge>
        <p className="muted">{t('sampleNoteHome')}</p>
      </div>

      <div className="stats">
        {stats.map((stat) => (
          <section key={stat.label} className="stat">
            <h2 className="stat__label">{t(stat.label)}</h2>
            <p className="stat__value">{stat.value}</p>
            <Sparkline values={stat.series} />
          </section>
        ))}
      </div>

      <div className="home-grid">
        <section className="card">
          <div>
            <h2>{t('salesOverview')}</h2>
            <p className="muted">{t('salesOverviewD')}</p>
          </div>
          <AreaChart values={dailySales} labels={dayLabels} format={money} label={t('salesOverview')} />
        </section>

        <section className="card home-grid__side">
          <div>
            <h2>{t('orderStatus')}</h2>
            <p className="muted">{t('orderStatusD')}</p>
          </div>
          <ul className="bars">
            {orderStatus.map((s) => (
              <li key={s.label} className="bars__row">
                <span>{t(s.label)}</span>
                <strong className="bars__value">{num(s.count)}</strong>
                <span className="bars__track"><span className="bars__fill" style={{ width: `${(s.count / maxStatus) * 100}%` }} /></span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <Card>
        <div className="setup__head">
          <h2>{t('setupTitle')}</h2>
          <p className="muted">{t('setupProgress', { n: num(0) })}</p>
        </div>
        <ol className="setup">
          {steps.map((step, i) => (
            <li key={step.title} className={i === 0 ? 'setup__step setup__step--next' : 'setup__step'}>
              <span className="setup__number" aria-hidden="true">{num(i + 1)}</span>
              <div className="setup__text">
                {i === 0
                  ? <h3>{t(step.title)}</h3>
                  : <h3><Link to={path(step.to)}>{t(step.title)}</Link></h3>}
                {i === 0 && <p className="muted">{t(step.body)}</p>}
              </div>
              {i === 0 && <LinkButton to={path(step.to)}>{t('start')}</LinkButton>}
            </li>
          ))}
        </ol>
      </Card>
    </div>
  )
}
