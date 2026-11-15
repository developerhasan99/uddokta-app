import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { hasRetiredBlocks, retireOldBlocks, retiredTypes } from 'storefront/convert'
import { readContent } from 'storefront/schema'
import { starterTheme } from 'storefront/theme'
import { isPreset } from 'storefront/themes'
import { starterName } from './themes.ts'
import { pool } from './db.ts'

await migrate(drizzle(pool), { migrationsFolder: new URL('../migrations', import.meta.url).pathname })

// Data step: pages holding retired blocks (Text, Image, Image with text, Video, Call to action, Standalone icon) are rewritten into elements, draft and published copy. Each
// result must pass readContent before it is written, and the revision goes up so an open editor reloads instead of
// saving the old version over it. Runs on every deploy and does nothing once no page holds them.
// Ids are predictable (counter, skipping ids already on the page), so a draft equal to its published copy stays equal
// after converting and the page does not start showing as changed.
const idsFor = (doc: unknown) => {
  const used = new Set(JSON.stringify(doc).match(/"id":"[^"]+"/g)?.map((m) => m.slice(6, -1)) ?? [])
  let n = 0
  return () => { let next; do next = `el-${++n}`; while (used.has(next)); used.add(next); return next }
}
const retiredPattern = `"type": "(${retiredTypes.join('|')})"`
const { rows } = await pool.query<{ id: string; draft: unknown; published: unknown }>(
  'select id, draft, published from pages where draft::text ~ $1 or published::text ~ $1', [retiredPattern])
for (const page of rows) {
  const draft = hasRetiredBlocks(page.draft) ? readContent(retireOldBlocks(page.draft, idsFor(page.draft))) : page.draft
  const published = page.published && hasRetiredBlocks(page.published) ? readContent(retireOldBlocks(page.published, idsFor(page.published))) : page.published
  if (!draft || (page.published && !published)) { console.warn(`Page ${page.id}: retired blocks could not be converted; left as is`); continue }
  await pool.query('update pages set draft = $1, published = $2, revision = revision + 1 where id = $3', [draft, published, page.id])
  console.log(`Page ${page.id}: retired blocks converted to elements`)
}

// Data step: every store gets the starter theme (in its chosen style) as its live theme. Does nothing once all have one.
const bare = await pool.query<{ id: string; theme: string }>('select id, theme from stores where live_theme_id is null')
for (const store of bare.rows) {
  const variation = isPreset(store.theme) ? store.theme : 'fresh'
  const doc = starterTheme(variation)
  const made = await pool.query<{ id: string }>(`insert into themes (store_id, name, draft, published, starter, published_at) values ($1, $2, $3, $3, $4, now()) returning id`, [store.id, starterName, doc, `starter:${variation}`])
  await pool.query('update stores set live_theme_id = $1 where id = $2', [made.rows[0].id, store.id])
  console.log(`Store ${store.id}: starter theme added`)
}

await pool.end()
console.log('Migrations applied')
