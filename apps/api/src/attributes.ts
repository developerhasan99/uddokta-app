import { and, asc, eq, inArray, notInArray, sql } from 'drizzle-orm'
import type { Hono } from 'hono'
import { attributeKinds, isAttributeName, maxAttributes, maxChoices, maxNumber, type AttributeKind } from 'storefront/filters'
import { databaseCode, fail, storeByHandle, type Env } from './app.ts'
import { tx, type Tx } from './db.ts'
import { isId } from './products.ts'
import { attributeChoices, attributes, productAttributeValues } from './schema.ts'

// Products › Attributes: the store's attribute definitions. Any team member adds and edits them; owners and admins
// delete (row-level security). A product's values are saved with the product (saveProductAttributes).

const text = (v: unknown, max: number) => (typeof v === 'string' && v.trim().length <= max ? v.trim() : null)

function readAttribute(body: any) {
  if (!body || typeof body !== 'object') throw fail(400, 'invalidRequest')
  const name = text(body.name, 60)
  if (!name || !isAttributeName(name)) throw fail(400, 'attributeName')
  const kind = body.kind as AttributeKind
  if (!attributeKinds.includes(kind)) throw fail(400, 'invalidRequest')
  const unit = kind === 'number' ? text(body.unit ?? '', 20) : ''
  if (unit === null || typeof (body.showOnProduct ?? true) !== 'boolean' || typeof (body.filterable ?? true) !== 'boolean') throw fail(400, 'invalidRequest')
  const raw = kind === 'choice' ? body.choices ?? [] : []
  if (!Array.isArray(raw) || raw.length > maxChoices) throw fail(400, 'invalidRequest')
  const choices = raw.map((c: any) => {
    const label = text(c?.label, 60)
    if (!label || !(c.id === undefined || isId(c.id))) throw fail(400, 'attributeChoice')
    return { id: c.id as string | undefined, label }
  })
  if (new Set(choices.map((c) => c.label.toLowerCase())).size !== choices.length) throw fail(400, 'attributeChoiceTwice')
  return { name, kind, unit, showOnProduct: (body.showOnProduct ?? true) as boolean, filterable: (body.filterable ?? true) as boolean, choices }
}

// Every attribute with its choices and how many products use each, in the seller's order.
export async function listAttributes(t: Tx, storeId: string) {
  const rows = await t.select().from(attributes).where(eq(attributes.storeId, storeId)).orderBy(asc(attributes.position), asc(attributes.name))
  const choices = rows.length ? await t.select().from(attributeChoices).where(and(eq(attributeChoices.storeId, storeId), inArray(attributeChoices.attributeId, rows.map((r) => r.id)))).orderBy(asc(attributeChoices.position)) : []
  const uses = (await t.execute<{ attribute_id: string; choice_id: string | null; n: number }>(sql`
    select attribute_id, choice_id, count(distinct product_id)::int as n from product_attribute_values where store_id = ${storeId}::uuid group by grouping sets ((attribute_id), (attribute_id, choice_id))`)).rows
  const count = (a: string, c: string | null) => uses.find((u) => u.attribute_id === a && u.choice_id === c)?.n ?? 0
  return rows.map((r) => ({
    id: r.id, name: r.name, kind: r.kind, unit: r.unit, showOnProduct: r.showOnProduct, filterable: r.filterable, products: count(r.id, null),
    choices: choices.filter((c) => c.attributeId === r.id).map((c) => ({ id: c.id, label: c.label, products: count(r.id, c.id) })),
  }))
}

