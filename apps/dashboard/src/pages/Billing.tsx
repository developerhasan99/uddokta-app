import { useEffect, useState } from 'react'
import { ArrowUpRight, Check, Copy, Lock, MessageCircle } from 'lucide-react'
import { planFeatureLabels, planFeatures, type PlanFeature } from 'storefront/plans'
import { useCurrentStore } from '../account-context'
import { api, errorCode } from '../api'
import { Badge, Button, Notice, PageHeader, Skeleton } from '../components/ui'
import { SupportLink, waDigits } from '../components/Support'
import { errorLabel, siteUrl, useLang, type Key } from '../i18n'

// Settings › Billing (owners and admins): the store's plan, what it uses and includes, the plans it can move to,
// how to pay (amount worked out from the plan's price for display, with the details to send on WhatsApp), and the
// payments Uddokta has recorded. Plans change only when Uddokta records a payment in the console.

type Plan = { plan_name: string; plan_until: string | null; price_bdt: number; is_custom: boolean; billing_note: string; max_landing_pages: number | null; storage_mb: number; max_members: number | null; max_products: number | null; features: PlanFeature[] }
type Offer = { id: string; name: string; priceBdt: number; isDefault: boolean; maxLandingPages: number | null; storageMb: number; maxMembers: number | null; maxProducts: number | null; features: PlanFeature[] }
type Data = {
  plan: Plan; paidPlanEnded: boolean
  usage: { products: number; landingPages: number; members: number; storageBytes: number }
  payments: { amount: number; months: number; method: string; reference: string; plan: string | null; at: string }[]
  plans: Offer[]
  pay: { whatsapp: string; bkash: string; nagad: string; bank: string; note: string }
}

const monthChoices = [1, 3, 6, 12]

