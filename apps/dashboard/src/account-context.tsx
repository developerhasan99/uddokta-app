import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useParams } from 'react-router'
import { sampleAccount, storesFor, type Account, type Failure, type Result } from './account'

// ponytail: sample account kept in this browser; replace with the API when accounts are built.
function saved(): Account {
  try {
    const raw = localStorage.getItem('account')
    return raw ? JSON.parse(raw) : sampleAccount
  } catch {
    return sampleAccount
  }
}

type Ctx = {
  account: Account
  apply: (result: Result) => Failure | null
  reset: () => void
}

const AccountContext = createContext<Ctx | null>(null)

export function AccountProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState(saved)

  useEffect(() => {
    try {
      localStorage.setItem('account', JSON.stringify(account))
    } catch {}
  }, [account])

  const apply = useCallback((result: Result) => {
    if (!result.ok) return result.error
    setAccount(result.account)
    return null
  }, [])

  const value = useMemo(() => ({ account, apply, reset: () => setAccount(sampleAccount) }), [account, apply])
  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>
}

export function useAccount() {
  const ctx = useContext(AccountContext)
  if (!ctx) throw new Error('useAccount needs AccountProvider')
  const me = ctx.account.users.find((u) => u.id === ctx.account.meId)!
  return { ...ctx, me, myStores: storesFor(ctx.account, me.id) }
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
