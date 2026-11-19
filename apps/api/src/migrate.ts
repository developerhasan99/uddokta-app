import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { hasRetiredBlocks, retireOldBlocks, retiredTypes } from 'storefront/convert'
import { readContent } from 'storefront/schema'
import { builtInTemplates, templateLabels, templateTypes } from 'storefront/site'
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

// Same for demos (console Demos): their snapshots are page content too, and must stay readable when a block retires.
const demos = await pool.query<{ id: string; content: unknown }>('select id, content from demo_items where content::text ~ $1', [retiredPattern])
for (const demo of demos.rows) {
  const content = retireOldBlocks(demo.content, idsFor(demo.content))
  if (!readContent(content, { theme: true })) { console.warn(`Demo ${demo.id}: retired blocks could not be converted; left as is`); continue }
  await pool.query('update demo_items set content = $1 where id = $2', [content, demo.id])
  console.log(`Demo ${demo.id}: retired blocks converted to elements`)
}

// Data step: every store gets its own editable copy of each built-in template (stores made before they were editable).
// Inserts only the types a store lacks, so it does nothing once all stores have them.
for (const { id } of (await pool.query<{ id: string }>('select id from stores')).rows) {
  for (const type of templateTypes) {
    const added = await pool.query(
      'insert into templates (store_id, type, title, draft, published, published_at, built_in) values ($1, $2, $3, $4, $4, now(), true) on conflict (store_id, type) where built_in do nothing',
      [id, type, templateLabels[type][0], builtInTemplates[type]])
    if (added.rowCount) console.log(`Store ${id}: built-in ${type} template added`)
  }
}

await pool.end()
console.log('Migrations applied')
