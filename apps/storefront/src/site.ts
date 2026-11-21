// The online store's look and templates (like Elementor Pro's Theme Builder). Each template is its own page-builder
// document of one type; the store-wide look (Site settings) is one small style object every page uses.
// Plain data, no JSX: the API validates with these and the dashboard imports them.
import { isPageFont, pageFonts, presets, type PresetId } from './themes.ts'
import { defOf, newSection, readContent, type Content, type NodeStyle, type PageNode, type Section, type SectionStyle, type SectionType, type Settings } from './schema.ts'

export const templateTypes = ['header', 'footer', 'home', 'product', 'collection', 'products', 'collections', 'page', 'cart', 'search', 'account', 'notFound'] as const
export type TemplateType = typeof templateTypes[number]
export const isTemplateType = (v: unknown): v is TemplateType => (templateTypes as readonly unknown[]).includes(v)
// Bangla and English names of each type; a store's built-in copies take the Bangla one as their title.
export const templateLabels: Record<TemplateType, readonly [string, string]> = {
  header: ['হেডার', 'Header'], footer: ['ফুটার', 'Footer'], home: ['হোম পেজ', 'Home page'], product: ['পণ্যের পেজ', 'Product page'],
  collection: ['কালেকশন পেজ', 'Collection page'], products: ['সব পণ্য', 'All products'], collections: ['সব কালেকশন', 'All collections'],
  page: ['দোকানের পেজ', 'Store page'], cart: ['কার্ট', 'Cart'], search: ['খোঁজার ফল', 'Search results'], account: ['ক্রেতার অ্যাকাউন্ট', 'Buyer account'], notFound: ['পাওয়া যায়নি (404)', 'Not found (404)'],
}
// Types a product, collection or store page can choose a template of in its own settings.
export const assignableTypes = ['product', 'collection', 'page'] as const satisfies readonly TemplateType[]
// Types a landing page can choose for its header and footer.
export const frameTypes = ['header', 'footer'] as const satisfies readonly TemplateType[]
export const maxTemplates = 100

// Template content is page content that may hold store blocks (readContent with { theme: true }).
export const readTemplateContent = (raw: unknown): Content | null => readContent(raw, { theme: true })

// ---- Site settings: the store-wide look ----

// page: the page behind everything (blank: a soft cool grey on light themes, so white parts such as the header stand out).
export type SiteColors = { accent: string; ink: string; paper: string; tint: string; rule: string; page?: string }
// elements: global styles for buttons, form fields, text and images (Online store › Customize), each optional (absent keeps
// the storefront's own look). A section's or element's own style in the page builder still wins over these.
export type SiteElements = Partial<Record<SiteElementKey, string | number>>
export type SiteStyle = { colors: SiteColors; radius: number; bangla: string; latin: string; width: number; css: string; elements?: SiteElements }

// ---- Global element styles: one list for validation, the CSS variables the storefront reads and the Customize form ----
type ElementField = { key: string; group: 'type' | 'button' | 'input' | 'image'; label: readonly [string, string]; variable: string }
  & ({ kind: 'number'; min: number; max: number } | { kind: 'color' } | { kind: 'select'; options: readonly (readonly [string, readonly [string, string]])[] })
