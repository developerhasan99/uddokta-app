import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { app } from './app.ts'
import { pool, tx } from './db.ts'
import { attributes, productAttributeValues } from './schema.ts'

before(async () => {
  await pool.query('drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public')
  await migrate(drizzle(pool), { migrationsFolder: new URL('../migrations', import.meta.url).pathname })
})
after(() => pool.end())

function client() {
  let cookie = ''
  return async (method: string, path: string, body?: unknown) => {
    const response = await app.request(`/api${path}`, { method, headers: { 'content-type': 'application/json', cookie }, body: body === undefined ? undefined : JSON.stringify(body) })
    if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie')!.split(';')[0]
    const text = await response.text()
    return { status: response.status, json: text ? JSON.parse(text) : null }
  }
}
let counter = 0
async function person() {
  const call = client()
  await call('POST', '/auth/signup', { name: 'Seller', email: `attr-${++counter}@example.com`, password: 'correct horse' })
  return { call, id: (await call('GET', '/me')).json.user.id as string }
}
async function shop() {
  const owner = await person()
  const handle = `attr-shop-${counter}`
  await owner.call('POST', '/stores', { name: 'Shop', handle })
  const staff = await person()
  const invite = await owner.call('POST', `/stores/${handle}/invites`, { role: 'staff' })
  await staff.call('POST', `/invites/${invite.json.token}/accept`)
  return { owner, staff, handle, base: `/stores/${handle}/attributes` }
}

test('attributes: kinds, choices renamed and removed, names that would clash with filters refused', async () => {
  const s = await shop()
  const origin = await s.staff.call('POST', s.base, { name: 'উৎস', kind: 'choice', choices: [{ label: 'সুন্দরবন' }, { label: 'রাজশাহী' }] })
  assert.equal(origin.status, 201, 'staff can add')
  assert.deepEqual(origin.json.choices.map((c: any) => c.label), ['সুন্দরবন', 'রাজশাহী'])
  assert.equal((await s.owner.call('POST', s.base, { name: 'উৎস', kind: 'flag' })).json.error, 'attributeTaken')
  assert.equal((await s.owner.call('POST', s.base, { name: 'page', kind: 'flag' })).json.error, 'attributeName')
  assert.equal((await s.owner.call('POST', s.base, { name: 'রং', kind: 'choice', choices: [{ label: 'লাল' }, { label: 'লাল' }] })).json.error, 'attributeChoiceTwice')
  const weight = (await s.owner.call('POST', s.base, { name: 'ওজন', kind: 'number', unit: 'গ্রাম', showOnProduct: true, filterable: false })).json
  assert.equal(weight.unit, 'গ্রাম')
  // Swapping two labels and adding one in the same save works; the kind cannot change.
  const [sb, rj] = origin.json.choices
  const swapped = (await s.owner.call('PUT', `${s.base}/${origin.json.id}`, { name: 'উৎপত্তি', kind: 'number', choices: [{ id: sb.id, label: 'রাজশাহী' }, { id: rj.id, label: 'সুন্দরবন' }, { label: 'যশোর' }] })).json
  assert.equal(swapped.kind, 'choice')
  assert.deepEqual(swapped.choices.map((c: any) => [c.id, c.label]).slice(0, 2), [[sb.id, 'রাজশাহী'], [rj.id, 'সুন্দরবন']])
  const ordered = (await s.owner.call('PUT', `/stores/${s.handle}/attributes-order`, { ids: [weight.id, origin.json.id] })).json
  assert.deepEqual(ordered.map((a: any) => a.name), ['ওজন', 'উৎপত্তি'])
})

test('product values: they must fit the attribute, removing a choice removes it from products, staff cannot delete, other stores see nothing', async () => {
  const s = await shop()
  const origin = (await s.owner.call('POST', s.base, { name: 'উৎস', kind: 'choice', choices: [{ label: 'সুন্দরবন' }, { label: 'রাজশাহী' }] })).json
  const weight = (await s.owner.call('POST', s.base, { name: 'ওজন', kind: 'number', unit: 'গ্রাম' })).json
  const organic = (await s.owner.call('POST', s.base, { name: 'অর্গানিক', kind: 'flag' })).json
  const other = (await s.owner.call('POST', s.base, { name: 'রং', kind: 'choice', choices: [{ label: 'লাল' }] })).json
  const [sb, rj] = origin.choices
  const values = [{ attributeId: origin.id, choiceIds: [sb.id, rj.id] }, { attributeId: weight.id, number: 500.5 }, { attributeId: organic.id, flag: true }]
  const product = (await s.staff.call('POST', `/stores/${s.handle}/products`, { name: 'মধু', variants: [{ options: [], price: 650 }], attributes: values })).json
  assert.deepEqual(product.attributes.find((v: any) => v.attributeId === weight.id).number, 500.5)
  assert.equal(product.attributes.find((v: any) => v.attributeId === origin.id).choiceIds.length, 2)
  const put = (attrs: unknown) => s.owner.call('PUT', `/stores/${s.handle}/products/${product.id}`, { name: 'মধু', variants: [{ id: product.variants[0].id, options: [], price: 650 }], attributes: attrs })
  assert.equal((await put([{ attributeId: origin.id, choiceIds: [other.choices[0].id] }])).status, 400, 'a choice of another attribute')
  assert.equal((await put([{ attributeId: weight.id, flag: true }])).status, 400, 'a value of the wrong kind')
  assert.equal((await put([{ attributeId: weight.id, number: -1 }])).json.error, 'attributeNumber')
  assert.equal((await s.owner.call('PUT', `/stores/${s.handle}/products/${product.id}`, { name: 'মধু', variants: [{ id: product.variants[0].id, options: [], price: 650 }] })).json.attributes.length, 3, 'left out keeps the values')

  await s.owner.call('PUT', `${s.base}/${origin.id}`, { name: 'উৎস', choices: [{ id: sb.id, label: 'সুন্দরবন' }] })
  const listed = (await s.owner.call('GET', s.base)).json
  assert.equal(listed.find((a: any) => a.id === origin.id).products, 1)
  assert.deepEqual((await s.owner.call('GET', `/stores/${s.handle}/products/${product.id}`)).json.attributes.find((v: any) => v.attributeId === origin.id).choiceIds, [sb.id])

  assert.equal((await s.staff.call('DELETE', `${s.base}/${weight.id}`)).status, 403)
  assert.equal((await s.owner.call('DELETE', `${s.base}/${weight.id}`)).status, 204)
  assert.equal((await s.owner.call('GET', `/stores/${s.handle}/products/${product.id}`)).json.attributes.length, 2)

  const outsider = await shop()
  assert.deepEqual((await outsider.owner.call('GET', outsider.base)).json, [])
  assert.equal((await tx(outsider.owner.id, (t) => t.select().from(attributes))).length, 0)
  assert.equal((await tx(outsider.owner.id, (t) => t.select().from(productAttributeValues))).length, 0)
  const theirs = (await outsider.owner.call('POST', `/stores/${outsider.handle}/products`, { name: 'চাল', variants: [{ options: [], price: 500 }], attributes: [{ attributeId: organic.id, flag: true }] }))
  assert.equal(theirs.status, 400, 'another store’s attribute is refused')
})
