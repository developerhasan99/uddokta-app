import { serve } from '@hono/node-server'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createConsole } from './app.ts'

const production = process.env.NODE_ENV === 'production'
if (production && !process.env.DATABASE_URL) throw new Error('Missing required environment variable: DATABASE_URL')
if (production && !existsSync(fileURLToPath(new URL('../dist/index.html', import.meta.url)))) throw new Error('Console build missing: run npm run build')
const port = Number(process.env.PORT ?? 8789)
serve({ fetch: createConsole({ production }).fetch, hostname: '0.0.0.0', port }, () => console.log(`Console listening on port ${port}`))
