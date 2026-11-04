import { Hono } from 'hono'
import { serveStatic } from '@hono/node-server/serve-static'
import { fileURLToPath } from 'node:url'
import { sql } from 'drizzle-orm'
import { app as api } from './app.ts'
import { tx } from './db.ts'

export const dashboardRoot = fileURLToPath(new URL('../../dashboard/dist/', import.meta.url))
export function createAdmin(options: { production?: boolean; root?: string; ready?: () => Promise<unknown> } = {}) {
  const app = new Hono()
  const ready = options.ready ?? (() => tx(null, (t) => t.execute(sql`select 1`)))
  app.get('/_health', async (c) => {
    c.header('Cache-Control', 'no-store')
    try { await ready(); return c.json({ status: 'ok' }) }
    catch { return c.json({ status: 'unavailable' }, 503) }
  })
  app.route('/', api)
  app.all('/api', (c) => c.json({ error: 'notFound' }, 404))
  app.all('/api/*', (c) => c.json({ error: 'notFound' }, 404))
  if (options.production) {
    const root = options.root ?? dashboardRoot
    app.use('/assets/*', async (c, next) => { await next(); if (c.res.status === 200) c.header('Cache-Control', 'public, max-age=31536000, immutable') })
    app.use('*', async (c, next) => { await next(); if (c.res.headers.get('content-type')?.includes('text/html')) c.header('Cache-Control', 'no-cache') })
    app.use('*', serveStatic({ root }))
    app.get('*', async (c, next) => {
      if (c.req.path.includes('.') || c.req.path.startsWith('/assets/')) return c.notFound()
      c.header('Cache-Control', 'no-cache')
      return serveStatic({ root, path: 'index.html' })(c, next)
    })
  }
  return app
}
