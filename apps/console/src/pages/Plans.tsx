import { useState } from 'react'
import { Badge, Button, PageHeader } from '../../../dashboard/src/components/ui'
import { planFeatures, type PlanFeature } from '../../../storefront/src/plans'
import { api, count, errorText, limitText, taka } from '../api'
import { fromLimitForm, LimitFields, LoadError, Loading, Modal, ReasonDialog, toLimitForm, useLoad, type LimitForm } from '../ui'

export type Plan = { id: string; name: string; priceBdt: number; isDefault: boolean; maxLandingPages: number | null; storageMb: number; maxMembers: number | null; maxProducts: number | null; features: PlanFeature[]; billingNote: string; archived: boolean; hidden: boolean; payments: number; stores: number }

const starter: Omit<Plan, 'id' | 'stores' | 'payments'> = { name: '', priceBdt: 0, isDefault: false, maxLandingPages: 10, storageMb: 1024, maxMembers: 3, maxProducts: 100, features: [], billingNote: '', archived: false, hidden: false }
export const storage = (mb: number) => (mb >= 1024 ? `${(mb / 1024).toLocaleString('en-US')} GB` : `${mb} MB`)

function PlanDialog({ plan, onClose, onDone, onMove, onDelete }: { plan: Plan | null; onClose: () => void; onDone: () => void; onMove: () => void; onDelete: () => void }) {
  const start = plan ?? starter
  const [form, setForm] = useState<LimitForm>(toLimitForm(start))
  const [name, setName] = useState(start.name)
  const [isDefault, setIsDefault] = useState(start.isDefault)
  const [archived, setArchived] = useState(start.archived)
  const [hidden, setHidden] = useState(start.hidden)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <Modal title={plan ? `Edit ${plan.name}` : 'New plan'} sub={plan?.stores ? `${plan.stores} stores are on this plan; changes apply to them at once.` : 'Limits and tools apply to each store on the plan.'} onClose={onClose} foot={(close) => <>
      {plan && plan.stores > 0 && <span className="console-foot-start"><Button onClick={() => close(onMove)}>Move stores</Button></span>}
      {plan && !plan.isDefault && !plan.stores && !plan.payments && <span className="console-foot-start"><Button variant="danger" onClick={() => close(onDelete)}>Delete plan</Button></span>}
      <Button onClick={() => close()}>Cancel</Button>
      <Button variant="primary" aria-busy={busy} onClick={async () => {
        setBusy(true); setError(null)
        try { await api(plan ? `/console/plans/${plan.id}` : '/console/plans', { method: plan ? 'PUT' : 'POST', body: { ...fromLimitForm(form), name, isDefault, archived, hidden, reason } }); close(onDone) } catch (err) { setError(errorText(err)); setBusy(false) }
      }}>{plan ? 'Save plan' : 'Create plan'}</Button>
    </>}>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="field"><label htmlFor="plan-name">Name</label><input id="plan-name" className="input" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} /></div>
      <LimitFields form={form} set={(patch) => setForm({ ...form, ...patch })} />
      <label className="console-check"><input type="checkbox" checked={isDefault} disabled={plan?.isDefault} onChange={(e) => { setIsDefault(e.target.checked); if (e.target.checked) setArchived(false) }} /> Default plan (new stores, and stores whose paid plan ended)</label>
      <label className="console-check"><input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} /> Hidden from sellers (not shown on the Billing page; give it from a store’s page or make it the default)</label>
      {plan && <label className="console-check"><input type="checkbox" checked={archived} disabled={isDefault} onChange={(e) => setArchived(e.target.checked)} /> Archived (can no longer be given; stores already on it keep it until moved)</label>}
      {plan && <div className="console-plan-manage">
        <p className="muted">{plan.isDefault ? 'Stores with no plan of their own use the default. To move them, make another plan the default.'
          : plan.stores ? `${count(plan.stores)} ${plan.stores === 1 ? 'store is' : 'stores are'} set to this plan.`
          : plan.payments ? 'No store is set to this plan. Payments were recorded on it, so it can be archived but not deleted.'
          : 'No store is set to this plan.'}</p>
      </div>}
      <div className="field"><label htmlFor="plan-reason">Note for the audit log (optional)</label><input id="plan-reason" className="input" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} /></div>
    </Modal>
  )
}

