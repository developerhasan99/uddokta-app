export const orderStatusValues = ['new', 'hold', 'confirmed', 'packed', 'courier', 'delivered', 'returned', 'cancelled'] as const
export const manualOrderSources = ['messenger', 'whatsapp', 'phone', 'facebook_comment', 'instagram', 'shop', 'other'] as const
export const orderSources = ['landing_page', 'website', ...manualOrderSources] as const
export const orderPeriods = ['today', '7d', '30d', 'custom'] as const
export const orderFilterKeys = ['q', 'status', 'source', 'period', 'from', 'to'] as const
export type OrderFilters = Record<typeof orderFilterKeys[number], string>
export const emptyOrderFilters: OrderFilters = { q: '', status: '', source: '', period: '', from: '', to: '' }

const validDate = (value: string) => /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value) && !value.startsWith('0000') && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value

// Both the URL and saved views use this contract. Relative periods stay relative;
// the API resolves them in Bangladesh time at the moment orders are requested.
export function readOrderFilters(raw: unknown): OrderFilters | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const input = raw as Record<string, unknown>
  if (orderFilterKeys.some((key) => input[key] !== undefined && typeof input[key] !== 'string')) return null
  const filters = Object.fromEntries(orderFilterKeys.map((key) => [key, ((input[key] ?? '') as string).trim()])) as OrderFilters
  filters.q = filters.q.slice(0, 100)
  if (filters.status && !orderStatusValues.includes(filters.status as never)) return null
  if (filters.source && !orderSources.includes(filters.source as never)) return null
  if (filters.period && !orderPeriods.includes(filters.period as never)) return null
  if (!filters.period && (filters.from || filters.to)) filters.period = 'custom'
  if (filters.period === 'custom') {
    if ((filters.from && !validDate(filters.from)) || (filters.to && !validDate(filters.to)) || (filters.from && filters.to && filters.from > filters.to)) return null
  } else {
    filters.from = ''
    filters.to = ''
  }
  return filters
}

export function orderFilterParams(filters: OrderFilters) {
  return new URLSearchParams(orderFilterKeys.flatMap((key) => filters[key] ? [[key, filters[key]]] : []))
}
