import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { useAccount, useSession } from '../account-context'
import { api, ApiError, errorCode } from '../api'
import { Badge, Button, Field, PageHeader } from '../components/ui'
import { errorLabel, useLang } from '../i18n'

// The signed-in person's own account, outside any store: details, email, password, devices, language, deletion.

function Card({ title, description, danger, children }: { title: string; description?: string; danger?: boolean; children: ReactNode }) {
  return (
    <section className={danger ? 'card card--form profile-card profile-card--danger' : 'card card--form profile-card'}>
      <div>
        <h2>{title}</h2>
        {description && <p className="muted">{description}</p>}
      </div>
      {children}
    </section>
  )
}

// A form's busy flag, its error code and a short "Saved" after success.
function useSubmit() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const run = async (work: () => Promise<unknown>) => {
    if (busy) return false
    setBusy(true)
    setError(null)
    setDone(false)
    try {
      await work()
      setDone(true)
      return true
    } catch (err) {
      setError(errorCode(err))
      return false
    } finally {
      setBusy(false)
    }
  }
  return { busy, error, done, run, setDone }
}

function Details() {
  const { t } = useLang()
  const { me, refresh } = useAccount()
  const [name, setName] = useState(me.name)
  const save = useSubmit()
  const submit = (e: FormEvent) => {
    e.preventDefault()
    void save.run(async () => { await api('/me', { method: 'PUT', body: { name } }); await refresh() })
  }
  return (
    <Card title={t('profileDetails')}>
      <form className="profile-form" onSubmit={submit} noValidate>
        <Field id="profile-name" name="name" label={t('yourName')} autoComplete="name" value={name} maxLength={80}
          error={save.error ? t(errorLabel(save.error)) : undefined} onChange={(e) => { setName(e.target.value); save.setDone(false) }} />
        <div className="profile-form__actions">
          <Button type="submit" variant="primary" aria-busy={save.busy} disabled={name.trim() === me.name}>{t('save')}</Button>
          {save.done && <span className="profile-saved" role="status">{t('profileSaved')}</span>}
        </div>
      </form>
    </Card>
  )
}

function Email() {
  const { t } = useLang()
  const { me, emailEnabled } = useAccount()
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [sentTo, setSentTo] = useState<string | null>(null)
  const send = useSubmit()
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (await send.run(() => api('/me/email', { method: 'POST', body: { email, password } }))) {
      setSentTo(email.trim())
      setOpen(false)
      setPassword('')
    }
  }
  const fieldError = (...codes: string[]) => (send.error && codes.includes(send.error) ? t(errorLabel(send.error)) : undefined)
  return (
    <Card title={t('emailLabel')} description={t('profileEmailD')}>
      <div className="profile-row">
        <span className="profile-row__value">{me.email}</span>
        {emailEnabled && <Badge tone={me.emailVerified ? 'success' : 'warning'}>{t(me.emailVerified ? 'emailVerified' : 'emailUnverified')}</Badge>}
        {!open && <Button onClick={() => { setOpen(true); setSentTo(null) }} disabled={!emailEnabled}>{t('changeEmail')}</Button>}
      </div>
      {!emailEnabled && <p className="field__help">{t('profileEmailOff')}</p>}
      {sentTo && <p className="profile-note" role="status">{t('changeEmailSent', { email: sentTo })}</p>}
      {open && (
        <form className="profile-form" onSubmit={submit} noValidate>
          {send.error && !fieldError('emailInvalid', 'emailTaken', 'sameEmail', 'wrongPassword') && <p className="form-error" role="alert">{t(errorLabel(send.error))}</p>}
          <Field id="profile-new-email" name="email" type="email" label={t('newEmail')} autoComplete="email" value={email} error={fieldError('emailInvalid', 'emailTaken', 'sameEmail')} onChange={(e) => setEmail(e.target.value)} />
          <Field id="profile-email-password" name="password" type="password" label={t('currentPassword')} autoComplete="current-password" value={password} error={fieldError('wrongPassword')} onChange={(e) => setPassword(e.target.value)} />
          <div className="profile-form__actions">
            <Button type="submit" variant="primary" aria-busy={send.busy}>{t('sendLink')}</Button>
            <Button onClick={() => setOpen(false)}>{t('cancel')}</Button>
          </div>
        </form>
      )}
    </Card>
  )
}

