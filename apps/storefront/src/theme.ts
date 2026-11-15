// Themes: a store's whole look as one JSON document, built from the same sections, elements and blocks as landing pages.
// No template language: templates are page Content, and store blocks (storeHeader, productInfo, …) read what the page is
// about from the render context. Plain data, no JSX: the API validates with readTheme and the dashboard imports it.
import { isPageFont, pageFonts, presets, type PresetId } from './themes.ts'
import { newSection, readContent, references, type Content, type Section, type SectionType, type Settings } from './schema.ts'

export const templateKinds = ['home', 'product', 'collection', 'collections', 'products', 'page', 'cart', 'search', 'notFound'] as const
// Themes saved before cart and search existed lack them; the starter theme's are used until the seller edits one.
const requiredKinds: readonly TemplateKind[] = ['home', 'product', 'collection', 'collections', 'products', 'page', 'notFound']
export type TemplateKind = typeof templateKinds[number]
// A template key: a kind, or a kind plus an alternate's name ("product.gift") that products, collections and pages can pick.
export const templateKey = /^(home|product|collection|collections|products|page|cart|search|notFound)(\.[a-z0-9-]{1,30})?$/
export const alternateKinds: readonly TemplateKind[] = ['product', 'collection', 'page']
export const maxTemplates = 40
export const maxThemeBytes = 1_000_000

export type ThemeColors = { accent: string; ink: string; paper: string; tint: string; rule: string }
export type ThemeSettings = { colors: ThemeColors; radius: number; bangla: string; latin: string; width: number }
export type ThemeDoc = { version: 1; settings: ThemeSettings; header: Section[]; footer: Section[]; templates: Record<string, Content>; css: string }

const hex = /^#[0-9a-f]{6}$/i
const colorKeys = ['accent', 'ink', 'paper', 'tint', 'rule'] as const

// Settings from one of the style presets: the six looks sellers already know become a theme's style variations.
export function variationSettings(id: PresetId): ThemeSettings {
  const v = presets[id].vars
  return { colors: { accent: v.accent, ink: v.ink, paper: v.paper, tint: v.tint, rule: v.rule }, radius: Number.parseInt(v.radius, 10), bangla: presets[id].font, latin: '', width: 1100 }
}

function readSettings(raw: unknown): ThemeSettings | null {
  const s = raw as ThemeSettings
  if (!s || typeof s !== 'object' || !s.colors || typeof s.colors !== 'object') return null
  const colors = {} as ThemeColors
  for (const key of colorKeys) {
    if (typeof s.colors[key] !== 'string' || !hex.test(s.colors[key])) return null
    colors[key] = s.colors[key].toLowerCase()
  }
  if (!Number.isInteger(s.radius) || s.radius < 0 || s.radius > 32) return null
  if (!Number.isInteger(s.width) || s.width < 720 || s.width > 1600) return null
  const bangla = s.bangla === '' || isPageFont('bangla', s.bangla) || s.bangla === 'Hind Siliguri' ? s.bangla : null
  const latin = s.latin === '' || isPageFont('latin', s.latin) ? s.latin : null
  if (bangla === null || latin === null) return null
  return { colors, radius: s.radius, bangla, latin, width: s.width }
}

// The trust boundary for themes, like readContent for pages: anything off is refused.
export function readTheme(raw: unknown): ThemeDoc | null {
  const doc = raw as ThemeDoc
  if (!doc || typeof doc !== 'object' || doc.version !== 1) return null
  if (JSON.stringify(doc).length > maxThemeBytes) return null
  const settings = readSettings(doc.settings)
  const header = readContent({ version: 2, sections: doc.header }, { theme: true })
  const footer = readContent({ version: 2, sections: doc.footer }, { theme: true })
  if (!settings || !header || !footer || !doc.templates || typeof doc.templates !== 'object' || Array.isArray(doc.templates)) return null
  const keys = Object.keys(doc.templates)
  if (keys.length > maxTemplates || !keys.every((k) => templateKey.test(k)) || !requiredKinds.every((k) => keys.includes(k))) return null
  const templates: Record<string, Content> = {}
  for (const key of keys) {
    const content = readContent(doc.templates[key], { theme: true })
    if (!content) return null
    templates[key] = content
  }
  if (typeof doc.css !== 'string' || doc.css.length > 20000 || doc.css.includes('<')) return null
  return { version: 1, settings, header: header.sections, footer: footer.sections, templates, css: doc.css }
}

// The template a page uses: its chosen alternate when the theme has it, else the kind's default.
export const templateFor = (doc: ThemeDoc, kind: TemplateKind, alternate = ''): Content => doc.templates[alternate ? `${kind}.${alternate}` : kind] ?? doc.templates[kind] ?? starterTheme('fresh').templates[kind]

// Every image, product and collection a theme points at.
export function themeReferences(doc: ThemeDoc) {
  const all = [{ version: 2 as const, sections: [...doc.header, ...doc.footer] }, ...Object.values(doc.templates)].map(references)
  return { media: [...new Set(all.flatMap((r) => r.media))], products: [...new Set(all.flatMap((r) => r.products))], collections: [...new Set(all.flatMap((r) => r.collections))] }
}

// A colour is dark when its light is under half; dark paper needs dark text on accent buttons and lighter muted text.
const isDark = (color: string) => {
  const n = Number.parseInt(color.slice(1), 16)
  return (0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255 < 0.5
}

// The theme's look as CSS variables (the storefront's styles read only these), its fonts and content width.
// Every value was checked by readTheme against a fixed format, so it is safe in CSS.
export function themeCss(s: ThemeSettings) {
  const c = s.colors
  const dark = isDark(c.paper)
  const font = [s.latin, s.bangla].filter(Boolean).map((f) => `"${f}"`).join(',')
  return `:root{--sf-accent:${c.accent};--sf-ink:${c.ink};--sf-paper:${c.paper};--sf-tint:${c.tint};--sf-rule:${c.rule};--sf-radius:${s.radius}px;--sf-muted:${dark ? '#a8a8a8' : '#5f6368'};--sf-accent-ink:${isDark(c.accent) ? '#ffffff' : '#141414'};--sf-width:${s.width}px}body{font-family:${font ? `${font},` : ''}"Hind Siliguri","Noto Sans Bengali",system-ui,sans-serif}`
}

export function themeFontsHref(s: ThemeSettings) {
  const params = [s.latin ? (pageFonts.latin as Record<string, string>)[s.latin] : null, s.bangla ? ((pageFonts.bangla as Record<string, string>)[s.bangla] ?? 'Hind+Siliguri:wght@400;600;700') : null].filter(Boolean)
  return params.length ? `https://fonts.googleapis.com/css2?${params.map((p) => `family=${p}`).join('&')}&display=swap` : null
}

const typed = (type: SectionType, id: string, settings: Settings = {}): Section => {
  const s = newSection(type, id)
  return { ...s, settings: { ...s.settings, ...settings } }
}
const page = (...sections: Section[]): Content => ({ version: 2, sections })

// The theme every store starts with: the same pages the storefront always had, now as editable templates.
export function starterTheme(variation: PresetId): ThemeDoc {
  return {
    version: 1,
    settings: variationSettings(variation),
    header: [typed('storeHeader', 'header')],
    footer: [typed('storeFooter', 'footer')],
    templates: {
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
    },
    css: '',
  }
}