// Moves every store set to a plan onto another one (or the default plan), e.g. before archiving or deleting it.
function MoveDialog({ plan, plans, onClose, onDone }: { plan: Plan; plans: Plan[]; onClose: () => void; onDone: () => void }) {
  const [target, setTarget] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const others = plans.filter((p) => p.id !== plan.id && !p.archived && !p.isDefault)
  return (
    <Modal title={`Move stores off ${plan.name}`} sub={`${count(plan.stores)} ${plan.stores === 1 ? 'store moves' : 'stores move'} at once. On another plan they keep their end date; on the default plan they have none.`} onClose={onClose} foot={(close) => <>
      <Button onClick={() => close()}>Cancel</Button>
      <Button variant="primary" aria-busy={busy} disabled={!reason.trim()} onClick={async () => {
        setBusy(true); setError(null)
        try { await api(`/console/plans/${plan.id}/move`, { method: 'POST', body: { planId: target || null, reason } }); close(onDone) } catch (err) { setError(errorText(err)); setBusy(false) }
      }}>Move stores</Button>
    </>}>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="field"><label htmlFor="move-to">Move to</label>
        <select id="move-to" className="input" value={target} onChange={(e) => setTarget(e.target.value)}>
          <option value="">Default plan ({plans.find((p) => p.isDefault)?.name})</option>
          {others.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.priceBdt ? `${taka(p.priceBdt)}/month` : 'Free'}{p.hidden ? ' · hidden' : ''}</option>)}
        </select>
      </div>
      <div className="field"><label htmlFor="move-reason">Reason</label><textarea id="move-reason" className="input console-textarea" rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Kept in the audit log" /></div>
    </Modal>
  )
}

export function Plans() {
  const { data, error, reload } = useLoad(() => api<Plan[]>('/console/plans'), [])
  const [editing, setEditing] = useState<Plan | 'new' | null>(null)
  const [managing, setManaging] = useState<{ plan: Plan; action: 'move' | 'delete' } | null>(null)
  const done = () => { setManaging(null); reload() }
  return (
    <div className="page">
      <PageHeader title="Plans" description="Limits and tools apply to each store on the plan as soon as you save. Sellers see every plan on their Billing page except hidden and archived ones. Custom plans for one store are made on that store’s page." action={<Button variant="primary" onClick={() => setEditing('new')}>New plan</Button>} />
      <div className="data-list">
        {error ? <LoadError error={error} retry={reload} /> : !data ? <Loading /> : (
          <table className="data-table">
            <thead><tr><th style={{ width: '17rem' }}>Plan</th><th className="end" style={{ width: '6rem' }}>Price</th><th className="end">Products</th><th className="end">Landing pages</th><th className="end">Team</th><th className="end">Storage</th><th style={{ width: '7rem' }} className="end">Tools</th><th className="end" style={{ width: '6rem' }}>Stores</th></tr></thead>
            <tbody>
              {data.map((p) => (
                <tr key={p.id} className="data-table__row" onClick={() => setEditing(p)}>
                  <th scope="row"><span className="console-plan-name"><button type="button" className="console-link" onClick={(e) => { e.stopPropagation(); setEditing(p) }}>{p.name}</button>{p.isDefault && <Badge tone="success">Default</Badge>}{p.hidden && <Badge>Hidden</Badge>}{p.archived && <Badge>Archived</Badge>}</span></th>
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
      {editing && <PlanDialog plan={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); reload() }}
        onMove={() => editing !== 'new' && setManaging({ plan: editing, action: 'move' })} onDelete={() => editing !== 'new' && setManaging({ plan: editing, action: 'delete' })} />}
      {managing?.action === 'move' && data && <MoveDialog plan={managing.plan} plans={data} onClose={() => setManaging(null)} onDone={done} />}
      {managing?.action === 'delete' && <ReasonDialog title={`Delete ${managing.plan.name}`} sub="No store is set to it and no payment was recorded on it. It disappears from the console for good." action="Delete plan" danger
        onConfirm={(reason) => api(`/console/plans/${managing.plan.id}`, { method: 'DELETE', body: { reason } })} onClose={() => setManaging(null)} onDone={done} />}
    </div>
  )
}
