export type MediaItem = { id: string; name: string; alt: string; width: number; height: number; sizeBytes: number; sourceFormat: string; createdAt: string; url: string; thumbUrl: string }

export class ApiError extends Error {
  code: string
  constructor(code: string) {
    super(code)
    this.code = code
  }
}

export async function api<T = unknown>(path: string, options: { method?: string; body?: unknown; form?: FormData } = {}): Promise<T> {
  let res: Response
  try {
    res = await fetch(`/api${path}`, {
      method: options.method ?? 'GET',
      headers: options.body === undefined ? undefined : { 'content-type': 'application/json' },
      body: options.form ?? (options.body === undefined ? undefined : JSON.stringify(options.body)),
    })
  } catch {
    throw new ApiError('network')
  }
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new ApiError(data?.error ?? 'server')
  return data as T
}

export const errorCode = (err: unknown) => (err instanceof ApiError ? err.code : 'server')

// Where a store's storefront answers. In development that is the local storefront server on {handle}.localhost:8788.
export const storefrontUrl = (storeHandle: string) => (import.meta.env.DEV ? `http://${storeHandle}.localhost:8788` : `https://${storeHandle}.${import.meta.env.VITE_STOREFRONT_DOMAIN || 'uddokta.live'}`)