function Password({ onChanged }: { onChanged: () => void }) {
  const { t } = useLang()
  const [current, setCurrent] = useState('')
  const [password, setPassword] = useState('')
  const save = useSubmit()
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (await save.run(() => api('/me/password', { method: 'PUT', body: { current, password } }))) {
      setCurrent('')
      setPassword('')
      onChanged()
    }
  }
  const fieldError = (code: string) => (save.error === code ? t(errorLabel(code)) : undefined)
  return (
    <Card title={t('passwordLabel')} description={t('profilePasswordD')}>
      <form className="profile-form" onSubmit={submit} noValidate>
        {save.error && save.error !== 'wrongPassword' && save.error !== 'weakPassword' && <p className="form-error" role="alert">{t(errorLabel(save.error))}</p>}
        <Field id="profile-current-password" name="current" type="password" label={t('currentPassword')} autoComplete="current-password" value={current} error={fieldError('wrongPassword')} onChange={(e) => { setCurrent(e.target.value); save.setDone(false) }} />
        <Field id="profile-new-password" name="password" type="password" label={t('newPassword')} autoComplete="new-password" help={t('passwordHelp')} value={password} error={fieldError('weakPassword')} onChange={(e) => { setPassword(e.target.value); save.setDone(false) }} />
        <div className="profile-form__actions">
          <Button type="submit" variant="primary" aria-busy={save.busy} disabled={!current || !password}>{t('changePassword')}</Button>
          {save.done && <span className="profile-saved" role="status">{t('passwordChanged')}</span>}
        </div>
      </form>
    </Card>
  )
}

function Devices({ count, onChanged }: { count: number | null; onChanged: () => void }) {
  const { t, num } = useLang()
  const end = useSubmit()
  return (
    <Card title={t('profileDevices')} description={t('profileDevicesD')}>
      <div className="profile-row">
        <span className="profile-row__value">{count === null ? '…' : count <= 1 ? t('devicesOnlyThis') : t('devicesCount', { n: num(count) })}</span>
        <Button aria-busy={end.busy} disabled={count === null || count <= 1} onClick={() => void end.run(() => api('/me/sessions/end-others', { method: 'POST' })).then(onChanged)}>{t('signOutOthers')}</Button>
      </div>
      {end.error && <p className="form-error" role="alert">{t(errorLabel(end.error))}</p>}
    </Card>
  )
}

function Language() {
  const { t, lang, setLang } = useLang()
  return (
    <Card title={t('language')} description={t('profileLanguageD')}>
      <div className="segmented" role="radiogroup" aria-label={t('language')}>
        {(['bn', 'en'] as const).map((value) => (
          <label key={value}><input type="radio" name="profile-language" checked={lang === value} onChange={() => setLang(value)} /><span>{value === 'bn' ? 'বাংলা' : 'English'}</span></label>
        ))}
      </div>
    </Card>
  )
}

function DeleteAccount() {
  const { t } = useLang()
  const { refresh } = useSession()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [blocking, setBlocking] = useState<string[]>([])
  const remove = useSubmit()
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBlocking([])
    const ok = await remove.run(async () => {
      try {
        await api('/me', { method: 'DELETE', body: { password } })
      } catch (err) {
        if (err instanceof ApiError && err.code === 'soleOwner') setBlocking((err.data as { stores?: string[] } | null)?.stores ?? [])
        throw err
      }
    })
    if (ok) { await refresh(); navigate('/login', { replace: true }) }
  }
  return (
    <Card title={t('deleteAccount')} description={t('deleteAccountD')} danger>
      <form className="profile-form" onSubmit={submit} noValidate>
        {remove.error === 'soleOwner'
          ? <p className="form-error" role="alert">{t('errSoleOwner', { stores: blocking.join(', ') })}</p>
          : remove.error && remove.error !== 'wrongPassword' && <p className="form-error" role="alert">{t(errorLabel(remove.error))}</p>}
        <Field id="profile-delete-password" name="password" type="password" label={t('currentPassword')} autoComplete="current-password" value={password} error={remove.error === 'wrongPassword' ? t(errorLabel('wrongPassword')) : undefined} onChange={(e) => setPassword(e.target.value)} />
        <div className="profile-form__actions">
          <Button type="submit" variant="danger" aria-busy={remove.busy} disabled={!password}>{t('deleteAccountAction')}</Button>
        </div>
      </form>
    </Card>
  )
}

export function Profile() {
  const { t } = useLang()
  const [devices, setDevices] = useState<number | null>(null)
  const loadDevices = () => { api<{ count: number }>('/me/sessions').then((r) => setDevices(r.count), () => setDevices(null)) }
  useEffect(loadDevices, [])
  return (
    <div className="page page--narrow">
      <PageHeader title={t('profileTitle')} description={t('profileD')} />
      <div className="profile-stack">
        <Details />
        <Email />
        <Password onChanged={loadDevices} />
        <Devices count={devices} onChanged={loadDevices} />
        <Language />
        <DeleteAccount />
      </div>
    </div>
  )
}

