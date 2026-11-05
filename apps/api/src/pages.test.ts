import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import sharp from 'sharp'
import { app } from './app.ts'
import { pool, tx } from './db.ts'
import { pageMedia, pages } from './schema.ts'

before(async () => {
  await pool.query('drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public')
  await migrate(drizzle(pool), { migrationsFolder: new URL('../migrations', import.meta.url).pathname })
})
after(() => pool.end())

function client() {
  let cookie = ''
  return async (method: string, path: string, body?: unknown) => {
    const isForm = body instanceof FormData
    const res = await app.request(`/api${path}`, {
      method,
      headers: isForm ? { cookie, host: 'shop.test', origin: 'https://shop.test' } : { 'content-type': 'application/json', cookie },
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    })
    const set = res.headers.get('set-cookie')
    if (set) cookie = set.split(';')[0]
    return { status: res.status, json: await res.json() as any }
  }
}

let count = 0
async function storeOwner() {
  const call = client()
  const n = ++count
  await call('POST', '/auth/signup', { name: 'Owner', email: `pg${n}@example.com`, password: 'correct horse' })
  const handle = `page-${n}`
  const store = await call('POST', '/stores', { name: 'Shop', handle })
  return { call, handle, storeId: store.json.id as string, base: `/stores/${handle}/pages` }
}
type Owner = Awaited<ReturnType<typeof storeOwner>>

async function upload(owner: Owner) {
  const png = await sharp({ create: { width: 20, height: 20, channels: 3, background: '#2a7' } }).png().toBuffer()
  const form = new FormData()
  form.set('file', new File([png as BlobPart], 'a.png', { type: 'image/png' }))
  return (await owner.call('POST', `/stores/${owner.handle}/media`, form)).json
}

const save = (owner: Owner, page: any, changes: any = {}) =>
  owner.call('PUT', `${owner.base}/${page.id}`, { title: page.title, handle: page.handle, seoTitle: '', seoDescription: '', draft: page.draft, revision: page.revision, ...changes })

const storefrontPage = async (storeHandle: string, pageHandle: string) =>
  (await tx(null, (t) => t.execute(sql`select * from storefront_page(${storeHandle}, ${pageHandle})`))).rows[0] as any

test('a new page starts with a landing page layout, and only publishing puts it on the storefront', async () => {
  const owner = await storeOwner()
  const made = await owner.call('POST', owner.base, { title: 'ঈদ অফার' })
  assert.equal(made.status, 201)
  assert.equal(made.json.handle, 'ঈদ-অফার')
  assert.deepEqual(made.json.draft.sections.map((s: any) => s.type), ['hero', 'features', 'video', 'reviews', 'faq', 'order', 'contact'])
  assert.equal(made.json.isPublished, false)
  assert.equal(await storefrontPage(owner.handle, 'ঈদ-অফার'), undefined, 'a draft is never public')

  const published = await owner.call('POST', `${owner.base}/${made.json.id}/publish`, { revision: made.json.revision })
  assert.equal(published.json.isPublished, true)
  assert.equal((await storefrontPage(owner.handle, 'ঈদ-অফার')).content.sections.length, 7)

  const draft = { version: 1, sections: [made.json.draft.sections[0]] }
  const saved = await save(owner, published.json, { draft })
  assert.equal(saved.status, 200)
  assert.equal(saved.json.hasChanges, true)
  assert.equal((await storefrontPage(owner.handle, 'ঈদ-অফার')).content.sections.length, 7, 'the storefront keeps the published version until the next publish')

  await owner.call('POST', `${owner.base}/${made.json.id}/unpublish`)
  assert.equal(await storefrontPage(owner.handle, 'ঈদ-অফার'), undefined)
  assert.equal((await owner.call('GET', owner.base)).json[0].isPublished, false)
})

