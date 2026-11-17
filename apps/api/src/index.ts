import { serve } from '@hono/node-server'
import { existsSync } from 'node:fs'
import { createAdmin, dashboardRoot } from './admin.ts'
import { kickOutbox } from './email.ts'
import { validateRuntime } from './runtime.ts'

validateRuntime('api')
const production = process.env.NODE_ENV === 'production'
if (production && !existsSync(`${dashboardRoot}/index.html`)) throw new Error('Dashboard build missing: run npm run build')
const app = createAdmin({ production })
const port = Number(process.env.PORT ?? 8787)
serve({ fetch: app.fetch, hostname: '0.0.0.0', port }, () => console.log(`Admin/API listening on port ${port}`))
// Emails that failed to send are retried, and any left by a restart are picked up.
setInterval(kickOutbox, 60_000)
kickOutbox()
