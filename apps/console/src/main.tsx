import { StrictMode, useCallback, useEffect, useState, type FormEvent } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, NavLink, Outlet, Route, Routes } from 'react-router'
import { Building2, CreditCard, LayoutDashboard, LayoutTemplate, LogOut, ScrollText, Settings as SettingsIcon, Users } from 'lucide-react'
import '@fontsource-variable/inter'
import '@fontsource-variable/noto-sans-bengali'
import '../../dashboard/src/styles/app.css'
import './console.css'
import { Button, Field } from '../../dashboard/src/components/ui'
import { api, errorText } from './api'
import { Loading } from './ui'
import { Overview } from './pages/Overview'
import { UserDetail, UserList } from './pages/Users'
import { StoreDetail, StoreList } from './pages/Stores'
import { Plans } from './pages/Plans'
import { Demos } from './pages/Demos'
import { Audit } from './pages/Audit'
import { Settings } from './pages/Settings'

type Admin = { id: string; name: string; email: string }

function SignIn({ onSignedIn }: { onSignedIn: () => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true); setError(null)
    try { await api('/auth/login', { method: 'POST', body: { email, password } }); onSignedIn() } catch (err) { setError(errorText(err)); setBusy(false) }
  }
  return (
    <main className="console-signin">
      <form className="console-signin__card auth__form" onSubmit={submit} noValidate>
        <div className="brand console-signin__brand"><img src="/favicon.svg" width="28" height="28" alt="" />Uddokta Console</div>
        <p className="muted">For platform administrators. Sign-ins last 12 hours.</p>
        {error && <p className="form-error" role="alert">{error}</p>}
        <Field id="console-email" type="email" label="Email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Field id="console-password" type="password" label="Password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <Button type="submit" variant="primary" aria-busy={busy}>Sign in</Button>
      </form>
    </main>
  )
}

const nav = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/users', label: 'Users', icon: Users },
  { to: '/stores', label: 'Stores', icon: Building2 },
  { to: '/plans', label: 'Plans', icon: CreditCard },
  { to: '/demos', label: 'Demos', icon: LayoutTemplate },
  { to: '/audit', label: 'Audit log', icon: ScrollText },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
]

function Layout({ admin, onSignOut }: { admin: Admin; onSignOut: () => void }) {
  return (
    <div className="shell console-shell">
      <a className="skip-link" href="#main">Skip to content</a>
      <nav className="sidebar" aria-label="Console">
        <div className="sidebar__top">
          <span className="brand"><img src="/favicon.svg" width="24" height="24" alt="" />Console</span>
        </div>
        <ul className="nav-list">
          {nav.map(({ to, label, icon: Icon, end }) => (
            <li key={to}><NavLink to={to} end={end} className="nav-link"><Icon size={18} aria-hidden="true" />{label}</NavLink></li>
          ))}
        </ul>
        <div className="nav-bottom console-admin">
          <span className="console-admin__who"><strong>{admin.name}</strong><span>{admin.email}</span></span>
          <button type="button" className="nav-link console-admin__out" onClick={onSignOut}><LogOut size={18} aria-hidden="true" />Sign out</button>
        </div>
      </nav>
      <main id="main" className="shell__main" tabIndex={-1}><Outlet /></main>
    </div>
  )
}

function App() {
  const [admin, setAdmin] = useState<Admin | null | undefined>(undefined)
  const check = useCallback(() => { api<Admin>('/console/me').then(setAdmin, () => setAdmin(null)) }, [])
  useEffect(check, [check])
  useEffect(() => {
    const out = () => setAdmin(null)
    window.addEventListener('console-signed-out', out)
    return () => window.removeEventListener('console-signed-out', out)
  }, [])
  if (admin === undefined) return <Loading />
  if (admin === null) return <SignIn onSignedIn={check} />
  const signOut = async () => { await api('/auth/logout', { method: 'POST' }).catch(() => {}); setAdmin(null) }
  return (
    <Routes>
      <Route element={<Layout admin={admin} onSignOut={() => void signOut()} />}>
        <Route index element={<Overview />} />
        <Route path="users" element={<UserList />} />
        <Route path="users/:id" element={<UserDetail adminId={admin.id} />} />
        <Route path="stores" element={<StoreList />} />
        <Route path="stores/:id" element={<StoreDetail />} />
        <Route path="plans" element={<Plans />} />
        <Route path="demos" element={<Demos />} />
        <Route path="audit" element={<Audit />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<Navigate replace to="/" />} />
      </Route>
    </Routes>
  )
}

createRoot(document.getElementById('root')!).render(<StrictMode><BrowserRouter><App /></BrowserRouter></StrictMode>)
