import { useState } from 'react'
import { Link } from 'react-router'
import { Button, PageHeader } from '../../../dashboard/src/components/ui'
import { api, count, dateTime } from '../api'
import { LoadError, Loading, useLoad } from '../ui'

type Entry = { id: string; admin_email: string; action: string; target_type: string; target_id: string | null; target_label: string; detail: Record<string, unknown>; reason: string; created_at: string }

const actions: Record<string, string> = {
  'user.suspend': 'Suspended user', 'user.restore': 'Restored user', 'user.signOut': 'Signed out user', 'user.passwordReset': 'Sent reset link',
  'store.suspend': 'Suspended store', 'store.restore': 'Restored store', 'store.plan': 'Changed plan', 'store.payment': 'Recorded payment',
  'plan.create': 'Created plan', 'plan.update': 'Changed plan settings',
}
function details(e: Entry) {
  const d = e.detail
  if (e.action === 'store.payment') return `${d.plan}, ৳${d.amount} for ${d.months} mo by ${d.method}${d.reference ? ` (${d.reference})` : ''}, until ${d.until}`
  if (e.action === 'store.plan') return `${d.plan ?? 'Default plan'}${d.until ? ` until ${d.until}` : ''}`
  return ''
}

export function Audit() {
  const [offset, setOffset] = useState(0)
  const { data, error, reload } = useLoad(() => api<{ total: number; items: Entry[] }>(`/console/audit?offset=${offset}`), [offset])
  return (
    <div className="page">
      <PageHeader title="Audit log" description="Everything done in the console: who, what, when and why. Entries cannot be edited or deleted." />
      <div className="data-list">
        {error ? <LoadError error={error} retry={reload} /> : !data ? <Loading /> : data.items.length === 0 ? <div className="notice"><h2>Nothing yet.</h2><p className="muted">Changes made in the console appear here.</p></div> : (
          <table className="data-table">
            <thead><tr><th style={{ width: '9rem' }}>When</th><th style={{ width: '13rem' }}>Who</th><th style={{ width: '11rem' }}>What</th><th>On</th><th>Reason and details</th></tr></thead>
            <tbody>
              {data.items.map((e) => (
                <tr key={e.id}>
                  <td>{dateTime(e.created_at)}</td>
                  <td className="console-ellipsis">{e.admin_email}</td>
                  <td>{actions[e.action] ?? e.action}</td>
                  <td>{e.target_id && e.target_type !== 'plan' ? <Link to={`/${e.target_type}s/${e.target_id}`}>{e.target_label}</Link> : e.target_label}</td>
                  <td>{e.reason}{details(e) && <span className="console-sub">{details(e)}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {data && data.total > 50 && <div className="console-pager">
        <Button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 50))}>Newer</Button>
        <span className="muted">{offset + 1}–{Math.min(offset + 50, data.total)} of {count(data.total)}</span>
        <Button disabled={offset + 50 >= data.total} onClick={() => setOffset(offset + 50)}>Older</Button>
      </div>}
    </div>
  )
}
