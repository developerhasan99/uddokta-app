import { createHash, randomBytes } from 'node:crypto'
import { HTTPException } from 'hono/http-exception'
import type { ContentfulStatusCode } from 'hono/utils/http-status'

// Small helpers shared by the API and the console service. Kept apart from app.ts so the console can use them
// without loading the whole seller API (media storage, couriers and the rest).

export const hash = (token: string) => createHash('sha256').update(token).digest('hex')
export const newToken = () => randomBytes(32).toString('base64url')

export const fail = (status: ContentfulStatusCode, error: string) =>
  new HTTPException(status, { res: Response.json({ error }, { status }) })

export function databaseCode(err: unknown) {
  const e = err as { code?: string; cause?: { code?: string } }
  return e.cause?.code ?? e.code
}
