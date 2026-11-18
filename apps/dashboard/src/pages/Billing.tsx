import { Check, Minus } from 'lucide-react'
import { planFeatureLabels, planFeatures, type PlanFeature } from 'storefront/plans'
import { useCurrentStore } from '../account-context'
import { api, errorCode } from '../api'
import { Badge, Notice, PageHeader, Skeleton } from '../components/ui'
import { errorLabel, useLang, type Key } from '../i18n'
import { useEffect, useState } from 'react'

// Settings › Billing (owners and admins): the store's plan and what it includes, what it uses against the limits,
// the plans on offer, how to pay, and the payments recorded. Plans change when Uddokta records a payment.

type Plan = { plan_name: string; plan_until: string | null; price_bdt: number; is_custom: boolean; billing_note: string; max_landing_pages: number | null; storage_mb: number; max_members: number | null; max_products: number | null; features: PlanFeature[] }
type Offer = { id: string; name: string; priceBdt: number; isDefault: boolean; maxLandingPages: number | null; storageMb: number; maxMembers: number | null; maxProducts: number | null; features: PlanFeature[] }
type Data = {
  plan: Plan; paidPlanEnded: boolean
  usage: { products: number; landingPages: number; members: number; storageBytes: number }
  payments: { amount: number; months: number; method: string; reference: string; plan: string | null; at: string }[]
  plans: Offer[]
  pay: { whatsapp: string; bkash: string; nagad: string; bank: string; note: string }
}