test('a stale save is refused instead of overwriting someone else’s', async () => {
  const owner = await storeOwner()
  const page = (await owner.call('POST', owner.base, { title: 'P' })).json
  assert.equal((await save(owner, page, { title: 'First' })).status, 200)
  const second = await save(owner, page, { title: 'Second' })
  assert.equal(second.status, 409)
  assert.equal(second.json.error, 'pageChanged')
})

test('content that does not match the section schema is refused', async () => {
  const owner = await storeOwner()
  const page = (await owner.call('POST', owner.base, { title: 'P' })).json
  const hero = page.draft.sections[0]
  const bad = [
    { version: 2, sections: [] },
    { version: 1, sections: [{ ...hero, type: 'script' }] },
    { version: 1, sections: [hero, hero] },
    { version: 1, sections: [{ ...hero, settings: { ...hero.settings, heading: 'x'.repeat(500) } }] },
    { version: 1, sections: [{ ...hero, settings: { ...hero.settings, image: 'not-an-id' } }] },
    { version: 1, sections: [{ id: 'v', type: 'video', hidden: false, settings: { heading: '', url: 'javascript:alert(1)' } }] },
    { version: 1, sections: [{ id: 'o', type: 'order', hidden: false, settings: { product: 'x' } }] },
  ]
  for (const draft of bad) assert.equal((await save(owner, page, { draft })).status, 400, JSON.stringify(draft).slice(0, 80))
  const dropped = await save(owner, page, { draft: { version: 1, sections: [{ ...hero, settings: { ...hero.settings, onclick: 'x' } }] } })
  assert.equal(dropped.status, 200)
  assert.equal(dropped.json.draft.sections[0].settings.onclick, undefined, 'unknown keys are dropped')
})

test('an image used by a page cannot be deleted, and shows where it is used', async () => {
  const owner = await storeOwner()
  const image = await upload(owner)
  const page = (await owner.call('POST', owner.base, { title: 'P' })).json
  const [hero, ...rest] = page.draft.sections
  const saved = await save(owner, page, { draft: { version: 1, sections: [{ ...hero, settings: { ...hero.settings, image: image.id } }, ...rest] } })
  assert.equal(saved.json.media[image.id].id, image.id)
  const usage = await owner.call('GET', `/stores/${owner.handle}/media/${image.id}/usage`)
  assert.deepEqual(usage.json.pages, [{ id: page.id, name: 'P' }])
  const refused = await owner.call('DELETE', `/stores/${owner.handle}/media/${image.id}`)
  assert.equal(refused.status, 409)
  assert.equal(refused.json.error, 'mediaInUse')

  await save(owner, saved.json, { draft: { version: 1, sections: rest } })
  assert.equal((await owner.call('DELETE', `/stores/${owner.handle}/media/${image.id}`)).status, 200, 'free again once the page stops using it')
})

test('staff can make and publish pages but not delete them', async () => {
  const owner = await storeOwner()
  const invite = await owner.call('POST', `/stores/${owner.handle}/invites`, { role: 'staff' })
  const staff = client()
  await staff('POST', '/auth/signup', { name: 'Staff', email: `pgstaff${++count}@example.com`, password: 'correct horse' })
  await staff('POST', `/invites/${invite.json.token}/accept`)
  const made = await staff('POST', owner.base, { title: 'S' })
  assert.equal(made.status, 201)
  assert.equal((await staff('POST', `${owner.base}/${made.json.id}/publish`, { revision: made.json.revision })).status, 200)
  assert.equal((await staff('DELETE', `${owner.base}/${made.json.id}`)).status, 403)
  assert.equal((await owner.call('DELETE', `${owner.base}/${made.json.id}`)).status, 200)
})

