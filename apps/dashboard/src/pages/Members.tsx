import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { addMember, isLastOwner, membersOf, removeMember, setRole, type Failure, type Role } from '../account'
import { useAccount, useCurrentStore } from '../account-context'
import { Badge, Button, Field, PageHeader } from '../components/ui'
import { useLang } from '../i18n'
import { roleLabels } from '../components/AppMenu'
import { failureLabels } from './Stores'

const roles: Role[] = ['owner', 'admin', 'staff']

export function Members() {
  const { t } = useLang()
  const { account, apply, me } = useAccount()
  const current = useCurrentStore()!
  const navigate = useNavigate()
  const [confirming, setConfirming] = useState<string | null>(null)
  const [error, setError] = useState<Failure | null>(null)
  const [email, setEmail] = useState('')
  const [role, setNewRole] = useState<Role>('staff')
  const storeId = current.store.id
  const canManage = current.role !== 'staff'
  // Only owners can create or change owners.
  const assignable = current.role === 'owner' ? roles : roles.filter((r) => r !== 'owner')

  const add = (e: FormEvent) => {
    e.preventDefault()
    const failure = apply(addMember(account, storeId, email, role))
    setError(failure)
    if (!failure) setEmail('')
  }

  const remove = (userId: string) => {
    const failure = apply(removeMember(account, storeId, userId))
    setError(failure)
    setConfirming(null)
    if (!failure && userId === me.id) navigate('/stores')
  }

  return (
    <div className="page page--narrow">
      <PageHeader title={t('members')} description={t('members.d')} />

      {error && error !== 'emailInvalid' && error !== 'alreadyMember' && <p className="form-error" role="alert">{t(failureLabels[error])}</p>}

      <section className="card card--flush">
        <table className="table">
          <thead>
            <tr>
              <th scope="col">{t('colMember')}</th>
              <th scope="col">{t('role')}</th>
              <th scope="col" className="num"><span className="visually-hidden">{t('colActions')}</span></th>
            </tr>
          </thead>
          <tbody>
            {membersOf(account, storeId).map(({ user, role: memberRole }) => {
              const isMe = user.id === me.id
              const lastOwner = isLastOwner(account, storeId, user.id)
              const editable = canManage && !lastOwner && (current.role === 'owner' || memberRole !== 'owner')
              const removable = !lastOwner && (isMe || editable)
              return (
                <tr key={user.id}>
                  <th scope="row" data-label={t('colMember')}>
                    <span>
                      {user.name}{isMe && ` (${t('you')})`}
                      <span className="table__sub">{user.email}</span>
                    </span>
                  </th>
                  <td data-label={t('role')}>
                    {editable
                      ? (
                        <select
                          className="input input--compact"
                          aria-label={`${t('role')}: ${user.name}`}
                          value={memberRole}
                          onChange={(e) => setError(apply(setRole(account, storeId, user.id, e.target.value as Role)))}
                        >
                          {assignable.map((r) => <option key={r} value={r}>{t(roleLabels[r])}</option>)}
                        </select>
                      )
                      : <Badge>{t(roleLabels[memberRole])}</Badge>}
                  </td>
                  <td data-label={t('colActions')}>
                    {lastOwner && <span className="muted">{t('lastOwnerNote')}</span>}
                    {removable && confirming !== user.id && (
                      <Button onClick={() => setConfirming(user.id)}>{isMe ? t('leaveStore') : t('removeMember')}</Button>
                    )}
                    {removable && confirming === user.id && (
                      <span className="row row--end">
                        <Button onClick={() => setConfirming(null)}>{t('cancel')}</Button>
                        <Button variant="danger" onClick={() => remove(user.id)}>{isMe ? t('confirmLeave') : t('confirmRemove')}</Button>
                      </span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </section>

      {canManage && (
        <form className="card" onSubmit={add} noValidate>
          <h2>{t('addMember')}</h2>
          <Field
            id="member-email"
            name="email"
            type="email"
            label={t('memberEmail')}
            autoComplete="off"
            value={email}
            error={error === 'emailInvalid' || error === 'alreadyMember' ? t(failureLabels[error]) : undefined}
            onChange={(e) => setEmail(e.target.value)}
          />
          <div className="field">
            <label htmlFor="member-role">{t('role')}</label>
            <select id="member-role" name="role" className="input" value={role} onChange={(e) => setNewRole(e.target.value as Role)}>
              {assignable.map((r) => <option key={r} value={r}>{t(roleLabels[r])}</option>)}
            </select>
          </div>
          <div className="row">
            <Button type="submit" variant="primary">{t('addMember')}</Button>
          </div>
        </form>
      )}
    </div>
  )
}
