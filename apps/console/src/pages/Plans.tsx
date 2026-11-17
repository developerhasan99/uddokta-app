import { useState } from 'react'
import { Badge, Button, PageHeader } from '../../../dashboard/src/components/ui'
import { api, count, errorText, limitText, taka } from '../api'
import { LoadError, Loading, Modal, useLoad } from '../ui'

export type Plan = { id: string; name: string; priceBdt: number; isDefault: boolean; maxLandingPages: number | null; storageMb: number; maxMembers: number | null; maxProducts: number | null; customDomain: boolean; archived: boolean; stores: number }

const empty: Omit<Plan, 'id' | 'stores'> = { name: '', priceBdt: 0, isDefault: false, maxLandingPages: 10, storageMb: 1024, maxMembers: 3, maxProducts: 100, customDomain: true, archived: false }
// A blank limit field means unlimited.
const toField = (n: number | null) => (n === null ? '' : String(n))
const fromField = (v: string) => (v.trim() === '' ? null : Number(v))

function PlanDialog({ plan, onClose, onDone }: { plan: Plan | null; onClose: () => void; onDone: () => void }) {
  const start = plan ?? empty
  const [form, setForm] = useState({ ...start, priceBdt: String(start.priceBdt), storageMb: String(start.storageMb), maxLandingPages: toField(start.maxLandingPages), maxMembers: toField(start.maxMembers), maxProducts: toField(start.maxProducts) })
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = (patch: Partial<typeof form>) => setForm({ ...form, ...patch })
  const digits = (v: string) => v.replace(/\D/g, '').slice(0, 7)
  const number = (key: 'priceBdt' | 'storageMb' | 'maxLandingPages' | 'maxMembers' | 'maxProducts', label: string, help?: string) => (
    <div className="field"><label htmlFor={`plan-${key}`}>{label}</label>
      <input id={`plan-${key}`} className="input" inputMode="numeric" value={form[key]} placeholder={help ? 'Unlimited' : undefined} onChange={(e) => set({ [key]: digits(e.target.value) })} />
      {help && <p className="field__help">{help}</p>}
    </div>
  )
  return (
    <Modal title={plan ? `Edit ${plan.name}` : 'New plan'} sub={plan?.stores ? `${plan.stores} stores are on this plan; changes apply to them at once.` : 'Limits apply per store.'} onClose={onClose} foot={(close) => <>
      <Button onClick={() => close()}>Cancel</Button>
      <Button variant="primary" aria-busy={busy} onClick={async () => {
        setBusy(true); setError(null)
        const body = { ...form, priceBdt: Number(form.priceBdt || 0), storageMb: Number(form.storageMb || 0), maxLandingPages: fromField(form.maxLandingPages), maxMembers: fromField(form.maxMembers), maxProducts: fromField(form.maxProducts), reason }
        try { await api(plan ? `/console/plans/${plan.id}` : '/console/plans', { method: plan ? 'PUT' : 'POST', body }); close(onDone) } catch (err) { setError(errorText(err)); setBusy(false) }
      }}>{plan ? 'Save plan' : 'Create plan'}</Button>
    </>}>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="console-row">
        <div className="field"><label htmlFor="plan-name">Name</label><input id="plan-name" className="input" maxLength={40} value={form.name} onChange={(e) => set({ name: e.target.value })} /></div>
        {number('priceBdt', 'Price per month (৳)')}
      </div>
      <div className="console-row">
        {number('maxProducts', 'Products', 'Blank: unlimited')}
        {number('maxLandingPages', 'Landing pages', 'Blank: unlimited')}
      </div>
      <div className="console-row">
        {number('maxMembers', 'Team members', 'Including the owner. Blank: unlimited')}
        {number('storageMb', 'Media storage (MB)')}
      </div>
      <label className="console-check"><input type="checkbox" checked={form.customDomain} onChange={(e) => set({ customDomain: e.target.checked })} /> Own domain allowed</label>
      <label className="console-check"><input type="checkbox" checked={form.isDefault} disabled={plan?.isDefault} onChange={(e) => set({ isDefault: e.target.checked, archived: e.target.checked ? false : form.archived })} /> Default plan (new stores, and stores whose paid plan ended)</label>
      {plan && <label className="console-check"><input type="checkbox" checked={form.archived} disabled={form.isDefault} onChange={(e) => set({ archived: e.target.checked })} /> Archived (no longer offered; stores already on it keep it)</label>}
      <div className="field"><label htmlFor="plan-reason">Note for the audit log (optional)</label><input id="plan-reason" className="input" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} /></div>
    </Modal>
  )
}

export function Plans() {
  const { data, error, reload } = useLoad(() => api<Plan[]>('/console/plans'), [])
  const [editing, setEditing] = useState<Plan | 'new' | null>(null)
  return (
    <div className="page">
      <PageHeader title="Plans" description="What each plan costs and allows. Limits apply to every store on the plan as soon as you save." action={<Button variant="primary" onClick={() => setEditing('new')}>New plan</Button>} />
      <div className="data-list">
        {error ? <LoadError error={error} retry={reload} /> : !data ? <Loading /> : (
          <table className="data-table">
            <thead><tr><th>Plan</th><th className="end" style={{ width: '7rem' }}>Price</th><th className="end">Products</th><th className="end">Landing pages</th><th className="end">Team</th><th className="end">Storage</th><th style={{ width: '7rem' }}>Own domain</th><th className="end" style={{ width: '6rem' }}>Stores</th></tr></thead>
            <tbody>
              {data.map((p) => (
                <tr key={p.id} className="data-table__row" onClick={() => setEditing(p)}>
                  <th scope="row"><button type="button" className="console-link" onClick={(e) => { e.stopPropagation(); setEditing(p) }}>{p.name}</button>{p.isDefault && <> <Badge tone="success">Default</Badge></>}{p.archived && <> <Badge>Archived</Badge></>}</th>
                  <td className="num end">{p.priceBdt ? taka(p.priceBdt) : 'Free'}</td>
                  <td className="num end">{limitText(p.maxProducts)}</td>
                  <td className="num end">{limitText(p.maxLandingPages)}</td>
                  <td className="num end">{limitText(p.maxMembers)}</td>
                  <td className="num end">{p.storageMb >= 1024 ? `${(p.storageMb / 1024).toLocaleString('en-US')} GB` : `${p.storageMb} MB`}</td>
                  <td>{p.customDomain ? 'Yes' : 'No'}</td>
                  <td className="num end">{count(p.stores)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="muted console-note">Stores with no plan of their own count under the default plan. Plan stores counts only stores set to that plan.</p>
      {editing && <PlanDialog plan={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); reload() }} />}
    </div>
  )
}