test('one store cannot reach another store’s pages, images or products', async () => {
  const a = await storeOwner()
  const b = await storeOwner()
  const theirs = (await b.call('POST', b.base, { title: 'B' })).json
  const theirImage = await upload(b)
  const theirProduct = (await b.call('POST', `/stores/${b.handle}/products`, { name: 'P', variants: [{ options: [], price: 100 }] })).json
  assert.equal((await a.call('GET', b.base)).status, 404)
  assert.equal((await a.call('GET', `${a.base}/${theirs.id}`)).status, 404)
  assert.equal((await save(a, theirs)).status, 404)
  assert.equal((await a.call('POST', `${a.base}/${theirs.id}/publish`, { revision: theirs.revision })).status, 404)
  assert.equal((await a.call('DELETE', `${a.base}/${theirs.id}`)).status, 403)

  const mine = (await a.call('POST', a.base, { title: 'A' })).json
  const [hero, ...rest] = mine.draft.sections
  assert.equal((await save(a, mine, { draft: { version: 1, sections: [{ ...hero, settings: { ...hero.settings, image: theirImage.id } }] } })).status, 400)
  const order = rest.find((s: any) => s.type === 'order')
  assert.equal((await save(a, mine, { draft: { version: 1, sections: [{ ...order, settings: { ...order.settings, product: theirProduct.id } }] } })).status, 400)

  const me = await a.call('GET', '/me')
  await tx(me.json.user.id, async (t) => {
    assert.deepEqual((await t.select().from(pages)).map((p) => p.id), [mine.id])
    assert.deepEqual(await t.select().from(pageMedia), [])
  })
  await assert.rejects(
    tx(me.json.user.id, (t) => t.insert(pages).values({ storeId: b.storeId, title: 'x', handle: 'x', draft: {} })),
    'the database refuses writing into another store',
  )
})

test('publishing checks the exact revision and invalidates older editor copies', async () => {
  const owner = await storeOwner()
  const page = (await owner.call('POST', owner.base, { title: 'Campaign' })).json
  const saved = (await save(owner, page, { title: 'Updated campaign' })).json
  const url = `${owner.base}/${page.id}/publish`
  assert.equal((await owner.call('POST', url, { revision: page.revision })).status, 409)
  assert.equal(await storefrontPage(owner.handle, page.handle), undefined)
  const published = await owner.call('POST', url, { revision: saved.revision })
  assert.equal(published.status, 200)
  assert.equal(published.json.revision, saved.revision + 1)
  assert.equal((await owner.call('POST', url, { revision: saved.revision })).status, 409)
  assert.equal((await save(owner, saved)).status, 409)
  assert.equal((await owner.call('POST', url)).status, 400)
})

test('draft metadata stays private until publish and live addresses remain reserved', async () => {
  const owner = await storeOwner()
  const original = (await owner.call('POST', owner.base, { title: 'Original', seoTitle: 'Live SEO', seoDescription: 'Live description' })).json
  const live = (await owner.call('POST', `${owner.base}/${original.id}/publish`, { revision: original.revision })).json
  const saved = (await save(owner, live, { title: 'New title', handle: 'new-url', seoTitle: 'Draft SEO', seoDescription: 'Draft description' })).json
  assert.equal(saved.hasChanges, true)
  assert.equal(saved.publishedHandle, original.handle)
  const publicPage = await storefrontPage(owner.handle, original.handle)
  assert.equal(publicPage.title, 'Original')
  assert.equal(publicPage.seo_title, 'Live SEO')
  assert.equal(publicPage.seo_description, 'Live description')
  assert.equal(await storefrontPage(owner.handle, 'new-url'), undefined)
  assert.equal((await owner.call('GET', owner.base)).json[0].hasChanges, true)
  assert.equal((await owner.call('POST', owner.base, { title: 'Other', handle: original.handle })).status, 409)
  const other = (await owner.call('POST', owner.base, { title: 'Other' })).json
  assert.equal((await save(owner, other, { handle: original.handle })).status, 409)
  const published = (await owner.call('POST', `${owner.base}/${original.id}/publish`, { revision: saved.revision })).json
  assert.equal(published.hasChanges, false)
  assert.equal(published.publishedHandle, 'new-url')
  assert.equal((await storefrontPage(owner.handle, 'new-url')).seo_title, 'Draft SEO')
  assert.equal(await storefrontPage(owner.handle, original.handle), undefined)
  assert.equal((await owner.call('POST', owner.base, { title: 'Reuse', handle: original.handle })).status, 201)
})

