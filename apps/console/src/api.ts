export class ApiError extends Error {
  constructor(public code: string) { super(code) }
}

export async function api<T = unknown>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response
  try {
    res = await fetch(`/api${path}`, {
      method: options.method ?? 'GET',
      headers: options.body === undefined || options.body instanceof FormData ? undefined : { 'content-type': 'application/json' },
      body: options.body === undefined ? undefined : options.body instanceof FormData ? options.body : JSON.stringify(options.body),
    })
  } catch {
    throw new ApiError('network')
  }
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    // An expired console sign-in sends the whole app back to the sign-in screen.
    if (data?.error === 'consoleSignIn') window.dispatchEvent(new Event('console-signed-out'))
    throw new ApiError(data?.error ?? 'server')
  }
  return data as T
}

const messages: Record<string, string> = {
  network: 'Could not reach the server. Check the connection and try again.',
  invalidCredentials: 'Email or password is not right.',
  tooManyAttempts: 'Too many wrong attempts. Try again in 15 minutes.',
  reasonRequired: 'Write a reason. It is kept in the audit log.',
  cannotSuspendSelf: 'You cannot suspend your own account.',
  planDefaultRequired: 'One plan must stay the default. Make another plan the default first.',
  planNameTaken: 'A plan with this name already exists.',
  planHasStores: 'Stores are still set to this plan. Move them to another plan first.',
  planHasPayments: 'Payments were recorded on this plan, so it stays in their history. Archive it instead.',
  planInvalid: 'Check the plan: limits must be whole numbers, storage at least 1 MB, and the default plan cannot be archived.',
  nameRequired: 'Give it a name.',
  emailUnavailable: 'Email sending is not set up yet (SES keys and APP_URL on the API service).',
  tooManyEmails: 'Three reset links were already sent in the last hour.',
  notFound: 'Not found. It may have been deleted.',
  userNotFound: 'No account uses this email. Ask the person to sign up first.',
  alreadyMember: 'This person is already on the store’s team.',
  invalidRequest: 'Some values are not valid.',
  storeNotScheduled: 'The owner has not asked to delete this store. Only stores in their 30 days can be deleted from here.',
  storeNotFound: 'No store has that address. Use the part before .uddokta.live.',
  demoPreviewUrl: 'The preview link must start with https://',
  demoInvalid: 'That draft cannot be used: open it in the page builder, fix any warnings and save it again.',
  demoEmpty: 'That draft has no sections yet. Design it first, then save.',
  demoStoreBlocks: 'This section uses store-only blocks (product grid, cart, …), so it would not work on landing pages. Pick another section.',
  fileNotImage: 'That file is not an image. Use a PNG, JPG or WebP screenshot.',
  fileTooLarge: 'That image is larger than 10 MB.',
  demoDefaultLocked: 'New stores get this template, so it stays published. Make another published template of this type the default first.',
  demoDefaultInvalid: 'Only a published template demo can be the default. Publish it first.',
  demoSourceGone: 'The source page, template or store was deleted. Make a new demo instead.',
}
export const errorText = (err: unknown) => messages[err instanceof ApiError ? err.code : 'server'] ?? 'Something went wrong. Try again in a moment.'

export const date = (v: string | null | undefined) => (v ? new Date(v).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—')
export const dateTime = (v: string) => new Date(v).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
export const count = (n: number) => n.toLocaleString('en-US')
export const taka = (n: number) => `৳${n.toLocaleString('en-US')}`
export function bytes(n: number) {
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`
  return `${(n / 1024 ** 3).toFixed(2)} GB`
}
export const limitText = (n: number | null, unit = '') => (n === null ? 'Unlimited' : `${count(n)}${unit}`)
