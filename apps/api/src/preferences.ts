import { and, eq } from 'drizzle-orm'
import type { Hono } from 'hono'
import { fail, storeByHandle, type Env } from './app.ts'
import { tx, type Tx } from './db.ts'
import { present } from './media.ts'
import { hashPassword } from './password.ts'
import { isId } from './products.ts'
import { media, stores } from './schema.ts'

// What a sitemap may list, in the order the storefront writes them.
const sitemapKindList = ['product', 'collection', 'storePage', 'landingPage']

const show = async (t: Tx, store: typeof stores.$inferSelect) => {
  const [image] = store.shareMediaId ? await t.select().from(media).where(and(eq(media.storeId, store.id), eq(media.id, store.shareMediaId))) : []
  return { homeTitle: store.homeTitle, homeDescription: store.homeDescription, shareImage: image ? present(image) : null, passwordOn: store.storePasswordHash !== null, passwordMessage: store.passwordMessage, language: store.language, seoHidden: store.seoHidden, robotsTxt: store.robotsTxt, sitemapKinds: store.sitemapKinds, codeHead: store.codeHead, codeBodyStart: store.codeBodyStart, codeBodyEnd: store.codeBodyEnd }
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
    const language = body?.language
    if (homeTitle === null || homeDescription === null || passwordMessage === null || !(shareImageId === null || isId(shareImageId))
      || typeof body?.passwordOn !== 'boolean' || typeof password !== 'string' || password.length > 100 || !(language === undefined || language === 'bn' || language === 'en')) throw fail(400, 'invalidRequest')
    // Any length will do: it only keeps buyers out while the store is being set up.
    if (password && !password.trim()) throw fail(400, 'storePasswordShort')
    // Search engines and custom code. Fields left out (an older screen) keep what is saved.
    const seoHidden = body?.seoHidden
    const robotsTxt = body?.robotsTxt === undefined ? undefined : typeof body.robotsTxt === 'string' && body.robotsTxt.length <= 5000 ? body.robotsTxt.replace(/\r\n?/g, '\n').trim() : null
    const kinds = body?.sitemapKinds
    const sitemapKinds = kinds === undefined ? undefined : Array.isArray(kinds) && kinds.every((k) => sitemapKindList.includes(k)) ? sitemapKindList.filter((k) => kinds.includes(k)) : null
    // Kept exactly as written (scripts, styles, tags): the seller's own code on their own pages, like a Custom HTML block.
    const code = (v: unknown) => (v === undefined ? undefined : typeof v === 'string' && v.length <= 50000 ? v : null)
    const codeHead = code(body?.codeHead), codeBodyStart = code(body?.codeBodyStart), codeBodyEnd = code(body?.codeBodyEnd)
    if (!(seoHidden === undefined || typeof seoHidden === 'boolean') || [robotsTxt, sitemapKinds, codeHead, codeBodyStart, codeBodyEnd].includes(null)) throw fail(400, 'searchEnginesInvalid')
    return tx(c.get('userId'), async (t) => {
      const store = await storeByHandle(t, c.req.param('handle'))
      if (body.passwordOn && !password && store.storePasswordHash === null) throw fail(400, 'storePasswordShort')
      const storePasswordHash = !body.passwordOn ? null : password ? await hashPassword(password.trim()) : store.storePasswordHash
      const [row] = await t.update(stores).set({ homeTitle, homeDescription, passwordMessage, shareMediaId: shareImageId, storePasswordHash, language: language ?? store.language, seoHidden: seoHidden ?? store.seoHidden, robotsTxt: robotsTxt ?? store.robotsTxt, sitemapKinds: sitemapKinds ?? store.sitemapKinds,
        codeHead: codeHead ?? store.codeHead, codeBodyStart: codeBodyStart ?? store.codeBodyStart, codeBodyEnd: codeBodyEnd ?? store.codeBodyEnd }).where(eq(stores.id, store.id)).returning()
      if (!row) throw fail(403, 'forbidden')
      return c.json(await show(t, row))
    })
  })
}
