import type { Tone } from './components/ui'
import type { Key } from './i18n'

export type ProductStatus = 'active' | 'unlisted' | 'draft'
export const productStatuses: ProductStatus[] = ['active', 'unlisted', 'draft']
export const statusInfo: Record<ProductStatus, { label: Key; help: Key; tone: Tone }> = {
  active: { label: 'productStatusActive', help: 'productStatusActiveHelp', tone: 'success' },
  unlisted: { label: 'productStatusUnlisted', help: 'productStatusUnlistedHelp', tone: 'info' },
  draft: { label: 'productStatusDraft', help: 'productStatusDraftHelp', tone: 'neutral' },
}

export type Option = { name: string; values: string[] }
export type VariantDraft = { id?: string; options: string[]; price: string; comparePrice: string; cost: string; sku: string; stock: string; mediaId?: string | null }

export const maxVariants = 100
const banglaDigits = '০১২৩৪৫৬৭৮৯'

// Whole taka or a stock count, typed in Bangla or English digits. Null when it is not a valid number.
export function parseAmount(text: string) {
  const digits = text.trim().replace(/[০-৯]/g, (d) => String(banglaDigits.indexOf(d))).replace(/,/g, '')
  return /^\d{1,10}$/.test(digits) && Number(digits) <= 1_000_000_000 ? Number(digits) : null
}

// What a seller types as a link, as a safe address. Null when it cannot be one.
export function linkAddress(text: string) {
  const typed = text.trim()
  if (!typed || /[\s"<>]/.test(typed.replace(/^\+?[\d\s-]+$/, (phone) => phone.replace(/[\s-]/g, '')))) return null
  if (/^(mailto:|tel:)/i.test(typed)) return typed
  if (/^\S+@\S+\.\S+$/.test(typed)) return `mailto:${typed}`
  if (/^\+?[\d\s-]{6,}$/.test(typed)) return `tel:${typed.replace(/[\s-]/g, '')}`
  if (/^[a-z][a-z0-9+.-]*:(?!\d)/i.test(typed) && !/^https?:\/\//i.test(typed)) return null
  try {
    const url = new URL(/^https?:\/\//i.test(typed) ? typed : `https://${typed}`)
    return url.hostname.includes('.') ? url.href : null
  } catch {
    return null
  }
}

// Same rule as the API, which has the final say. Used to show the address before saving.
export const slugify = (text: string) => text.normalize('NFC').toLowerCase().replace(/[^\p{L}\p{M}\p{N}\u200c\u200d]+/gu, '-').slice(0, 100).replace(/^-+|-+$/g, '')

// ponytail: the storefront domain is not decided yet; change it here once stores have real addresses, and use a custom domain when the store has one.
export const storeAddress = (storeHandle: string) => `https://${storeHandle}.uddokta.com`

export const seoTitleLimit = 70
export const seoDescriptionLimit = 160

// What search engines get when the seller writes no description of their own. The storefront must do the same.
export function searchDescription(html: string) {
  const text = html
    .replace(/<\/?(p|div|br|li|ul|ol|h2)>/g, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
  return text.length > seoDescriptionLimit ? `${text.slice(0, seoDescriptionLimit - 3).trimEnd()}...` : text
}

export const variantTotal = (options: Option[]) => options.reduce((n, o) => (o.values.length > 0 ? n * o.values.length : n), 1)

// One variant per combination. Existing combinations are kept; new ones start with the first variant's prices.
export function variantsFor(options: Option[], previous: VariantDraft[]): VariantDraft[] {
  const combinations = options
    .filter((o) => o.values.length > 0)
    .reduce<string[][]>((all, o) => all.flatMap((c) => o.values.map((v) => [...c, v])), [[]])
  const known = new Map(previous.map((v) => [JSON.stringify(v.options), v]))
  const first = previous[0]
  return combinations.map((options) => known.get(JSON.stringify(options)) ?? {
    options,
    price: first?.price ?? '',
    comparePrice: first?.comparePrice ?? '',
    cost: first?.cost ?? '',
    sku: '',
    stock: '',
  })
}
