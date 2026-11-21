import { lazy, Suspense, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router'
import { ArrowLeft, ChevronLeft, ChevronRight, Code, Eye, Image as ImageIcon, LayoutTemplate, ListTree, Monitor, MousePointerClick, Palette, PanelsTopLeft, RotateCcw, Settings, Smartphone, SquareMousePointer, TextCursorInput, Type } from 'lucide-react'
import { catalogCss } from 'storefront/catalog'
import { defOf, nodeDefs, type Content, type PageNode, type Section } from 'storefront/schema'
import { css as storefrontCss, PageView, type Ctx } from 'storefront/sections'
import { pageColor, siteCss, siteElementFields, siteFontsHref, type SiteColors, type SiteElementKey, type SiteStyle } from 'storefront/site'
import { pageFonts } from 'storefront/themes'
import { useCurrentStore, useStorePath } from '../account-context'
import { api, errorCode } from '../api'
import { ColorControl, NumericInput } from '../components/SectionDesignControls'
import { loadScreen } from '../components/ScreenError'
import { Button, IconButton, PageTitle } from '../components/ui'
import { errorLabel, useLang } from '../i18n'
import { frameFor, usePreviewData, type PreviewData } from './PageEditor'

const CssEditor = lazy(() => loadScreen(() => import('../components/CssEditor')))

// Online store › Customize: the store's global styles (like Elementor's Site Settings). Colours, type, buttons, form
// fields, images, width, the default header and footer and site CSS, set once for every store page and landing page.
// The page structure on the left is for finding things, not editing: clicking an element (there or in the preview)
// opens the global style it follows. Page sections and elements keep their own overrides from the page builder.

type GroupKey = 'colors' | 'type' | 'button' | 'input' | 'image' | 'layout' | 'frames' | 'css'
type PageKey = 'home' | 'product'
const shell = `<!doctype html><html lang="bn"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${storefrontCss}${catalogCss}</style></head><body></body></html>`
// What the preview marks: the element under the pointer (dashed) and the one picked (solid), never part of the page.
const markCss = '[data-cz=hover]{outline:2px dashed #1f7a4d;outline-offset:2px}[data-cz=picked]{outline:2px solid #1f7a4d;outline-offset:2px}*{cursor:default}'

// Which global style an element in the preview follows, from what was clicked.
function groupOfElement(el: Element): { group: GroupKey; target: Element } {
  const pick = (selector: string) => el.closest(selector)
  const field = pick('input, select, textarea, .sf-choice, .sf-hsearch')
  if (field) return { group: 'input', target: field }
  const button = pick('.sf-button, button')
  if (button) return { group: 'button', target: button }
  const image = pick('img, .sf-n-image, .sf-card__image, .sf-product__image')
  if (image) return { group: 'image', target: image.closest('.sf-n-image, .sf-card__image') ?? image }
  const text = pick('h1, h2, h3, h4, h5, h6, p, li, .sf-n-heading, .sf-n-text, .sf-heading')
  if (text) return { group: 'type', target: text }
  return { group: 'colors', target: el.closest('[data-node], [data-section]') ?? el }
}
// Which global style a node of the page structure follows.
const formBlocks = new Set(['order', 'productInfo', 'cart', 'search', 'account', 'storeSearch'])
function groupOfNode(node: PageNode | null): GroupKey {
  if (!node) return 'layout'
  if (node.kind === 'heading' || node.kind === 'text') return 'type'
  if (node.kind === 'button') return 'button'
  if (node.kind === 'image') return 'image'
  if (node.kind === 'block' && node.block && formBlocks.has(node.block.type)) return 'input'
  return 'colors'
}

export function Customize() {
  const { t, lang } = useLang()
  const L = (bn: string, en: string) => (lang === 'bn' ? bn : en)
  const path = useStorePath()
  const current = useCurrentStore()!
  const handle = current.store.handle
  const canEdit = current.role !== 'staff'
  // The product page previews the store's newest product; asked for once the first load lists them.
  const [productId, setProductId] = useState('')
  const preview = usePreviewData(handle, productId ? `?product=${productId}` : '')
  const [style, setStyle] = useState<SiteStyle | null>(null)
  const [saved, setSaved] = useState('')
  const [frames, setFrames] = useState<{ header: string; footer: string }>({ header: '', footer: '' })
  const [savedFrames, setSavedFrames] = useState('')
  const [page, setPage] = useState<PageKey>('home')
  const [mobile, setMobile] = useState(false)
  const [view, setView] = useState<'settings' | 'structure'>('settings')
  // Phones show one pane at a time, switched from the bottom dock (as in the page builder).
  const [pane, setPane] = useState<'edit' | 'preview'>('edit')
  const [group, setGroup] = useState<GroupKey | null>(null)
  const [picked, setPicked] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    if (!preview) return
    if (!style) { setStyle(preview.style); setSaved(JSON.stringify(preview.style)) }
    if (!savedFrames) {
      const chosen = { header: preview.headers.find((f) => f.isDefault)?.id ?? '', footer: preview.footers.find((f) => f.isDefault)?.id ?? '' }
      setFrames(chosen)
      setSavedFrames(JSON.stringify(chosen))
    }
    if (!productId && preview.choices.products[0]) setProductId(preview.choices.products[0].id)
  }, [preview])

  const dirty = Boolean(style) && (JSON.stringify(style) !== saved || JSON.stringify(frames) !== savedFrames)
  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  if (!preview || !style) return <div className="editor-loading" role="status" aria-label={L('লোড হচ্ছে', 'Loading')} />

  const setS = (next: Partial<SiteStyle>) => { setStyle({ ...style, ...next }); setDone(false) }
  const setEl = (key: SiteElementKey, value: string | number | undefined) => {
    const elements = { ...style.elements }
    if (value === undefined || value === '') delete elements[key]
    else elements[key] = value
    setS({ elements })
  }

  const save = async () => {
    if (!canEdit || busy) return
    setBusy(true); setError(null)
    try {
      const next = await api<SiteStyle>(`/stores/${handle}/site-style`, { method: 'PUT', body: style })
      // The default header and footer: make the chosen one the default, or (built-in chosen) clear the current default.
      const was = JSON.parse(savedFrames) as typeof frames
      for (const type of ['header', 'footer'] as const) {
        if (frames[type] === was[type]) continue
        if (frames[type]) await api(`/stores/${handle}/templates/${frames[type]}/default`, { method: 'POST' })
        else if (was[type]) await api(`/stores/${handle}/templates/${was[type]}/default`, { method: 'DELETE' })
      }
      setStyle(next)
      setSaved(JSON.stringify(next))
      setSavedFrames(JSON.stringify(frames))
      setDone(true)
    } catch (err) {
      setError(errorCode(err))
    } finally {
      setBusy(false)
    }
  }
  const discard = () => { setStyle(JSON.parse(saved) as SiteStyle); setFrames(JSON.parse(savedFrames) as typeof frames); setLeaving(false) }

  const content = page === 'product' ? preview.productPage : preview.home
  const frameSections = (type: 'header' | 'footer') => {
    const list = type === 'header' ? preview.headers : preview.footers
    const chosen = frames[type] ? list.find((f) => f.id === frames[type]) : list.find((f) => f.builtIn)
    return chosen?.sections ?? frameFor(preview, type)
  }
  const header = frameSections('header')
  const footer = frameSections('footer')

  const groups: { key: GroupKey; label: string; help: string; Icon: typeof Palette }[] = [
    { key: 'colors', label: L('রং', 'Colours'), help: L('মূল রং, লেখা, পটভূমি', 'Main, text, backgrounds'), Icon: Palette },
    { key: 'type', label: L('লেখা ও ফন্ট', 'Typography'), help: L('ফন্ট, লেখা আর শিরোনামের মাপ', 'Fonts, text and heading sizes'), Icon: Type },
    { key: 'button', label: L('বাটন', 'Buttons'), help: L('রং, মাপ, কোণা, মাউস রাখলে', 'Colours, size, corners, hover'), Icon: SquareMousePointer },
    { key: 'input', label: L('ফর্মের ঘর', 'Form fields'), help: L('অর্ডার ফর্ম, খোঁজা, অ্যাকাউন্ট', 'Order form, search, account'), Icon: TextCursorInput },
    { key: 'image', label: L('ছবি', 'Images'), help: L('ছবি আর পণ্যের কার্ডের কোণা', 'Corners of images and product cards'), Icon: ImageIcon },
    { key: 'layout', label: L('লেআউট', 'Layout'), help: L('কন্টেন্টের প্রস্থ, কোণার গোলভাব', 'Content width, corner roundness'), Icon: LayoutTemplate },
    { key: 'frames', label: L('হেডার ও ফুটার', 'Header and footer'), help: L('দোকানের ডিফল্ট হেডার আর ফুটার', "The store's default header and footer"), Icon: PanelsTopLeft },
    { key: 'css', label: L('কাস্টম CSS', 'Custom CSS'), help: L('পুরো সাইটের জন্য নিজের CSS', 'Your own CSS for the whole site'), Icon: Code },
  ]
  const open = groups.find((g) => g.key === group)

  // Shown in the top bar on wide screens and, with short labels, in the bottom dock on phones.
  const dockLabel = (dock: boolean, text: string) => dock && <span className="editor__dock-label">{text}</span>
  const views = (dock: boolean) => <>
    <IconButton label={L('সাইটের সেটিংস', 'Site settings')} title={L('সাইটের সেটিংস', 'Site settings')} aria-pressed={view === 'settings' && (!dock || pane === 'edit')} onClick={() => { setView('settings'); setGroup(null); setPane('edit') }}><Settings size={dock ? 20 : 16} aria-hidden="true" />{dockLabel(dock, L('সেটিংস', 'Settings'))}</IconButton>
    <IconButton label={L('পেজের গঠন', 'Page structure')} title={L('পেজের গঠন', 'Page structure')} aria-pressed={view === 'structure' && (!dock || pane === 'edit')} onClick={() => { setView('structure'); setGroup(null); setPane('edit') }}><ListTree size={dock ? 20 : 16} aria-hidden="true" />{dockLabel(dock, L('গঠন', 'Structure'))}</IconButton>
    {dock && <IconButton label={L('প্রিভিউ', 'Preview')} title={L('প্রিভিউ', 'Preview')} aria-pressed={pane === 'preview'} onClick={() => setPane('preview')}><Eye size={20} aria-hidden="true" />{dockLabel(true, L('প্রিভিউ', 'Preview'))}</IconButton>}
  </>

  return (
    <div className="editor customize" data-pane={pane}>
      <PageTitle title={L('দোকান সাজান', 'Customize store')} />
      <header className="editor__bar">
        <div className="editor__nav">
          <Link className="detail-head__back" to={path('/online-store')} aria-label={L('অনলাইন স্টোরে ফিরুন', 'Back to Online store')} title={L('অনলাইন স্টোরে ফিরুন', 'Back to Online store')}
            onClick={(e) => { if (dirty) { e.preventDefault(); setLeaving(true) } }}><ArrowLeft size={16} aria-hidden="true" /></Link>
          <span className="editor__views">{views(false)}</span>
        </div>
        <div className="editor__title">
          <h1>{L('দোকান সাজান', 'Customize store')}</h1>
          <select className="input theme-top__select" aria-label={L('যে পেজ দেখাবে', 'Page to preview')} value={page} onChange={(e) => { setPage(e.target.value as PageKey); setPicked(null) }}>
            <option value="home">{L('হোম পেজ', 'Home page')}</option>
            <option value="product" disabled={!preview.product}>{L('পণ্যের পেজ', 'Product page')}{preview.product ? `: ${preview.product.name}` : ''}</option>
          </select>
        </div>
        <div className="editor__tools">
          {leaving
            ? <><span className="editor__save-state">{L('সেভ না করা পরিবর্তন আছে।', 'You have unsaved changes.')}</span><Button onClick={() => setLeaving(false)}>{L('থাকুন', 'Keep editing')}</Button><Link className="btn btn--danger" to={path('/online-store')}>{L('বাদ দিয়ে বের হোন', 'Discard and leave')}</Link></>
            : <>
              <span className="editor__save-state" role="status">{busy ? L('সেভ হচ্ছে…', 'Saving…') : dirty ? L('সেভ হয়নি', 'Unsaved') : done ? L('সেভ হয়েছে', 'Saved') : ''}</span>
              <div className="editor__devices">
                <IconButton label={L('ডেস্কটপ', 'Desktop')} title={L('ডেস্কটপ', 'Desktop')} aria-pressed={!mobile} onClick={() => setMobile(false)}><Monitor size={16} aria-hidden="true" /></IconButton>
                <IconButton label={L('মোবাইল', 'Phone')} title={L('মোবাইল', 'Phone')} aria-pressed={mobile} onClick={() => setMobile(true)}><Smartphone size={16} aria-hidden="true" /></IconButton>
              </div>
              {dirty && <Button disabled={busy} onClick={discard}>{L('বাতিল', 'Discard')}</Button>}
              <Button variant="primary" disabled={!canEdit || busy || !dirty} aria-busy={busy} onClick={() => void save()}>{L('সেভ করুন', 'Save')}</Button>
            </>}
        </div>
      </header>

      {error && <div className="editor__error" role="alert"><p>{L('সেভ হয়নি: ', 'Not saved: ')}{t(errorLabel(error))}</p></div>}

      <div className="editor__sidebar" data-editing="true">
        <aside className="editor__settings" aria-label={open?.label ?? (view === 'settings' ? L('সাইটের সেটিংস', 'Site settings') : L('পেজের গঠন', 'Page structure'))}>
          {open ? <>
            <div className="editor__settings-head">
              <h2 className="editor__heading"><button type="button" className="customize__back" onClick={() => setGroup(null)} aria-label={L('ফিরে যান', 'Back')}><ChevronLeft size={16} aria-hidden="true" /></button>{open.label}</h2>
            </div>
            <div className="editor__form">
              {!canEdit && <p className="design-help">{L('শুধু মালিক ও অ্যাডমিন এগুলো বদলাতে পারেন।', 'Only owners and admins can change these.')}</p>}
              <GroupForm group={open.key} style={style} setS={setS} setEl={setEl} frames={frames} setFrames={(f) => { setFrames(f); setDone(false) }} preview={preview} />
            </div>
          </> : view === 'settings' ? <>
            <div className="editor__settings-head"><h2 className="editor__heading">{L('সাইটের সেটিংস', 'Site settings')}</h2></div>
            <p className="design-help customize__intro">{L('এখানে যা বদলাবেন, দোকানের সব পেজ আর ল্যান্ডিং পেজে একসাথে বদলাবে। কোনো সেকশন বা এলিমেন্টের নিজের স্টাইল থাকলে সেটাই থাকবে।', 'What you change here changes every store page and landing page at once. A section or element with its own style keeps it.')}</p>
            <ul className="customize-groups">
              {groups.map(({ key, label, help, Icon }) => (
                <li key={key}><button type="button" onClick={() => setGroup(key)}>
                  <span className="customize-groups__icon"><Icon size={16} aria-hidden="true" /></span>
                  <span className="customize-groups__text"><strong>{label}</strong><span>{help}</span></span>
                  <ChevronRight size={16} aria-hidden="true" />
                </button></li>
              ))}
            </ul>
          </> : <>
            <div className="editor__settings-head"><h2 className="editor__heading">{L('পেজের গঠন', 'Page structure')}</h2></div>
            <p className="design-help customize__intro"><MousePointerClick size={14} aria-hidden="true" /> {L('কিছু বাছাই করলে তার সাইট-জুড়ে স্টাইল খুলবে। সেকশন বদলাতে টেমপ্লেট বা ল্যান্ডিং পেজ এডিট করুন।', 'Pick anything to open the site-wide style it follows. To change sections, edit the template or landing page.')}</p>
            <Structure label={L('হেডার', 'Header')} sections={header} picked={picked} onPick={(id, node) => { setPicked(id); setGroup(groupOfNode(node)) }} />
            <Structure label={page === 'product' ? L('পণ্যের পেজ', 'Product page') : L('হোম পেজ', 'Home page')} sections={content.sections} picked={picked} onPick={(id, node) => { setPicked(id); setGroup(groupOfNode(node)) }} />
            <Structure label={L('ফুটার', 'Footer')} sections={footer} picked={picked} onPick={(id, node) => { setPicked(id); setGroup(groupOfNode(node)) }} />
          </>}
        </aside>
      </div>

      <section className={`editor__preview${mobile ? ' editor__preview--mobile' : ''}`} aria-label={L('প্রিভিউ', 'Preview')}>
        <LivePreview preview={preview} style={style} content={content} page={page} header={header} footer={footer} mobile={mobile} picked={picked}
          onPick={(g, id) => { setGroup(g); setPicked(id); setPane('edit') }} />
      </section>

      <nav className="editor__dock" aria-label={L('দোকান সাজান', 'Customize store')}>{views(true)}</nav>
    </div>
  )
}