export function Billing() {
  const { t, lang, num } = useLang()
  const current = useCurrentStore()!
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    api<Data>(`/stores/${current.store.handle}/billing`).then(setData, (err) => setError(errorCode(err)))
  }, [current.store.handle])

  const L = (pair: readonly [string, string]) => pair[lang === 'bn' ? 0 : 1]
  const taka = (n: number) => `৳${num(n)}`
  const date = (v: string) => new Date(v).toLocaleDateString(lang === 'bn' ? 'bn-BD' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  const mb = (n: number) => (n >= 1024 ? `${num(Math.round((n / 1024) * 10) / 10)} GB` : `${num(n)} MB`)
  const limit = (n: number | null) => (n === null ? t('billingUnlimited') : num(n))

  if (error) {
    return (
      <div className="page page--narrow">
        <PageHeader title={t('billing')} description={t('billing.d')} />
        <section className="card card--flush"><Notice title={t(error === 'forbidden' ? 'billingOwnersOnly' : errorLabel(error))} /></section>
      </div>
    )
  }
  if (!data) return <div className="page page--narrow"><PageHeader title={t('billing')} description={t('billing.d')} /><section className="card"><Skeleton /><Skeleton width="60%" /></section></div>

  const { plan, usage } = data
  const meters: { key: Key; used: number; max: number | null; show: (n: number) => string }[] = [
    { key: 'billingProducts', used: usage.products, max: plan.max_products, show: num },
    { key: 'billingLandingPages', used: usage.landingPages, max: plan.max_landing_pages, show: num },
    { key: 'billingTeam', used: usage.members, max: plan.max_members, show: num },
    { key: 'billingStorage', used: usage.storageBytes / 1024 / 1024, max: plan.storage_mb, show: (n) => mb(Math.round(n)) },
  ]
  const ways = [
    data.pay.bkash && [t('billingBkash'), data.pay.bkash],
    data.pay.nagad && [t('billingNagad'), data.pay.nagad],
    data.pay.whatsapp && ['WhatsApp', data.pay.whatsapp],
  ].filter(Boolean) as [string, string][]

  return (
    <div className="page page--narrow billing">
      <PageHeader title={t('billing')} description={t('billing.d')} />

      <section className="card billing-plan">
        <div className="billing-plan__head">
          <div>
            <p className="muted">{t('billingCurrent')}</p>
            <h2>{plan.plan_name} {plan.is_custom && <Badge tone="info">{t('billingCustom')}</Badge>}</h2>
          </div>
          <p className="billing-plan__price">{plan.price_bdt ? <>{taka(plan.price_bdt)}<span className="muted"> / {t('billingMonth')}</span></> : t('billingFree')}</p>
        </div>
        <p className="muted">{plan.plan_until ? t('billingPaidUntil', { date: date(plan.plan_until) }) : plan.price_bdt ? t('billingNoEnd') : t('billingFreeD')}</p>
        {plan.billing_note && <p className="muted">{plan.billing_note}</p>}
        {data.paidPlanEnded && <p className="notice-line notice-line--warning">{t('billingEnded')}</p>}
        <div className="billing-meters">
          {meters.map((m) => {
            const share = m.max === null ? 0 : Math.min(m.used / Math.max(m.max, 1), 1)
            return (
              <div key={m.key} className="bars__row">
                <span>{t(m.key)}</span>
                <span className="bars__value">{m.show(m.used)} / {m.max === null ? t('billingUnlimited') : m.key === 'billingStorage' ? mb(m.max) : num(m.max)}</span>
                <span className="bars__track"><span className="bars__fill" data-full={share >= 0.9 || undefined} style={{ width: `${m.max === null ? 0 : share * 100}%` }} /></span>
              </div>
            )
          })}
        </div>
        <ul className="billing-tools" aria-label={t('billingTools')}>
          {planFeatures.map((f) => {
            const on = plan.features.includes(f)
            return <li key={f} data-on={on || undefined}>{on ? <Check size={14} aria-hidden="true" /> : <Minus size={14} aria-hidden="true" />}{L(planFeatureLabels[f])}<span className="visually-hidden">: {t(on ? 'billingIncluded' : 'billingNotIncluded')}</span></li>
          })}
        </ul>
      </section>

      {data.plans.length > 0 && (
        <section className="data-list">
          <div className="filter-bar"><h2 className="billing-h2">{t('billingPlans')}</h2></div>
          <div className="billing-compare">
            <table className="data-table">
              <thead>
                <tr><th>{t('billingPlan')}</th><th className="end">{t('billingPrice')}</th><th className="end">{t('billingProducts')}</th><th className="end">{t('billingLandingPages')}</th><th className="end">{t('billingTeam')}</th><th className="end">{t('billingStorage')}</th></tr>
              </thead>
              <tbody>
                {data.plans.map((p) => (
                  <tr key={p.id}>
                    <th scope="row">{p.name}{p.name === plan.plan_name && <> <Badge tone="success">{t('billingYours')}</Badge></>}<span className="billing-sub">{t('billingToolsCount', { n: num(p.features.length), all: num(planFeatures.length) })}</span></th>
                    <td className="num end">{p.priceBdt ? taka(p.priceBdt) : t('billingFree')}</td>
                    <td className="num end">{limit(p.maxProducts)}</td>
                    <td className="num end">{limit(p.maxLandingPages)}</td>
                    <td className="num end">{limit(p.maxMembers)}</td>
                    <td className="num end">{mb(p.storageMb)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="card billing-pay">
        <h2 className="billing-h2">{t('billingHowToPay')}</h2>
        <p className="muted">{t('billingHowToPayD', { store: current.store.handle })}</p>
        {ways.length === 0 && !data.pay.bank && !data.pay.note
          ? <p>{t('billingPayContact')}</p>
          : <>
            {ways.length > 0 && <dl className="billing-ways">{ways.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>}
            {data.pay.bank && <div><p className="billing-label">{t('billingBank')}</p><p className="billing-pre">{data.pay.bank}</p></div>}
            {data.pay.note && <p className="billing-pre">{data.pay.note}</p>}
          </>}
      </section>

      <section className="data-list">
        <div className="filter-bar"><h2 className="billing-h2">{t('billingPayments')}</h2></div>
        {data.payments.length === 0
          ? <Notice title={t('billingNoPayments')} body={t('billingNoPaymentsD')} />
          : (
            <table className="data-table">
              <thead><tr><th>{t('billingDate')}</th><th>{t('billingPlan')}</th><th className="end">{t('billingAmount')}</th><th>{t('billingMonths')}</th><th>{t('billingMethod')}</th></tr></thead>
              <tbody>{data.payments.map((p, i) => (
                <tr key={i}><td>{date(p.at)}</td><td>{p.plan ?? '—'}</td><td className="num end">{taka(p.amount)}</td><td className="num">{num(p.months)}</td><td>{p.method}{p.reference && <span className="billing-sub">{p.reference}</span>}</td></tr>
              ))}</tbody>
            </table>
          )}
      </section>
    </div>
  )
}
