import { lazy, Suspense, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useParams } from 'react-router'
import { Plus, Trash2 } from 'lucide-react'
import { toLayout } from 'storefront/convert'
import { defOf, walk, type Content, type Section } from 'storefront/schema'
import { alternateKinds, starterTheme, templateKinds, variationSettings, type TemplateKind, type ThemeDoc, type ThemeSettings } from 'storefront/theme'
import { pageFonts, presetIds, presets } from 'storefront/themes'
import { useCurrentStore, useStorePath } from '../account-context'
import { api, storefrontUrl } from '../api'
import { DialogHead } from '../components/DialogHead'
import { useDialog } from '../components/dialog'
import { ColorControl } from '../components/SectionDesignControls'
import { Button, Field, IconButton } from '../components/ui'
import { useLang } from '../i18n'
import { Builder, lookOf, usePreviewData, type BuilderHost, type BuilderLoad, type Doc } from './PageEditor'

const CssEditor = lazy(() => import('../components/CssEditor'))

type Saved = { id: string; name: string; revision: number; isLive: boolean; isPublished: boolean; hasChanges: boolean; draft: ThemeDoc }
// The theme being edited: the whole document, which template is open, and which of the open sections are the
// header and footer groups (shown above and below the template, as on the live store).
type Extra = { theme: ThemeDoc; key: string; header: string[]; footer: string[] }

const newId = () => crypto.randomUUID().slice(0, 8)
const kindOf = (key: string) => key.split('.')[0] as TemplateKind
// Sections are edited as layouts (like landing pages): built-in ones become a block inside a layout section.
// The store's header and footer sit flush, without the space a section normally gets above and below.
const flush: readonly string[] = ['storeHeader', 'storeFooter']
const asLayouts = (sections: Section[], lang: string) => sections.map((s) => {
  if (s.type === 'layout') return s
  const layout = toLayout(s, newId)
  return { ...layout, settings: { name: defOf(s.type).label[lang === 'en' ? 1 : 0] }, ...(flush.includes(s.type) ? { style: { ...layout.style, paddingTop: 0, paddingBottom: 0 } } : {}) }
})
const normalize = (doc: ThemeDoc, lang: string): ThemeDoc => ({
  ...doc,
  header: asLayouts(doc.header, lang),
  footer: asLayouts(doc.footer, lang),
  // Templates added since the theme was made (cart, search) start from the starter theme's.
  templates: Object.fromEntries(Object.entries({ ...starterTheme('fresh').templates, ...doc.templates }).map(([k, c]) => [k, { ...c, sections: asLayouts(c.sections, lang) }])),
})

// One template open in the editor, with the header and footer groups around it.
function open(theme: ThemeDoc, key: string, name: string): Doc {
  const template = theme.templates[key]
  const extra: Extra = { theme, key, header: theme.header.map((s) => s.id), footer: theme.footer.map((s) => s.id) }
  return { title: name, handle: '', seoTitle: '', seoDescription: '', content: { ...template, canvas: { header: false, footer: false }, sections: [...theme.header, ...template.sections, ...theme.footer] }, extra }
}

// The whole theme back from what is open: group sections go back to the header and footer, the rest is the template.
export function compose(doc: Doc): ThemeDoc {
  const { theme, key, header, footer } = doc.extra as Extra
  const sections = doc.content.sections
  const { canvas: _, ...content } = doc.content
  const template: Content = { ...content, sections: sections.filter((s) => !header.includes(s.id) && !footer.includes(s.id)) }
  return { ...theme, header: sections.filter((s) => header.includes(s.id)), footer: sections.filter((s) => footer.includes(s.id)), templates: { ...theme.templates, [key]: template } }
}
const switchTo = (doc: Doc, key: string): Doc => open(compose(doc), key, doc.title)
const withTheme = (doc: Doc, change: (theme: ThemeDoc) => ThemeDoc): Doc => {
  const next = change(compose(doc))
  return open(next, (doc.extra as Extra).key, doc.title)
}