async function saveChoices(t: Tx, storeId: string, attributeId: string, choices: ReturnType<typeof readAttribute>['choices']) {
  const kept = choices.flatMap((c) => (c.id ? [c.id] : []))
  // Removing a choice removes it from the products that had it (cascade).
  await t.delete(attributeChoices).where(and(eq(attributeChoices.attributeId, attributeId), kept.length ? notInArray(attributeChoices.id, kept) : undefined))
  // Labels move aside first so a rename that swaps two labels never trips the unique label index.
  if (kept.length) await t.update(attributeChoices).set({ label: sql`'~' || ${attributeChoices.id}::text` }).where(and(eq(attributeChoices.attributeId, attributeId), inArray(attributeChoices.id, kept)))
  for (const [position, c] of choices.entries()) {
    if (c.id) {
      const done = await t.update(attributeChoices).set({ label: c.label, position }).where(and(eq(attributeChoices.attributeId, attributeId), eq(attributeChoices.id, c.id))).returning({ id: attributeChoices.id })
      if (!done.length) throw fail(400, 'invalidRequest')
    } else await t.insert(attributeChoices).values({ storeId, attributeId, label: c.label, position })
  }
}

const refuseTaken = (err: unknown) => {
  throw databaseCode(err) === '23505' ? fail(409, 'attributeTaken') : err
}

export function registerAttributes(app: Hono<Env>) {
  app.get('/stores/:handle/attributes', async (c) => tx(c.get('userId'), async (t) => c.json(await listAttributes(t, (await storeByHandle(t, c.req.param('handle'))).id))))

  app.post('/stores/:handle/attributes', async (c) => {
    const input = readAttribute(await c.req.json().catch(() => null))
    return tx(c.get('userId'), async (t) => {
      const store = await storeByHandle(t, c.req.param('handle'))
      await t.execute(sql`select pg_advisory_xact_lock(hashtext(${`attributes:${store.id}`}))`)
      const [{ n }] = (await t.execute<{ n: number }>(sql`select count(*)::int as n from attributes where store_id = ${store.id}::uuid`)).rows
      if (n >= maxAttributes) throw fail(409, 'attributeLimit')
      const [row] = await t.insert(attributes).values({ storeId: store.id, name: input.name, kind: input.kind, unit: input.unit, showOnProduct: input.showOnProduct, filterable: input.filterable, position: n }).returning({ id: attributes.id })
      await saveChoices(t, store.id, row.id, input.choices)
      return c.json((await listAttributes(t, store.id)).find((a) => a.id === row.id), 201)
    }).catch(refuseTaken)
  })

  // The kind never changes (values would no longer fit); everything else does.
  app.put('/stores/:handle/attributes/:id', async (c) => {
    const id = c.req.param('id')
    if (!isId(id)) throw fail(404, 'notFound')
    const body = await c.req.json().catch(() => null)
    return tx(c.get('userId'), async (t) => {
      const store = await storeByHandle(t, c.req.param('handle'))
      const [current] = await t.select().from(attributes).where(and(eq(attributes.storeId, store.id), eq(attributes.id, id)))
      if (!current) throw fail(404, 'notFound')
      const input = readAttribute({ ...body, kind: current.kind })
      await t.update(attributes).set({ name: input.name, unit: input.unit, showOnProduct: input.showOnProduct, filterable: input.filterable }).where(eq(attributes.id, id))
      if (current.kind === 'choice') await saveChoices(t, store.id, id, input.choices)
      return c.json((await listAttributes(t, store.id)).find((a) => a.id === id))
    }).catch(refuseTaken)
  })

  app.put('/stores/:handle/attributes-order', async (c) => {
    const body = await c.req.json().catch(() => null)
    const ids = body?.ids
    if (!Array.isArray(ids) || ids.length > maxAttributes || !ids.every(isId) || new Set(ids).size !== ids.length) throw fail(400, 'invalidRequest')
    return tx(c.get('userId'), async (t) => {
      const store = await storeByHandle(t, c.req.param('handle'))
      for (const [position, id] of ids.entries()) await t.update(attributes).set({ position }).where(and(eq(attributes.storeId, store.id), eq(attributes.id, id)))
      return c.json(await listAttributes(t, store.id))
    })
  })

  // Deleting an attribute removes its values from every product (cascade). Staff get nothing deleted: forbidden.
  app.delete('/stores/:handle/attributes/:id', async (c) => {
    const id = c.req.param('id')
    if (!isId(id)) throw fail(404, 'notFound')
    return tx(c.get('userId'), async (t) => {
      const store = await storeByHandle(t, c.req.param('handle'))
      const gone = await t.delete(attributes).where(and(eq(attributes.storeId, store.id), eq(attributes.id, id))).returning({ id: attributes.id })
      if (!gone.length) throw fail(403, 'forbidden')
      return c.body(null, 204)
    })
  })
}

