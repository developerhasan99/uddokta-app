import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Badge, Button, PageHeader, SearchInput } from '../../../dashboard/src/components/ui'
import { api, bytes, count, date, dateTime, errorText, limitText, taka } from '../api'
import { LoadError, Loading, Modal, ReasonDialog, useLoad } from '../ui'
import type { Plan } from './Plans'

type Row = { id: string; name: string; handle: string; owner_email: string | null; plan_name: string; plan_until: string | null; suspended_at: string | null; created_at: string; products: number; orders: number; storage_bytes: number }
type Limits = { plan_name: string; plan_until: string | null; max_landing_pages: number | null; storage_mb: number; max_members: number | null; max_products: number | null; custom_domain: boolean }
type Store = {
  id: string; name: string; handle: string; domain: string | null; createdAt: string; suspendedAt: string | null; suspendReason: string
  planId: string | null; planUntil: string | null; limits: Limits
  counts: { products: number; orders: number; orders30: number; landingPages: number; storageBytes: number }
  members: { id: string; name: string; email: string; role: string }[]
  payments: { id: string; amount: number; months: number; method: string; reference: string; plan: string | null; by: string | null; at: string }[]
}

const planLine = (name: string, until: string | null) => (until ? `${name} until ${date(until)}` : name)

export function StoreList() {
  const [q, setQ] = useState('')
  const [search, setSearch] = useState('')
  const [offset, setOffset] = useState(0)
  const navigate = useNavigate()
  const { data, error, reload } = useLoad(() => api<{ total: number; items: Row[] }>(`/console/stores?q=${encodeURIComponent(search)}&offset=${offset}`), [search, offset])
  return (
    <div className="page">
      <PageHeader title="Stores" description="Every store with its owner, plan and size. Open one to change its plan, record a payment or suspend it." />
      <div className="data-list">
        <form className="filter-bar" onSubmit={(e) => { e.preventDefault(); setOffset(0); setSearch(q.trim()) }}>
          <SearchInput label="Search stores" placeholder="Name, address or domain" value={q} onChange={(e) => setQ(e.target.value)} />
          {data && <span className="muted console-total">{count(data.total)} {data.total === 1 ? 'store' : 'stores'}</span>}
        </form>
        {error ? <LoadError error={error} retry={reload} /> : !data ? <Loading /> : data.items.length === 0 ? <div className="notice"><h2>No stores match “{search}”.</h2><p className="muted">Try part of the name or address.</p></div> : (
          <table className="data-table">
            <thead><tr><th>Store</th><th>Owner</th><th style={{ width: '12rem' }}>Plan</th><th style={{ width: '6rem' }} className="end">Products</th><th style={{ width: '6rem' }} className="end">Orders</th><th style={{ width: '7rem' }} className="end">Media</th><th style={{ width: '8rem' }}>Created</th></tr></thead>
            <tbody>
              {data.items.map((s) => (
                <tr key={s.id} className="data-table__row" onClick={() => navigate(`/stores/${s.id}`)}>
                  <th scope="row"><Link to={`/stores/${s.id}`} onClick={(e) => e.stopPropagation()}>{s.name}</Link> {s.suspended_at && <Badge tone="danger">Suspended</Badge>}<span className="console-sub">{s.handle}</span></th>
                  <td className="console-ellipsis">{s.owner_email ?? '—'}</td>
                  <td>{planLine(s.plan_name, s.plan_until)}</td>
                  <td className="num end">{count(s.products)}</td>
                  <td className="num end">{count(s.orders)}</td>
                  <td className="num end">{bytes(s.storage_bytes)}</td>
                  <td>{date(s.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {data && data.total > 50 && <div className="console-pager">
        <Button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 50))}>Previous</Button>
        <span className="muted">{offset + 1}–{Math.min(offset + 50, data.total)} of {count(data.total)}</span>
        <Button disabled={offset + 50 >= data.total} onClick={() => setOffset(offset + 50)}>Next</Button>
      </div>}
    </div>
  )
}

function PlanDialog({ store, plans, onClose, onDone }: { store: Store; plans: Plan[]; onClose: () => void; onDone: () => void }) {
  const [planId, setPlanId] = useState(store.planId ?? '')
  const [until, setUntil] = useState(store.planUntil ?? '')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const live = plans.filter((p) => !p.archived)
  return (
    <Modal title="Change plan" sub="For a trial, a gift or a correction. To take money, record a payment instead: it extends the plan for you." onClose={onClose} foot={(close) => <>
      <Button onClick={() => close()}>Cancel</Button>
      <Button variant="primary" aria-busy={busy} disabled={!reason.trim()} onClick={async () => {
        setBusy(true); setError(null)
        try { await api(`/console/stores/${store.id}/plan`, { method: 'PUT', body: { planId: planId || null, until: planId ? until || null : null, reason } }); close(onDone) } catch (err) { setError(errorText(err)); setBusy(false) }
      }}>Save plan</Button>
    </>}>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="field"><label htmlFor="plan-pick">Plan</label>
        <select id="plan-pick" className="input" value={planId} onChange={(e) => setPlanId(e.target.value)}>
          <option value="">Default plan ({plans.find((p) => p.isDefault)?.name})</option>
          {live.filter((p) => !p.isDefault).map((p) => <option key={p.id} value={p.id}>{p.name} · {taka(p.priceBdt)}/month</option>)}
        </select>
      </div>
      {planId && <div className="field"><label htmlFor="plan-until">Ends on</label>
        <input id="plan-until" type="date" className="input" value={until} onChange={(e) => setUntil(e.target.value)} />
        <p className="field__help">Blank: no end date. After the end date the store goes back to the default plan.</p>
      </div>}
      <div className="field"><label htmlFor="plan-reason">Reason</label><textarea id="plan-reason" className="input console-textarea" rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Kept in the audit log" /></div>
    </Modal>
  )
}

const methods = ['bKash', 'Nagad', 'Rocket', 'Bank transfer', 'Cash']

function PaymentDialog({ store, plans, onClose, onDone }: { store: Store; plans: Plan[]; onClose: () => void; onDone: (until: string) => void }) {
  const paid = plans.filter((p) => !p.archived && p.priceBdt > 0)
  const [planId, setPlanId] = useState(store.planId && paid.some((p) => p.id === store.planId) ? store.planId : paid[0]?.id ?? '')
  const [months, setMonths] = useState(1)
  const plan = paid.find((p) => p.id === planId)
  const [amount, setAmount] = useState(String(plan?.priceBdt ?? ''))
  const [method, setMethod] = useState(methods[0])
  const [reference, setReference] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pick = (id: string, m: number) => { setPlanId(id); setMonths(m); setAmount(String((paid.find((p) => p.id === id)?.priceBdt ?? 0) * m)) }
  return (
    <Modal title="Record a payment" sub="Money received outside the app. The plan is extended by the months paid, from today or from its current end date." onClose={onClose} foot={(close) => <>
      <Button onClick={() => close()}>Cancel</Button>
      <Button variant="primary" aria-busy={busy} disabled={!planId || amount === ''} onClick={async () => {
        setBusy(true); setError(null)
        try {
          const r = await api<{ until: string }>(`/console/stores/${store.id}/payments`, { method: 'POST', body: { planId, months, amount: Number(amount), method, reference, reason: note } })
          close(() => onDone(r.until))
        } catch (err) { setError(errorText(err)); setBusy(false) }
      }}>Record payment</Button>
    </>}>
      {paid.length === 0 ? <p className="muted">There is no paid plan yet. Create one on the Plans page first.</p> : <>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="console-row">
          <div className="field"><label htmlFor="pay-plan">Plan</label>
            <select id="pay-plan" className="input" value={planId} onChange={(e) => pick(e.target.value, months)}>{paid.map((p) => <option key={p.id} value={p.id}>{p.name} · {taka(p.priceBdt)}/month</option>)}</select>
          </div>
          <div className="field"><label htmlFor="pay-months">Months</label>
            <select id="pay-months" className="input" value={months} onChange={(e) => pick(planId, Number(e.target.value))}>{[1, 2, 3, 6, 12].map((m) => <option key={m} value={m}>{m}</option>)}</select>
          </div>
        </div>
        <div className="console-row">
          <div className="field"><label htmlFor="pay-amount">Amount received (৳)</label><input id="pay-amount" className="input" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))} /></div>
          <div className="field"><label htmlFor="pay-method">Paid by</label>
            <select id="pay-method" className="input" value={method} onChange={(e) => setMethod(e.target.value)}>{methods.map((m) => <option key={m}>{m}</option>)}</select>
          </div>
        </div>
        <div className="field"><label htmlFor="pay-ref">Transaction ID or reference</label><input id="pay-ref" className="input" maxLength={100} value={reference} onChange={(e) => setReference(e.target.value)} /></div>
        <div className="field"><label htmlFor="pay-note">Note (optional)</label><input id="pay-note" className="input" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} /></div>
      </>}
    </Modal>
  )
}

