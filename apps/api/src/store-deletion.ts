import { sql } from 'drizzle-orm'
import type { Hono } from 'hono'
import { databaseCode, fail, storeByHandle, type Env } from './app.ts'
import { one, tx } from './db.ts'
import { confirmPassword } from './profile.ts'
import { deleteFile } from './storage.ts'

// Deleting a store (migration 0104). The owner asks, typing the store's address and their password; the store is then
// offline and read-only for 30 days and the owner can restore it. After that sweepDeletedStores removes it, with its
// files; a platform administrator can remove it sooner from the console, but only while the owner's request stands.

const ownersOnly = (err: unknown) => { throw databaseCode(err) === '42501' ? fail(403, 'forbidden') : err }

export function registerStoreDeletion(app: Hono<Env>) {
  app.post('/stores/:handle/deletion', async (c) => {
    const body = await c.req.json().catch(() => null)
    const handle = c.req.param('handle')
    if (!body || body.confirm !== handle) throw fail(400, 'deleteConfirmMismatch')
    const userId = c.get('userId')
    await confirmPassword(userId, body.password)
    const due = await tx(userId, async (t) => {
      const store = await storeByHandle(t, handle)
      return (await one<{ due: string }>(t, sql`select store_request_deletion(${store.id}::uuid) as due`))?.due
    }).catch(ownersOnly)
    return c.json({ deletionDueAt: due })
  })

  app.delete('/stores/:handle/deletion', async (c) => {
    await tx(c.get('userId'), async (t) => {
      const store = await storeByHandle(t, c.req.param('handle'))
      await t.execute(sql`select store_cancel_deletion(${store.id}::uuid)`)
    }).catch(ownersOnly)
    return c.json({ deletionDueAt: null })
  })
}

// Removes stores whose 30 days are over (a few per run), then their image files. Runs hourly from index.ts.
// ponytail: a timer in the API process, like the email outbox; move to a pg-boss worker when workers are deployed.
export async function sweepDeletedStores() {
  const result = (await tx(null, (t) => one<{ r: { stores: number; keys: string[] } }>(t, sql`select store_purge_due() as r`)))?.r
  if (!result?.stores) return 0
  await Promise.allSettled(result.keys.map((key) => deleteFile(key)))
  console.log(`Deleted ${result.stores} store(s) whose grace period ended`)
  return result.stores
}
