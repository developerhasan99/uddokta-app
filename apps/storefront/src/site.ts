// The online store's look and templates (like Elementor Pro's Theme Builder). Each template is its own page-builder
// document of one type; the store-wide look (Site settings) is one small style object every page uses.
// Plain data, no JSX: the API validates with these and the dashboard imports them.
import { isPageFont, pageFonts, presets, type PresetId } from './themes.ts'
import { newSection, readContent, type Content, type Section, type SectionType, type Settings } from './schema.ts'

export const templateTypes = ['header', 'footer', 'home', 'product', 'collection', 'products', 'collections', 'page', 'cart', 'search', 'notFound'] as const
export type TemplateType = typeof templateTypes[number]
export const isTemplateType = (v: unknown): v is TemplateType => (templateTypes as readonly unknown[]).includes(v)
// Bangla and English names of each type; a store's built-in copies take the Bangla one as their title.
export const templateLabels: Record<TemplateType, readonly [string, string]> = {
  header: ['হেডার', 'Header'], footer: ['ফুটার', 'Footer'], home: ['হোম পেজ', 'Home page'], product: ['পণ্যের পেজ', 'Product page'],
  collection: ['কালেকশন পেজ', 'Collection page'], products: ['সব পণ্য', 'All products'], collections: ['সব কালেকশন', 'All collections'],
  page: ['দোকানের পেজ', 'Store page'], cart: ['কার্ট', 'Cart'], search: ['খোঁজার ফল', 'Search results'], notFound: ['পাওয়া যায়নি (404)', 'Not found (404)'],
}
// Types a product, collection or store page can choose a template of in its own settings.
export const assignableTypes = ['product', 'collection', 'page'] as const satisfies readonly TemplateType[]
// Types a landing page can choose for its header and footer.
export const frameTypes = ['header', 'footer'] as const satisfies readonly TemplateType[]
export const maxTemplates = 100

// Template content is page content that may hold store blocks (readContent with { theme: true }).
export const readTemplateContent = (raw: unknown): Content | null => readContent(raw, { theme: true })

// ---- Site settings: the store-wide look ----

export type SiteColors = { accent: string; ink: string; paper: string; tint: string; rule: string }
export type SiteStyle = { colors: SiteColors; radius: number; bangla: string; latin: string; width: number; css: string }

const hex = /^#[0-9a-f]{6}$/i
const colorKeys = ['accent', 'ink', 'paper', 'tint', 'rule'] as const

// One of the six one-click styles as Site settings (custom CSS left empty).
export function styleFromPreset(id: PresetId): SiteStyle {
  const v = presets[id].vars
  return { colors: { accent: v.accent, ink: v.ink, paper: v.paper, tint: v.tint, rule: v.rule }, radius: Number.parseInt(v.radius, 10), bangla: presets[id].font, latin: '', width: 1100, css: '' }
}

// The trust boundary for Site settings: every value from a fixed format, so siteCss can write them into CSS.
export function readSiteStyle(raw: unknown): SiteStyle | null {
  const s = raw as SiteStyle
  if (!s || typeof s !== 'object' || !s.colors || typeof s.colors !== 'object') return null
  const colors = {} as SiteColors
  for (const key of colorKeys) {
    if (typeof s.colors[key] !== 'string' || !hex.test(s.colors[key])) return null
    colors[key] = s.colors[key].toLowerCase()
  }
  if (!Number.isInteger(s.radius) || s.radius < 0 || s.radius > 32) return null
  if (!Number.isInteger(s.width) || s.width < 720 || s.width > 1600) return null
  if (!(s.bangla === '' || isPageFont('bangla', s.bangla)) || !(s.latin === '' || isPageFont('latin', s.latin))) return null
  if (typeof s.css !== 'string' || s.css.length > 20000 || s.css.includes('<')) return null
  return { colors, radius: s.radius, bangla: s.bangla, latin: s.latin, width: s.width, css: s.css }
}