// The page as the storefront draws it, with the styles being edited. Clicks pick an element instead of following links.
function LivePreview({ preview, style, content, page, header, footer, mobile, picked, onPick }: { preview: PreviewData; style: SiteStyle; content: Content; page: PageKey; header: Section[]; footer: Section[]; mobile: boolean; picked: string | null; onPick: (group: GroupKey, id: string | null) => void }) {
  const [body, setBody] = useState<HTMLElement | null>(null)
  const pick = useRef(onPick)
  pick.current = onPick
  const attach = (frame: HTMLIFrameElement) => {
    const doc = frame.contentDocument
    if (!doc) return
    let hovered: Element | null = null
    const mark = (el: Element | null, value: string) => { if (el && (el as HTMLElement).dataset.cz !== 'picked') (el as HTMLElement).dataset.cz = value }
    doc.addEventListener('mouseover', (e) => {
      const target = e.target as Element
      if (!target?.closest) return
      const { target: el } = groupOfElement(target)
      if (hovered && hovered !== el && (hovered as HTMLElement).dataset.cz === 'hover') delete (hovered as HTMLElement).dataset.cz
      hovered = el
      mark(el, 'hover')
    })
    doc.addEventListener('click', (e) => {
      e.preventDefault()
      const target = e.target as Element
      if (!target?.closest) return
      const { group, target: el } = groupOfElement(target)
      for (const old of doc.querySelectorAll('[data-cz=picked]')) delete (old as HTMLElement).dataset.cz
      ;(el as HTMLElement).dataset.cz = 'picked'
      pick.current(group, el.closest('[data-node], [data-section]')?.getAttribute('data-node') ?? el.closest('[data-section]')?.getAttribute('data-section') ?? null)
    }, true)
    doc.addEventListener('submit', (e) => e.preventDefault(), true)
    setBody(doc.body)
  }
  // A pick from the page structure: mark it in the preview and scroll to it.
  useEffect(() => {
    if (!body || !picked) return
    const el = body.querySelector(`[data-node="${picked}"]`) ?? body.querySelector(`[data-section="${picked}"]`)
    // A click in the preview already marked the element itself (inside this node or section): keep that mark.
    const marked = body.querySelector('[data-cz=picked]')
    if (!el || (marked && (marked === el || el.contains(marked)))) return
    for (const old of body.querySelectorAll('[data-cz=picked]')) delete (old as HTMLElement).dataset.cz
    ;(el as HTMLElement).dataset.cz = 'picked'
    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [body, picked])

  const ctx = useMemo((): Ctx => {
    return {
      preview: true, shipping: [], lang: preview.language,
      image: (id) => (id ? preview.images[id] : undefined),
      product: (pid) => (pid && preview.product?.id === pid ? preview.product.product : undefined),
      store: preview.store, menus: preview.menus, collections: preview.collections,
      // Home and product pages list products without the filter panel (it belongs to collection and all-products pages).
      grid: () => ({ cards: preview.cards.slice(0, 8), page: 1, hasMore: false, base: '' }),
      current: { path: '', ...(page === 'product' && preview.product ? { product: preview.product } : {}) },
    }
  }, [preview, page])
  const fontsHref = siteFontsHref(style)
  return (
    <div className={mobile ? 'editor-preview editor-preview--mobile' : 'editor-preview'}>
      <iframe title="Preview" srcDoc={shell} onLoad={(e) => attach(e.currentTarget)} />
      {body && createPortal(<>
        {fontsHref && <link rel="stylesheet" href={fontsHref} />}
        <style>{siteCss(style)}</style>
        <style>{markCss}</style>
        <PageView content={content} ctx={ctx} storeName={preview.store.name} frame={{ header, footer }} themeCss={style.css} />
      </>, body)}
    </div>
  )
}

// The page's sections and elements, read only: names and kinds, indented by nesting.
function Structure({ label, sections, picked, onPick }: { label: string; sections: Section[]; picked: string | null; onPick: (id: string, node: PageNode | null) => void }) {
  const { lang } = useLang()
  const L = (pair: readonly [string, string]) => pair[lang === 'bn' ? 0 : 1]
  const nodeName = (n: PageNode) => (n.block ? L(defOf(n.block.type).label) : L(nodeDefs[n.kind].label))
  const rows = (nodes: PageNode[], depth: number): ReactNode[] => nodes.flatMap((n) => [
    <li key={n.id}><button type="button" style={{ ['--depth' as string]: depth }} aria-current={picked === n.id || undefined} onClick={() => onPick(n.id, n)}>{nodeName(n)}</button></li>,
    ...(n.children ? rows(n.children, depth + 1) : []),
  ])
  const visible = sections.filter((s) => !s.hidden)
  if (!visible.length) return null
  return (
    <div className="customize-tree">
      <p className="customize-tree__label">{label}</p>
      <ul>
        {visible.map((s) => [
          <li key={s.id}><button type="button" className="customize-tree__section" style={{ ['--depth' as string]: 0 }} aria-current={picked === s.id || undefined} onClick={() => onPick(s.id, null)}>{String(s.settings.name || '') || L(defOf(s.type).label)}</button></li>,
          ...rows(s.children ?? [], 1),
        ])}
      </ul>
    </div>
  )
}

// One group's controls. Element styles come from siteElementFields; blank keeps the storefront's own look.
function GroupForm({ group, style, setS, setEl, frames, setFrames, preview }: { group: GroupKey; style: SiteStyle; setS: (next: Partial<SiteStyle>) => void; setEl: (key: SiteElementKey, value: string | number | undefined) => void; frames: { header: string; footer: string }; setFrames: (f: { header: string; footer: string }) => void; preview: PreviewData }) {
  const { lang, num } = useLang()
  const path = useStorePath()
  const uid = useId()
  const L = (bn: string, en: string) => (lang === 'bn' ? bn : en)
  const Lp = (pair: readonly [string, string]) => pair[lang === 'bn' ? 0 : 1]
  const c = style.colors
  const el = style.elements ?? {}
  // What a blank element field falls back to, shown as its hint.
  const hints: Partial<Record<SiteElementKey, string>> = { buttonBg: c.accent, buttonInk: '#ffffff', buttonHoverBg: c.accent, buttonHoverInk: '#ffffff', buttonBorderColor: c.accent, inputBg: c.paper, inputInk: c.ink, inputBorderColor: c.rule, inputFocus: c.accent }
  const placeholders: Partial<Record<SiteElementKey, string>> = { textSize: '16', h1: '48', h2: '34', h3: '24', buttonSize: '18', buttonHeight: '48', buttonPadding: '24', buttonRadius: String(style.radius), buttonBorder: '0', inputBorder: '1', inputHeight: '48', inputRadius: '8', imageRadius: String(style.radius) }
  const reset = (key: SiteElementKey) => <button type="button" className="design-reset" disabled={el[key] === undefined} onClick={() => setEl(key, undefined)} aria-label={L('ডিফল্ট করুন', 'Reset')} title={L('ডিফল্ট মান ব্যবহার করুন', 'Use the default')}><RotateCcw size={12} aria-hidden="true" /></button>
  const fields = siteElementFields.filter((f) => f.group === group)
  const elementControls = fields.map((f) => {
    const id = `${uid}-${f.key}`
    const label = Lp(f.label)
    if (f.kind === 'color') return <ColorControl key={f.key} id={id} label={label} value={String(el[f.key] ?? '')} inherited={hints[f.key] ?? ''} onChange={(v) => setEl(f.key, v || undefined)} />
    if (f.kind === 'select') return <div key={f.key} className="design-control">
      <div className="design-control__label"><label htmlFor={id}>{label}</label>{reset(f.key)}</div>
      <select id={id} className="input" value={String(el[f.key] ?? '')} onChange={(e) => setEl(f.key, e.target.value || undefined)}>
        <option value="">{L('ডিফল্ট', 'Default')}</option>
        {f.options.map(([v, l]) => <option key={v} value={v}>{Lp(l)}</option>)}
      </select>
    </div>
    return <div key={f.key} className="design-control">
      <div className="design-control__label"><label htmlFor={id}>{label}</label>{reset(f.key)}</div>
      <div className="input-affix design-number"><NumericInput id={id} field={{ key: f.key, kind: 'number', min: f.min, max: f.max, label: f.label }} value={el[f.key] as number | undefined} placeholder={placeholders[f.key]} onChange={(v) => setEl(f.key, v)} /><span aria-hidden="true">px</span></div>
    </div>
  })

  if (group === 'colors') {
    const labels: Record<keyof SiteColors, string> = { accent: L('মূল রং (বাটন, লিংক)', 'Main (buttons, links)'), ink: L('লেখা', 'Text'), page: L('পেজের পটভূমি', 'Page background'), paper: L('কার্ড ও বক্সের পটভূমি', 'Cards and boxes'), tint: L('হালকা পটভূমি', 'Soft background'), rule: L('রেখা', 'Lines') }
    return <div className="editor__fields">{(Object.keys(labels) as (keyof SiteColors)[]).map((key) => (
      <ColorControl key={key} id={`${uid}-${key}`} label={labels[key]} value={c[key] ?? ''} inherited={key === 'page' ? pageColor(c.paper) : ''}
        onChange={(value) => {
          if (/^#[0-9a-f]{6}$/i.test(value)) setS({ colors: { ...c, [key]: value.toLowerCase() } })
          else if (key === 'page' && !value) { const { page: _, ...rest } = c; setS({ colors: rest }) }
        }} />
    ))}</div>
  }
  if (group === 'type') return <div className="editor__fields">
    {(['bangla', 'latin'] as const).map((kind) => (
      <div key={kind} className="design-control">
        <div className="design-control__label"><label htmlFor={`${uid}-${kind}`}>{kind === 'bangla' ? L('বাংলা ফন্ট', 'Bangla font') : L('ইংরেজি ফন্ট', 'English font')}</label></div>
        <select className="input" id={`${uid}-${kind}`} value={style[kind]} onChange={(e) => setS({ [kind]: e.target.value })}>
          {kind === 'latin' && <option value="">{L('ডিফল্ট', 'Default')}</option>}
          {Object.keys(pageFonts[kind]).map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
      </div>
    ))}
    {elementControls}
  </div>
  if (group === 'layout') return <div className="editor__fields">
    <div className="look-range"><span className="look-range__head"><span>{L('কন্টেন্টের প্রস্থ', 'Content width')}</span><output>{num(style.width)}px</output></span>
      <input type="range" min={720} max={1600} step={20} value={style.width} aria-label={L('কন্টেন্টের প্রস্থ', 'Content width')} onChange={(e) => setS({ width: Number(e.target.value) })} /></div>
    <div className="look-range"><span className="look-range__head"><span>{L('কোণের গোলভাব', 'Corner roundness')}</span><output>{num(style.radius)}px</output></span>
      <input type="range" min={0} max={32} value={style.radius} aria-label={L('কোণের গোলভাব', 'Corner roundness')} onChange={(e) => setS({ radius: Number(e.target.value) })} /></div>
    <p className="design-help">{L('কোণের গোলভাব কার্ড, বক্স আর বাটনে লাগে; বাটন, ফর্মের ঘর আর ছবির নিজের কোণা আলাদাভাবেও দেওয়া যায়।', 'Corner roundness applies to cards, boxes and buttons; buttons, form fields and images can also have their own.')}</p>
  </div>
  if (group === 'frames') return <div className="editor__fields">
    {(['header', 'footer'] as const).map((type) => {
      const list = type === 'header' ? preview.headers : preview.footers
      return <div key={type} className="design-control">
        <div className="design-control__label"><label htmlFor={`${uid}-${type}`}>{type === 'header' ? L('ডিফল্ট হেডার', 'Default header') : L('ডিফল্ট ফুটার', 'Default footer')}</label></div>
        <select className="input" id={`${uid}-${type}`} value={frames[type]} onChange={(e) => setFrames({ ...frames, [type]: e.target.value })}>
          {list.filter((f) => f.builtIn).map((f) => <option key={f.id} value="">{f.title} ({L('বিল্ট-ইন', 'built-in')})</option>)}
          {list.filter((f) => !f.builtIn).map((f) => <option key={f.id} value={f.id}>{f.title}</option>)}
        </select>
      </div>
    })}
    <p className="design-help">{L('শুধু প্রকাশিত হেডার আর ফুটার এখানে আসে। নতুন বানাতে বা বদলাতে টেমপ্লেটে যান।', 'Only published headers and footers are listed. Make or change them under Templates.')} <Link to={path('/online-store/templates')}>{L('টেমপ্লেট', 'Templates')}</Link></p>
  </div>
  if (group === 'css') return <div className="editor__fields">
    <Suspense fallback={<div className="css-editor css-editor--loading" />}>
      <CssEditor value={style.css} label={L('পুরো সাইটের কাস্টম CSS', 'Custom CSS for the whole site')} describedBy={`${uid}-css`} maxLength={20000} onChange={(css) => setS({ css })} />
    </Suspense>
    <p className="design-help" id={`${uid}-css`}>{style.css.includes('<') ? L('CSS-এ < চিহ্ন রাখা যাবে না।', 'CSS cannot contain <.') : L('দোকানের সব পেজ আর ল্যান্ডিং পেজে লাগে, সবার শেষে।', 'Applies to every store page and landing page, after everything else.')}</p>
  </div>
  return <div className="editor__fields">{elementControls}</div>
}
