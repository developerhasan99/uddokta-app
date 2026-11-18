import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { Lock } from 'lucide-react'
import { planFeatureLabels, type PlanFeature } from 'storefront/plans'
import { useCurrentStore, useStorePath } from '../account-context'
import { api } from '../api'
import { useLang } from '../i18n'
import { Badge, LinkButton, PageHeader } from './ui'

// The store's plan as the dashboard needs it: which tools it includes. The API is what enforces it
// (guardStores); here it only marks closed tools in the menu and explains them instead of showing an error.
export type StorePlan = { planName: string; isCustom: boolean; features: PlanFeature[] }
const PlanContext = createContext<StorePlan | null>(null)

export function PlanProvider({ handle, children }: { handle: string; children: ReactNode }) {
  const [plan, setPlan] = useState<StorePlan | null>(null)
  useEffect(() => {
    let live = true
    setPlan(null)
    api<StorePlan>(`/stores/${handle}/plan`).then((p) => { if (live) setPlan(p) }, () => {})
    return () => { live = false }
  }, [handle])
  return <PlanContext.Provider value={plan}>{children}</PlanContext.Provider>
}

// False only once the plan is known to leave the tool out, so nothing flickers while it loads.
export function useHasFeature(feature?: PlanFeature) {
  const plan = useContext(PlanContext)
  return !feature || !plan || plan.features.includes(feature)
}

export function LockMark() {
  const { t } = useLang()
  return <Lock className="nav-lock" size={13} aria-label={t('planLocked')} />
}

// Wraps a screen whose tool may not be in the plan: shows what it is and where to get it.
export function PlanGate({ feature, children }: { feature: PlanFeature; children: ReactNode }) {
  const { t, lang } = useLang()
  const path = useStorePath()
  const current = useCurrentStore()
  const plan = useContext(PlanContext)
  if (useHasFeature(feature)) return <>{children}</>
  const name = planFeatureLabels[feature][lang === 'bn' ? 0 : 1]
  const manages = current?.role === 'owner' || current?.role === 'admin'
  return (
    <div className="page page--narrow planned-feature-page">
      <PageHeader title={name} description={t('planLockedD', { plan: plan?.planName ?? '' })} />
      <section className="card planned-feature">
        <div><Badge>{t('planLocked')}</Badge></div>
        <h2>{t('planLockedTitle')}</h2>
        <p className="muted">{t(manages ? 'planLockedOwner' : 'planLockedStaff')}</p>
        <div className="row">{manages ? <LinkButton to={path('/settings/billing')} variant="primary">{t('billingSee')}</LinkButton> : <LinkButton to={path('/')}>{t('backHome')}</LinkButton>}</div>
      </section>
    </div>
  )
}
