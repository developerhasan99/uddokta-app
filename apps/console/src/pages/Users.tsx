import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Badge, Button, PageHeader, SearchInput } from '../../../dashboard/src/components/ui'
import { api, count, date } from '../api'
import { LoadError, Loading, ReasonDialog, useLoad } from '../ui'

type Row = { id: string; name: string; email: string; verified: boolean; phone: string | null; phone_verified: boolean; suspended_at: string | null; created_at: string; stores: number; is_admin: boolean }
type User = { id: string; name: string; email: string; language: string; verified: boolean; phone: string | null; phoneVerified: boolean; suspendedAt: string | null; createdAt: string; isAdmin: boolean; sessions: number; stores: { id: string; name: string; handle: string; role: string }[] }

export function UserList() {
  const [q, setQ] = useState('')
  const [search, setSearch] = useState('')
  const [offset, setOffset] = useState(0)
  const navigate = useNavigate()
  const { data, error, reload } = useLoad(() => api<{ total: number; items: Row[] }>(`/console/users?q=${encodeURIComponent(search)}&offset=${offset}`), [search, offset])
  return (
    <div className="page">
      <PageHeader title="Users" description="Everyone with an account. Open one to see their stores, suspend them or send a reset link." />
      <div className="data-list">
        <form className="filter-bar" onSubmit={(e) => { e.preventDefault(); setOffset(0); setSearch(q.trim()) }}>
          <SearchInput label="Search users" placeholder="Name, email or phone" value={q} onChange={(e) => setQ(e.target.value)} />
          {data && <span className="muted console-total">{count(data.total)} {data.total === 1 ? 'user' : 'users'}</span>}
        </form>
        {error ? <LoadError error={error} retry={reload} /> : !data ? <Loading /> : data.items.length === 0 ? <div className="notice"><h2>No users match “{search}”.</h2><p className="muted">Try part of the email, name or phone number.</p></div> : (
          <table className="data-table">
            <thead><tr><th>Name</th><th>Email</th><th style={{ width: '9rem' }}>Phone</th><th style={{ width: '7rem' }}>Stores</th><th style={{ width: '9rem' }}>Status</th><th style={{ width: '9rem' }}>Joined</th></tr></thead>
            <tbody>
              {data.items.map((u) => (
                <tr key={u.id} className="data-table__row" onClick={() => navigate(`/users/${u.id}`)}>
                  <th scope="row"><Link to={`/users/${u.id}`} onClick={(e) => e.stopPropagation()}>{u.name}</Link>{u.is_admin && <> <Badge tone="info">Admin</Badge></>}</th>
                  <td className="console-ellipsis">{u.email}</td>
                  <td>{u.phone ? <span title={u.phone_verified ? 'Verified' : 'Not verified'}>{u.phone}{!u.phone_verified && <span className="muted"> (unverified)</span>}</span> : <span className="muted">None</span>}</td>
                  <td className="num">{u.stores}</td>
                  <td>{u.suspended_at ? <Badge tone="danger">Suspended</Badge> : u.verified ? <Badge tone="success">Confirmed</Badge> : <Badge>Unconfirmed</Badge>}</td>
                  <td>{date(u.created_at)}</td>
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

type Action = 'suspend' | 'restore' | 'signOut' | 'reset'

export function UserDetail({ adminId }: { adminId: string }) {
  const { id } = useParams()
  const { data: user, error, reload } = useLoad(() => api<User>(`/console/users/${id}`), [id])
  const [action, setAction] = useState<Action | null>(null)
  const [done, setDone] = useState<string | null>(null)
  if (error) return <div className="page"><LoadError error={error} retry={reload} /></div>
  if (!user) return <div className="page"><Loading /></div>
  const dialogs: Record<Action, { title: string; sub: string; label: string; danger?: boolean; run: (reason: string) => Promise<unknown>; message: string }> = {
    suspend: { title: `Suspend ${user.name}?`, sub: 'They are signed out everywhere and cannot sign in until restored. Their stores keep working for other members.', label: 'Suspend', danger: true,
      run: (reason) => api(`/console/users/${user.id}/suspend`, { method: 'POST', body: { suspend: true, reason } }), message: 'Suspended and signed out.' },
    restore: { title: `Restore ${user.name}?`, sub: 'They can sign in again.', label: 'Restore',
      run: (reason) => api(`/console/users/${user.id}/suspend`, { method: 'POST', body: { suspend: false, reason } }), message: 'Restored.' },
    signOut: { title: 'Sign out everywhere?', sub: `Ends all ${user.sessions} sessions. They can sign in again with their password.`, label: 'Sign out',
      run: (reason) => api(`/console/users/${user.id}/sign-out`, { method: 'POST', body: { reason } }), message: 'Signed out everywhere.' },
    reset: { title: 'Send a password reset link?', sub: `The same link as “Forgot password”, sent to ${user.email}. The console never sees or sets passwords.`, label: 'Send link',
      run: (reason) => api(`/console/users/${user.id}/password-reset`, { method: 'POST', body: { reason } }), message: `Reset link sent to ${user.email}.` },
  }
  const self = user.id === adminId
  const open = action ? dialogs[action] : null
  return (
    <div className="page page--detail">
      <PageHeader title={user.name} description={user.email} action={<div className="console-actions">
        <Button onClick={() => setAction('reset')}>Send reset link</Button>
        <Button disabled={user.sessions === 0} onClick={() => setAction('signOut')}>Sign out everywhere</Button>
        {user.suspendedAt ? <Button variant="primary" onClick={() => setAction('restore')}>Restore</Button> : <Button variant="danger" disabled={self} onClick={() => setAction('suspend')}>Suspend</Button>}
      </div>} />
      {done && <p className="console-done" role="status">{done}</p>}
      <section className="card">
        <dl className="console-facts">
          <div><dt>Status</dt><dd>{user.suspendedAt ? <Badge tone="danger">Suspended {date(user.suspendedAt)}</Badge> : <Badge tone="success">Active</Badge>}{user.isAdmin && <> <Badge tone="info">Platform admin</Badge></>}</dd></div>
          <div><dt>Email</dt><dd>{user.verified ? 'Confirmed' : 'Not confirmed'}</dd></div>
          <div><dt>Phone</dt><dd>{user.phone ? <><a href={`tel:${user.phone}`}>{user.phone}</a> {user.phoneVerified ? 'Verified' : 'Not verified'}</> : 'None'}</dd></div>
          <div><dt>Joined</dt><dd>{date(user.createdAt)}</dd></div>
          <div><dt>Signed in on</dt><dd>{user.sessions} {user.sessions === 1 ? 'device' : 'devices'}</dd></div>
          <div><dt>Language</dt><dd>{user.language === 'en' ? 'English' : 'Bangla'}</dd></div>
        </dl>
      </section>
      <section className="data-list">
        <div className="filter-bar"><h2 className="console-h2">Stores</h2></div>
        {user.stores.length === 0 ? <div className="notice"><h2>No stores yet.</h2><p className="muted">They have an account but have not created or joined a store.</p></div> : (
          <table className="data-table"><thead><tr><th>Store</th><th>Address</th><th style={{ width: '8rem' }}>Role</th></tr></thead>
            <tbody>{user.stores.map((s) => <tr key={s.id}><th scope="row"><Link to={`/stores/${s.id}`}>{s.name}</Link></th><td>{s.handle}</td><td className="console-cap">{s.role}</td></tr>)}</tbody>
          </table>
        )}
      </section>
      {open && <ReasonDialog title={open.title} sub={open.sub} action={open.label} danger={open.danger} onConfirm={open.run} onClose={() => setAction(null)} onDone={() => { setDone(open.message); setAction(null); reload() }} />}
    </div>
  )
}