test('public metadata and live address reservations are isolated by store', async () => {
  const a = await storeOwner()
  const b = await storeOwner()
  for (const owner of [a, b]) {
    const page = (await owner.call('POST', owner.base, { title: 'Same', handle: 'campaign' })).json
    assert.equal((await owner.call('POST', `${owner.base}/${page.id}/publish`, { revision: page.revision })).status, 200)
  }
  assert.notEqual((await storefrontPage(a.handle, 'campaign')).store_id, (await storefrontPage(b.handle, 'campaign')).store_id)
})

test('campaign handles cannot take system paths, while generated handles avoid them', async () => {
  const owner = await storeOwner()
  for (const handle of ['products', 'collections', 'api', 'checkout', 'pages', 'thanks']) {
    const result = await owner.call('POST', owner.base, { title: 'Campaign', handle })
    assert.equal(result.status, 409)
    assert.equal(result.json.error, 'pageHandleReserved')
  }
  const generated = await owner.call('POST', owner.base, { title: 'Products' })
  assert.equal(generated.json.handle, 'products-2')
})

test('blank canvas, new section styles and links survive save/reload and stay private until publish', async () => {
  const owner = await storeOwner()
  const made = await owner.call('POST', owner.base, { title: 'Canvas', blank: true })
  assert.equal(made.status, 201)
  assert.deepEqual(made.json.draft, { version: 1, sections: [], canvas: { header: false, footer: false } })
  const draft = { ...made.json.draft, sections: [{ id: 'story', type: 'imageText', hidden: false, settings: { heading: 'Our story', text: 'Origin', image: null, layout: 'reverse', button: 'Details', link: '#details' }, style: { background: '#123456', paddingTop: 0, paddingLeft: 16, paddingRight: 24, mobilePaddingLeft: 8, marginRight: 12, headingSize: 48, mobileHeadingSize: 28, borderWidth: 2, radius: 16 } }] }
  const saved = await save(owner, made.json, { draft })
  assert.equal(saved.status, 200)
  assert.deepEqual(saved.json.draft, draft)
  assert.deepEqual((await owner.call('GET', `${owner.base}/${made.json.id}`)).json.draft, draft)
  assert.equal(await storefrontPage(owner.handle, made.json.handle), undefined)
  const published = await owner.call('POST', `${owner.base}/${made.json.id}/publish`, { revision: saved.json.revision })
  assert.equal(published.status, 200)
  assert.deepEqual((await storefrontPage(owner.handle, made.json.handle)).content, draft)
  const changed = structuredClone(draft)
  changed.sections[0].style.background = '#654321'
  const next = await save(owner, published.json, { draft: changed })
  assert.equal(next.status, 200)
  assert.equal((await storefrontPage(owner.handle, made.json.handle)).content.sections[0].style.background, '#123456')
  changed.sections[0].style.background = 'url(https://evil.test/image)'
  assert.equal((await save(owner, next.json, { draft: changed })).status, 400)
})

test('new card sections enforce store ownership for nested images', async () => {
  const owner = await storeOwner()
  const other = await storeOwner()
  const image = await upload(other)
  const page = (await owner.call('POST', owner.base, { title: 'Cards', blank: true })).json
  const draft = { ...page.draft, sections: [{ id: 'bundle', type: 'cards', hidden: false, settings: { heading: 'Included', items: [{ title: 'Item', text: 'Details', image: image.id }] } }] }
  assert.equal((await save(owner, page, { draft })).status, 400)
})
