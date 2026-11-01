export type Role = 'owner' | 'admin' | 'staff'
export type User = { id: string; name: string; email: string }
export type Store = { id: string; handle: string; name: string }
export type Membership = { storeId: string; userId: string; role: Role }
export type Account = { users: User[]; stores: Store[]; memberships: Membership[]; meId: string }

export type Failure = 'nameRequired' | 'handleInvalid' | 'handleTaken' | 'emailInvalid' | 'alreadyMember' | 'lastOwner'
export type Result = { ok: true; account: Account } | { ok: false; error: Failure }

const fail = (error: Failure): Result => ({ ok: false, error })

export const sampleAccount: Account = {
  meId: 'u1',
  users: [
    { id: 'u1', name: 'Sample owner', email: 'owner@example.com' },
    { id: 'u2', name: 'Sample teammate', email: 'teammate@example.com' },
  ],
  stores: [
    { id: 's1', handle: 'rangin-fashion', name: 'Rangin Fashion' },
    { id: 's2', handle: 'nodi-crafts', name: 'Nodi Crafts' },
  ],
  memberships: [
    { storeId: 's1', userId: 'u1', role: 'owner' },
    { storeId: 's1', userId: 'u2', role: 'admin' },
    { storeId: 's2', userId: 'u2', role: 'owner' },
    { storeId: 's2', userId: 'u1', role: 'staff' },
  ],
}

export function storesFor(account: Account, userId: string) {
  return account.memberships
    .filter((m) => m.userId === userId)
    .flatMap((m) => {
      const store = account.stores.find((s) => s.id === m.storeId)
      return store ? [{ store, role: m.role }] : []
    })
}

export function membersOf(account: Account, storeId: string) {
  return account.memberships
    .filter((m) => m.storeId === storeId)
    .flatMap((m) => {
      const user = account.users.find((u) => u.id === m.userId)
      return user ? [{ user, role: m.role }] : []
    })
}

export function isLastOwner(account: Account, storeId: string, userId: string) {
  const owners = account.memberships.filter((m) => m.storeId === storeId && m.role === 'owner')
  return owners.length === 1 && owners[0].userId === userId
}

// The store and its owner are created together, so a store never exists without a user.
export function createStore(account: Account, userId: string, name: string, handle: string): Result {
  const cleanName = name.trim()
  const cleanHandle = handle.trim().toLowerCase()
  if (!cleanName) return fail('nameRequired')
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(cleanHandle)) return fail('handleInvalid')
  if (account.stores.some((s) => s.handle === cleanHandle)) return fail('handleTaken')
  const store: Store = { id: crypto.randomUUID(), handle: cleanHandle, name: cleanName }
  return {
    ok: true,
    account: {
      ...account,
      stores: [...account.stores, store],
      memberships: [...account.memberships, { storeId: store.id, userId, role: 'owner' }],
    },
  }
}

export function addMember(account: Account, storeId: string, email: string, role: Role): Result {
  const cleanEmail = email.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) return fail('emailInvalid')
  const existing = account.users.find((u) => u.email === cleanEmail)
  if (existing && account.memberships.some((m) => m.storeId === storeId && m.userId === existing.id)) return fail('alreadyMember')
  const user = existing ?? { id: crypto.randomUUID(), name: cleanEmail.split('@')[0], email: cleanEmail }
  return {
    ok: true,
    account: {
      ...account,
      users: existing ? account.users : [...account.users, user],
      memberships: [...account.memberships, { storeId, userId: user.id, role }],
    },
  }
}

export function setRole(account: Account, storeId: string, userId: string, role: Role): Result {
  if (role !== 'owner' && isLastOwner(account, storeId, userId)) return fail('lastOwner')
  return {
    ok: true,
    account: {
      ...account,
      memberships: account.memberships.map((m) => (m.storeId === storeId && m.userId === userId ? { ...m, role } : m)),
    },
  }
}

// Also used for leaving a store: the user stays, only the membership goes.
export function removeMember(account: Account, storeId: string, userId: string): Result {
  if (isLastOwner(account, storeId, userId)) return fail('lastOwner')
  return {
    ok: true,
    account: {
      ...account,
      memberships: account.memberships.filter((m) => !(m.storeId === storeId && m.userId === userId)),
    },
  }
}
