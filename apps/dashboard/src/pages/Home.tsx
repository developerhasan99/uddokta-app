import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Check, ChevronDown, ClipboardCheck, LayoutTemplate, Palette, Store, Tag, Truck, UserPlus, type LucideIcon } from 'lucide-react'
import { useAccount, useCurrentStore, useStorePath } from '../account-context'
import { AreaChart, Sparkline } from '../components/charts'
import { api } from '../api'
import { statuses, type Status } from './Orders'
import { Badge, Button, LinkButton, Notice, PageHeader, Skeleton } from '../components/ui'
import { useLang, type Key } from '../i18n'

type Summary = {
  days: { day: string; sales: number; orders: number; delivered: number; returned: number }[]
  statuses: Partial<Record<string, number>>
  setup: { products: number; livePages: number; orders: number }
}

const steps: { title: Key; body: Key; action: Key; to: string; icon: LucideIcon; done?: (s: Summary['setup']) => boolean }[] = [
  { title: 'stepProduct', body: 'stepProductD', action: 'stepProductAction', to: '/products', icon: Tag, done: (s) => s.products > 0 },
  { title: 'stepPage', body: 'stepPageD', action: 'stepPageAction', to: '/landing-pages', icon: LayoutTemplate, done: (s) => s.livePages > 0 },
  { title: 'stepTheme', body: 'stepThemeD', action: 'stepThemeAction', to: '/online-store/themes', icon: Palette },
  { title: 'stepDelivery', body: 'stepDeliveryD', action: 'stepDeliveryAction', to: '/settings', icon: Truck },
  { title: 'stepTest', body: 'stepTestD', action: 'stepTestAction', to: '/orders/new', icon: ClipboardCheck, done: (s) => s.orders > 0 },
  { title: 'stepPublish', body: 'stepPublishD', action: 'stepPublishAction', to: '/settings/billing', icon: Store },
]

// Steps that can be checked tick themselves off; delivery, theme and plan have nothing to check yet.
function Onboarding({ setup }: { setup: Summary['setup'] }) {
  const { t, num } = useLang()
  const { me } = useAccount()
  const current = useCurrentStore()!
  const path = useStorePath()
  const isDone = steps.map((step) => step.done?.(setup) ?? false)
  const doneCount = isDone.filter(Boolean).length
  const [open, setOpen] = useState(() => Math.max(isDone.indexOf(false), 0))

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
              <p className="muted">{t('setupProgress', { n: num(doneCount) })}</p>
            </div>
            <span className="bars__track" role="progressbar" aria-label={t('setupTitle')} aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={doneCount}><span className="bars__fill" style={{ width: `${(doneCount / steps.length) * 100}%` }} /></span>
          </div>
          <ol className="guide">
            {steps.map((step, i) => {
              const Icon = step.icon
              const isOpen = open === i
              return (
                <li key={step.title} className={isOpen ? 'guide__step guide__step--open' : 'guide__step'}>
                  <h3>
                    <button type="button" className="guide__toggle" aria-expanded={isOpen} onClick={() => setOpen(i)}>
                      <span className="guide__mark" aria-hidden="true">{isDone[i] ? <Check size={14} /> : num(i + 1)}</span>
                      <span className="guide__name">{t(step.title)}</span>
                      {isDone[i] && <Badge tone="success">{t('stepDone')}</Badge>}
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

const statusOrder: { key: Status; label: Key }[] = (Object.keys(statuses) as Status[]).map((key) => ({ key, label: statuses[key].label }))

function Dashboard({ summary }: { summary: Summary }) {
  const { t, num, money, date } = useLang()
  const path = useStorePath()
  const sum = (values: number[]) => values.reduce((a, b) => a + b, 0)
  const sales = summary.days.map((d) => d.sales)
  const orders = summary.days.map((d) => d.orders)
  const delivered = summary.days.map((d) => d.delivered)
  // Of the orders that finished, the share that came back: what costs a COD seller courier fees both ways.
  const returnRate = summary.days.map((d) => (d.delivered + d.returned ? Math.round((d.returned / (d.delivered + d.returned)) * 100) : 0))
  const finished = sum(delivered) + sum(summary.days.map((d) => d.returned))
  const stats: { label: Key; value: string; series: number[] }[] = [
    { label: 'statSales', value: money(sum(sales)), series: sales },
    { label: 'statOrders', value: num(sum(orders)), series: orders },
    { label: 'statDelivered', value: num(sum(delivered)), series: delivered },
    { label: 'statReturn', value: `${num(finished ? Math.round((sum(summary.days.map((d) => d.returned)) / finished) * 100) : 0)}%`, series: returnRate },
  ]
  const dayLabels = summary.days.map((d) => date(new Date(`${d.day}T00:00:00Z`)))
  const orderStatus = statusOrder.map((s) => ({ label: s.label, count: summary.statuses[s.key] ?? 0 }))
  const maxStatus = Math.max(1, ...orderStatus.map((s) => s.count))

  return (
    <div className="page">
      <PageHeader title={t('home')} description={t('home.d')} action={<LinkButton to={path('/orders/new')} variant="primary">{t('newOrder')}</LinkButton>} />

      <p className="muted">{t('statLast14')}</p>

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
          <AreaChart values={sales} labels={dayLabels} format={money} label={t('salesOverview')} />
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

// The setup guide until the first order arrives, then the store's real figures.
export function Home() {
  const { t } = useLang()
  const handle = useCurrentStore()!.store.handle
  const [summary, setSummary] = useState<Summary | null>(null)
  const [failed, setFailed] = useState(false)

  const load = async () => {
    setFailed(false)
    try {
      setSummary(await api<Summary>(`/stores/${handle}/summary`))
    } catch {
      setFailed(true)
    }
  }

  useEffect(() => {
    void load()
  }, [handle])

  if (failed) return <div className="page"><section className="card card--flush"><Notice role="alert" title={t('errNetwork')} action={<Button onClick={() => void load()}>{t('retry')}</Button>} /></section></div>
  if (!summary) return <div className="page" role="status" aria-label={t('loading')}><Skeleton width="16rem" /><section className="card"><Skeleton /><Skeleton width="60%" /></section></div>
  return summary.setup.orders > 0 ? <Dashboard summary={summary} /> : <Onboarding setup={summary.setup} />
}
