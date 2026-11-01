import assert from 'node:assert/strict'
import { test } from 'node:test'
import { addMember, createStore, membersOf, removeMember, sampleAccount as a, setRole, storesFor, type Result } from './account.ts'

const ok = (r: Result) => {
  assert.ok(r.ok)
  return r.account
}
const error = (r: Result) => (r.ok ? null : r.error)

test('a user can have no stores and still exist', () => {
  const next = ok(addMember(a, 's1', 'new@example.com', 'staff'))
  const user = next.users.find((u) => u.email === 'new@example.com')!
  const without = ok(removeMember(next, 's1', user.id))
  assert.ok(without.users.some((u) => u.id === user.id))
  assert.deepEqual(storesFor(without, user.id), [])
})

test('a new store always has its creator as owner', () => {
  const next = ok(createStore(a, 'u1', ' New Shop ', 'new-shop'))
  const store = next.stores.find((s) => s.handle === 'new-shop')!
  assert.equal(store.name, 'New Shop')
  assert.deepEqual(membersOf(next, store.id).map((m) => [m.user.id, m.role]), [['u1', 'owner']])
})

test('one user in many stores, one store with many users', () => {
  assert.equal(storesFor(a, 'u1').length, 2)
  assert.equal(membersOf(a, 's1').length, 2)
})

test('the last owner cannot be removed or demoted', () => {
  assert.equal(error(removeMember(a, 's1', 'u1')), 'lastOwner')
  assert.equal(error(setRole(a, 's1', 'u1', 'staff')), 'lastOwner')
})

test('an owner can leave once another owner exists', () => {
  const next = ok(removeMember(ok(setRole(a, 's1', 'u2', 'owner')), 's1', 'u1'))
  assert.deepEqual(membersOf(next, 's1').map((m) => m.user.id), ['u2'])
})

test('store and member input is validated', () => {
  assert.equal(error(createStore(a, 'u1', ' ', 'x')), 'nameRequired')
  assert.equal(error(createStore(a, 'u1', 'X', 'Bad Handle')), 'handleInvalid')
  assert.equal(error(createStore(a, 'u1', 'X', 'rangin-fashion')), 'handleTaken')
  assert.equal(error(addMember(a, 's1', 'nope', 'staff')), 'emailInvalid')
  assert.equal(error(addMember(a, 's1', 'TEAMMATE@example.com', 'staff')), 'alreadyMember')
})
