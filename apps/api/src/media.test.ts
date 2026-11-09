import assert from 'node:assert/strict'
import { readdir } from 'node:fs/promises'
import { after, before, test } from 'node:test'
import { createServer } from 'node:http'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import sharp from 'sharp'
import { app } from './app.ts'
import { pool } from './db.ts'
import { storeLimitBytes } from './media.ts'
import { media } from './schema.ts'
import { tx } from './db.ts'

before(async () => {
  await pool.query('drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public')
  await migrate(drizzle(pool), { migrationsFolder: new URL('../migrations', import.meta.url).pathname })
})
after(() => pool.end())

function client() {
  let cookie = ''
  return async (method: string, path: string, body?: unknown) => {
    const form = body instanceof FormData
    const res = await app.request(`/api${path}`, {
      method,
      headers: form ? { cookie, host: 'shop.test', origin: 'https://shop.test' } : { 'content-type': 'application/json', cookie },
      body: body === undefined ? undefined : form ? body : JSON.stringify(body),
    })
    const set = res.headers.get('set-cookie')
    if (set) cookie = set.split(';')[0]
    const isJson = res.headers.get('content-type')?.includes('json')
    return { status: res.status, headers: res.headers, json: (isJson ? await res.json() : null) as any, bytes: isJson ? null : Buffer.from(await res.arrayBuffer()) }
  }
}

let count = 0
async function storeOwner() {
  const call = client()
  const n = ++count
  await call('POST', '/auth/signup', { name: 'Owner', email: `m${n}@example.com`, password: 'correct horse' })
  const handle = `media-${n}`
  const store = await call('POST', '/stores', { name: 'Shop', handle })
  return { call, handle, storeId: store.json.id as string }
}

const png = (width = 3000, height = 1500) => sharp({ create: { width, height, channels: 3, background: '#2a7' } }).png().toBuffer()
const form = (data: Buffer | string, name = 'photo.png', type = 'image/png') => {
  const f = new FormData()
  f.set('file', new File([data as BlobPart], name, { type }))
  return f
}

test('an upload is resized, converted and given a thumbnail', async () => {
  const { call, handle } = await storeOwner()
  const up = await call('POST', `/stores/${handle}/media`, form(await png()))
  assert.equal(up.status, 201)
  assert.equal(up.json.name, 'photo.png')
  assert.equal(up.json.sourceFormat, 'png')
  assert.deepEqual([up.json.width, up.json.height], [2000, 1000])

  const anon = client()
  const file = await anon('GET', up.json.url.replace('/api', ''))
  assert.equal(file.status, 200)
  const meta = await sharp(file.bytes!).metadata()
  assert.equal(meta.format, 'webp')
  assert.equal(meta.width, 2000)
  const thumb = await sharp((await anon('GET', up.json.thumbUrl.replace('/api', ''))).bytes!).metadata()
  assert.equal(thumb.width, 480)

  const list = await call('GET', `/stores/${handle}/media`)
  assert.equal(list.json.items.length, 1)
  assert.equal(list.json.usedBytes, up.json.sizeBytes)
})

test('the list filters by original file type and counts each type', async () => {
  const { call, handle } = await storeOwner()
  await call('POST', `/stores/${handle}/media`, form(await png(40, 40)))
  await call('POST', `/stores/${handle}/media`, form(await sharp({ create: { width: 40, height: 40, channels: 3, background: '#a72' } }).jpeg().toBuffer(), 'shot.jpg', 'image/jpeg'))
  const pngs = await call('GET', `/stores/${handle}/media?format=png`)
  assert.deepEqual(pngs.json.items.map((i: any) => i.sourceFormat), ['png'])
  assert.deepEqual(pngs.json.formats, { png: 1, jpeg: 1 })
  assert.equal((await call('GET', `/stores/${handle}/media?format=x'y`)).status, 400)
})

test('metadata such as GPS location is removed', async () => {
  const { call, handle } = await storeOwner()
  const withExif = await sharp({ create: { width: 100, height: 100, channels: 3, background: '#000' } })
    .jpeg().withExif({ IFD3: { GPSLatitude: '23/1 45/1 0/1' } }).toBuffer()
  assert.ok((await sharp(withExif).metadata()).exif)
  const up = await call('POST', `/stores/${handle}/media`, form(withExif, 'a.jpg', 'image/jpeg'))
  assert.equal(up.json.sourceFormat, 'jpeg')
  const stored = await client()('GET', up.json.url.replace('/api', ''))
  assert.equal((await sharp(stored.bytes!).metadata()).exif, undefined)
})

test('non-images are rejected even when they claim to be images', async () => {
  const { call, handle } = await storeOwner()
  const fake = await call('POST', `/stores/${handle}/media`, form('<script>alert(1)</script>', 'evil.png'))
  assert.equal(fake.json.error, 'fileNotImage')
  const svg = await call('POST', `/stores/${handle}/media`, form('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>', 'a.svg', 'image/svg+xml'))
  assert.equal(svg.json.error, 'fileNotImage')
})

