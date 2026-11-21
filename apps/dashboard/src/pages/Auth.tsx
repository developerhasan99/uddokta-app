import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Check, Eye, EyeOff, MailCheck } from 'lucide-react'
import { Link, Navigate, Outlet, useNavigate, useParams, useSearchParams } from 'react-router'
import { useSession, type Role } from '../account-context'
import { api, errorCode } from '../api'
import { SupportLink } from '../components/Support'
import { roleLabels } from '../components/AppMenu'
import { Button, Field, LinkButton, Notice, PageTitle } from '../components/ui'
import { errorLabel, siteUrl, useLang, type Key } from '../i18n'

// Only same-site paths, so a crafted link cannot send someone to another website after login.
function useNext() {
  const [params] = useSearchParams()
  const next = params.get('next') ?? '/'
  return next.startsWith('/') && !next.startsWith('//') ? next : '/'
}

const benefits: Key[] = ['authBenefitOrders', 'authBenefitCouriers', 'authBenefitFake']

function AuthLayout({ title, description, children }: { title: string; description?: ReactNode; children: ReactNode }) {
  const { t, lang, setLang } = useLang()
  return (
    <div className="auth-page">
      <PageTitle title={title} />
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
        {error === 'accountSuspended' && <SupportLink />}
        <Field id="login-email" name="email" type="email" label={t('emailLabel')} autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <PasswordField id="login-password" autoComplete="current-password" value={password} onChange={setPassword} />
        <Link className="auth__link auth__forgot" to={`/forgot-password${email ? `?email=${encodeURIComponent(email)}` : ''}`}>{t('forgotLink')}</Link>
        <Button type="submit" variant="primary" aria-busy={busy}>{t('loginAction')}</Button>
      </form>
      <p className="muted auth__switch">
        {t('noAccount')} <Link className="auth__link" to={`/signup?next=${encodeURIComponent(next)}`}>{t('signupAction')}</Link>
      </p>
    </AuthLayout>
  )
}

export function Signup() {
  const { t, lang } = useLang()
  const { state, refresh } = useSession()
  const next = useNext()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
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
      await api('/auth/signup', { method: 'POST', body: { name, email, phone, password, lang } })
      await refresh()
    } catch (err) {
      setError(errorCode(err))
    } finally {
      setBusy(false)
    }
  }

  const fieldError = (...codes: string[]) => (error && codes.includes(error) ? t(errorLabel(error)) : undefined)
  const isFieldError = ['nameRequired', 'emailInvalid', 'emailTaken', 'phoneInvalid', 'phoneTaken', 'weakPassword'].includes(error ?? '')

  return (
    <AuthLayout title={t('signupTitle')} description={t('signupD')}>
      <form className="auth__form" onSubmit={submit} noValidate>
        {error && !isFieldError && <p className="form-error" role="alert">{t(errorLabel(error))}</p>}
        <Field id="signup-name" name="name" label={t('yourName')} autoComplete="name" value={name} error={fieldError('nameRequired')} onChange={(e) => setName(e.target.value)} />
        <Field id="signup-email" name="email" type="email" label={t('emailLabel')} autoComplete="email" value={email} error={fieldError('emailInvalid', 'emailTaken')} onChange={(e) => setEmail(e.target.value)} />
        <Field id="signup-phone" name="phone" type="tel" inputMode="tel" label={t('phoneLabel')} autoComplete="tel-national" placeholder="01XXXXXXXXX" help={t('phoneHelp')} value={phone} error={fieldError('phoneInvalid', 'phoneTaken')} onChange={(e) => setPhone(e.target.value)} />
        <PasswordField id="signup-password" autoComplete="new-password" help={t('passwordHelp')} value={password} error={fieldError('weakPassword')} onChange={setPassword} />
        <Button type="submit" variant="primary" aria-busy={busy}>{t('signupAction')}</Button>
        <p className="muted auth__agree">
          {t('signupAgree', { terms: '{terms}', privacy: '{privacy}' }).split(/(\{terms\}|\{privacy\})/).map((part, i) =>
            part === '{terms}' ? <a key={i} className="auth__link" href={siteUrl(lang, 'terms')} target="_blank" rel="noopener">{t('legalTerms')}</a>
            : part === '{privacy}' ? <a key={i} className="auth__link" href={siteUrl(lang, 'privacy')} target="_blank" rel="noopener">{t('legalPrivacy')}</a>
            : part)}
        </p>
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

export function ForgotPassword() {
  const { t, lang } = useLang()
  const [params] = useSearchParams()
  const [email, setEmail] = useState(params.get('email') ?? '')
  const [sent, setSent] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await api('/auth/forgot', { method: 'POST', body: { email, lang } })
      setSent(email.trim())
    } catch (err) {
      setError(errorCode(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout title={t('forgotTitle')} description={sent ? undefined : t('forgotD')}>
      {sent
        ? <p className="auth__sent" role="status"><MailCheck size={18} aria-hidden="true" />{t('forgotSent', { email: sent })}</p>
        : (
          <form className="auth__form" onSubmit={submit} noValidate>
            <Field id="forgot-email" name="email" type="email" label={t('emailLabel')} autoComplete="email" value={email} error={error ? t(errorLabel(error)) : undefined} onChange={(e) => setEmail(e.target.value)} />
            {error === 'emailUnavailable' && <SupportLink />}
            <Button type="submit" variant="primary" aria-busy={busy}>{t('forgotAction')}</Button>
          </form>
        )}
      <p className="muted auth__switch"><Link className="auth__link" to="/login">{t('backToLogin')}</Link></p>
    </AuthLayout>
  )
}

export function ResetPassword() {
  const { t } = useLang()
  const { token } = useParams()
  const { refresh } = useSession()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await api('/auth/reset', { method: 'POST', body: { token, password } })
      await refresh()
      navigate('/', { replace: true })
    } catch (err) {
      setError(errorCode(err))
      setBusy(false)
    }
  }

  if (error === 'linkInvalid') {
    return (
      <AuthLayout title={t('errLinkInvalid')}>
        <div className="auth__form">
          <LinkButton to="/forgot-password" variant="primary">{t('resetAgain')}</LinkButton>
          <LinkButton to="/login">{t('backToLogin')}</LinkButton>
        </div>
      </AuthLayout>
    )
  }
  return (
    <AuthLayout title={t('resetTitle')} description={t('resetD')}>
      <form className="auth__form" onSubmit={submit} noValidate>
        {error && error !== 'weakPassword' && <p className="form-error" role="alert">{t(errorLabel(error))}</p>}
        <PasswordField id="reset-password" autoComplete="new-password" help={t('passwordHelp')} value={password} error={error === 'weakPassword' ? t(errorLabel(error)) : undefined} onChange={setPassword} />
        <Button type="submit" variant="primary" aria-busy={busy}>{t('resetAction')}</Button>
      </form>
    </AuthLayout>
  )
}

