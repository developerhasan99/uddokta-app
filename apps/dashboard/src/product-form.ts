export type Option = { name: string; values: string[] }
export type VariantDraft = { id?: string; options: string[]; price: string; comparePrice: string; cost: string; sku: string; stock: string }

export const maxVariants = 100
const banglaDigits = '০১২৩৪৫৬৭৮৯'

// Whole taka or a stock count, typed in Bangla or English digits. Null when it is not a valid number.
export function parseAmount(text: string) {
  const digits = text.trim().replace(/[০-৯]/g, (d) => String(banglaDigits.indexOf(d))).replace(/,/g, '')
  return /^\d{1,10}$/.test(digits) && Number(digits) <= 1_000_000_000 ? Number(digits) : null
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
