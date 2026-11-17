import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router'
import { toLayout } from 'storefront/convert'
import { defOf, maxCss, walk, type Section } from 'storefront/schema'
import { pageFonts } from 'storefront/themes'
import type { TemplateType } from 'storefront/site'
import { useCurrentStore, useStorePath } from '../account-context'
import { api, errorCode, storefrontUrl } from '../api'
import { Field, LinkButton } from '../components/ui'
import { useLang } from '../i18n'
import { Builder, frameFor, HeaderFooterFields, lookOf, usePreviewData, type BuilderHost, type BuilderLoad, type Doc, type PreviewData, type SettingsProps } from './PageEditor'
import { templateLabels } from './Templates'

const CssEditor = lazy(() => import('../components/CssEditor'))

type Saved = { id: string; type: TemplateType; title: string; revision: number; isDefault: boolean; builtIn: boolean; isPublished: boolean; hasChanges: boolean; draft: Doc['content'] }

const newId = () => crypto.randomUUID().slice(0, 8)
// Header and footer templates are the frame themselves; every other type previews inside the store's default ones.
const framesItself = (type: TemplateType) => type === 'header' || type === 'footer'
// The header and footer sit flush, without the space a section normally gets above and below.
const flush: readonly string[] = ['storeHeader', 'storeFooter', 'announcement']
// Sections are edited as layouts (as on landing pages): a built-in one becomes a block inside a layout section.
const asLayouts = (sections: Section[], lang: string) => sections.map((s) => {
  if (s.type === 'layout') return s
  const layout = toLayout(s, newId)
  return { ...layout, settings: { name: defOf(s.type).label[lang === 'en' ? 1 : 0] }, ...(flush.includes(s.type) ? { style: { ...layout.style, paddingTop: 0, paddingBottom: 0 } } : {}) }
})

