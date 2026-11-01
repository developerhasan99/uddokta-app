import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { pool } from './db.ts'

await migrate(drizzle(pool), { migrationsFolder: new URL('../migrations', import.meta.url).pathname })
await pool.end()
console.log('Migrations applied')