const weights = [['400', ['স্বাভাবিক', 'Regular']], ['500', ['মাঝারি', 'Medium']], ['600', ['সেমিবোল্ড', 'Semibold']], ['700', ['বোল্ড', 'Bold']], ['800', ['খুব মোটা', 'Extra bold']]] as const
export const siteElementFields = [
  { key: 'textSize', group: 'type', kind: 'number', min: 12, max: 22, label: ['লেখার মাপ', 'Body text size'], variable: '--sf-text-size' },
  { key: 'h1', group: 'type', kind: 'number', min: 20, max: 80, label: ['H1 শিরোনামের মাপ', 'H1 heading size'], variable: '--sf-h1' },
  { key: 'h2', group: 'type', kind: 'number', min: 18, max: 64, label: ['H2 শিরোনামের মাপ', 'H2 heading size'], variable: '--sf-h2' },
  { key: 'h3', group: 'type', kind: 'number', min: 16, max: 48, label: ['H3 শিরোনামের মাপ', 'H3 heading size'], variable: '--sf-h3' },
  { key: 'headingWeight', group: 'type', kind: 'select', options: weights, label: ['শিরোনামের ওজন', 'Heading weight'], variable: '--sf-heading-weight' },
  { key: 'buttonBg', group: 'button', kind: 'color', label: ['পটভূমি', 'Background'], variable: '--sf-btn-bg' },
  { key: 'buttonInk', group: 'button', kind: 'color', label: ['লেখার রং', 'Text colour'], variable: '--sf-btn-ink' },
  { key: 'buttonHoverBg', group: 'button', kind: 'color', label: ['মাউস রাখলে পটভূমি', 'Background on hover'], variable: '--sf-btn-hover-bg' },
  { key: 'buttonHoverInk', group: 'button', kind: 'color', label: ['মাউস রাখলে লেখার রং', 'Text colour on hover'], variable: '--sf-btn-hover-ink' },
  { key: 'buttonSize', group: 'button', kind: 'number', min: 12, max: 24, label: ['লেখার মাপ', 'Text size'], variable: '--sf-btn-size' },
  { key: 'buttonWeight', group: 'button', kind: 'select', options: weights, label: ['লেখার ওজন', 'Text weight'], variable: '--sf-btn-weight' },
  { key: 'buttonHeight', group: 'button', kind: 'number', min: 32, max: 64, label: ['উচ্চতা', 'Height'], variable: '--sf-btn-h' },
  { key: 'buttonPadding', group: 'button', kind: 'number', min: 8, max: 48, label: ['পাশের ফাঁকা', 'Side padding'], variable: '--sf-btn-px' },
  { key: 'buttonRadius', group: 'button', kind: 'number', min: 0, max: 40, label: ['কোণা', 'Corners'], variable: '--sf-btn-radius' },
  { key: 'buttonBorder', group: 'button', kind: 'number', min: 0, max: 4, label: ['বর্ডার', 'Border'], variable: '--sf-btn-border' },
  { key: 'buttonBorderColor', group: 'button', kind: 'color', label: ['বর্ডারের রং', 'Border colour'], variable: '--sf-btn-border-color' },
  { key: 'inputBg', group: 'input', kind: 'color', label: ['পটভূমি', 'Background'], variable: '--sf-input-bg' },
  { key: 'inputInk', group: 'input', kind: 'color', label: ['লেখার রং', 'Text colour'], variable: '--sf-input-ink' },
  { key: 'inputBorderColor', group: 'input', kind: 'color', label: ['বর্ডারের রং', 'Border colour'], variable: '--sf-input-border-color' },
  { key: 'inputFocus', group: 'input', kind: 'color', label: ['ক্লিক করলে বর্ডার', 'Focus outline'], variable: '--sf-input-focus' },
  { key: 'inputBorder', group: 'input', kind: 'number', min: 0, max: 4, label: ['বর্ডার', 'Border'], variable: '--sf-input-border' },
  { key: 'inputHeight', group: 'input', kind: 'number', min: 36, max: 64, label: ['উচ্চতা', 'Height'], variable: '--sf-input-h' },
  { key: 'inputRadius', group: 'input', kind: 'number', min: 0, max: 32, label: ['কোণা', 'Corners'], variable: '--sf-input-radius' },
  { key: 'imageRadius', group: 'image', kind: 'number', min: 0, max: 40, label: ['ছবির কোণা', 'Image corners'], variable: '--sf-image-radius' },
] as const satisfies readonly ElementField[]
export type SiteElementKey = typeof siteElementFields[number]['key']

// The trust boundary for element styles: known keys only, numbers in range, #RRGGBB(AA) colours, listed choices.
function readElements(raw: unknown): SiteElements | null {
  if (raw === undefined) return {}
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const out: SiteElements = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const field = siteElementFields.find((f) => f.key === key)
    if (!field || value === undefined || value === null || value === '') continue
    if (field.kind === 'number' && !(Number.isInteger(value) && (value as number) >= field.min && (value as number) <= field.max)) return null
    if (field.kind === 'color' && !(typeof value === 'string' && /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(value))) return null
    if (field.kind === 'select' && !field.options.some(([v]) => v === value)) return null
    out[field.key] = field.kind === 'color' ? (value as string).toLowerCase() : value as string | number
  }
  return out
}