const isDark = (color: string) => {
  const n = Number.parseInt(color.slice(1), 16)
  return (0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255 < 0.5
}

// The look as CSS variables (the storefront's styles read only these), its fonts and content width.
export function siteCss(s: SiteStyle) {
  const c = s.colors
  const font = [s.latin, s.bangla].filter(Boolean).map((f) => `"${f}"`).join(',')
  return `:root{--sf-accent:${c.accent};--sf-ink:${c.ink};--sf-paper:${c.paper};--sf-tint:${c.tint};--sf-rule:${c.rule};--sf-radius:${s.radius}px;--sf-muted:${isDark(c.paper) ? '#a8a8a8' : '#5f6368'};--sf-accent-ink:${isDark(c.accent) ? '#ffffff' : '#141414'};--sf-width:${s.width}px}body{font-family:${font ? `${font},` : ''}"Hind Siliguri","Noto Sans Bengali",system-ui,sans-serif}`
}

export function siteFontsHref(s: SiteStyle) {
  const params = [s.latin ? (pageFonts.latin as Record<string, string>)[s.latin] : null, s.bangla ? (pageFonts.bangla as Record<string, string>)[s.bangla] : null].filter(Boolean)
  return params.length ? `https://fonts.googleapis.com/css2?${params.map((p) => `family=${p}`).join('&')}&display=swap` : null
}

// ---- Built-in templates ----

const typed = (type: SectionType, id: string, settings: Settings = {}): Section => {
  const s = newSection(type, id)
  return { ...s, settings: { ...s.settings, ...settings } }
}
const page = (...sections: Section[]): Content => ({ version: 2, sections })

// The template each type uses until the store sets its own default: the pages the storefront always had. Read-only;
// sellers duplicate one to change it.
export const builtInTemplates: Record<TemplateType, Content> = {
  header: page(typed('storeHeader', 'header')),
  footer: page(typed('storeFooter', 'footer')),
  home: page(typed('productGrid', 'products')),
  product: page(typed('productInfo', 'product')),
  collection: page(typed('collectionHeader', 'collection'), typed('productGrid', 'products')),
  collections: page(typed('collectionList', 'collections', { heading: 'সব কালেকশন' })),
  products: page(typed('productGrid', 'products', { heading: 'সব পণ্য' })),
  page: page(typed('pageContent', 'content')),
  cart: page(typed('cart', 'cart')),
  search: page(typed('search', 'search')),
  notFound: page({ ...newSection('layout', 'missing'), settings: { name: '404' }, style: { align: 'center', paddingTop: 64, paddingBottom: 64 }, children: [
    { id: 'missing-title', kind: 'heading', props: { text: 'পেজটি পাওয়া যায়নি', level: 'h1' } },
    { id: 'missing-text', kind: 'text', props: { text: '<p>লিংকটি ঠিক আছে কিনা দেখুন, অথবা হোম পেজে ফিরে যান।</p>' } },
    { id: 'missing-home', kind: 'button', props: { text: 'হোম পেজে যান', link: '/', icon: '', iconPosition: 'before', variant: 'outline' }, style: { alignSelf: 'center' } },
  ] }),
}

// Ready-made starting points offered when creating a template, besides blank and the built-in one.
export const readyMade: Partial<Record<TemplateType, { id: string; label: readonly [string, string]; content: Content }[]>> = {
  header: [{ id: 'announcement', label: ['ঘোষণা বারসহ হেডার', 'Header with announcement bar'], content: page(
    typed('announcement', 'notice', { text: 'সারা দেশে ক্যাশ অন ডেলিভারি · পণ্য হাতে পেয়ে টাকা দিন', button: '', link: '' }),
    typed('storeHeader', 'header', { sticky: 'yes' }),
  ) }],
  footer: [{ id: 'contact', label: ['যোগাযোগসহ ফুটার', 'Footer with contact details'], content: page(typed('storeFooter', 'footer', { showContact: 'yes' })) }],
  home: [{ id: 'shopfront', label: ['দোকানের সামনে: ব্যানার, কালেকশন, নতুন পণ্য', 'Shop front: banner, collections, new arrivals'], content: page(
    { ...newSection('layout', 'hero'), settings: { name: 'হিরো' }, style: { align: 'center', paddingTop: 72, paddingBottom: 72 }, children: [
      { id: 'hero-title', kind: 'heading', props: { text: 'নতুন কালেকশন এসেছে', level: 'h1' } },
      { id: 'hero-text', kind: 'text', props: { text: '<p>পছন্দের পণ্য বেছে নিন, ঘরে বসে হাতে পেয়ে টাকা দিন।</p>' } },
      { id: 'hero-button', kind: 'button', props: { text: 'সব পণ্য দেখুন', link: '/products', icon: '', iconPosition: 'before', variant: 'solid' }, style: { alignSelf: 'center' } },
    ] },
    typed('collectionList', 'shop-by', { heading: 'কালেকশন অনুযায়ী কিনুন', columns: 3 }),
    typed('productGrid', 'new', { heading: 'নতুন পণ্য', source: 'all', limit: 8, pager: 'no' }),
  ) }],
}
