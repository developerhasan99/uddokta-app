import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { ChevronDown, ClipboardCheck, Image, Palette, Store, Tag, Truck, UserPlus, type LucideIcon } from 'lucide-react'
import { useAccount, useCurrentStore, useStorePath } from '../account-context'
import { AreaChart, Sparkline } from '../components/charts'
import { Badge, LinkButton, PageHeader } from '../components/ui'
import { useLang, type Key } from '../i18n'

const steps: { title: Key; body: Key; action: Key; to: string; icon: LucideIcon }[] = [
  { title: 'stepProduct', body: 'stepProductD', action: 'stepProductAction', to: '/products', icon: Tag },
  { title: 'stepLogo', body: 'stepLogoD', action: 'stepLogoAction', to: '/settings', icon: Image },
  { title: 'stepTheme', body: 'stepThemeD', action: 'stepThemeAction', to: '/online-store/themes', icon: Palette },
  { title: 'stepDelivery', body: 'stepDeliveryD', action: 'stepDeliveryAction', to: '/settings', icon: Truck },
  { title: 'stepTest', body: 'stepTestD', action: 'stepTestAction', to: '/orders/new', icon: ClipboardCheck },
  { title: 'stepPublish', body: 'stepPublishD', action: 'stepPublishAction', to: '/settings/billing', icon: Store },
]

// ponytail: nothing can be completed yet, so steps have no done state. Add it as products, themes and orders are built.
function Onboarding() {
  const { t, num } = useLang()
  const { me } = useAccount()
  const current = useCurrentStore()!
  const path = useStorePath()
  const [open, setOpen] = useState(0)

  return (
    <div className="page page--onboarding">
      <header className="welcome">
        <title>{t('home')}</title>
        <h1>{t('welcomeTitle', { name: me.name.split(' ')[0] })}</h1>
        <p className="muted">{t('welcomeD', { store: current.store.name })}</p>
      </header>

      <div className="onboarding">
        <section className="card card--flush">
          <div className="guide__head">
            <div className="guide__title">
              <h2>{t('setupTitle')}</h2>
              <p className="muted">{t('setupProgress', { n: num(0) })}</p>
            </div>
            <span className="bars__track" role="progressbar" aria-label={t('setupTitle')} aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={0} />
          </div>
          <ol className="guide">
            {steps.map((step, i) => {
              const Icon = step.icon
              const isOpen = open === i
              return (
                <li key={step.title} className={isOpen ? 'guide__step guide__step--open' : 'guide__step'}>
                  <h3>
                    <button type="button" className="guide__toggle" aria-expanded={isOpen} onClick={() => setOpen(i)}>
                      <span className="guide__mark" aria-hidden="true">{num(i + 1)}</span>
                      <span className="guide__name">{t(step.title)}</span>
                      {!isOpen && <ChevronDown size={16} aria-hidden="true" />}
                    </button>
                  </h3>
                  {isOpen && (
                    <div className="guide__panel">
                      <div className="guide__copy">
                        <p className="muted">{t(step.body)}</p>
                        <LinkButton to={path(step.to)} variant="primary">{t(step.action)}</LinkButton>
                      </div>
                      <span className="guide__icon" aria-hidden="true"><Icon size={28} strokeWidth={1.5} /></span>
                    </div>
                  )}
                </li>
              )
            })}
          </ol>
        </section>

        <aside className="onboarding__side">
          <section className="card">
            <h2>{t('yourStore')}</h2>
            <div className="side-store">
              <span className="store-mark" aria-hidden="true">{current.store.name.charAt(0).toUpperCase()}</span>
              <span className="store-row__text">
                <strong>{current.store.name}</strong>
                <span className="muted">{current.store.handle}</span>
              </span>
            </div>
            <div className="side-status">
              <Badge tone="warning">{t('storeNotOpen')}</Badge>
              <p className="muted">{t('storeNotOpenD')}</p>
            </div>
          </section>
          {current.role !== 'staff' && (
            <section className="card">
              <h2>{t('inviteTeam')}</h2>
              <p className="muted">{t('inviteTeamD')}</p>
              <Link className="side-link" to={path('/settings/members')}>
                <UserPlus size={16} aria-hidden="true" />
                {t('inviteMember')}
              </Link>
            </section>
          )}
        </aside>
      </div>
    </div>
  )
}

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

function Dashboard() {
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
    </div>
  )
}

// Stores have no real figures yet, so everyone gets onboarding. The dashboard design stays reachable with ?preview=dashboard.
export function Home() {
  const [params] = useSearchParams()
  return params.get('preview') === 'dashboard' ? <Dashboard /> : <Onboarding />
}
