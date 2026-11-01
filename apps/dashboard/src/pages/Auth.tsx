import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Check, Eye, EyeOff } from 'lucide-react'
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router'
import { useSession, type Role } from '../account-context'
import { api, errorCode } from '../api'
import { roleLabels } from '../components/AppMenu'
import { Button, Field, LinkButton, Notice } from '../components/ui'
import { errorLabel, useLang, type Key } from '../i18n'

// Only same-site paths, so a crafted link cannot send someone to another website after login.
function useNext() {
  const [params] = useSearchParams()
  const next = params.get('next') ?? '/'
  return next.startsWith('/') && !next.startsWith('//') ? next : '/'
}

const benefits: Key[] = ['authBenefitOrders', 'authBenefitCouriers', 'authBenefitFake']

function AuthLayout({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  const { t, lang, setLang } = useLang()
  return (
    <div className="auth-page">
      <title>{title}</title>
      <aside className="auth-page__brand">
        <div className="brand">
          <img src="/favicon.svg" width="28" height="28" alt="" />
          {t('appName')}
        </div>
        <div className="auth-page__pitch">
          <p className="auth-page__headline">{t('authHeadline')}</p>
          <ul className="auth-page__benefits">
            {benefits.map((key) => (
              <li key={key}><Check size={16} aria-hidden="true" />{t(key)}</li>
            ))}
          </ul>
        </div>
      </aside>
      <main id="main" className="auth-page__panel">
        <div className="auth-page__language" role="group" aria-label={t('language')}>
          <button type="button" aria-pressed={lang === 'bn'} onClick={() => setLang('bn')}>বাংলা</button>
          <button type="button" aria-pressed={lang === 'en'} onClick={() => setLang('en')}>English</button>
        </div>
        <div className="auth__card">
          <div className="auth__heading">
            <h1>{title}</h1>
            {description && <p className="muted">{description}</p>}
          </div>
          {children}
        </div>
      </main>
    </div>
  )
}

function PasswordField(props: { id: string; autoComplete: string; value: string; help?: string; error?: string; onChange: (value: string) => void }) {
  const { t } = useLang()
  const [shown, setShown] = useState(false)
  const { onChange, ...rest } = props
  return (
    <Field
      {...rest}
      name="password"
      type={shown ? 'text' : 'password'}
      label={t('passwordLabel')}
      onChange={(e) => onChange(e.target.value)}
      trailing={(
        <button type="button" className="field__toggle" aria-pressed={shown} aria-label={t('showPassword')} onClick={() => setShown(!shown)}>
          {shown ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
        </button>
      )}
    />
  )
}

export function Login() {
  const { t } = useLang()
  const { state, refresh } = useSession()
  const next = useNext()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (state.status === 'ready') return <Navigate replace to={next} />

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await api('/auth/login', { method: 'POST', body: { email, password } })
      await refresh()
    } catch (err) {
      setError(errorCode(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout title={t('loginTitle')} description={t('loginD')}>
      <form className="auth__form" onSubmit={submit} noValidate>
        {error && <p className="form-error" role="alert">{t(errorLabel(error))}</p>}
        <Field id="login-email" name="email" type="email" label={t('emailLabel')} autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <PasswordField id="login-password" autoComplete="current-password" value={password} onChange={setPassword} />
        <Button type="submit" variant="primary" aria-busy={busy}>{t('loginAction')}</Button>
      </form>
      <p className="muted auth__switch">
        {t('noAccount')} <Link className="auth__link" to={`/signup?next=${encodeURIComponent(next)}`}>{t('signupAction')}</Link>
      </p>
    </AuthLayout>
  )
}

export function Signup() {
  const { t } = useLang()
  const { state, refresh } = useSession()
  const next = useNext()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (state.status === 'ready') return <Navigate replace to={next} />

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await api('/auth/signup', { method: 'POST', body: { name, email, password } })
      await refresh()
    } catch (err) {
      setError(errorCode(err))
    } finally {
      setBusy(false)
    }
  }

  const fieldError = (...codes: string[]) => (error && codes.includes(error) ? t(errorLabel(error)) : undefined)
  const isFieldError = error === 'nameRequired' || error === 'emailInvalid' || error === 'emailTaken' || error === 'weakPassword'

  return (
    <AuthLayout title={t('signupTitle')} description={t('signupD')}>
      <form className="auth__form" onSubmit={submit} noValidate>
        {error && !isFieldError && <p className="form-error" role="alert">{t(errorLabel(error))}</p>}
        <Field id="signup-name" name="name" label={t('yourName')} autoComplete="name" value={name} error={fieldError('nameRequired')} onChange={(e) => setName(e.target.value)} />
        <Field id="signup-email" name="email" type="email" label={t('emailLabel')} autoComplete="email" value={email} error={fieldError('emailInvalid', 'emailTaken')} onChange={(e) => setEmail(e.target.value)} />
        <PasswordField id="signup-password" autoComplete="new-password" help={t('passwordHelp')} value={password} error={fieldError('weakPassword')} onChange={setPassword} />
        <Button type="submit" variant="primary" aria-busy={busy}>{t('signupAction')}</Button>
      </form>
      <p className="muted auth__switch">
        {t('haveAccount')} <Link className="auth__link" to={`/login?next=${encodeURIComponent(next)}`}>{t('loginAction')}</Link>
      </p>
    </AuthLayout>
  )
}

export function Invite() {
  const { t } = useLang()
  const { token } = useParams()
  const { state, refresh } = useSession()
  const navigate = useNavigate()
  const [invite, setInvite] = useState<{ storeName: string; role: Role } | 'invalid' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const here = encodeURIComponent(`/invite/${token}`)

  useEffect(() => {
    api<{ storeName: string; role: Role }>(`/invites/${token}`).then(setInvite, () => setInvite('invalid'))
  }, [token])

  const accept = async () => {
    setError(null)
    try {
      const { handle } = await api<{ handle: string }>(`/invites/${token}/accept`, { method: 'POST' })
      await refresh()
      navigate(`/store/${handle}`)
    } catch (err) {
      setError(errorCode(err))
    }
  }

  if (invite === null) return <div className="auth" role="status" aria-label={t('loading')} />
  if (invite === 'invalid') {
    return (
      <AuthLayout title={t('errInviteInvalid')}>
        <Notice title={t('inviteInvalidBody')} action={<LinkButton to="/">{t('backHome')}</LinkButton>} />
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title={t('inviteTitle', { store: invite.storeName })}
      description={t('inviteD', { role: t(roleLabels[invite.role]) })}
    >
      {error && <p className="form-error" role="alert">{t(errorLabel(error))}</p>}
      {state.status === 'ready'
        ? (
          <>
            <p className="muted">{t('inviteAs', { email: state.me.user.email })}</p>
            <Button variant="primary" onClick={() => void accept()}>{t('inviteAccept')}</Button>
          </>
        )
        : (
          <div className="auth__form">
            <LinkButton to={`/signup?next=${here}`} variant="primary">{t('signupAction')}</LinkButton>
            <LinkButton to={`/login?next=${here}`}>{t('loginAction')}</LinkButton>
          </div>
        )}
    </AuthLayout>
  )
}