// Opened from the verification email; the link works whether or not this browser is signed in.
export function VerifyEmail() {
  const { t } = useLang()
  const { token } = useParams()
  const { state, refresh } = useSession()
  const [result, setResult] = useState<'done' | string | null>(null)
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return // the link works once; development renders effects twice
    started.current = true
    api('/auth/verify', { method: 'POST', body: { token } })
      .then(() => { setResult('done'); void refresh() }, (err) => setResult(errorCode(err)))
  }, [token, refresh])

  if (result === null) return <AuthLayout title={t('verifyTitle')}><div role="status" aria-label={t('loading')} /></AuthLayout>
  const next = <LinkButton to={state.status === 'ready' ? '/' : '/login'} variant="primary">{state.status === 'ready' ? t('continueAction') : t('loginAction')}</LinkButton>
  return result === 'done'
    ? <AuthLayout title={t('verifyDone')} description={t('verifyDoneBody')}><div className="auth__form">{next}</div></AuthLayout>
    : <AuthLayout title={t(errorLabel(result))}><div className="auth__form">{next}</div></AuthLayout>
}

// Opened from the link sent to a new address; the email changes when it is used.
export function ChangeEmail() {
  const { t } = useLang()
  const { token } = useParams()
  const { state, refresh } = useSession()
  const [result, setResult] = useState<{ email: string } | string | null>(null)
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    api<{ email: string }>('/auth/email-change', { method: 'POST', body: { token } })
      .then((r) => { setResult(r); void refresh() }, (err) => setResult(errorCode(err)))
  }, [token, refresh])

  if (result === null) return <AuthLayout title={t('changeEmailTitle')}><div role="status" aria-label={t('loading')} /></AuthLayout>
  const next = <LinkButton to={state.status === 'ready' ? '/account' : '/login'} variant="primary">{state.status === 'ready' ? t('continueAction') : t('loginAction')}</LinkButton>
  return typeof result === 'string'
    ? <AuthLayout title={t(errorLabel(result))}><div className="auth__form">{next}</div></AuthLayout>
    : <AuthLayout title={t('changeEmailDone', { email: result.email })} description={t('changeEmailDoneBody')}><div className="auth__form">{next}</div></AuthLayout>
}

// Shown above every signed-in screen until the account's email is confirmed.
export function VerifyEmailBar() {
  const { t, lang } = useLang()
  const { state } = useSession()
  const [sent, setSent] = useState<'sent' | string | null>(null)
  if (state.status !== 'ready' || state.me.user.emailVerified) return null
  const resend = async () => {
    try {
      await api('/me/verify-email', { method: 'POST', body: { lang } })
      setSent('sent')
    } catch (err) {
      setSent(errorCode(err))
    }
  }
  return (
    <div className="verify-bar" role="status">
      <MailCheck size={16} aria-hidden="true" />
      {sent && sent !== 'sent'
        ? <span>{t(errorLabel(sent))}</span>
        : <span><span className="verify-bar__long">{t('verifyBar', { email: state.me.user.email })}</span><span className="verify-bar__short">{t('verifyBarShort')}</span></span>}
      {sent === 'sent' ? <span className="verify-bar__done">{t('verifyResent')}</span> : sent === null && <button type="button" className="verify-bar__action" onClick={() => void resend()}>{t('verifyResend')}</button>}
    </div>
  )
}