// The element styles as CSS variables. Heading sizes shrink on small screens, like the storefront's own.
function elementVars(elements: SiteElements | undefined) {
  if (!elements) return ''
  return siteElementFields.flatMap((f) => {
    const v = elements[f.key]
    if (v === undefined) return []
    if (f.kind !== 'number') return [`${f.variable}:${v}`]
    if (f.key === 'h1' || f.key === 'h2' || f.key === 'h3') return [`${f.variable}:clamp(${Math.round((v as number) * 0.68)}px,${f.key === 'h1' ? 5 : f.key === 'h2' ? 3.6 : 2.6}vw,${v}px)`]
    return [`${f.variable}:${v}px`]
  }).map((d) => `;${d}`).join('')
}

const hex = /^#[0-9a-f]{6}$/i
const colorKeys = ['accent', 'ink', 'paper', 'tint', 'rule'] as const

// One of the six one-click styles as Site settings (custom CSS left empty).
export function styleFromPreset(id: PresetId): SiteStyle {
  const v = presets[id].vars
  return { colors: { accent: v.accent, ink: v.ink, paper: v.paper, tint: v.tint, rule: v.rule }, radius: Number.parseInt(v.radius, 10), bangla: presets[id].font, latin: '', width: 1200, css: '' }
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
  if (s.colors.page !== undefined && s.colors.page !== '') {
    if (typeof s.colors.page !== 'string' || !hex.test(s.colors.page)) return null
    colors.page = s.colors.page.toLowerCase()
  }
  if (!Number.isInteger(s.radius) || s.radius < 0 || s.radius > 32) return null
  if (!Number.isInteger(s.width) || s.width < 720 || s.width > 1600) return null
  if (!(s.bangla === '' || isPageFont('bangla', s.bangla)) || !(s.latin === '' || isPageFont('latin', s.latin))) return null
  if (typeof s.css !== 'string' || s.css.length > 20000 || s.css.includes('<')) return null
  const elements = readElements(s.elements)
  if (!elements) return null
  return { colors, radius: s.radius, bangla: s.bangla, latin: s.latin, width: s.width, css: s.css, ...(Object.keys(elements).length ? { elements } : {}) }
}

