import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { useAccount, useCurrentStore, type Role, type User } from '../account-context'
import { api, errorCode } from '../api'
import { roleLabels } from '../components/AppMenu'
import { Badge, Button, Notice, PageHeader, Skeleton } from '../components/ui'
import { errorLabel, useLang } from '../i18n'

type Member = User & { role: Role }
type PendingInvite = { id: string; role: Role; expiresAt: string }
type Team = { members: Member[]; invites: PendingInvite[] }

const roles: Role[] = ['owner', 'admin', 'staff']

export function Members() {
  const { t, date } = useLang()
  const { me, refresh } = useAccount()
  const current = useCurrentStore()!
  const navigate = useNavigate()
  const [team, setTeam] = useState<Team | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [confirming, setConfirming] = useState<string | null>(null)
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
                <th scope="col">{t('role')}</th>
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
                      <span>
                        {member.name}{isMe && ` (${t('you')})`}
                        <span className="table__sub">{member.email}</span>
                      </span>
                    </th>
                    <td data-label={t('role')}>
                      {editable
                        ? (
                          <select
                            className="input input--compact"
                            aria-label={`${t('role')}: ${member.name}`}
                            value={member.role}
                            onChange={(e) => void run(() => api(`${base}/members/${member.id}`, { method: 'PATCH', body: { role: e.target.value } }))}
                          >
                            {assignable.map((r) => <option key={r} value={r}>{t(roleLabels[r])}</option>)}
                          </select>
                        )
                        : <Badge>{t(roleLabels[member.role])}</Badge>}
                    </td>
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
              <select id="invite-role" name="role" className="input" value={role} onChange={(e) => setNewRole(e.target.value as Role)}>
                {assignable.map((r) => <option key={r} value={r}>{t(roleLabels[r])}</option>)}
              </select>
            </div>
            <Button type="submit" variant="primary">{t('createInvite')}</Button>
          </div>
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
                    <span className="muted invite-list__date">{t('inviteExpires', { date: date(new Date(invite.expiresAt)) })}</span>
                    <Button onClick={() => void run(() => api(`${base}/invites/${invite.id}`, { method: 'DELETE' }))}>{t('revokeInvite')}</Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </form>
      )}
    </div>
  )
}
