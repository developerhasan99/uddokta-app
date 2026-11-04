import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createAdmin } from './admin.ts'
import { pool } from './db.ts'

after(() => pool.end())
test('production serves SPA deep links, caches assets, and never turns API errors into HTML', async () => {
  const root = await mkdtemp(join(tmpdir(), 'uddokta-admin-'))
  try {
    await mkdir(join(root, 'assets'))
    await writeFile(join(root, 'index.html'), '<!doctype html><title>Dashboard</title>')
    await writeFile(join(root, 'assets', 'app-hash.js'), 'export {}')
    const app = createAdmin({ production: true, root, ready: async () => {} })
    for (const path of ['/', '/store/book-shop/landing-pages/page-id']) {
      const res = await app.request(path)
      assert.equal(res.status, 200)
      assert.match(await res.text(), /Dashboard/)
      assert.equal(res.headers.get('cache-control'), 'no-cache')
    }
    const asset = await app.request('/assets/app-hash.js')
    assert.match(asset.headers.get('cache-control')!, /immutable/)
    assert.equal((await app.request('/assets/missing.js')).status, 404)
    const api = await app.request('/api/missing')
    assert.match(api.headers.get('content-type')!, /json/)
    assert.notEqual(api.status, 200)
    assert.equal((await app.request('/_health')).status, 200)
    assert.equal((await createAdmin({ ready: async () => { throw new Error('offline') } }).request('/_health')).status, 503)
  } finally { await rm(root, { recursive: true, force: true }) }
})
