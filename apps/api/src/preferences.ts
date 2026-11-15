import { and, eq } from 'drizzle-orm'
import type { Hono } from 'hono'
import { fail, storeByHandle, type Env } from './app.ts'
import { tx, type Tx } from './db.ts'
import { present } from './media.ts'
import { hashPassword } from './password.ts'
import { isId } from './products.ts'
import { media, stores } from './schema.ts'

const show = async (t: Tx, store: typeof stores.$inferSelect) => {
  const [image] = store.shareMediaId ? await t.select().from(media).where(and(eq(media.storeId, store.id), eq(media.id, store.shareMediaId))) : []
  return { homeTitle: store.homeTitle, homeDescription: store.homeDescription, shareImage: image ? present(image) : null, passwordOn: store.storePasswordHash !== null, passwordMessage: store.passwordMessage }
}

// Online store › Preferences. Owners and admins change them, like the other store settings (row-level security on stores).
export function registerPreferences(app: Hono<Env>) {
  app.get('/stores/:handle/preferences', async (c) => tx(c.get('userId'), async (t) => c.json(await show(t, await storeByHandle(t, c.req.param('handle'))))))

  // passwordOn false removes the password; true with a new password sets it; true without one keeps the current one.
  app.put('/stores/:handle/preferences', async (c) => {
    const body = await c.req.json().catch(() => null)
    const str = (v: unknown, max: number) => (typeof v === 'string' && v.length <= max ? v.trim() : null)
    const homeTitle = str(body?.homeTitle ?? '', 300)
    const homeDescription = str(body?.homeDescription ?? '', 1000)
    const passwordMessage = str(body?.passwordMessage ?? '', 300)
    const shareImageId = body?.shareImageId ?? null
    const password = body?.password ?? ''
    if (homeTitle === null || homeDescription === null || passwordMessage === null || !(shareImageId === null || isId(shareImageId))
      || typeof body?.passwordOn !== 'boolean' || typeof password !== 'string' || password.length > 100) throw fail(400, 'invalidRequest')
    if (password && password.trim().length < 4) throw fail(400, 'storePasswordShort')
    return tx(c.get('userId'), async (t) => {
      const store = await storeByHandle(t, c.req.param('handle'))
      if (body.passwordOn && !password && store.storePasswordHash === null) throw fail(400, 'storePasswordShort')
      const storePasswordHash = !body.passwordOn ? null : password ? await hashPassword(password.trim()) : store.storePasswordHash
      const [row] = await t.update(stores).set({ homeTitle, homeDescription, passwordMessage, shareMediaId: shareImageId, storePasswordHash }).where(eq(stores.id, store.id)).returning()
      if (!row) throw fail(403, 'forbidden')
      return c.json(await show(t, row))
    })
  })
}
