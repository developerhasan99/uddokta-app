import { sql } from 'drizzle-orm'
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import pg from 'pg'

export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
const db = drizzle(pool)

export type Tx = Parameters<Parameters<NodePgDatabase['transaction']>[0]>[0]

// The only way queries run: as the restricted role, scoped to one user, for one transaction.
// Both settings are transaction-local, so they cannot leak to the next request on a pooled connection.
export function tx<T>(userId: string | null, work: (t: Tx) => Promise<T>) {
  return db.transaction(async (t) => {
    await t.execute(sql`set local role uddokta_app`)
    await t.execute(sql`select set_config('app.user_id', ${userId ?? ''}, true)`)
    return work(t)
  })
}

export async function one<T extends Record<string, unknown>>(t: Tx, query: ReturnType<typeof sql>) {
  const result = await t.execute(query)
  return result.rows[0] as T | undefined
}
