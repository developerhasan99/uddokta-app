import { and, eq, sql } from 'drizzle-orm'
import { starterTheme, themeReferences, variationSettings, type ThemeDoc } from 'storefront/theme'
import type { PresetId } from 'storefront/themes'
import type { Tx } from './db.ts'
import { stores, themeMedia, themes } from './schema.ts'

export const starterName = 'উদ্যোক্তা'

// Keeps theme_media equal to the images in the draft and published copies, which is what blocks deleting them.
export async function syncThemeMedia(t: Tx, storeId: string, themeId: string, ...docs: (ThemeDoc | null)[]) {
  const ids = new Set(docs.flatMap((d) => (d ? themeReferences(d).media : [])))
  await t.delete(themeMedia).where(eq(themeMedia.themeId, themeId))
  if (ids.size) await t.insert(themeMedia).values([...ids].map((mediaId) => ({ storeId, themeId, mediaId })))
}

// Every store starts with the starter theme, published and live, in the style it chose.
export async function createStarterTheme(t: Tx, storeId: string, variation: PresetId = 'fresh') {
  const doc = starterTheme(variation)
  const [row] = await t.insert(themes).values({ storeId, name: starterName, draft: doc, published: doc, starter: `starter:${variation}`, publishedAt: sql`now()` }).returning({ id: themes.id })
  await t.update(stores).set({ liveThemeId: row.id }).where(eq(stores.id, storeId))
  return row.id
}

// One-click style: the preset's colours, font and corners on the live theme, in both copies so the store changes now.
export async function applyVariation(t: Tx, storeId: string, themeId: string | null, variation: PresetId) {
  if (!themeId) return
  const [row] = await t.select().from(themes).where(and(eq(themes.storeId, storeId), eq(themes.id, themeId)))
  if (!row) return
  const settings = variationSettings(variation)
  const restyle = (doc: unknown) => (doc ? { ...(doc as ThemeDoc), settings: { ...settings, latin: (doc as ThemeDoc).settings.latin, width: (doc as ThemeDoc).settings.width } } : doc)
  await t.update(themes).set({ draft: restyle(row.draft), published: restyle(row.published), revision: sql`${themes.revision} + 1`, updatedAt: sql`now()` }).where(eq(themes.id, row.id))
}