const templateLabels: Record<TemplateKind, readonly [string, string]> = {
  home: ['হোম পেজ', 'Home page'], product: ['পণ্যের পেজ', 'Product page'], collection: ['কালেকশন পেজ', 'Collection page'],
  collections: ['সব কালেকশন', 'All collections'], products: ['সব পণ্য', 'All products'], page: ['দোকানের পেজ', 'Store page'], notFound: ['পাওয়া যায়নি (404)', 'Not found (404)'],
  cart: ['কার্ট', 'Cart'], search: ['খোঁজা', 'Search'],
}

export function ThemeEditor() {
  const { id } = useParams()
  const { lang } = useLang()
  const path = useStorePath()
  const current = useCurrentStore()!
  const base = `/stores/${current.store.handle}/themes/${id}`
  const L = (label: readonly [string, string]) => label[lang === 'bn' ? 0 : 1]
  // What the preview shows on product, collection and page templates: one of the store's own, picked in the top bar.
  const [sample, setSample] = useState<{ product: string; collection: string; page: string }>({ product: '', collection: '', page: '' })
  const query = useMemo(() => `?${new URLSearchParams(Object.entries(sample).filter(([, v]) => v)).toString()}`, [sample])
  const preview = usePreviewData(current.store.handle, query)
  const [making, setMaking] = useState<{ doc: Doc; edit: (next: Doc) => void; kind: TemplateKind } | null>(null)

  // Pick the first product, collection and page once the lists arrive, so templates never preview empty.
  useEffect(() => {
    if (!preview) return
    setSample((s) => ({
      product: s.product || preview.choices.products[0]?.id || '',
      collection: s.collection || preview.choices.collections[0]?.id || '',
      page: s.page || preview.choices.pages[0]?.id || '',
    }))
  }, [preview?.choices])

  const toLoad = (saved: Saved, key = 'home'): BuilderLoad => ({
    doc: open(normalize(saved.draft, lang), saved.draft.templates[key] ? key : 'home', saved.name),
    state: { revision: saved.revision, isPublished: saved.isPublished, hasChanges: saved.hasChanges, liveUrl: saved.isLive ? storefrontUrl(current.store.handle) : null },
  })
  // The template that was open when saving, so the editor stays on it after the save reloads the theme.
  const openKey = useRef('home')

  const host: BuilderHost = {
    key: base,
    back: { to: path('/online-store/themes'), label: 'themeBack' },
    title: (doc) => doc.title,
    load: async () => toLoad(await api<Saved>(base)),
    save: async (doc, state) => {
      openKey.current = (doc.extra as Extra).key
      return toLoad(await api<Saved>(base, { method: 'PUT', body: { name: doc.title, draft: compose(doc), revision: state.revision } }), openKey.current)
    },
    publish: async (state) => toLoad(await api<Saved>(`${base}/publish`, { method: 'POST', body: { revision: state.revision } }), openKey.current),
    serialize: (doc) => JSON.stringify([doc.title, compose(doc)]),
    check: (doc) => (doc.title.trim() ? null : 'nameRequired'),
    storeBlocks: true,
    history: `${base}/versions`,
    group: (doc, sid) => {
      const extra = doc.extra as Extra
      return extra.header.includes(sid) ? L(['হেডার', 'Header']) : extra.footer.includes(sid) ? L(['ফুটার', 'Footer']) : null
    },
    top: ({ doc, edit, busy }) => {
      const extra = doc.extra as Extra
      const kind = kindOf(extra.key)
      const keys = templateKinds.flatMap((k) => [k, ...Object.keys(extra.theme.templates).filter((x) => x.startsWith(`${k}.`)).sort()])
      const label = (key: string) => `${L(templateLabels[kindOf(key)])}${key.includes('.') ? ` · ${key.split('.')[1]}` : ''}`
      const pickFrom = kind === 'product' ? 'products' : kind === 'collection' ? 'collections' : kind === 'page' ? 'pages' : null
      return (
        <span className="theme-top">
          <select className="input theme-top__select" aria-label={L(['টেমপ্লেট', 'Template'])} disabled={busy} value={extra.key} onChange={(e) => edit(switchTo(doc, e.target.value))}>
            {keys.map((key) => <option key={key} value={key}>{label(key)}</option>)}
          </select>
          {alternateKinds.includes(kind) && <IconButton label={L(['নতুন টেমপ্লেট', 'New template'])} title={L(['এই ধরনের আরেকটি টেমপ্লেট', 'Another template of this kind'])} disabled={busy} onClick={() => setMaking({ doc, edit, kind })}><Plus size={16} aria-hidden="true" /></IconButton>}
          {extra.key.includes('.') && <IconButton label={L(['টেমপ্লেট মুছুন', 'Delete template'])} title={L(['টেমপ্লেট মুছুন', 'Delete template'])} disabled={busy} onClick={() => {
            const theme = compose(doc)
            const { [extra.key]: _, ...templates } = theme.templates
            edit(open({ ...theme, templates }, kind, doc.title))
          }}><Trash2 size={16} aria-hidden="true" /></IconButton>}
          {pickFrom && preview && preview.choices[pickFrom].length > 0 && (
            <select className="input theme-top__select" aria-label={L(['যা দিয়ে দেখাবে', 'Preview with'])} value={sample[pickFrom === 'products' ? 'product' : pickFrom === 'collections' ? 'collection' : 'page']}
              onChange={(e) => setSample((s) => ({ ...s, [pickFrom === 'products' ? 'product' : pickFrom === 'collections' ? 'collection' : 'page']: e.target.value }))}>
              {preview.choices[pickFrom].map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
        </span>
      )
    },
    settingsLabel: L(['থিমের সেটিংস', 'Theme settings']),
    settings: ({ doc, edit }) => <ThemeSettingsForm doc={doc} edit={edit} />,
    preview: (doc) => {
      if (!preview) return {}
      const theme = compose(doc)
      const kind = kindOf((doc.extra as Extra).key)
      // Product lists show the store's products (a collection's on collection pages), up to each list's limit.
      const limits = new Map<string, number>()
      for (const s of doc.content.sections) for (const n of [s, ...walk(s.children ?? [])]) {
        const settings = 'block' in n && n.block ? n.block.type === 'productGrid' ? n.block.settings : null : (n as Section).type === 'productGrid' ? (n as Section).settings : null
        if (settings) limits.set(n.id, typeof settings.limit === 'number' ? settings.limit : 24)
      }
      return {
        look: lookOf(theme.settings),
        themeCss: theme.css,
        storeName: preview.store.name,
        ctx: {
          store: preview.store, menus: preview.menus, collections: preview.collections,
          grid: (gid) => ({ cards: preview.cards.slice(0, limits.get(gid) ?? 24), page: 1, hasMore: false, base: '' }),
          product: (pid) => (pid && preview.product?.id === pid ? preview.product.product : undefined),
          current: {
            path: '',
            ...(kind === 'product' && preview.product ? { product: preview.product } : {}),
            ...(kind === 'collection' && preview.collection ? { collection: preview.collection } : {}),
            ...(kind === 'page' && preview.page ? { page: preview.page } : {}),
          },
          // The cart and search templates preview with two and four of the store's own products.
          ...(kind === 'cart' ? { cart: {
            lines: preview.cards.slice(0, 2).map((x) => ({ variantId: x.id, productId: x.id, name: x.name, handle: x.handle, label: '', price: x.price, comparePrice: x.comparePrice, qty: 1, image: x.image, available: true })),
            subtotal: preview.cards.slice(0, 2).reduce((n, x) => n + x.price, 0), qty: Math.min(2, preview.cards.length), checkoutToken: '',
          } } : {}),
          ...(kind === 'search' ? { search: { query: preview.cards[0]?.name.split(' ')[0] ?? '', cards: preview.cards.slice(0, 4) } } : {}),
        },
      }
    },
  }

  return <>
    <Builder host={host} />
    {making && <NewTemplateDialog kind={making.kind} taken={Object.keys((making.doc.extra as Extra).theme.templates)} onClose={() => setMaking(null)} onMake={(name) => {
      const theme = compose(making.doc)
      const key = `${making.kind}.${name}`
      making.edit(open({ ...theme, templates: { ...theme.templates, [key]: structuredClone(theme.templates[making.kind]) } }, key, making.doc.title))
      setMaking(null)
    }} />}
  </>
}

// A second template of one kind ("product.gift"), copied from the default, for products, collections or pages that choose it.
function NewTemplateDialog({ kind, taken, onClose, onMake }: { kind: TemplateKind; taken: string[]; onClose: () => void; onMake: (name: string) => void }) {
  const { lang } = useLang()
  const L = (label: readonly [string, string]) => label[lang === 'bn' ? 0 : 1]
  const { ref, close, props } = useDialog(onClose)
  const [name, setName] = useState('')
  const [tried, setTried] = useState(false)
  useEffect(() => { ref.current?.showModal() }, [])
  const clean = name.trim().toLowerCase()
  const problem = !/^[a-z0-9-]{1,30}$/.test(clean) ? L(['ইংরেজি ছোট হাতের অক্ষর, সংখ্যা ও হাইফেন দিয়ে লিখুন, যেমন gift', 'Use lowercase English letters, numbers and hyphens, like gift'])
    : taken.includes(`${kind}.${clean}`) ? L(['এই নামে টেমপ্লেট আছে', 'A template with this name exists']) : null
  const submit = (e: FormEvent) => {
    e.preventDefault()
    setTried(true)
    if (!problem) close(() => onMake(clean))
  }
  return <dialog {...props} className="modal" aria-labelledby="new-template-heading">
    <form onSubmit={submit} noValidate>
      <DialogHead id="new-template-heading" title={`${L(['নতুন টেমপ্লেট', 'New template'])}: ${L(templateLabels[kind])}`} onClose={() => close()} />
      <div className="dialog__body">
        <Field id="template-name" label={L(['টেমপ্লেটের নাম', 'Template name'])} placeholder="gift" maxLength={30} autoComplete="off" autoFocus value={name} error={tried && problem ? problem : undefined}
          help={L(['ডিফল্ট টেমপ্লেটের কপি থেকে শুরু হবে। পণ্য, কালেকশন বা পেজের সেটিংসে এই টেমপ্লেট বেছে নেওয়া যাবে।', 'It starts as a copy of the default. Products, collections or pages can choose it in their settings.'])}
          onChange={(e) => setName(e.target.value)} />
      </div>
      <footer className="dialog__foot dialog__foot--split">
        <Button onClick={() => close()}>{L(['বাতিল', 'Cancel'])}</Button>
        <Button type="submit" variant="primary">{L(['টেমপ্লেট বানান', 'Create template'])}</Button>
      </footer>
    </form>
  </dialog>
}

// Theme settings: name, one-click styles, colours, corners, fonts, width and the theme's own CSS.
function ThemeSettingsForm({ doc, edit }: { doc: Doc; edit: (next: Doc, key?: string) => void }) {
  const { lang } = useLang()
  const L = (label: readonly [string, string]) => label[lang === 'bn' ? 0 : 1]
  const theme = compose(doc)
  const s = theme.settings
  const set = (patch: Partial<ThemeSettings>, key?: string) => edit(withTheme(doc, (th) => ({ ...th, settings: { ...th.settings, ...patch } })), key)
  const colorLabels: Record<keyof ThemeSettings['colors'], readonly [string, string]> = {
    accent: ['মূল রং (বাটন, দাম)', 'Main colour (buttons, prices)'], ink: ['লেখার রং', 'Text colour'], paper: ['পটভূমি', 'Background'], tint: ['হালকা পটভূমি', 'Soft background'], rule: ['রেখা ও বর্ডার', 'Lines and borders'],
  }
  return <div className="editor__form">
    <Field id="theme-name" label={L(['থিমের নাম', 'Theme name'])} maxLength={60} value={doc.title} error={!doc.title.trim() ? L(['নাম দিন', 'Enter a name']) : undefined} onChange={(e) => edit({ ...doc, title: e.target.value }, 'title')} />
    <fieldset className="editor-canvas">
      <legend>{L(['এক ক্লিকে স্টাইল', 'One-click style'])}</legend>
      <p className="muted">{L(['রং, ফন্ট ও কোণ একসাথে বদলায়। পরে আলাদা করে ঠিক করতে পারবেন।', 'Sets colours, font and corners together. Fine-tune them below.'])}</p>
      <div className="theme-styles">
        {presetIds.map((id) => {
          const v = presets[id].vars
          return <button key={id} type="button" className="theme-styles__item" title={presets[id].label[lang === 'bn' ? 0 : 1]} onClick={() => {
            const next = variationSettings(id)
            set({ ...next, latin: s.latin, width: s.width })
          }}><span style={{ background: v.paper, borderColor: v.rule }}><i style={{ background: v.accent }} /></span>{presets[id].label[lang === 'bn' ? 0 : 1]}</button>
        })}
      </div>
    </fieldset>
    <fieldset className="editor-canvas">
      <legend>{L(['রং', 'Colours'])}</legend>
      {(Object.keys(colorLabels) as (keyof ThemeSettings['colors'])[]).map((key) => (
        <ColorControl key={key} id={`theme-color-${key}`} label={L(colorLabels[key])} value={s.colors[key]} inherited="" onChange={(value, typing) => {
          if (/^#[0-9a-f]{6}$/i.test(value)) set({ colors: { ...s.colors, [key]: value.toLowerCase() } }, typing ? `color-${key}` : undefined)
        }} />
      ))}
    </fieldset>
    <fieldset className="editor-canvas">
      <legend>{L(['লেখা ও আকার', 'Type and size'])}</legend>
      {(['bangla', 'latin'] as const).map((kind) => <div key={kind} className="field">
        <label htmlFor={`theme-font-${kind}`}>{kind === 'bangla' ? L(['বাংলা ফন্ট', 'Bangla font']) : L(['ইংরেজি ফন্ট', 'English font'])}</label>
        <select className="input" id={`theme-font-${kind}`} value={s[kind]} onChange={(e) => set({ [kind]: e.target.value })}>
          <option value="">{L(['সাধারণ', 'Default'])}</option>
          {Object.keys(pageFonts[kind]).map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
      </div>)}
      <Field id="theme-radius" type="number" label={L(['কোণের গোলভাব (px)', 'Corner roundness (px)'])} min={0} max={32} value={String(s.radius)} onChange={(e) => { const n = Number.parseInt(e.target.value, 10); if (n >= 0 && n <= 32) set({ radius: n }, 'radius') }} />
      <Field id="theme-width" type="number" label={L(['কন্টেন্টের সর্বোচ্চ প্রস্থ (px)', 'Content max width (px)'])} min={720} max={1600} step={20} value={String(s.width)} onChange={(e) => { const n = Number.parseInt(e.target.value, 10); if (n >= 720 && n <= 1600) set({ width: n }, 'width') }} />
    </fieldset>
    <div className="field">
      <Suspense fallback={<div className="css-editor css-editor--loading" />}>
        <CssEditor value={theme.css} label={L(['থিমের কাস্টম CSS', 'Theme custom CSS'])} describedBy="theme-css-help" maxLength={20000} onChange={(css) => edit(withTheme(doc, (th) => ({ ...th, css })), 'css')} />
      </Suspense>
      {theme.css.includes('<')
        ? <p className="field__help field__help--error" role="alert">{L(['CSS-এ < চিহ্ন রাখা যাবে না।', 'CSS cannot contain the < character.'])}</p>
        : <p className="field__help" id="theme-css-help">{L(['এই থিমের সব পেজে কাজ করে, ল্যান্ডিং পেজেও (দোকানের হেডার চালু থাকলে)।', 'Applies to every page of this theme, and to landing pages that show the store header.'])}</p>}
    </div>
  </div>
}
