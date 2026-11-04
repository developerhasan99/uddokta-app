import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { app } from './app.ts'
import { pool, tx } from './db.ts'
import { shifts } from './schema.ts'

before(async () => {
  await pool.query('drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public')
  await migrate(drizzle(pool), { migrationsFolder: new URL('../migrations', import.meta.url).pathname })
})
after(() => pool.end())

function client() {
  let cookie = ''
  return async (method: string, path: string, body?: unknown) => {
    const res = await app.request(`/api${path}`, { method, headers: { 'content-type': 'application/json', cookie }, body: body === undefined ? undefined : JSON.stringify(body) })
    const set = res.headers.get('set-cookie')
    if (set) cookie = set.split(';')[0]
    return { status: res.status, json: await res.json() as any }
  }
}

let count = 0
async function person(name: string) {
  const call = client()
  await call('POST', '/auth/signup', { name, email: `tm${++count}@example.com`, password: 'correct horse' })
  return { call, id: (await call('GET', '/me')).json.user.id as string }
}
async function team() {
  const owner = await person('Owner')
  const handle = `tm-${++count}`
  await owner.call('POST', '/stores', { name: 'Shop', handle })
  const invite = await owner.call('POST', `/stores/${handle}/invites`, { role: 'staff' })
  const staff = await person('Staff')
  await staff.call('POST', `/invites/${invite.json.token}/accept`)
  return { owner, staff, handle }
}

test('tasks are shared by the team, assigned only within the store, and ticked off', async () => {
  const { owner, staff, handle } = await team()
  const base = `/stores/${handle}/tasks`
  const outsider = await person('Outsider')
  assert.equal((await owner.call('POST', base, { title: 'x', assigneeId: outsider.id })).status, 400, 'not a member')
  assert.equal((await owner.call('POST', base, { title: '' })).status, 400)
  const made = await owner.call('POST', base, { title: 'রাফিকে ৫টায় ফোন', dueOn: '2026-11-05', assigneeId: staff.id })
  assert.equal(made.status, 201)
  const [task] = (await staff.call('GET', base)).json
  assert.deepEqual([task.title, task.dueOn, task.assignee], ['রাফিকে ৫টায় ফোন', '2026-11-05', 'Staff'])
  await staff.call('PATCH', `${base}/${task.id}`, { done: true })
  assert.deepEqual((await owner.call('GET', base)).json, [])
  assert.equal((await owner.call('GET', `${base}?done=1`)).json.length, 1)
  assert.equal((await outsider.call('GET', base)).status, 404)
  assert.equal((await outsider.call('PATCH', `/stores/${handle}/tasks/${task.id}`, { done: false })).status, 404)
})

test('members clock themselves in and out, once at a time, and nobody else can', async () => {
  const { owner, staff, handle } = await team()
  const base = `/stores/${handle}/shifts`
  await staff.call('POST', `${base}/start`)
  await staff.call('POST', `${base}/start`)
  let board = (await owner.call('GET', base)).json
  assert.deepEqual(board.open.map((s: any) => s.name), ['Staff'], 'starting twice keeps one open shift')
  await owner.call('POST', `${base}/end`)
  assert.equal((await owner.call('GET', base)).json.open.length, 1, 'ending your own shift does not end someone else’s')
  await staff.call('POST', `${base}/end`)
  board = (await owner.call('GET', base)).json
  assert.equal(board.open.length, 0)
  assert.equal(board.days[0].name, 'Staff')
  const stores = (await owner.call('GET', '/me')).json.stores
  await assert.rejects(tx(owner.id, (t) => t.insert(shifts).values({ storeId: stores[0].id, userId: staff.id })), 'the database refuses clocking in for someone else')
})