// ---- A product's values ----

export type ProductAttributeInput = { attributeId: string; choiceIds?: string[]; number?: number; flag?: boolean }

// The values a product form sent, or undefined when it left them out (the saved values are kept).
export function readProductAttributes(raw: unknown): ProductAttributeInput[] | undefined {
  if (raw === undefined) return undefined
  if (!Array.isArray(raw) || raw.length > maxAttributes) throw fail(400, 'invalidRequest')
  const seen = new Set<string>()
  return raw.map((v: any) => {
    if (!v || !isId(v.attributeId) || seen.has(v.attributeId)) throw fail(400, 'invalidRequest')
    seen.add(v.attributeId)
    const choiceIds = v.choiceIds
    if (choiceIds !== undefined && !(Array.isArray(choiceIds) && choiceIds.length <= maxChoices && choiceIds.every(isId) && new Set(choiceIds).size === choiceIds.length)) throw fail(400, 'invalidRequest')
    if (v.number !== undefined && !(typeof v.number === 'number' && Number.isFinite(v.number) && v.number >= 0 && v.number <= maxNumber)) throw fail(400, 'attributeNumber')
    if (v.flag !== undefined && typeof v.flag !== 'boolean') throw fail(400, 'invalidRequest')
    return { attributeId: v.attributeId, choiceIds, number: v.number === undefined ? undefined : Math.round(v.number * 1000) / 1000, flag: v.flag }
  })
}

// Replaces a product's values. Each value must fit its attribute's kind and use that attribute's own choices.
export async function saveProductAttributes(t: Tx, storeId: string, productId: string, values: ProductAttributeInput[]) {
  const defs = values.length ? await t.select({ id: attributes.id, kind: attributes.kind }).from(attributes).where(and(eq(attributes.storeId, storeId), inArray(attributes.id, values.map((v) => v.attributeId)))) : []
  const rows: (typeof productAttributeValues.$inferInsert)[] = []
  for (const v of values) {
    const def = defs.find((d) => d.id === v.attributeId)
    if (!def) throw fail(400, 'invalidRequest')
    const base = { storeId, productId, attributeId: v.attributeId }
    if (def.kind === 'choice' && v.choiceIds?.length && v.number === undefined && v.flag === undefined) rows.push(...v.choiceIds.map((choiceId) => ({ ...base, choiceId })))
    else if (def.kind === 'number' && v.number !== undefined && !v.choiceIds?.length && v.flag === undefined) rows.push({ ...base, number: v.number })
    else if (def.kind === 'flag' && v.flag !== undefined && !v.choiceIds?.length && v.number === undefined) rows.push({ ...base, flag: v.flag })
    else if (v.choiceIds?.length || v.number !== undefined || v.flag !== undefined) throw fail(400, 'invalidRequest')
  }
  await t.delete(productAttributeValues).where(eq(productAttributeValues.productId, productId))
  // A choice of another attribute fails the (attribute, choice) foreign key.
  if (rows.length) await t.insert(productAttributeValues).values(rows).catch((err) => { throw databaseCode(err) === '23503' ? fail(400, 'invalidRequest') : err })
}

export async function productAttributes(t: Tx, productId: string) {
  const rows = await t.select().from(productAttributeValues).where(eq(productAttributeValues.productId, productId))
  const byAttr = new Map<string, ProductAttributeInput>()
  for (const r of rows) {
    const v = byAttr.get(r.attributeId) ?? { attributeId: r.attributeId }
    if (r.choiceId) v.choiceIds = [...(v.choiceIds ?? []), r.choiceId]
    if (r.number !== null) v.number = Number(r.number)
    if (r.flag !== null) v.flag = r.flag
    byAttr.set(r.attributeId, v)
  }
  return [...byAttr.values()]
}
