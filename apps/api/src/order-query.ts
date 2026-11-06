import { sql } from 'drizzle-orm'
import type { OrderFilters } from 'storefront/order-filters'
import { likePattern } from './media.ts'

// Shared by list rows, tab counts and CSV. Status tabs intentionally count all
// statuses within the same search/source/date scope.
export function orderWhere(storeId: string, filters: OrderFilters, includeStatus = true) {
  const { q, status, source, tag, period, from, to } = filters
  const digits = q.replace(/[০-৯]/g, (d) => String('০১২৩৪৫৬৭৮৯'.indexOf(d))).replace(/^#/, '')
  const number = Number(digits)
  const canMatchNumber = /^\d+$/.test(digits) && Number.isSafeInteger(number) && number <= 2147483647
  return sql`o.store_id = ${storeId}::uuid
    ${q ? sql`and (o.customer_name ilike ${likePattern(q)} or o.phone like ${likePattern(digits)} ${canMatchNumber ? sql`or o.number = ${number}` : sql``} or exists (select 1 from unnest(o.tags) tag where tag ilike ${likePattern(q)}))` : sql``}
    ${includeStatus && status ? sql`and o.status = ${status}` : sql``}
    ${source ? sql`and o.source = ${source}` : sql``}
    ${tag ? sql`and ${tag} = any(o.tags)` : sql``}
    ${period && period !== 'custom' ? sql`and o.created_at >= (((now() at time zone 'Asia/Dhaka')::date - ${period === 'today' ? 0 : period === '7d' ? 6 : 29}::int)::timestamp at time zone 'Asia/Dhaka') and o.created_at < (((now() at time zone 'Asia/Dhaka')::date + 1)::timestamp at time zone 'Asia/Dhaka')` : sql``}
    ${period === 'custom' && from ? sql`and o.created_at >= (${from}::date::timestamp at time zone 'Asia/Dhaka')` : sql``}
    ${period === 'custom' && to ? sql`and o.created_at < ((${to}::date + 1)::timestamp at time zone 'Asia/Dhaka')` : sql``}`
}

// CSV quoting does not stop spreadsheet formula execution. Prefix text that
// could be interpreted as a formula, and force phones to text to retain zeroes.
export function csvCell(raw: unknown, forceText = false) {
  let value = raw === null || raw === undefined ? '' : String(raw)
  if (forceText || /^[\s\u0000-\u001f]*[=+\-@]/.test(value) || /^[\t\r\n]/.test(value)) value = `'${value}`
  return `"${value.replace(/"/g, '""')}"`
}