function CopyValue({ value, label }: { value: string; label: string }) {
  const { t } = useLang()
  const [copied, setCopied] = useState(false)
  return (
    <button type="button" className="billing-copy" aria-label={`${t('billingCopy')}: ${label}`} onClick={async () => {
      try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { /* the value stays visible to copy by hand */ }
    }}>
      {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
      <span>{copied ? t('copied') : t('billingCopy')}</span>
    </button>
  )
}

export function Billing() {
  const { t, lang, num } = useLang()
  const current = useCurrentStore()!
  const handle = current.store.handle
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [choice, setChoice] = useState<string | null>(null)
  const [months, setMonths] = useState(1)
  useEffect(() => {
    api<Data>(`/stores/${handle}/billing`).then(setData, (err) => setError(errorCode(err)))
  }, [handle])

  const L = (pair: readonly [string, string]) => pair[lang === 'bn' ? 0 : 1]
  const taka = (n: number) => `৳${num(n)}`
  const date = (v: string) => new Date(v).toLocaleDateString(lang === 'bn' ? 'bn-BD' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  const mb = (n: number) => (n >= 1024 ? `${num(Math.round((n / 1024) * 10) / 10)} GB` : `${num(n)} MB`)
  const limit = (n: number | null) => (n === null ? t('billingUnlimited') : num(n))
  const header = <PageHeader title={t('billing')} description={t('billing.d')} action={<a className="btn btn--default" href={siteUrl(lang, 'pricing')} target="_blank" rel="noopener">{t('billingCompare')}<ArrowUpRight size={14} aria-hidden="true" /></a>} />

  if (error) return <div className="page page--narrow">{header}<section className="card card--flush"><Notice title={t(error === 'forbidden' ? 'billingOwnersOnly' : errorLabel(error))} /></section></div>
  if (!data) return <div className="page page--narrow">{header}<section className="card"><Skeleton /><Skeleton width="60%" /></section></div>

  const { plan, usage } = data
  const paidOffers = data.plans.filter((p) => p.priceBdt > 0)
  // The plan to pay for: the one picked below, else the store's own paid plan, else the cheapest paid plan.
  const ownPaid = plan.price_bdt > 0 ? { name: plan.plan_name, priceBdt: plan.price_bdt } : null
  const picked = paidOffers.find((p) => p.id === choice) ?? (ownPaid && !choice ? ownPaid : paidOffers[0] ?? ownPaid)
  const total = picked ? picked.priceBdt * months : 0
  const status = data.paidPlanEnded ? { tone: 'warning' as const, text: t('billingStatusEnded') }
    : plan.plan_until ? { tone: 'success' as const, text: t('billingStatusUntil', { date: date(plan.plan_until) }) }
    : plan.price_bdt ? { tone: 'success' as const, text: t('billingStatusActive') }
    : { tone: 'neutral' as const, text: t('billingStatusFree') }
  const meters: { key: Key; used: number; max: number | null; show: (n: number) => string }[] = [
    { key: 'billingProducts', used: usage.products, max: plan.max_products, show: (n) => num(n) },
    { key: 'billingLandingPages', used: usage.landingPages, max: plan.max_landing_pages, show: (n) => num(n) },
    { key: 'billingTeam', used: usage.members, max: plan.max_members, show: (n) => num(n) },
    { key: 'billingStorage', used: usage.storageBytes / 1024 / 1024, max: plan.storage_mb, show: (n) => (n > 0 && n < 1 ? `${num(Math.max(1, Math.round(n * 1024)))} KB` : mb(Math.round(n))) },
  ]
  const ways = ([['billingBkash', data.pay.bkash], ['billingNagad', data.pay.nagad]] as [Key, string][]).filter(([, v]) => v)
  const waNumber = waDigits(data.pay.whatsapp)
  const waText = picked
    ? t('billingWaText', { store: handle, plan: picked.name, months: num(months), amount: taka(total) })
    : t('billingWaAsk', { store: handle })
  const choose = (id: string) => { setChoice(id); document.getElementById('billing-pay')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }

  return (
    <div className="page page--narrow billing">
      {header}

      <section className="card billing-plan" aria-labelledby="billing-plan-name">
        <div className="billing-plan__head">
          <div className="billing-plan__title">
            <p className="muted">{t('billingCurrent')}</p>
            <h2 id="billing-plan-name">{plan.plan_name}{plan.is_custom && <Badge tone="info">{t('billingCustom')}</Badge>}</h2>
            <p><Badge tone={status.tone}>{status.text}</Badge></p>
          </div>
          <div className="billing-plan__price">
            <strong>{plan.price_bdt ? taka(plan.price_bdt) : t('billingFree')}</strong>
            {plan.price_bdt > 0 && <span className="muted">/ {t('billingMonth')}</span>}
          </div>
        </div>
        {plan.billing_note && <p className="muted">{plan.billing_note}</p>}
        {data.paidPlanEnded && <p className="notice-line notice-line--warning">{t('billingEnded')}</p>}

        <div className="billing-usage">
          {meters.map((m) => {
            const share = m.max === null ? 0 : Math.min(m.used / Math.max(m.max, 1), 1)
            return (
              <div key={m.key} className="billing-usage__item" data-full={share >= 0.9 || undefined}>
                <span className="muted">{t(m.key)}</span>
                <strong>{m.show(m.used)} <span className="muted">/ {m.max === null ? t('billingUnlimited') : m.key === 'billingStorage' ? mb(m.max) : num(m.max)}</span></strong>
                <span className="bars__track" aria-hidden="true"><span className="bars__fill" style={{ width: `${share * 100}%` }} /></span>
              </div>
            )
          })}
        </div>

        <div className="billing-tools-wrap">
          <p className="billing-label">{t('billingTools')}</p>
          <ul className="billing-tools">
            {planFeatures.map((f) => {
              const on = plan.features.includes(f)
              return <li key={f} data-on={on || undefined}>{on ? <Check size={14} aria-hidden="true" /> : <Lock size={13} aria-hidden="true" />}{L(planFeatureLabels[f])}<span className="visually-hidden">: {t(on ? 'billingIncluded' : 'billingNotIncluded')}</span></li>
            })}
          </ul>
        </div>
      </section>

      {data.plans.length > 0 && (
        <section aria-labelledby="billing-plans">
          <div className="billing-section-head">
            <div><h2 id="billing-plans" className="billing-h2">{t('billingPlans')}</h2><p className="muted">{t('billingPlansD')}</p></div>
            <a className="billing-link" href={siteUrl(lang, 'pricing')} target="_blank" rel="noopener">{t('billingCompareAll')}<ArrowUpRight size={14} aria-hidden="true" /></a>
          </div>
          <div className="billing-offers">
            {data.plans.map((p) => {
              const yours = p.name === plan.plan_name
              return (
                <article key={p.id} className="card billing-offer" data-current={yours || undefined}>
                  <div className="billing-offer__top">
                    <h3>{p.name}</h3>
                    {yours && <Badge tone="success">{t('billingYours')}</Badge>}
                  </div>
                  <p className="billing-offer__price"><strong>{p.priceBdt ? taka(p.priceBdt) : t('billingFree')}</strong>{p.priceBdt > 0 && <span className="muted"> / {t('billingMonth')}</span>}</p>
                  <dl className="billing-offer__limits">
                    <div><dt>{t('billingProducts')}</dt><dd>{limit(p.maxProducts)}</dd></div>
                    <div><dt>{t('billingLandingPages')}</dt><dd>{limit(p.maxLandingPages)}</dd></div>
                    <div><dt>{t('billingTeam')}</dt><dd>{limit(p.maxMembers)}</dd></div>
                    <div><dt>{t('billingStorage')}</dt><dd>{mb(p.storageMb)}</dd></div>
                  </dl>
                  <p className="muted billing-offer__tools">{p.features.length === planFeatures.length ? t('billingAllTools') : t('billingToolsCount', { n: num(p.features.length), all: num(planFeatures.length) })}</p>
                  {p.priceBdt > 0 && <Button variant={yours ? 'default' : 'primary'} onClick={() => choose(p.id)}>{yours ? t('billingRenew') : t('billingChoose')}</Button>}
                </article>
              )
            })}
          </div>
        </section>
      )}

      <section id="billing-pay" className="card billing-pay" aria-labelledby="billing-pay-title">
        <div>
          <h2 id="billing-pay-title" className="billing-h2">{t('billingHowToPay')}</h2>
          <p className="muted">{t('billingHowToPayD')}</p>
          <a className="billing-link" href={siteUrl(lang, 'refund')} target="_blank" rel="noopener">{t('legalRefund')}<ArrowUpRight size={14} aria-hidden="true" /></a>
        </div>
        {!picked && !ways.length && !data.pay.bank
          ? <p>{t('billingPayContact')}</p>
          : (
            <ol className="billing-steps">
              {picked && (
                <li>
                  <span className="billing-steps__n" aria-hidden="true">{num(1)}</span>
                  <div className="billing-steps__body">
                    <h3>{t('billingStepPlan')}</h3>
                    <div className="billing-pick">
                      <label className="field"><span>{t('billingPlan')}</span>
                        <select className="input" value={paidOffers.find((p) => p.name === picked.name)?.id ?? ''} onChange={(e) => setChoice(e.target.value)} disabled={!paidOffers.length}>
                          {!paidOffers.some((p) => p.name === picked.name) && <option value="">{picked.name}</option>}
                          {paidOffers.map((p) => <option key={p.id} value={p.id}>{p.name} · {taka(p.priceBdt)}</option>)}
                        </select>
                      </label>
                      <div className="field"><span id="billing-months">{t('billingMonths')}</span>
                        <div className="segmented" role="radiogroup" aria-labelledby="billing-months">
                          {monthChoices.map((m) => <label key={m}><input type="radio" name="billing-months" checked={months === m} onChange={() => setMonths(m)} /><span>{num(m)}</span></label>)}
                        </div>
                      </div>
                    </div>
                    <p className="billing-total">{t('billingTotal')} <strong>{taka(total)}</strong> <span className="muted">({taka(picked.priceBdt)} × {num(months)})</span></p>
                  </div>
                </li>
              )}
              <li>
                <span className="billing-steps__n" aria-hidden="true">{num(picked ? 2 : 1)}</span>
                <div className="billing-steps__body">
                  <h3>{t('billingStepSend')}</h3>
                  {ways.length > 0 && (
                    <dl className="billing-ways">
                      {ways.map(([label, value]) => <div key={label}><dt>{t(label)}</dt><dd><span>{value}</span><CopyValue value={value} label={t(label)} /></dd></div>)}
                    </dl>
                  )}
                  {data.pay.bank && <div className="billing-bank"><p className="billing-label">{t('billingBank')}</p><p className="billing-pre">{data.pay.bank}</p></div>}
                  {/* No payment details set up yet: say how to get them instead of leaving the step empty. */}
                  {!ways.length && !data.pay.bank && <p>{t('billingPayContact')}</p>}
                  <p className="billing-ref">{t('billingReference')} <strong>{handle}</strong> <CopyValue value={handle} label={t('billingReferenceLabel')} /></p>
                  {data.pay.note && <p className="billing-pre muted">{data.pay.note}</p>}
                </div>
              </li>
              <li>
                <span className="billing-steps__n" aria-hidden="true">{num(picked ? 3 : 2)}</span>
                <div className="billing-steps__body">
                  <h3>{t('billingStepConfirm')}</h3>
                  <p className="muted">{t('billingStepConfirmD')}</p>
                  {waNumber
                    ? <a className="btn btn--primary billing-wa" href={`https://wa.me/${waNumber}?text=${encodeURIComponent(waText)}`} target="_blank" rel="noopener"><MessageCircle size={16} aria-hidden="true" />{t('billingSendWa')}</a>
                    : <SupportLink />}
                </div>
              </li>
            </ol>
          )}
      </section>

      <section className="data-list" aria-labelledby="billing-history">
        <div className="filter-bar"><h2 id="billing-history" className="billing-h2">{t('billingPayments')}</h2></div>
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
