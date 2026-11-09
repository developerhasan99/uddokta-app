import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { Check, Minus } from 'lucide-react'
import { useAccount, useCurrentStore, type Role, type User } from '../account-context'
import { api, errorCode } from '../api'
import { roleLabels } from '../components/AppMenu'
import { Badge, Button, Notice, PageHeader, Skeleton } from '../components/ui'
import { errorLabel, useLang } from '../i18n'
import { permissionGroups, roleDescriptions } from '../permissions'

type Member = User & { role: Role; joinedAt: string }
type PendingInvite = { id: string; role: Role; expiresAt: string; createdAt: string }
type Team = { members: Member[]; invites: PendingInvite[] }

const roles: Role[] = ['owner', 'admin', 'staff']

export function Members() {
  const { t, date, day } = useLang()
  const { me, refresh } = useAccount()
  const current = useCurrentStore()!
  const navigate = useNavigate()
  const [team, setTeam] = useState<Team | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [confirming, setConfirming] = useState<string | null>(null)
  // Changing your own role only ever takes permissions away, so it waits for a confirmation.
  const [ownRole, setOwnRole] = useState<Role | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [role, setNewRole] = useState<Role>('staff')
  const [link, setLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const base = `/stores/${current.store.handle}`
  const canManage = current.role !== 'staff'
  // Only owners can create or change owners.
  const assignable = current.role === 'owner' ? roles : roles.filter((r) => r !== 'owner')

  const load = useCallback(async () => {
    setLoadFailed(false)
    try {
      setTeam(await api<Team>(`${base}/members`))
    } catch {
      setLoadFailed(true)
    }
  }, [base])

  useEffect(() => {
    void load()
  }, [load])

  const run = async (work: () => Promise<unknown>) => {
    setError(null)
    try {
      await work()
      await load()
    } catch (err) {
      setError(errorCode(err))
    }
  }

  const changeRole = (member: Member, next: Role) => {
    if (member.id === me.id) {
      setOwnRole(next)
      return
    }
    void run(() => api(`${base}/members/${member.id}`, { method: 'PATCH', body: { role: next } }))
  }

  const confirmOwnRole = () => {
    const next = ownRole!
    setOwnRole(null)
    void run(async () => {
      await api(`${base}/members/${me.id}`, { method: 'PATCH', body: { role: next } })
      await refresh()
    })
  }

  const remove = async (userId: string) => {
    setConfirming(null)
    setError(null)
    try {
      await api(`${base}/members/${userId}`, { method: 'DELETE' })
      if (userId === me.id) {
        await refresh()
        navigate('/stores')
        return
      }
      await load()
    } catch (err) {
      setError(errorCode(err))
    }
  }

  const createInvite = (e: FormEvent) => {
    e.preventDefault()
    setCopied(false)
    void run(async () => {
      const invite = await api<{ token: string }>(`${base}/invites`, { method: 'POST', body: { role } })
      setLink(`${location.origin}/invite/${invite.token}`)
    })
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link!)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  const owners = team?.members.filter((m) => m.role === 'owner').length ?? 0

  return (
    <div className="page page--narrow">
      <PageHeader title={t('members')} description={t('members.d')} />

      {error && <p className="form-error" role="alert">{t(errorLabel(error))}</p>}
      {ownRole && <div className="notice-line notice-line--warning order-confirm" role="alert">
        <span>{t('roleSelfConfirm', { role: t(roleLabels[ownRole]) })}</span>
        <span className="row"><Button onClick={() => setOwnRole(null)}>{t('cancel')}</Button><Button variant="danger" onClick={confirmOwnRole}>{t('roleSelfConfirmButton')}</Button></span>
      </div>}

      <section className="data-list">
        {loadFailed && <Notice role="alert" title={t('teamLoadFailed')} action={<Button onClick={() => void load()}>{t('retry')}</Button>} />}
        {!loadFailed && !team && (
          <div className="skeleton-rows" role="status" aria-label={t('loading')}>
            {[0, 1].map((i) => <div key={i} className="skeleton-row"><Skeleton width="12rem" /><Skeleton width="5rem" /></div>)}
          </div>
        )}
        {team && (
          <table className="data-table data-table--stack">
            <thead>
              <tr>
                <th scope="col">{t('colMember')}</th>
                <th scope="col">{t('emailLabel')}</th>
                <th scope="col">{t('role')}</th>
                <th scope="col">{t('colJoined')}</th>
                <th scope="col" className="end"><span className="visually-hidden">{t('colActions')}</span></th>
              </tr>
            </thead>
            <tbody>
              {team.members.map((member) => {
                const isMe = member.id === me.id
                const lastOwner = member.role === 'owner' && owners === 1
                const editable = canManage && !lastOwner && (current.role === 'owner' || member.role !== 'owner')
                const removable = !lastOwner && (isMe || editable)
                return (
                  <tr key={member.id}>
                    <th scope="row" data-label={t('colMember')}>
                      {member.name}{isMe && ` (${t('you')})`}
                    </th>
                    <td className="data-table__truncate muted" data-label={t('emailLabel')} title={member.email}>{member.email}</td>
                    <td data-label={t('role')}>
                      {editable
                        ? (
                          <select
                            className="input input--compact"
                            aria-label={`${t('role')}: ${member.name}`}
                            value={isMe && ownRole ? ownRole : member.role}
                            onChange={(e) => changeRole(member, e.target.value as Role)}
                          >
                            {assignable.map((r) => <option key={r} value={r}>{t(roleLabels[r])}</option>)}
                          </select>
                        )
                        : <Badge>{t(roleLabels[member.role])}</Badge>}
                    </td>
                    <td className="muted" data-label={t('colJoined')}>{day(member.joinedAt)}</td>
                    <td className="end" data-label={t('colActions')}>
                      {lastOwner && <span className="muted">{t('lastOwnerNote')}</span>}
                      {removable && confirming !== member.id && (
                        <Button onClick={() => setConfirming(member.id)}>{isMe ? t('leaveStore') : t('removeMember')}</Button>
                      )}
                      {removable && confirming === member.id && (
                        <span className="row row--end">
                          <Button onClick={() => setConfirming(null)}>{t('cancel')}</Button>
                          <Button variant="danger" onClick={() => void remove(member.id)}>{isMe ? t('confirmLeave') : t('confirmRemove')}</Button>
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </section>

      {canManage && (
        <form className="card" onSubmit={createInvite}>
          <div>
            <h2>{t('inviteMember')}</h2>
            <p className="muted">{t('inviteMemberD')}</p>
          </div>
          <div className="invite-form">
            <div className="field">
              <label htmlFor="invite-role">{t('role')}</label>
              <select id="invite-role" name="role" className="input" aria-describedby="invite-role-help" value={role} onChange={(e) => setNewRole(e.target.value as Role)}>
                {assignable.map((r) => <option key={r} value={r}>{t(roleLabels[r])}</option>)}
              </select>
            </div>
            <Button type="submit" variant="primary">{t('createInvite')}</Button>
          </div>
          <p id="invite-role-help" className="field__help">{t(roleDescriptions[role])}</p>
          {link && (
            <div className="invite-link">
              <label htmlFor="invite-url">{t('inviteLinkLabel')}</label>
              <input id="invite-url" className="input" readOnly value={link} onFocus={(e) => e.target.select()} />
              <div className="row">
                <Button onClick={() => void copy()}>{copied ? t('copied') : t('copyLink')}</Button>
                <a className="btn btn--default" href={`https://wa.me/?text=${encodeURIComponent(link)}`} target="_blank" rel="noreferrer">{t('sendWhatsApp')}</a>
              </div>
            </div>
          )}
          {team && team.invites.length > 0 && (
            <div>
              <h3>{t('pendingInvites')}</h3>
              <ul className="invite-list">
                {team.invites.map((invite) => (
                  <li key={invite.id}>
                    <Badge>{t(roleLabels[invite.role])}</Badge>
                    <span className="muted invite-list__date">{t('inviteCreated', { date: day(invite.createdAt) })} · {t('inviteExpires', { date: date(new Date(invite.expiresAt)) })}</span>
                    <Button onClick={() => void run(() => api(`${base}/invites/${invite.id}`, { method: 'DELETE' }))}>{t('revokeInvite')}</Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </form>
      )}

      <section className="card" aria-labelledby="perm-title">
        <div>
          <h2 id="perm-title">{t('permTitle')}</h2>
          <p className="muted">{t('permD', { role: t(roleLabels[current.role]) })}</p>
        </div>
        <dl className="role-notes">
          {roles.map((r) => <div key={r}><dt>{t(roleLabels[r])}</dt><dd>{t(roleDescriptions[r])}</dd></div>)}
        </dl>
        <table className="perm-table">
          <thead>
            <tr>
              <th scope="col"><span className="visually-hidden">{t('permTitle')}</span></th>
              {roles.map((r) => <th key={r} scope="col" className={r === current.role ? 'perm-table__mine' : undefined}>{t(roleLabels[r])}</th>)}
            </tr>
          </thead>
          {permissionGroups.map((group) => (
            <tbody key={group.title}>
              <tr><th scope="colgroup" colSpan={roles.length + 1} className="perm-table__group">{t(group.title)}</th></tr>
              {group.rows.map((row) => (
                <tr key={row.label}>
                  <th scope="row">{t(row.label)}</th>
                  {roles.map((r) => (
                    <td key={r} className={r === current.role ? 'perm-table__mine' : undefined}>
                      {row.roles.includes(r)
                        ? <><Check size={16} className="perm-table__yes" aria-hidden="true" /><span className="visually-hidden">{t('permAllowed')}</span></>
                        : <><Minus size={16} className="perm-table__no" aria-hidden="true" /><span className="visually-hidden">{t('permNotAllowed')}</span></>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
        <p className="muted">{t('permLeaveNote')}</p>
      </section>
    </div>
  )
}