type Action = 'plan' | 'payment' | 'suspend' | 'restore'

export function StoreDetail() {
  const { id } = useParams()
  const { data: store, error, reload } = useLoad(() => api<Store>(`/console/stores/${id}`), [id])
  const { data: plans } = useLoad(() => api<Plan[]>('/console/plans'), [])
  const [action, setAction] = useState<Action | null>(null)
  const [done, setDone] = useState<string | null>(null)
  if (error) return <div className="page"><LoadError error={error} retry={reload} /></div>
  if (!store || !plans) return <div className="page"><Loading /></div>
  const l = store.limits
  const finish = (message: string) => { setDone(message); setAction(null); reload() }
  return (
    <div className="page page--detail">
      <PageHeader title={store.name} description={`${store.handle}${store.domain ? ` · ${store.domain}` : ''} · created ${date(store.createdAt)}`} action={<div className="console-actions">
        <Button onClick={() => setAction('payment')}>Record payment</Button>
        <Button onClick={() => setAction('plan')}>Change plan</Button>
        {store.suspendedAt ? <Button variant="primary" onClick={() => setAction('restore')}>Restore</Button> : <Button variant="danger" onClick={() => setAction('suspend')}>Suspend</Button>}
      </div>} />
      {done && <p className="console-done" role="status">{done}</p>}
      {store.suspendedAt && <p className="notice-line notice-line--danger">Suspended since {date(store.suspendedAt)}{store.suspendReason && `: ${store.suspendReason}`}. Buyers see “unavailable”; the team can look but not change anything.</p>}
      <div className="stats">
        <div className="stat"><span className="stat__label">Plan</span><span className="stat__value console-stat__text">{l.plan_name}</span><span className="console-stat__sub">{l.plan_until ? `Paid until ${date(l.plan_until)}` : 'No end date'}</span></div>
        <div className="stat"><span className="stat__label">Orders</span><span className="stat__value">{count(store.counts.orders)}</span><span className="console-stat__sub">{count(store.counts.orders30)} in 30 days</span></div>
        <div className="stat"><span className="stat__label">Products</span><span className="stat__value">{count(store.counts.products)}</span><span className="console-stat__sub">Limit {limitText(l.max_products)}</span></div>
        <div className="stat"><span className="stat__label">Media</span><span className="stat__value">{bytes(store.counts.storageBytes)}</span><span className="console-stat__sub">of {limitText(l.storage_mb, ' MB')}</span></div>
      </div>
      <section className="card">
        <h2 className="console-h2">What the plan allows</h2>
        <dl className="console-facts">
          <div><dt>Landing pages</dt><dd>{count(store.counts.landingPages)} of {limitText(l.max_landing_pages)}</dd></div>
          <div><dt>Team members</dt><dd>{store.members.length} of {limitText(l.max_members)}</dd></div>
          <div><dt>Own domain</dt><dd>{l.custom_domain ? 'Allowed' : 'Not on this plan'}</dd></div>
        </dl>
      </section>
      <section className="data-list">
        <div className="filter-bar"><h2 className="console-h2">Team</h2></div>
        <table className="data-table"><thead><tr><th>Name</th><th>Email</th><th style={{ width: '8rem' }}>Role</th></tr></thead>
          <tbody>{store.members.map((m) => <tr key={m.id}><th scope="row"><Link to={`/users/${m.id}`}>{m.name}</Link></th><td className="console-ellipsis">{m.email}</td><td className="console-cap">{m.role}</td></tr>)}</tbody>
        </table>
      </section>
      <section className="data-list">
        <div className="filter-bar"><h2 className="console-h2">Payments</h2></div>
        {store.payments.length === 0 ? <div className="notice"><h2>No payments recorded.</h2><p className="muted">When the seller pays by bKash, Nagad or bank, use Record payment.</p></div> : (
          <table className="data-table"><thead><tr><th style={{ width: '10rem' }}>When</th><th>Plan</th><th className="end" style={{ width: '7rem' }}>Amount</th><th style={{ width: '6rem' }}>Months</th><th>Paid by</th><th>Recorded by</th></tr></thead>
            <tbody>{store.payments.map((p) => <tr key={p.id}><td>{dateTime(p.at)}</td><td>{p.plan ?? '—'}</td><td className="num end">{taka(p.amount)}</td><td className="num">{p.months}</td><td>{p.method}{p.reference && <span className="console-sub">{p.reference}</span>}</td><td className="console-ellipsis">{p.by ?? '—'}</td></tr>)}</tbody>
          </table>
        )}
      </section>
      {action === 'plan' && <PlanDialog store={store} plans={plans} onClose={() => setAction(null)} onDone={() => finish('Plan saved.')} />}
      {action === 'payment' && <PaymentDialog store={store} plans={plans} onClose={() => setAction(null)} onDone={(until) => finish(`Payment recorded. The plan now runs until ${date(until)}.`)} />}
      {action === 'suspend' && <ReasonDialog title={`Suspend ${store.name}?`} sub="Buyers see “unavailable” on every page and cannot order. The team can still sign in and look, but cannot change anything." action="Suspend store" danger
        onConfirm={(reason) => api(`/console/stores/${store.id}/suspend`, { method: 'POST', body: { suspend: true, reason } })} onClose={() => setAction(null)} onDone={() => finish('Store suspended.')} />}
      {action === 'restore' && <ReasonDialog title={`Restore ${store.name}?`} sub="The store opens to buyers again and the team can make changes." action="Restore store"
        onConfirm={(reason) => api(`/console/stores/${store.id}/suspend`, { method: 'POST', body: { suspend: false, reason } })} onClose={() => setAction(null)} onDone={() => finish('Store restored.')} />}
    </div>
  )
}
