import { PageHeader } from '../../../dashboard/src/components/ui'
import { api, bytes, count, taka } from '../api'
import { LoadError, Loading, useLoad } from '../ui'

type Data = {
  users: number; usersSuspended: number; usersNew30: number; stores: number; storesSuspended: number; storesNew30: number
  orders: number; orders30: number; storageBytes: number; payments30: number
  signups: { day: string; users: number; stores: number }[]; plans: { name: string; stores: number }[]
}

// New accounts per day for the last 30 days, as plain SVG bars.
function Signups({ days }: { days: Data['signups'] }) {
  const max = Math.max(1, ...days.map((d) => d.users))
  const w = 600, h = 140, gap = 4, bar = (w - gap * (days.length - 1)) / days.length
  return (
    <svg className="console-chart" viewBox={`0 0 ${w} ${h + 20}`} role="img" aria-label={`Sign-ups in the last 30 days: ${days.reduce((n, d) => n + d.users, 0)}`}>
      {days.map((d, i) => {
        const bh = (d.users / max) * h
        return <rect key={d.day} x={i * (bar + gap)} y={h - bh} width={bar} height={Math.max(bh, d.users ? 2 : 0)} rx="2"><title>{`${d.day}: ${d.users} users, ${d.stores} stores`}</title></rect>
      })}
      <line x1="0" x2={w} y1={h + 0.5} y2={h + 0.5} />
      <text x="0" y={h + 16}>{days[0]?.day.slice(5)}</text>
      <text x={w} y={h + 16} textAnchor="end">Today</text>
    </svg>
  )
}

export function Overview() {
  const { data, error, reload } = useLoad(() => api<Data>('/console/overview'), [])
  return (
    <div className="page">
      <PageHeader title="Overview" description="The whole platform at a glance. Every number is counted from the database." />
      {error ? <LoadError error={error} retry={reload} /> : !data ? <Loading /> : <>
        <div className="stats">
          <div className="stat"><span className="stat__label">Users</span><span className="stat__value">{count(data.users)}</span><span className="console-stat__sub">+{count(data.usersNew30)} in 30 days · {count(data.usersSuspended)} suspended</span></div>
          <div className="stat"><span className="stat__label">Stores</span><span className="stat__value">{count(data.stores)}</span><span className="console-stat__sub">+{count(data.storesNew30)} in 30 days · {count(data.storesSuspended)} suspended</span></div>
          <div className="stat"><span className="stat__label">Orders</span><span className="stat__value">{count(data.orders)}</span><span className="console-stat__sub">{count(data.orders30)} in 30 days</span></div>
          <div className="stat"><span className="stat__label">Payments, 30 days</span><span className="stat__value">{taka(data.payments30)}</span><span className="console-stat__sub">Recorded by hand · media {bytes(data.storageBytes)}</span></div>
        </div>
        <div className="console-grid">
          <section className="card"><h2 className="console-h2">New users, last 30 days</h2><Signups days={data.signups} /></section>
          <section className="card">
            <h2 className="console-h2">Stores by plan</h2>
            <div className="bars">
              {data.plans.map((p) => (
                <div key={p.name} className="bars__row">
                  <span>{p.name}</span><span className="bars__value">{count(p.stores)}</span>
                  <span className="bars__track"><span className="bars__fill" style={{ width: `${(p.stores / Math.max(1, data.stores)) * 100}%` }} /></span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </>}
    </div>
  )
}
