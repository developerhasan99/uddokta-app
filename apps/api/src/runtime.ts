type Env = Record<string, string | undefined>
export function validateRuntime(service: 'api' | 'storefront', env: Env = process.env) {
  if (env.NODE_ENV !== 'production') return
  const required = ['DATABASE_URL', 'R2_BUCKET', 'R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'MEDIA_PUBLIC_URL', ...(service === 'api' ? ['COURIER_KEY'] : ['STOREFRONT_DOMAIN'])]
  const missing = required.filter((key) => !env[key]?.trim())
  if (missing.length) throw new Error(`Missing required environment variables: ${missing.join(', ')}`)
  if (!/^https:\/\/[^/]+\/?$/.test(env.MEDIA_PUBLIC_URL!)) throw new Error('MEDIA_PUBLIC_URL must be an HTTPS origin')
  if (service === 'storefront' && !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(env.STOREFRONT_DOMAIN!)) throw new Error('STOREFRONT_DOMAIN must be a domain without a protocol or path')
  if (service === 'api' && env.COURIER_KEY!.length < 32) throw new Error('COURIER_KEY must contain at least 32 characters')
  if (service === 'api' && env.SIGNUP_MODE && !['open', 'allowlist', 'closed'].includes(env.SIGNUP_MODE)) throw new Error('SIGNUP_MODE must be open, allowlist, or closed')
  if (service === 'api' && env.SIGNUP_MODE === 'allowlist' && !env.SIGNUP_EMAIL_ALLOWLIST?.trim()) throw new Error('SIGNUP_EMAIL_ALLOWLIST is required in allowlist mode')
}
export function registrationAllowed(email: string, env: Env = process.env) {
  const mode = env.SIGNUP_MODE ?? (env.NODE_ENV === 'production' ? 'closed' : 'open')
  if (mode === 'open') return true
  return mode === 'allowlist' && (env.SIGNUP_EMAIL_ALLOWLIST ?? '').split(',').some((value) => value.trim().toLowerCase() === email.toLowerCase())
}