const isDark = (color: string) => {
  const n = Number.parseInt(color.slice(1), 16)
  return (0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255 < 0.5
}
// The page colour behind white parts: a soft cool grey on light backgrounds, the background itself on dark ones.
export const pageColor = (paper: string) => (isDark(paper) ? paper : '#f6f6f6')

// The look as CSS variables (the storefront's styles read only these), its fonts and content width.
export function siteCss(s: SiteStyle) {
  const c = s.colors
  const font = [s.latin, s.bangla].filter(Boolean).map((f) => `"${f}"`).join(',')
  return `:root{--sf-accent:${c.accent};--sf-ink:${c.ink};--sf-paper:${c.paper};--sf-tint:${c.tint};--sf-rule:${c.rule};--sf-radius:${s.radius}px;--sf-muted:${isDark(c.paper) ? '#a8a8a8' : '#5f6368'};--sf-accent-ink:${isDark(c.accent) ? '#ffffff' : '#141414'};--sf-width:${s.width}px;--sf-page:${c.page ?? pageColor(c.paper)}${elementVars(s.elements)}}body{font-family:${font ? `${font},` : ''}"Hind Siliguri","Noto Sans Bengali",system-ui,sans-serif}`
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

// ---- Headers: one row, two rows, three rows ----
// Each row is a layout section (its own background, height, border and width) holding a box of header blocks. Plain
// black and white like the big fashion and marketplace shops; every colour, size and gap is the seller's to change.
const block = (id: string, type: SectionType, settings: Settings = {}, extra: Partial<PageNode> = {}): PageNode =>
  ({ id, kind: 'block', props: {}, block: { type, settings: { ...structuredClone(defOf(type).defaults), ...settings } }, ...extra })
const row = (id: string, children: PageNode[], style: NodeStyle = {}, mobile: NodeStyle = {}): PageNode =>
  ({ id, kind: 'box', props: {}, style: { direction: 'row', justify: 'between', align: 'center', gap: 24, ...style }, mobile: { direction: 'row', gap: 8, ...mobile }, children })
// A thin bar in three equal parts (left, middle, right); on phones only what is not hidden shows, in one column.
const bar = (id: string, children: PageNode[], style: NodeStyle = {}): PageNode =>
  ({ id, kind: 'box', props: {}, style: { display: 'grid', gridColumns: 3, align: 'center', gap: 16, fontSize: 13, ...style }, children })
const headerRow = (id: string, name: string, style: SectionStyle, children: PageNode[]): Section =>
  ({ ...newSection('layout', id), settings: { name }, style: { paddingTop: 0, paddingBottom: 0, ...style }, children })
const text = (id: string, html: string, extra: Partial<PageNode> = {}): PageNode => ({ id, kind: 'text', props: { text: html }, ...extra })
// Links in a row with thin lines between them (Help | Orders | Returns).
const links = (id: string, items: [icon: string, text: string, link: string][], settings: Settings = {}, extra: Partial<PageNode> = {}) =>
  block(id, 'iconList', { items: items.map(([icon, label, link]) => ({ icon, text: label, link })), direction: 'horizontal', itemGap: 12, iconGap: 6, iconSize: 15, iconColor: '', textColor: '', ...settings }, extra)
// Phone sides of a main row: equal widths, so the logo sits in the middle.
const phoneSide = { width: 30 }
const menuButton = (extra: Partial<PageNode> = { mobile: phoneSide }) => block('header-menu-button', 'menuButton', {}, { hide: 'desktop', ...extra })
const logo = (style: NodeStyle = {}, mobile: NodeStyle = {}) => block('header-logo', 'storeLogo', {}, { style: { fontSize: 26, fontWeight: '700', ...style }, mobile: { fontSize: 22, ...mobile } })

// One row: logo, menu in the middle, search · account · bag (phones: menu button, logo, search, bag).
const oneRowHeader = (): Content => page(headerRow('header', 'হেডার', { background: '#ffffff', color: '#111111' }, [
  row('header-row', [
    menuButton(),
    logo(),
    block('header-menu', 'storeMenu', { align: 'center', itemGap: 36 }, { hide: 'mobile', style: { fontSize: 16, fontWeight: '500' } }),
    block('header-icons', 'storeIcons', { showAccount: 'desktop', iconSize: 24, itemGap: 22 }, { mobile: phoneSide }),
  ], { minHeight: 76, gap: 32 }, { minHeight: 60 }),
]))

// Two rows: a black announcement bar with help links, then logo, menu (last link red for Sale), a round search box and icons.
const twoRowHeader = (): Content => page(
  headerRow('announcement-bar', 'ঘোষণা বার', { background: '#000000', color: '#ffffff' }, [
    bar('announcement-row', [
      { id: 'announcement-space', kind: 'spacer', props: {}, style: { minHeight: 1 }, hide: 'mobile' },
      text('announcement-text', 'সারা দেশে ক্যাশ অন ডেলিভারি · পণ্য হাতে পেয়ে টাকা দিন', { style: { textAlign: 'center' } }),
      links('announcement-links', [['', 'সাহায্য', '/policies/contact'], ['', 'অর্ডার ট্র্যাক', '/account'], ['', 'রিটার্ন', '/policies/refund']], { align: 'end', textColor: '#ffffff', divider: 'solid', dividerColor: '#ffffff59' }, { hide: 'mobile' }),
    ], { minHeight: 40 }),
  ]),
  headerRow('header', 'হেডার', { background: '#ffffff', color: '#111111' }, [
    row('header-row', [
      menuButton(),
      logo({ fontSize: 30 }),
      block('header-menu', 'storeMenu', { itemGap: 28, lastLinkColor: '#d4111e' }, { hide: 'mobile', style: { fontSize: 15, fontWeight: '500' } }),
      block('header-search', 'storeSearch', { look: 'icon', height: 40, radius: 20 }, { hide: 'mobile', style: { maxWidth: 260 } }),
      block('header-icons', 'storeIcons', { showSearch: 'mobile', showAccount: 'desktop', iconSize: 24, itemGap: 20 }, { mobile: phoneSide }),
    ], { minHeight: 72, gap: 32 }, { minHeight: 60 }),
  ]),
)

// Three rows: a light top bar (delivery, offer, help links), logo with a wide search box and account/cart, then a dark
// category bar with an "All" button. Phones: menu button, logo, account, cart, the search box under them, the bar below.
const threeRowHeader = (): Content => page(
  headerRow('utility-bar', 'ওপরের বার', { background: '#ececec', color: '#111111' }, [
    bar('utility-row', [
      links('utility-left', [['map-pin', 'সারা দেশে ডেলিভারি', '']], { iconColor: '#111111' }),
      text('utility-offer', 'প্রথম অর্ডারে ১০% ছাড়। কোড: <strong>SHURU10</strong>', { style: { textAlign: 'center' }, hide: 'mobile' }),
      links('utility-right', [['', 'সাহায্য', '/policies/contact'], ['', 'আমার অর্ডার', '/account'], ['', 'রিটার্ন', '/policies/refund']], { align: 'end', divider: 'solid', dividerColor: '#bdbdbd' }, { hide: 'mobile' }),
    ], { minHeight: 36 }),
  ]),
  headerRow('header', 'হেডার', { background: '#ffffff', color: '#111111' }, [
    row('header-row', [
      menuButton({}),
      logo({}, { grow: 'grow' }),
      block('header-search', 'storeSearch', { placeholder: 'পণ্য, ব্র্যান্ড বা ক্যাটাগরি খুঁজুন', height: 42, radius: 6, buttonColor: '#febd69', buttonIconColor: '#111111' }, { style: { maxWidth: 820 }, mobile: { width: 100, order: 'last' } }),
      block('header-icons', 'storeIcons', { showSearch: 'no', labels: 'beside', iconSize: 28, itemGap: 28, badgeColor: '#f08804', badgeTextColor: '#ffffff' }),
    ], { minHeight: 80, gap: 32 }, { minHeight: 60, wrap: 'wrap', paddingBottom: 10, gap: 10 }),
  ]),
  headerRow('category-bar', 'ক্যাটাগরি বার', { background: '#232f3e', color: '#ffffff' }, [
    row('category-row', [
      block('category-button', 'menuButton', { label: 'সব', iconSize: 20 }, { style: { fontSize: 14, fontWeight: '700' } }),
      block('category-menu', 'storeMenu', { itemGap: 24 }, { style: { fontSize: 14, fontWeight: '500' } }),
    ], { minHeight: 42, gap: 24, justify: 'start' }, { minHeight: 40, gap: 18 }),
  ]),
)

// The template each type uses until the store sets its own default: the pages the storefront always had. Read-only;
// sellers duplicate one to change it.
export const builtInTemplates: Record<TemplateType, Content> = {
  header: oneRowHeader(),
  footer: page(typed('storeFooter', 'footer')),
  home: page(typed('productGrid', 'products')),
  product: page(typed('productInfo', 'product')),
  collection: page(typed('collectionHeader', 'collection'), typed('productGrid', 'products')),
  collections: page(typed('collectionList', 'collections', { heading: 'সব কালেকশন' })),
  products: page(typed('productGrid', 'products', { heading: 'সব পণ্য' })),
  page: page(typed('pageContent', 'content')),
  cart: page(typed('cart', 'cart')),
  search: page(typed('search', 'search')),
  account: page(typed('account', 'account')),
  notFound: page({ ...newSection('layout', 'missing'), settings: { name: '404' }, style: { align: 'center', paddingTop: 64, paddingBottom: 64 }, children: [
    { id: 'missing-title', kind: 'heading', props: { text: 'পেজটি পাওয়া যায়নি', level: 'h1' } },
    { id: 'missing-text', kind: 'text', props: { text: '<p>লিংকটি ঠিক আছে কিনা দেখুন, অথবা হোম পেজে ফিরে যান।</p>' } },
    { id: 'missing-home', kind: 'button', props: { text: 'হোম পেজে যান', link: '/', icon: '', iconPosition: 'before', variant: 'outline' }, style: { alignSelf: 'center' } },
  ] }),
}

// Ready-made starting points offered when creating a template, besides blank and the built-in one.
export const readyMade: Partial<Record<TemplateType, { id: string; label: readonly [string, string]; content: Content }[]>> = {
  // New headers: one, two or three rows (blank is offered by the dialog too).
  header: [
    { id: 'one-row', label: ['এক সারির হেডার', 'One-row header'], content: oneRowHeader() },
    { id: 'two-rows', label: ['দুই সারির হেডার', 'Two-row header'], content: twoRowHeader() },
    { id: 'three-rows', label: ['তিন সারির হেডার', 'Three-row header'], content: threeRowHeader() },
  ],
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