// Every screen after sign-in waits until the account's mobile number is verified (when SMS is set up; /me says).
export function RequirePhone() {
  const { state } = useSession()
  if (state.status === 'ready' && !state.me.user.phoneVerified) return <VerifyPhone />
  return <Outlet />
}

function VerifyPhone() {
  const { t, num, lang } = useLang()
  const { state, refresh, logout } = useSession()
  const saved = state.status === 'ready' ? state.me.user.phone : null
  // An account from before phone sign-up has no number yet, so it starts by giving one.
  const [editing, setEditing] = useState(!saved)
  const [phone, setPhone] = useState(saved ?? '')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [wait, setWait] = useState(0)

  useEffect(() => {
    if (wait <= 0) return
    const timer = setTimeout(() => setWait(wait - 1), 1000)
    return () => clearTimeout(timer)
  }, [wait])

  const send = async (number?: string) => {
    setBusy(true)
    setError(null)
    try {
      await api('/me/phone', { method: 'POST', body: number === undefined ? {} : { phone: number } })
      await refresh()
      setEditing(false)
      setSent(true)
      setCode('')
      setWait(60)
    } catch (err) {
      setError(errorCode(err))
      if (errorCode(err) === 'codeWait') setWait(60)
    } finally {
      setBusy(false)
    }
  }

  const verify = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await api('/me/phone/verify', { method: 'POST', body: { code } })
      await refresh()
    } catch (err) {
      setError(errorCode(err))
      setBusy(false)
    }
  }

  const fieldError = (...codes: string[]) => (error && codes.includes(error) ? t(errorLabel(error)) : undefined)
  const otherError = error && !['phoneInvalid', 'phoneTaken', 'codeWrong', 'codeExpired'].includes(error) ? t(errorLabel(error)) : null
  const footer = (
    <p className="muted auth__switch">
      <button type="button" className="link-button" onClick={() => void logout()}>{t('logout')}</button>
    </p>
  )

  if (editing) {
    return (
      <AuthLayout title={t('phoneVerifyTitle')} description={t('phoneAddD')}>
        <form className="auth__form" onSubmit={(e) => { e.preventDefault(); if (!busy) void send(phone) }} noValidate>
          {otherError && <p className="form-error" role="alert">{otherError}</p>}
          <Field id="verify-phone" name="phone" type="tel" inputMode="tel" label={t('phoneLabel')} autoComplete="tel-national" placeholder="01XXXXXXXXX" value={phone} error={fieldError('phoneInvalid', 'phoneTaken')} onChange={(e) => setPhone(e.target.value)} />
          <Button type="submit" variant="primary" aria-busy={busy} disabled={wait > 0}>{wait > 0 ? t('phoneResendIn', { n: num(wait) }) : t('phoneSendCode')}</Button>
          {saved && <button type="button" className="link-button" onClick={() => { setEditing(false); setError(null) }}>{t('cancel')}</button>}
        </form>
        {footer}
      </AuthLayout>
    )
  }

  // 01711 222333, in Bangla digits on the Bangla dashboard.
  const grouped = saved ? `${saved.slice(0, 5)} ${saved.slice(5)}` : ''
  const shown = lang === 'bn' ? grouped.replace(/\d/g, (d) => '০১২৩৪৫৬৭৮৯'[Number(d)]) : grouped
  const description = (
    <>
      {/* The number sits where the sentence puts it, in either language. */}
      {t('phoneSentTo', { phone: '\0' }).split('\0').flatMap((part, i) => (i ? [<strong key={i} className="auth__phone">{shown}</strong>, part] : [part]))}
      {' '}<button type="button" className="link-button" onClick={() => { setEditing(true); setError(null) }}>{t('phoneChange')}</button>
    </>
  )

  return (
    <AuthLayout title={t('phoneVerifyTitle')} description={description}>
      <form className="auth__form" onSubmit={verify} noValidate>
        {otherError && <p className="form-error" role="alert">{otherError}</p>}
        <Field id="verify-code" name="code" className="input input--code" label={t('phoneCodeLabel')} inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus placeholder="••••••" value={code}
          error={fieldError('codeWrong', 'codeExpired', 'phoneTaken')} onChange={(e) => setCode(e.target.value)} />
        <Button type="submit" variant="primary" aria-busy={busy}>{t('phoneVerifyAction')}</Button>
        <p className="auth__resend muted" role="status">
          {sent && wait > 0 ? t('phoneSentAgain') : t('phoneNoCode')}{' '}
          <button type="button" className="link-button" disabled={busy || wait > 0} onClick={() => void send()}>{wait > 0 ? t('phoneResendIn', { n: num(wait) }) : t('phoneResend')}</button>
        </p>
      </form>
      {footer}
    </AuthLayout>
  )
}
