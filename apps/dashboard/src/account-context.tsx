import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Navigate, Outlet, useLocation, useParams } from 'react-router'
import { api, ApiError } from './api'
import { Button, Notice } from './components/ui'
import { useLang } from './i18n'

export type Role = 'owner' | 'admin' | 'staff'
export type User = { id: string; name: string; email: string }
export type Store = { id: string; handle: string; name: string }
export type MyStore = { store: Store; role: Role }

type Me = { user: User; stores: (Store & { role: Role })[] }
type State = { status: 'loading' | 'signedOut' | 'failed' } | { status: 'ready'; me: Me }

type Ctx = { state: State; refresh: () => Promise<void>; logout: () => Promise<void> }

const AccountContext = createContext<Ctx | null>(null)

export function AccountProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ status: 'loading' })

  const refresh = useCallback(async () => {
    try {
      setState({ status: 'ready', me: await api<Me>('/me') })
    } catch (err) {
      setState({ status: err instanceof ApiError && err.code === 'signedOut' ? 'signedOut' : 'failed' })
    }
  }, [])

  const logout = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' })
    setState({ status: 'signedOut' })
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const value = useMemo(() => ({ state, refresh, logout }), [state, refresh, logout])
  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>
}

export function useSession() {
  const ctx = useContext(AccountContext)
  if (!ctx) throw new Error('useSession needs AccountProvider')
  return ctx
}

// For screens under RequireAccount, where a signed-in user is guaranteed.
export function useAccount() {
  const { state, refresh, logout } = useSession()
  if (state.status !== 'ready') throw new Error('useAccount needs RequireAccount')
  const myStores: MyStore[] = state.me.stores.map(({ role, ...store }) => ({ store, role }))
  return { me: state.me.user, myStores, refresh, logout }
}

export function RequireAccount() {
  const { t } = useLang()
  const { state, refresh } = useSession()
  const { pathname, search } = useLocation()

  if (state.status === 'loading') return <div className="auth" role="status" aria-label={t('loading')} />
  if (state.status === 'signedOut') return <Navigate replace to={`/login?next=${encodeURIComponent(pathname + search)}`} />
  if (state.status === 'failed') {
    return (
      <div className="auth">
        <section className="card auth__card">
          <Notice role="alert" title={t('errNetwork')} action={<Button onClick={() => void refresh()}>{t('retry')}</Button>} />
        </section>
      </div>
    )
  }
  return <Outlet />
}

// The store in the URL, only if the signed-in user belongs to it.
export function useCurrentStore() {
  const { handle } = useParams()
  const { myStores } = useAccount()
  return myStores.find((m) => m.store.handle === handle) ?? null
}

export function useStorePath() {
  const { handle } = useParams()
  return (path: string) => `/store/${handle}${path === '/' ? '' : path}`
}

export function lastStoreHandle() {
  try {
    return localStorage.getItem('lastStore')
  } catch {
    return null
  }
}

export function rememberStore(handle: string) {
  try {
    localStorage.setItem('lastStore', handle)
  } catch {}
}
