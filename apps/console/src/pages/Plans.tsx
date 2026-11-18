import { useState } from 'react'
import { Badge, Button, PageHeader } from '../../../dashboard/src/components/ui'
import { planFeatures, type PlanFeature } from '../../../storefront/src/plans'
import { api, count, errorText, limitText, taka } from '../api'
import { fromLimitForm, LimitFields, LoadError, Loading, Modal, toLimitForm, useLoad, type LimitForm } from '../ui'

export type Plan = { id: string; name: string; priceBdt: number; isDefault: boolean; maxLandingPages: number | null; storageMb: number; maxMembers: number | null; maxProducts: number | null; features: PlanFeature[]; billingNote: string; archived: boolean; stores: number }

const starter: Omit<Plan, 'id' | 'stores'> = { name: '', priceBdt: 0, isDefault: false, maxLandingPages: 10, storageMb: 1024, maxMembers: 3, maxProducts: 100, features: [], billingNote: '', archived: false }
export const storage = (mb: number) => (mb >= 1024 ? `${(mb / 1024).toLocaleString('en-US')} GB` : `${mb} MB`)

function PlanDialog({ plan, onClose, onDone }: { plan: Plan | null; onClose: () => void; onDone: () => void }) {
  const start = plan ?? starter
  const [form, setForm] = useState<LimitForm>(toLimitForm(start))
  const [name, setName] = useState(start.name)
  const [isDefault, setIsDefault] = useState(start.isDefault)
  const [archived, setArchived] = useState(start.archived)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <Modal title={plan ? `Edit ${plan.name}` : 'New plan'} sub={plan?.stores ? `${plan.stores} stores are on this plan; changes apply to them at once.` : 'Limits and tools apply to each store on the plan.'} onClose={onClose} foot={(close) => <>
      <Button onClick={() => close()}>Cancel</Button>
      <Button variant="primary" aria-busy={busy} onClick={async () => {
        setBusy(true); setError(null)
        try { await api(plan ? `/console/plans/${plan.id}` : '/console/plans', { method: plan ? 'PUT' : 'POST', body: { ...fromLimitForm(form), name, isDefault, archived, reason } }); close(onDone) } catch (err) { setError(errorText(err)); setBusy(false) }
      }}>{plan ? 'Save plan' : 'Create plan'}</Button>
    </>}>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="field"><label htmlFor="plan-name">Name</label><input id="plan-name" className="input" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} /></div>
      <LimitFields form={form} set={(patch) => setForm({ ...form, ...patch })} />
      <label className="console-check"><input type="checkbox" checked={isDefault} disabled={plan?.isDefault} onChange={(e) => { setIsDefault(e.target.checked); if (e.target.checked) setArchived(false) }} /> Default plan (new stores, and stores whose paid plan ended)</label>
      {plan && <label className="console-check"><input type="checkbox" checked={archived} disabled={isDefault} onChange={(e) => setArchived(e.target.checked)} /> Archived (no longer offered; stores already on it keep it)</label>}
      <div className="field"><label htmlFor="plan-reason">Note for the audit log (optional)</label><input id="plan-reason" className="input" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} /></div>
    </Modal>
  )
}

export function Plans() {
  const { data, error, reload } = useLoad(() => api<Plan[]>('/console/plans'), [])
  const [editing, setEditing] = useState<Plan | 'new' | null>(null)
  return (
    <div className="page">
      <PageHeader title="Plans" description="The plans every seller can choose. Limits and tools apply to each store on the plan as soon as you save. Custom plans for one store are made on that store’s page." action={<Button variant="primary" onClick={() => setEditing('new')}>New plan</Button>} />
      <div className="data-list">
        {error ? <LoadError error={error} retry={reload} /> : !data ? <Loading /> : (
          <table className="data-table">
            <thead><tr><th>Plan</th><th className="end" style={{ width: '7rem' }}>Price</th><th className="end">Products</th><th className="end">Landing pages</th><th className="end">Team</th><th className="end">Storage</th><th style={{ width: '7rem' }} className="end">Tools</th><th className="end" style={{ width: '6rem' }}>Stores</th></tr></thead>
            <tbody>
              {data.map((p) => (
                <tr key={p.id} className="data-table__row" onClick={() => setEditing(p)}>
                  <th scope="row"><button type="button" className="console-link" onClick={(e) => { e.stopPropagation(); setEditing(p) }}>{p.name}</button>{p.isDefault && <> <Badge tone="success">Default</Badge></>}{p.archived && <> <Badge>Archived</Badge></>}</th>
                  <td className="num end">{p.priceBdt ? taka(p.priceBdt) : 'Free'}</td>
                  <td className="num end">{limitText(p.maxProducts)}</td>
                  <td className="num end">{limitText(p.maxLandingPages)}</td>
                  <td className="num end">{limitText(p.maxMembers)}</td>
                  <td className="num end">{storage(p.storageMb)}</td>
                  <td className="num end">{p.features.length} of {planFeatures.length}</td>
                  <td className="num end">{count(p.stores)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="muted console-note">Stores with no plan of their own count under the default plan. The Stores column counts only stores set to that plan.</p>
      {editing && <PlanDialog plan={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); reload() }} />}
    </div>
  )
}
