import { useEffect, useState, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { useDialog } from '../../dashboard/src/components/dialog'
import { Button } from '../../dashboard/src/components/ui'
import { errorText } from './api'
import { planFeatureLabels, planFeatures, type PlanFeature } from '../../storefront/src/plans'

// A modal from the shared dialog helper (animated in and out, closes on Esc and backdrop).
export function Modal({ title, sub, onClose, children, foot }: { title: string; sub?: string; onClose: () => void; children: ReactNode; foot: (close: (then?: () => void) => void) => ReactNode }) {
  const { ref, close, props } = useDialog(onClose)
  useEffect(() => { if (!ref.current?.open) ref.current?.showModal() }, [ref])
  return (
    <dialog className="modal" aria-labelledby="console-dialog-title" {...props}>
      <header className="dialog__head">
        <div className="dialog__title">
          <h2 id="console-dialog-title">{title}</h2>
          {sub && <p className="dialog__sub">{sub}</p>}
        </div>
        <button type="button" className="dialog__close" aria-label="Close" onClick={() => close()}><X size={18} aria-hidden="true" /></button>
      </header>
      <div className="dialog__body console-form">{children}</div>
      <footer className="dialog__foot">{foot(close)}</footer>
    </dialog>
  )
}

// Every change in the console says why; the reason is kept in the audit log.
export function ReasonDialog({ title, sub, action, danger, onConfirm, onClose, onDone }: {
  title: string; sub?: string; action: string; danger?: boolean
  onConfirm: (reason: string) => Promise<unknown>; onClose: () => void; onDone: () => void
}) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <Modal title={title} sub={sub} onClose={onClose} foot={(close) => <>
      <Button onClick={() => close()}>Cancel</Button>
      <Button variant={danger ? 'danger' : 'primary'} aria-busy={busy} disabled={!reason.trim()} onClick={async () => {
        setBusy(true); setError(null)
        try { await onConfirm(reason.trim()); close(onDone) } catch (err) { setError(errorText(err)); setBusy(false) }
      }}>{action}</Button>
    </>}>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="field">
        <label htmlFor="console-reason">Reason</label>
        <textarea id="console-reason" className="input console-textarea" rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Kept in the audit log" />
      </div>
    </Modal>
  )
}

export function Loading() {
  return <div className="console-loading" role="status" aria-label="Loading" />
}

export function LoadError({ error, retry }: { error: unknown; retry: () => void }) {
  return <div className="notice"><h2>{errorText(error)}</h2><Button onClick={retry}>Try again</Button></div>
}

// Loads once and again on demand; the screens keep their own forms.
export function useLoad<T>(load: () => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<{ data?: T; error?: unknown }>({})
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let live = true
    load().then((data) => { if (live) setState({ data }) }, (error) => { if (live) setState({ error }) })
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick])
  return { ...state, reload: () => setTick((n) => n + 1) }
}


// The checklist of seller tools a plan includes.
export function FeatureChecklist({ value, onChange }: { value: PlanFeature[]; onChange: (next: PlanFeature[]) => void }) {
  return (
    <fieldset className="console-features">
      <legend>Included tools <span className="muted">(landing pages, orders, products and media are always included)</span></legend>
      {planFeatures.map((f) => (
        <label key={f} className="console-check">
          <input type="checkbox" checked={value.includes(f)} onChange={(e) => onChange(e.target.checked ? [...value, f] : value.filter((x) => x !== f))} />
          {planFeatureLabels[f][1]}
        </label>
      ))}
      <div className="console-features__all">
        <button type="button" className="console-link" onClick={() => onChange([...planFeatures])}>Select all</button>
        <button type="button" className="console-link" onClick={() => onChange([])}>Clear</button>
      </div>
    </fieldset>
  )
}

// Limits typed as text: blank means unlimited.
export type LimitForm = { priceBdt: string; storageMb: string; maxLandingPages: string; maxMembers: string; maxProducts: string; features: PlanFeature[]; billingNote: string }
const field = (n: number | null) => (n === null ? '' : String(n))
export const toLimitForm = (p: { priceBdt: number; storageMb: number; maxLandingPages: number | null; maxMembers: number | null; maxProducts: number | null; features: PlanFeature[]; billingNote?: string }): LimitForm =>
  ({ priceBdt: String(p.priceBdt), storageMb: String(p.storageMb), maxLandingPages: field(p.maxLandingPages), maxMembers: field(p.maxMembers), maxProducts: field(p.maxProducts), features: p.features, billingNote: p.billingNote ?? '' })
const num = (v: string) => (v.trim() === '' ? null : Number(v))
export const fromLimitForm = (f: LimitForm) => ({ ...f, priceBdt: Number(f.priceBdt || 0), storageMb: Number(f.storageMb || 0), maxLandingPages: num(f.maxLandingPages), maxMembers: num(f.maxMembers), maxProducts: num(f.maxProducts) })

// Price, the four limits, the tools and the billing note: the same form for public and custom plans.
export function LimitFields({ form, set, priceLabel = 'Price per month (৳)' }: { form: LimitForm; set: (patch: Partial<LimitForm>) => void; priceLabel?: string }) {
  const digits = (v: string) => v.replace(/\D/g, '').slice(0, 7)
  const input = (key: 'priceBdt' | 'storageMb' | 'maxLandingPages' | 'maxMembers' | 'maxProducts', label: string, help?: string) => (
    <div className="field"><label htmlFor={`limit-${key}`}>{label}</label>
      <input id={`limit-${key}`} className="input" inputMode="numeric" value={form[key]} placeholder={help ? 'Unlimited' : undefined} onChange={(e) => set({ [key]: digits(e.target.value) })} />
      {help && <p className="field__help">{help}</p>}
    </div>
  )
  return <>
    <div className="console-row">{input('priceBdt', priceLabel)}{input('storageMb', 'Media storage (MB)')}</div>
    <div className="console-row">{input('maxProducts', 'Products', 'Blank: unlimited')}{input('maxLandingPages', 'Landing pages', 'Blank: unlimited')}</div>
    <div className="console-row">{input('maxMembers', 'Team members', 'Including the owner. Blank: unlimited')}<div /></div>
    <FeatureChecklist value={form.features} onChange={(features) => set({ features })} />
    <div className="field"><label htmlFor="limit-note">Billing note <span className="muted">(shown to the store, e.g. “Paid yearly by bank transfer”)</span></label>
      <input id="limit-note" className="input" maxLength={300} value={form.billingNote} onChange={(e) => set({ billingNote: e.target.value })} />
    </div>
  </>
}