// One template (header, product page, …) in the page builder. Page templates preview inside the store's default
// header and footer; header and footer templates preview on their own.
export function TemplateEditor() {
  const { id } = useParams()
  const { lang } = useLang()
  const path = useStorePath()
  const current = useCurrentStore()!
  const base = `/stores/${current.store.handle}/templates/${id}`
  const L = (label: readonly [string, string]) => label[lang === 'bn' ? 0 : 1]
  const [type, setType] = useState<TemplateType | null>(null)
  const [isDefault, setIsDefault] = useState(false)
  const [builtIn, setBuiltIn] = useState(false)
  // What product, collection or store page the preview shows, picked in the top bar.
  const [sample, setSample] = useState<{ product: string; collection: string; page: string }>({ product: '', collection: '', page: '' })
  const query = useMemo(() => `?${new URLSearchParams(Object.entries(sample).filter(([, v]) => v)).toString()}`, [sample])
  const preview = usePreviewData(current.store.handle, query)

  useEffect(() => {
    if (!preview) return
    setSample((s) => ({
      product: s.product || preview.choices.products[0]?.id || '',
      collection: s.collection || preview.choices.collections[0]?.id || '',
      page: s.page || preview.choices.pages[0]?.id || '',
    }))
  }, [preview?.choices])

  const toLoad = (saved: Saved): BuilderLoad => {
    setType(saved.type)
    setIsDefault(saved.isDefault)
    setBuiltIn(saved.builtIn)
    return {
      doc: { title: saved.title, handle: '', seoTitle: '', seoDescription: '', content: { ...saved.draft, canvas: framesItself(saved.type) ? { header: false, footer: false } : saved.draft.canvas ?? { header: true, footer: true }, sections: asLayouts(saved.draft.sections, lang) } },
      state: { revision: saved.revision, isPublished: saved.isPublished, hasChanges: saved.hasChanges, liveUrl: saved.isPublished ? storefrontUrl(current.store.handle) : null },
    }
  }
  // A page template saves its chosen header and footer (left out while both are the store's defaults); a header or
  // footer template's canvas is the editor's own (no frame around it) and is not saved.
  const draftOf = (doc: Doc) => {
    const { canvas, ...content } = doc.content
    const chosen = type && !framesItself(type) && canvas && (!canvas.header || !canvas.footer || canvas.headerId || canvas.footerId)
    return chosen ? { ...content, canvas } : content
  }
  const pickFrom = type === 'product' ? 'products' : type === 'collection' ? 'collections' : type === 'page' ? 'pages' : null
  const sampleKey = type === 'product' ? 'product' : type === 'collection' ? 'collection' : 'page'

  const host: BuilderHost = {
    key: base,
    back: { to: path('/online-store/templates'), label: 'templateBack' },
    title: (doc) => doc.title,
    load: async () => toLoad(await api<Saved>(base)),
    save: async (doc, state) => toLoad(await api<Saved>(base, { method: 'PUT', body: { title: doc.title, draft: draftOf(doc), revision: state.revision } })),
    publish: async (state) => toLoad(await api<Saved>(`${base}/publish`, { method: 'POST', body: { revision: state.revision } })),
    serialize: (doc) => JSON.stringify([doc.title, draftOf(doc)]),
    check: (doc) => (doc.title.trim() ? null : 'nameRequired'),
    storeBlocks: true,
    history: `${base}/versions`,
    top: () => type && (
      <span className="theme-top">
        <span className="theme-top__type">{L(templateLabels[type])}{isDefault && ` · ${L(['ডিফল্ট', 'Default'])}`}</span>
        {pickFrom && preview && preview.choices[pickFrom].length > 0 && (
          <select className="input theme-top__select" aria-label={L(['যা দিয়ে দেখাবে', 'Preview with'])} value={sample[sampleKey]} onChange={(e) => setSample((s) => ({ ...s, [sampleKey]: e.target.value }))}>
            {preview.choices[pickFrom].map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
      </span>
    ),
    settingsLabel: L(['টেমপ্লেটের সেটিংস', 'Template settings']),
    settings: (props) => <TemplateSettings {...props} base={base} type={type} isDefault={isDefault} builtIn={builtIn} onDefault={setIsDefault} frames={preview} />,
    preview: (doc) => {
      if (!preview || !type) return {}
      const framed = !framesItself(type)
      // Product lists show the store's products (a collection's on collection templates), up to each list's limit.
      const limits = new Map<string, number>()
      for (const s of doc.content.sections) for (const n of [s, ...walk(s.children ?? [])]) {
        const settings = 'block' in n && n.block ? n.block.type === 'productGrid' ? n.block.settings : null : (n as Section).type === 'productGrid' ? (n as Section).settings : null
        if (settings) limits.set(n.id, typeof settings.limit === 'number' ? settings.limit : 24)
      }
      return {
        look: lookOf(preview.style),
        themeCss: preview.style.css,
        storeName: preview.store.name,
        frame: framed ? { header: frameFor(preview, 'header', doc.content.canvas?.headerId), footer: frameFor(preview, 'footer', doc.content.canvas?.footerId) } : undefined,
        ctx: {
          lang: preview.language,
          store: preview.store, menus: preview.menus, collections: preview.collections,
          grid: (gid) => ({ cards: preview.cards.slice(0, limits.get(gid) ?? 24), page: 1, hasMore: false, base: '' }),
          product: (pid) => (pid && preview.product?.id === pid ? preview.product.product : undefined),
          current: {
            path: '',
            ...(type === 'product' && preview.product ? { product: preview.product } : {}),
            ...(type === 'collection' && preview.collection ? { collection: preview.collection } : {}),
            ...(type === 'page' && preview.page ? { page: preview.page } : {}),
          },
          // The cart and search templates preview with two and four of the store's own products.
          ...(type === 'cart' ? { cart: {
            lines: preview.cards.slice(0, 2).map((x) => ({ variantId: x.id, productId: x.id, name: x.name, handle: x.handle, label: '', price: x.price, comparePrice: x.comparePrice, qty: 1, image: x.image, available: true })),
            subtotal: preview.cards.slice(0, 2).reduce((n, x) => n + x.price, 0), qty: Math.min(2, preview.cards.length), checkoutToken: '',
          } } : {}),
          // The account template previews its sign-in form (the page a signed-out buyer sees first).
          ...(type === 'account' ? { account: { mode: 'login' as const } } : {}),
          ...(type === 'search' ? { search: { query: preview.cards[0]?.name.split(' ')[0] ?? '', cards: preview.cards.slice(0, 4) } } : {}),
        },
      }
    },
  }
  return <Builder host={host} />
}

// Template settings: name, whether it is the store's default for its type, page fonts and the template's own CSS.
function TemplateSettings({ doc, edit, busy, state, run, setError, setToast, base, type, isDefault, builtIn, onDefault, setState, frames }: SettingsProps & { base: string; type: TemplateType | null; isDefault: boolean; builtIn: boolean; onDefault: (v: boolean) => void; frames: PreviewData | null }) {
  const { lang } = useLang()
  const L = (label: readonly [string, string]) => label[lang === 'bn' ? 0 : 1]
  const path = useStorePath()
  const toggleDefault = () => run(async () => {
    try {
      await api(`${base}/default`, { method: isDefault ? 'DELETE' : 'POST' })
      onDefault(!isDefault)
      setToast(isDefault ? L(['আর ডিফল্ট নয়, বিল্ট-ইন টেমপ্লেট দেখাবে।', 'No longer the default; the built-in template shows instead.']) : L(['এটি এখন ডিফল্ট টেমপ্লেট।', 'This is now the default template.']))
    } catch (err) {
      setError(errorCode(err))
    }
  })
  // Back to draft: products, collections and pages that picked it show the default again. A default must stop being one first.
  const unpublish = () => run(async () => {
    try {
      await api(`${base}/unpublish`, { method: 'POST' })
      setState({ ...state, isPublished: false, hasChanges: false, liveUrl: null })
      setToast(L(['অপ্রকাশিত হয়েছে। দোকানে আর দেখাবে না।', 'Unpublished. Your store no longer shows it.']))
    } catch (err) {
      setError(errorCode(err))
    }
  })
  return <div className="editor__form">
    <Field id="template-title" label={L(['টেমপ্লেটের নাম', 'Template name'])} maxLength={100} value={doc.title} error={!doc.title.trim() ? L(['নাম দিন', 'Enter a name']) : undefined} onChange={(e) => edit({ ...doc, title: e.target.value }, 'title')} />
    {type && builtIn && <fieldset className="editor-canvas">
      <legend>{L(['বিল্ট-ইন টেমপ্লেট', 'Built-in template'])}</legend>
      <p className="muted">{L(['অন্য কোনো টেমপ্লেট ডিফল্ট না থাকলে দোকানে এটিই দেখায়। ইচ্ছেমতো এডিট করুন; এটি মোছা যায় না।', 'Your store shows this unless another template is the default. Edit it as you like; it cannot be deleted.'])}</p>
    </fieldset>}
    {type && !builtIn && <fieldset className="editor-canvas">
      <legend>{L(['ডিফল্ট', 'Default'])}</legend>
      <p className="muted">{isDefault
        ? L(['দোকানের সব জায়গায় এই ধরনের পেজে এটি দেখায়, যদি না কোনো পণ্য, কালেকশন বা পেজ অন্যটি বেছে নেয়।', 'Shows for this kind of page everywhere in the store, unless a product, collection or page picks another.'])
        : L(['ডিফল্ট করলে দোকানের সব জায়গায় এই ধরনের পেজে এটি দেখাবে। আগে প্রকাশ করুন।', 'Make it the default to show it for this kind of page everywhere in the store. Publish it first.'])}</p>
      <button type="button" className="btn" disabled={busy || (!isDefault && !state.isPublished)} onClick={() => void toggleDefault()}>{isDefault ? L(['ডিফল্ট থেকে সরান', 'Stop being the default']) : L(['ডিফল্ট করুন', 'Make default'])}</button>
    </fieldset>}
    {type && !builtIn && state.isPublished && <fieldset className="editor-canvas">
      <legend>{L(['প্রকাশিত', 'Published'])}</legend>
      <p className="muted">{isDefault
        ? L(['ডিফল্ট টেমপ্লেট অপ্রকাশিত করা যায় না। আগে ডিফল্ট থেকে সরান।', 'A default template cannot be unpublished. Stop it being the default first.'])
        : L(['অপ্রকাশিত করলে দোকান এটি আর দেখাবে না; যে পণ্য, কালেকশন বা পেজ এটি বেছে নিয়েছিল সেগুলো ডিফল্ট দেখাবে।', 'Unpublish to stop your store using it; products, collections and pages that picked it show the default instead.'])}</p>
      <button type="button" className="btn" disabled={busy || isDefault} onClick={() => void unpublish()}>{L(['অপ্রকাশিত করুন', 'Unpublish'])}</button>
    </fieldset>}
    {type && !framesItself(type) && <HeaderFooterFields doc={doc} edit={edit} frames={frames} />}
    <fieldset className="editor-canvas"><legend>{L(['ফন্ট', 'Fonts'])}</legend>
      <p className="muted">{L(['এই টেমপ্লেটের ফন্ট। ফাঁকা রাখলে সাইট সেটিংসের ফন্ট থাকে।', 'Fonts for this template. Leave blank to keep the Site settings fonts.'])}</p>
      {(['bangla', 'latin'] as const).map((kind) => <div key={kind} className="field">
        <label htmlFor={`template-font-${kind}`}>{kind === 'bangla' ? L(['বাংলা ফন্ট', 'Bangla font']) : L(['ইংরেজি ফন্ট', 'English font'])}</label>
        <select className="input" id={`template-font-${kind}`} value={doc.content.fonts?.[kind] ?? ''} onChange={(e) => {
          const fonts = { ...doc.content.fonts, [kind]: e.target.value || undefined }
          edit({ ...doc, content: { ...doc.content, fonts: fonts.bangla || fonts.latin ? fonts : undefined } })
        }}>
          <option value="">{L(['সাইটের ফন্ট', 'Site font'])}</option>
          {Object.keys(pageFonts[kind]).map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
      </div>)}
    </fieldset>
    <div className="field">
      <Suspense fallback={<div className="css-editor css-editor--loading" />}>
        <CssEditor value={doc.content.css ?? ''} label={L(['এই টেমপ্লেটের CSS', 'CSS for this template'])} describedBy="template-css-help" maxLength={maxCss} onChange={(css) => edit({ ...doc, content: { ...doc.content, css } }, 'css')} />
      </Suspense>
      {doc.content.css?.includes('<')
        ? <p className="field__help field__help--error" role="alert">{L(['CSS-এ < চিহ্ন রাখা যাবে না।', 'CSS cannot contain the < character.'])}</p>
        : <p className="field__help" id="template-css-help">{L(['পুরো দোকানের রং ও ফন্ট সাইট সেটিংসে।', 'The whole store’s colours and fonts are in Site settings.'])}</p>}
    </div>
    <LinkButton to={path('/online-store')}>{L(['সাইট সেটিংস খুলুন', 'Open Site settings'])}</LinkButton>
  </div>
}