test('files over 10 MB are rejected', async () => {
  const { call, handle } = await storeOwner()
  const res = await call('POST', `/stores/${handle}/media`, form(Buffer.alloc(11 * 1024 * 1024)))
  assert.equal(res.status, 413)
  assert.equal(res.json.error, 'fileTooLarge')
})

test('a store over its limit cannot upload, and leaves no file behind', async () => {
  const { call, handle, storeId } = await storeOwner()
  await pool.query(`insert into media (store_id, name, key, thumb_key, width, height, size_bytes) values ($1, 'big', $2, $3, 1, 1, $4)`,
    [storeId, `${storeId}/big`, `${storeId}/big-thumb`, storeLimitBytes])
  const res = await call('POST', `/stores/${handle}/media`, form(await png(50, 50)))
  assert.equal(res.json.error, 'storageFull')
  assert.deepEqual(await readdir(`/tmp/uddokta-test-media/${storeId}`).catch(() => []), [])
})

test('alt text can be edited, and deleting removes the files', async () => {
  const { call, handle } = await storeOwner()
  const up = await call('POST', `/stores/${handle}/media`, form(await png(50, 50)))
  const edited = await call('PATCH', `/stores/${handle}/media/${up.json.id}`, { alt: ' Green box ' })
  assert.equal(edited.json.alt, 'Green box')
  assert.equal((await call('DELETE', `/stores/${handle}/media/${up.json.id}`)).status, 200)
  assert.equal((await client()('GET', up.json.url.replace('/api', ''))).status, 404)
  assert.equal((await call('GET', `/stores/${handle}/media`)).json.items.length, 0)
})

test('staff can upload but not delete', async () => {
  const { call, handle } = await storeOwner()
  const invite = await call('POST', `/stores/${handle}/invites`, { role: 'staff' })
  const staff = client()
  await staff('POST', '/auth/signup', { name: 'Staff', email: `s${++count}@example.com`, password: 'correct horse' })
  await staff('POST', `/invites/${invite.json.token}/accept`)
  const up = await staff('POST', `/stores/${handle}/media`, form(await png(50, 50)))
  assert.equal(up.status, 201)
  assert.equal((await staff('DELETE', `/stores/${handle}/media/${up.json.id}`)).status, 403)
})

test('one store cannot see, change or delete another store’s media', async () => {
  const a = await storeOwner()
  const b = await storeOwner()
  const up = await b.call('POST', `/stores/${b.handle}/media`, form(await png(50, 50)))
  assert.equal((await a.call('GET', `/stores/${b.handle}/media`)).status, 404)
  assert.equal((await a.call('POST', `/stores/${b.handle}/media`, form(await png(50, 50)))).status, 404)
  assert.equal((await a.call('PATCH', `/stores/${a.handle}/media/${up.json.id}`, { alt: 'x' })).status, 404)
  assert.equal((await a.call('DELETE', `/stores/${a.handle}/media/${up.json.id}`)).status, 403)
  const me = await a.call('GET', '/me')
  await tx(me.json.user.id, async (t) => assert.deepEqual(await t.select().from(media), []))
})

test('uploads posted from another website are refused', async () => {
  const { handle } = await storeOwner()
  const res = await app.request(`/api/stores/${handle}/media`, { method: 'POST', headers: { host: 'shop.test', origin: 'https://evil.test' }, body: form(await png(50, 50)) })
  assert.equal(res.status, 403)
})

test('cropping saves a new image and keeps the original', async () => {
  const { call, handle } = await storeOwner()
  const up = await call('POST', `/stores/${handle}/media`, form(await png(1000, 800)))
  const crop = await call('POST', `/stores/${handle}/media/${up.json.id}/crop`, { x: 100, y: 50, width: 400, height: 300 })
  assert.equal(crop.status, 201)
  assert.equal(crop.json.name, 'photo-cropped.webp')
  assert.equal(crop.json.sourceFormat, 'webp')
  assert.deepEqual([crop.json.width, crop.json.height], [400, 300])
  const stored = await client()('GET', crop.json.url.replace('/api', ''))
  const meta = await sharp(stored.bytes!).metadata()
  assert.deepEqual([meta.width, meta.height], [400, 300])
  assert.equal((await client()('GET', up.json.url.replace('/api', ''))).status, 200)
  assert.equal((await call('GET', `/stores/${handle}/media`)).json.items.length, 2)
})

test('a crop must stay inside the image and belong to the store', async () => {
  const a = await storeOwner()
  const b = await storeOwner()
  const up = await a.call('POST', `/stores/${a.handle}/media`, form(await png(100, 100)))
  const url = `/stores/${a.handle}/media/${up.json.id}/crop`
  for (const bad of [{ x: 50, y: 0, width: 51, height: 10 }, { x: -1, y: 0, width: 10, height: 10 }, { x: 0, y: 0, width: 0, height: 10 }, { x: 0.5, y: 0, width: 10, height: 10 }, {}]) {
    assert.equal((await a.call('POST', url, bad)).status, 400, JSON.stringify(bad))
  }
  assert.equal((await b.call('POST', url, { x: 0, y: 0, width: 10, height: 10 })).status, 404)
  assert.equal((await b.call('POST', `/stores/${b.handle}/media/${up.json.id}/crop`, { x: 0, y: 0, width: 10, height: 10 })).status, 404)
})

