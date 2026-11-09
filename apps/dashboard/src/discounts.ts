import type { ProductRow } from './components/ProductPicker'
import type { Tone } from './components/ui'
import type { Key } from './i18n'

// The rules of a discount as the API stores them. What it takes off an order is worked out only by the database.
export type DiscountType = 'order' | 'products' | 'bxgy' | 'shipping'
export type Discount = {
  id: string; type: DiscountType; code: string | null; title: string; kind: 'percent' | 'amount'; value: number
  minSubtotal: number; minQty: number; maxUses: number | null; uses: number; oncePerPhone: boolean
  appliesAll: boolean; buysAll: boolean; buyQty: number | null; getQty: number | null; maxPerOrder: number | null
  startsAt: string; endsAt: string | null; active: boolean; createdAt: string
  getCount?: number; buyCount?: number; getProducts?: ProductRow[]; buyProducts?: ProductRow[]
}

export const discountTypes: { type: DiscountType; label: Key; help: Key }[] = [
  { type: 'products', label: 'discTypeProducts', help: 'discTypeProductsD' },
  { type: 'bxgy', label: 'discTypeBxgy', help: 'discTypeBxgyD' },
  { type: 'order', label: 'discTypeOrder', help: 'discTypeOrderD' },
  { type: 'shipping', label: 'discTypeShipping', help: 'discTypeShippingD' },
]
export const typeLabel = (type: DiscountType) => discountTypes.find((d) => d.type === type)!.label

export type DiscountStatus = 'active' | 'scheduled' | 'expired' | 'off'
// Used up counts as expired: like an end date, it no longer applies to anything.
export function discountStatus(d: Discount, now = Date.now()): DiscountStatus {
  if (!d.active) return 'off'
  if ((d.endsAt && Date.parse(d.endsAt) <= now) || (d.maxUses !== null && d.uses >= d.maxUses)) return 'expired'
  if (Date.parse(d.startsAt) > now) return 'scheduled'
  return 'active'
}
export const statusInfo: Record<DiscountStatus, { label: Key; tone: Tone }> = {
  active: { label: 'discActive', tone: 'success' },
  scheduled: { label: 'discScheduled', tone: 'info' },
  expired: { label: 'discExpired', tone: 'neutral' },
  off: { label: 'discOff', tone: 'neutral' },
}

type Fmt = { t: (key: Key, vars?: Record<string, string>) => string; money: (n: number) => string; num: (n: number) => string; time: (iso: string) => string }

// Plain lines describing a discount, for the list and the editor's summary.
export function describeDiscount(d: Discount, { t, money, num, time }: Fmt): string[] {
  const count = (all: boolean, n: number | undefined) => (all ? t('discItemsAll') : n === 1 ? t('discItemsOne') : t('discItemsSome', { n: num(n ?? 0) }))
  const value = d.kind === 'percent' ? num(d.value) : money(d.value)
  const lines: string[] = []
  if (d.type === 'order') lines.push(t(d.kind === 'percent' ? 'discSumOrderPercent' : 'discSumOrderAmount', { v: value }))
  if (d.type === 'products') lines.push(t(d.kind === 'percent' ? 'discSumProductsPercent' : 'discSumProductsAmount', { v: value, items: count(d.appliesAll, d.getCount ?? d.getProducts?.length) }))
  if (d.type === 'shipping') lines.push(t('discSumShipping'))
  if (d.type === 'bxgy') {
    lines.push(t('discSumBxgy', { buy: num(d.buyQty ?? 1), get: num(d.getQty ?? 1), at: d.value === 100 ? t('discAtFree') : t('discAtPercent', { v: num(d.value) }) }))
    if (!d.buysAll || !d.appliesAll) {
      lines.push(t('discSumBuyFrom', { items: count(d.buysAll, d.buyCount ?? d.buyProducts?.length) }))
      lines.push(t('discSumGetFrom', { items: count(d.appliesAll, d.getCount ?? d.getProducts?.length) }))
    }
    if (d.maxPerOrder) lines.push(t('discSumPerOrder', { n: num(d.maxPerOrder) }))
  }
  if (d.minSubtotal > 0) lines.push(t('discSumMinAmount', { v: money(d.minSubtotal) }))
  if (d.minQty > 0) lines.push(t('discSumMinQty', { n: num(d.minQty) }))
  if (d.maxUses) lines.push(t('discSumLimit', { n: num(d.maxUses) }))
  if (d.oncePerPhone) lines.push(t('discSumOnce'))
  if (Date.parse(d.startsAt) > Date.now()) lines.push(t('discSumStarts', { date: time(d.startsAt) }))
  if (d.endsAt) lines.push(t('discSumEnds', { date: time(d.endsAt) }))
  return lines
}
