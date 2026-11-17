// The store's own words (buttons, form labels, messages) in the store's language, set in Online store › Preferences.
// Each string is written beside its translation where it is used: tr(lang, ['বাংলা', 'English']).
// Bangla is the default; what the seller writes is always shown as written.
export type Lang = 'bn' | 'en'
export type Pair = readonly [bn: string, en: string]

export const tr = (lang: Lang | undefined, pair: Pair) => pair[lang === 'en' ? 1 : 0]
export const locale = (lang: Lang | undefined) => (lang === 'en' ? 'en-US' : 'bn-BD')

const formats = new Map<string, Intl.NumberFormat>()
const format = (lang: Lang | undefined, options: Intl.NumberFormatOptions = {}) => {
  const key = `${locale(lang)}${JSON.stringify(options)}`
  if (!formats.has(key)) formats.set(key, new Intl.NumberFormat(locale(lang), options))
  return formats.get(key)!
}
// Bangla digits for a Bangla store, Latin digits for an English one.
export const num = (lang: Lang | undefined, n: number, options?: Intl.NumberFormatOptions) => format(lang, options).format(n)
export const taka = (n: number, lang?: Lang) => `৳${num(lang, n)}`