test('search matches name and description, inside one store only', async () => {
  const { call, handle } = await storeOwner()
  const other = await storeOwner()
  await other.call('POST', `/stores/${other.handle}/media`, form(await png(20, 20), 'red-bag.png'))
  const bag = await call('POST', `/stores/${handle}/media`, form(await png(20, 20), 'Red-Bag.png'))
  const shoe = await call('POST', `/stores/${handle}/media`, form(await png(20, 20), 'shoe_100%.png'))
  await call('PATCH', `/stores/${handle}/media/${shoe.json.id}`, { alt: 'লাল জুতা' })
  const search = async (q: string) => (await call('GET', `/stores/${handle}/media?q=${encodeURIComponent(q)}`)).json
  assert.deepEqual((await search('red')).items.map((i: any) => i.id), [bag.json.id])
  assert.deepEqual((await search('জুতা')).items.map((i: any) => i.id), [shoe.json.id])
  assert.deepEqual((await search('100%')).items.map((i: any) => i.id), [shoe.json.id])
  assert.deepEqual((await search('%')).items.map((i: any) => i.id), [shoe.json.id])
  assert.equal((await search('nothing')).items.length, 0)
  const used = await search('red')
  assert.equal(used.usedBytes, bag.json.sizeBytes + shoe.json.sizeBytes, 'storage counts the whole store')
})

test('crafted file paths cannot read outside the media folder', async () => {
  const res = await client()('GET', '/media-files/..%2F..%2F/package.json')
  assert.equal(res.status, 404)
})

test('production storage sends signed requests to R2', async () => {
  const seen: { method: string; url: string; auth: string; type: string }[] = []
  const server = createServer((req, res) => {
    seen.push({ method: req.method!, url: req.url!, auth: req.headers.authorization ?? '', type: req.headers['content-type'] ?? '' })
    req.resume().on('end', () => { res.statusCode = 200; res.end() })
  })
  await new Promise<void>((r) => server.listen(0, r))
  const { port } = server.address() as { port: number }
  Object.assign(process.env, { R2_BUCKET: 'bucket', R2_ACCESS_KEY_ID: 'id', R2_SECRET_ACCESS_KEY: 'secret', R2_ENDPOINT: `http://localhost:${port}`, MEDIA_PUBLIC_URL: 'https://media.test' })
  const storage = await import(`./storage.ts?r2=${Date.now()}`)
  await storage.putFile('a/b.webp', Buffer.from('x'))
  await storage.getFile('a/b.webp')
  await storage.deleteFile('a/b.webp')
  server.close()
  assert.equal(storage.publicUrl('a/b.webp'), 'https://media.test/a/b.webp')
  assert.deepEqual(seen.map((s) => [s.method, s.url]), [['PUT', '/bucket/a/b.webp'], ['GET', '/bucket/a/b.webp'], ['DELETE', '/bucket/a/b.webp']])
  assert.match(seen[0].auth, /^AWS4-HMAC-SHA256/)
  assert.equal(seen[0].type, 'image/webp')
})

test('a store logo and favicon must be the store’s own images and cannot be deleted while set', async () => {
  const owner = await storeOwner()
  const other = await storeOwner()
  const logo = (await owner.call('POST', `/stores/${owner.handle}/media`, form(await png(40, 40)))).json
  const foreign = (await other.call('POST', `/stores/${other.handle}/media`, form(await png(40, 40)))).json
  const settings = `/stores/${owner.handle}/settings`
  assert.equal((await owner.call('PUT', settings, { name: 'Shop', logoId: foreign.id })).status, 400)
  assert.equal((await owner.call('PUT', settings, { name: 'Shop', logoId: logo.id })).json.logo.id, logo.id)
  assert.equal((await owner.call('GET', `/stores/${owner.handle}/media/${logo.id}/usage`)).json.logo, true)
  assert.deepEqual(await owner.call('DELETE', `/stores/${owner.handle}/media/${logo.id}`).then((r) => [r.status, r.json.error]), [409, 'mediaInUse'])
  assert.equal((await owner.call('PUT', settings, { name: 'Shop', logoId: null })).json.logo, null)
  assert.equal((await owner.call('DELETE', `/stores/${owner.handle}/media/${logo.id}`)).status, 200)

  const icon = (await owner.call('POST', `/stores/${owner.handle}/media`, form(await png(64, 64)))).json
  assert.equal((await owner.call('PUT', settings, { faviconId: foreign.id })).status, 400)
  assert.equal((await owner.call('PUT', settings, { faviconId: icon.id })).json.favicon.id, icon.id)
  assert.deepEqual(await owner.call('GET', `/stores/${owner.handle}/media/${icon.id}/usage`).then((r) => [r.json.favicon, r.json.logo]), [true, false])
  assert.equal((await owner.call('DELETE', `/stores/${owner.handle}/media/${icon.id}`)).json.error, 'mediaInUse')
})
