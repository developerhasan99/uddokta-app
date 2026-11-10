import { Fragment, lazy, Suspense, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { DialogHead } from '../components/DialogHead'
import { RichText } from '../components/RichText'
import { DeviceSwitch, NodeDesignControls, type Device } from '../components/NodeDesignControls'
import { columns, setGrid, readClip, writeClip, findNode, insertNode, layoutPresets, pathTo, sectionPresets, moveNode, nodeName, reId, reIdSection, relocate, removeNode, starterNodes, updateNode, type Found } from '../layout-tree'
const CssEditor = lazy(() => import('../components/CssEditor'))
import { createPortal } from 'react-dom'
import { Link, useNavigate, useParams } from 'react-router'
import {
  Sparkles, LayoutGrid, Box, RotateCcw, ClipboardCopy, ClipboardPaste, PenLine, SlidersHorizontal, Palette, RectangleHorizontal, PanelTop, PanelBottom, Megaphone, BadgeCheck, ShieldCheck, ListOrdered, ClipboardList, Table2, GalleryHorizontal, Shapes, List, PanelLeft, MessageSquareQuote, Columns3, Rows3, Heading, MousePointerClick, Minus, MoveVertical, CornerLeftUp, ArrowDown, ArrowLeft, ArrowUp, ChevronDown, LayoutTemplate, Type, Image, Video, ListChecks, MessageSquare, CircleHelp, ShoppingBag, Images, Timer, Phone, CircleCheck, Copy, ExternalLink, Eye, EyeOff, GripVertical, ImagePlus, Link2, Plus, Redo2, Settings, Settings2, Smartphone, Trash2, Undo2, X,
} from 'lucide-react'
import { pageHref } from 'storefront/paths'
import { toLayout } from 'storefront/convert'
import { toRich } from 'storefront/rich'
import { blockTypes, walk, defOf, isSectionLink, maxCss, maxSections, newBlock, newNode, newSection, nodeDefs, nodeKinds, orderBlocks, type NodeKind, type PageNode, sectionTypes, styleFieldsFor, videoEmbed, type Content, type Field as SchemaField, type Leaf, type Label, type Section, type SectionType, type Value } from 'storefront/schema'
import { css as storefrontCss, PageView, type Ctx, type Product, type ShippingOption } from 'storefront/sections'
import { loadRates } from '../shipping'
import { isPreset, presetCss, presetFontsHref, type PresetId } from 'storefront/themes'
import { useCurrentStore, useStorePath } from '../account-context'
import { api, errorCode, storefrontUrl, type MediaItem } from '../api'
import { IconField } from '../components/IconField'
import { SectionDesignControls } from '../components/SectionDesignControls'
import { SectionThumbnail } from '../components/SectionThumbnail'
import { MediaPicker } from '../components/MediaPicker'
import { ProductPicker } from '../components/ProductPicker'
import { Button, Field, IconButton, Notice, PageTitle, SearchInput, Skeleton } from '../components/ui'
import { errorLabel, useLang } from '../i18n'
import type { ProductStatus } from '../product-form'
import type { StoreSettingsData } from './StoreSettings'
import { PageStatus } from './Pages'
import { useDialog } from '../components/dialog'

type Saved = {
  id: string; title: string; handle: string; seoTitle: string; seoDescription: string; draft: Content; revision: number
  publishedHandle: string | null; isPublished: boolean; hasChanges: boolean; media: Record<string, MediaItem>
}
type Doc = { title: string; handle: string; seoTitle: string; seoDescription: string; content: Content }
type PreviewProduct = Product & { status: ProductStatus }
type Pick = { kind: 'image' | 'product'; apply: (id: string | null) => void }

// One fitting icon per kind of section/block, used in the section list, the tree and the Add dialogs.
const sectionIcons = { layout: RectangleHorizontal, hero: PanelTop, header: PanelTop, footer: PanelBottom, announcement: Megaphone, text: Type, image: Image, imageText: PanelLeft, video: Video, features: BadgeCheck, trust: ShieldCheck, steps: ListOrdered, specifications: ClipboardList, comparison: Table2, cards: GalleryHorizontal, iconCards: Shapes, iconList: List, icon: Sparkles, cta: MousePointerClick, reviews: MessageSquareQuote, faq: CircleHelp, order: ShoppingBag, gallery: Images, countdown: Timer, contact: Phone }
const nodeIcons: Record<NodeKind, typeof Box> = { box: Rows3, heading: Heading, text: Type, image: Image, button: MousePointerClick, icon: Sparkles, divider: Minus, spacer: MoveVertical, video: Video, block: Shapes }
const historyLimit = 100
// Every section is edited as a layout; older built-in sections are turned into one when the page opens.
const toDoc = (p: Saved): Doc => ({ title: p.title, handle: p.handle, seoTitle: p.seoTitle, seoDescription: p.seoDescription, content: { ...p.draft, sections: p.draft.sections.map((s) => (s.type === 'layout' ? s : { ...toLayout(s, newId), settings: { name: defOf(s.type).label[document.documentElement.lang === 'en' ? 1 : 0] } })) } })
const newId = () => crypto.randomUUID().slice(0, 8)
const frameShell = `<!doctype html><html lang="bn"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${storefrontCss}</style></head><body></body></html>`

// The real section components, drawn inside an iframe so the storefront's styles and breakpoints apply exactly as they will live.
function Preview({ content, ctx, storeName, theme, mobile, selected, onSelect, onText, onAddInto, onMenu }: { content: Content; ctx: Ctx; storeName: string; theme: PresetId; mobile: boolean; selected: string | null; onSelect: (id: string) => void; onText: (id: string, text: string) => void; onAddInto: (id: string) => void; onMenu: (id: string, x: number, y: number) => void }) {
  const { t } = useLang()
  const [body, setBody] = useState<HTMLElement | null>(null)
  const select = useRef(onSelect)
  select.current = onSelect
  const typed = useRef(onText)
  typed.current = onText
  const adding = useRef(onAddInto)
  adding.current = onAddInto
  const menu = useRef(onMenu)
  menu.current = onMenu
  const chosen = useRef(selected)
  chosen.current = selected

  useEffect(() => {
    if (!body || !selected) return
    const node = body.querySelector(`[data-node="${selected}"]`)
    if (node) node.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    else body.querySelector(`[data-section="${selected}"]`)?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }, [body, selected])

  const attach = (frame: HTMLIFrameElement) => {
    const doc = frame.contentDocument
    if (!doc) return
    // A srcdoc frame resolves links against the dashboard, so links never navigate here; in-page links still scroll.
    // Typing on the page: a plain-text box laid exactly over the element, so React never sees its markup edited.
    let editing: HTMLElement | null = null
    const startEdit = (el: HTMLElement, id: string) => {
      if (editing) return
      const win = doc.defaultView!
      const rect = el.getBoundingClientRect()
      const cs = win.getComputedStyle(el)
      const box = doc.createElement('div')
      box.className = 'editor-inline'
      const rich = el.dataset.edit === 'rich'
      box.setAttribute('contenteditable', rich ? 'true' : 'plaintext-only')
      if (!rich && box.contentEditable !== 'plaintext-only') box.contentEditable = 'true'
      for (const prop of ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'color', 'textAlign', 'textTransform'] as const) box.style[prop] = cs[prop]
      Object.assign(box.style, { position: 'absolute', zIndex: '9999', left: `${rect.left + win.scrollX}px`, top: `${rect.top + win.scrollY}px`, width: `${Math.max(rect.width, 80)}px`, minHeight: `${rect.height}px`, whiteSpace: 'pre-wrap', outline: '2px solid #1f7a4d', outlineOffset: '3px', background: 'transparent', borderRadius: '2px' })
      if (rich) box.innerHTML = el.innerHTML
      else box.textContent = el.classList.contains('sf-n-prompt') ? '' : el.innerText
      el.style.visibility = 'hidden'
      doc.body.appendChild(box)
      editing = box
      box.focus()
      const range = doc.createRange()
      range.selectNodeContents(box)
      range.collapse(false)
      win.getSelection()?.removeAllRanges()
      win.getSelection()?.addRange(range)
      const single = el.tagName !== 'DIV'
      const finish = (save: boolean) => {
        if (editing !== box) return
        editing = null
        const text = rich ? box.innerHTML.trim() : box.innerText.replace(/\n{3,}/g, '\n\n').trim()
        box.remove()
        el.style.visibility = ''
        if (save && text !== (rich ? el.innerHTML.trim() : el.innerText.trim())) typed.current(id, text)
      }
      box.addEventListener('blur', () => finish(true))
      box.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { e.preventDefault(); finish(false) }
        if (e.key === 'Enter' && (single || e.metaKey || e.ctrlKey)) { e.preventDefault(); finish(true) }
      })
    }
    const editable = (target: Element) => {
      const field = target.closest<HTMLElement>('[data-edit]')
      const node = field?.closest('[data-node]')
      return field && node ? { field, id: node.getAttribute('data-node')! } : null
    }
    doc.addEventListener('dblclick', (e) => {
      const hit = editable(e.target as Element)
      if (hit) { select.current(hit.id); startEdit(hit.field, hit.id) }
    })
    doc.addEventListener('click', (e) => {
      const target = e.target as Element
      if (editing?.contains(target)) return
      // The small handle on a box or section selects that container (even an empty one).
      const handle = target.closest('[data-select]')
      if (handle) { e.preventDefault(); select.current(handle.getAttribute('data-select')!); return }
      // An empty section or box opens Add element for that container.
      const into = target.closest('[data-add-into]')
      if (into) { e.preventDefault(); adding.current(into.getAttribute('data-add-into')!); return }
      const hit = editable(target)
      if (hit && hit.id === chosen.current) { e.preventDefault(); startEdit(hit.field, hit.id); return }
      const link = target.closest('a')
      if (link) {
        e.preventDefault()
        const hash = link.getAttribute('href')
        if (hash?.startsWith('#')) doc.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth' })
      }
      const picked = target.closest('[data-node]') ?? target.closest('[data-section]')
      if (picked) select.current(picked.getAttribute('data-node') ?? picked.getAttribute('data-section')!)
    })
    // Right-click: the editor's own menu for the element or section under the pointer.
    doc.addEventListener('contextmenu', (e) => {
      const target = e.target as Element
      const picked = target.closest('[data-select]') ?? target.closest('[data-node]') ?? target.closest('[data-section]')
      if (!picked) return
      e.preventDefault()
      const id = picked.getAttribute('data-select') ?? picked.getAttribute('data-node') ?? picked.getAttribute('data-section')!
      const box = frame.getBoundingClientRect()
      select.current(id)
      menu.current(id, box.left + e.clientX, box.top + e.clientY)
    })
    doc.addEventListener('submit', (e) => e.preventDefault())
    setBody(doc.body)
  }

  return (
    <div className={mobile ? 'editor-preview editor-preview--mobile' : 'editor-preview'}>
      <iframe title={t('pagePreview')} srcDoc={frameShell} onLoad={(e) => attach(e.currentTarget)} />
      {body && createPortal(
        <>
          <link rel="stylesheet" href={presetFontsHref(theme)} />
          <style>{presetCss(theme)}</style>
          <style>{`[data-section],[data-node]{cursor:pointer}[data-section]:hover{outline:1px dashed #1f7a4d;outline-offset:-1px}[data-node]:hover{outline:1px dashed #1f7a4d;outline-offset:2px}${selected ? `[data-section="${selected}"]{outline:2px solid #1f7a4d!important;outline-offset:-2px}[data-node="${selected}"]{outline:2px solid #1f7a4d!important;outline-offset:2px}[data-node="${selected}"]>.sf-n-handle,[data-section="${selected}"] .sf-layout>.sf-n-handle{display:flex}` : ''}`}</style>
          {content.sections.every((s) => s.hidden) ? <p className="sf-hint" style={{ margin: 24 }}>{t('pageNoSections')}</p> : <PageView content={content} ctx={ctx} storeName={storeName} />}
        </>,
        body,
      )}
    </div>
  )
}

const short = (text: unknown) => (typeof text === 'string' ? text.trim().split('\n')[0].slice(0, 60) : '')

function LeafEditor({ field, value, id, onChange, onPick, media, products }: {
  field: Leaf; value: Value; id: string; onChange: (v: Value, typing?: boolean) => void; onPick: (p: Pick) => void
  media: Record<string, MediaItem>; products: Record<string, PreviewProduct | null>
}) {
  const { t, lang } = useLang()
  const label = field.label[lang === 'bn' ? 0 : 1]
  switch (field.kind) {
    case 'icon':
      return <IconField label={label} value={typeof value === 'string' ? value : field.defaultIcon ?? ''} onChange={onChange} />
    case 'select':
      return <div className="field"><label htmlFor={id}>{label}</label><select className="input" id={id} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)}>
        <option value="">{lang === 'bn' ? 'স্বাভাবিক / ডিফল্ট' : 'Inherit / default'}</option>
        {field.options.map((o) => <option key={o.value} value={o.value}>{o.label[lang === 'bn' ? 0 : 1]}</option>)}
      </select></div>
    case 'number':
      return <Field id={id} type="number" label={label} min={field.min} max={field.max} step={1} placeholder={lang === 'bn' ? 'ডিফল্ট' : 'Inherit'} value={value === null ? '' : String(value)} onChange={(e) => onChange(e.target.value === '' ? '' : Math.max(field.min, Math.min(field.max, Math.round(Number(e.target.value) || 0))), true)} />
    case 'color': {
      const color = String(value ?? '')
      return <Field id={id} label={label} maxLength={7} placeholder={lang === 'bn' ? 'ডিফল্ট রং' : 'Inherit color'} value={color} error={color && !/^#[0-9a-f]{6}$/i.test(color) ? (lang === 'bn' ? '#RRGGBB ফরম্যাটে দিন' : 'Use #RRGGBB') : undefined} onChange={(e) => onChange(e.target.value, true)} trailing={<input type="color" className="editor-color" aria-label={`${label}: ${lang === 'bn' ? 'রং বাছাই' : 'Choose color'}`} value={/^#[0-9a-f]{6}$/i.test(color) ? color : '#ffffff'} onChange={(e) => onChange(e.target.value)} />} />
    }
    case 'link':
      return <Field id={id} label={label} placeholder="https://… / #section-id" maxLength={500} value={String(value ?? '')} error={!isSectionLink(value ?? '') ? (lang === 'bn' ? 'https://, #সেকশন, tel: বা mailto: লিংক দিন।' : 'Use https://, #section, tel: or mailto: links.') : undefined} onChange={(e) => onChange(e.target.value.trim(), true)} />
    case 'text':
      return <Field id={id} label={label} maxLength={field.max} value={String(value ?? '')} onChange={(e) => onChange(e.target.value, true)} />
    case 'richtext':
      return <div className="field"><span className="field__label" id={`${id}-label`}>{label}</span><RichText labelledBy={`${id}-label`} value={toRich(String(value ?? ''))} onChange={(html) => onChange(html, true)} /></div>
    case 'textarea':
      return (
        <div className="field">
          <label htmlFor={id}>{label}</label>
          <textarea id={id} className="input input--area" rows={field.max > 1000 ? 4 : 3} maxLength={field.max} value={String(value ?? '')} onChange={(e) => onChange(e.target.value, true)} />
        </div>
      )
    case 'url': {
      const text = String(value ?? '')
      const invalid = text !== '' && !videoEmbed(text)
      return <Field id={id} type="url" label={label} placeholder="https://" maxLength={500} value={text} help={t('pageVideoHelp')} error={invalid ? t('pageVideoInvalid') : undefined} onChange={(e) => onChange(e.target.value.trim(), true)} />
    }
    case 'amount':
      return <Field id={id} label={label} unit="৳" inputMode="numeric" value={String(value ?? 0)} help={t('pageChargeHelp')} onChange={(e) => {
        const n = Number(e.target.value.replace(/[০-৯]/g, (d) => String('০১২৩৪৫৬৭৮৯'.indexOf(d))).replace(/\D/g, '') || 0)
        onChange(Math.min(n, 100_000), true)
      }} />
    case 'datetime': {
      // Stored as an exact moment (ISO); the seller picks it in their own local time.
      const date = typeof value === 'string' && value ? new Date(value) : null
      const local = date ? new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16) : ''
      return <Field id={id} type="datetime-local" label={label} value={local} onChange={(e) => onChange(e.target.value ? new Date(e.target.value).toISOString() : '')} />
    }
    case 'image': {
      const item = typeof value === 'string' ? media[value] : undefined
      const pick = () => onPick({ kind: 'image', apply: (v) => onChange(v) })
      return (
        <div className="field">
          <span className="field__label">{label}</span>
          {item
            ? (
              <div className="editor-image">
                <img src={item.thumbUrl} alt={item.alt || item.name} />
                <div className="row">
                  <Button onClick={pick}>{t('pageChangeImage')}</Button>
                  <Button onClick={() => onChange(null)}>{t('pageRemoveImage')}</Button>
                </div>
              </div>
            )
            : <button type="button" className="media__empty editor-image__empty" onClick={pick}><ImagePlus size={20} strokeWidth={1.5} aria-hidden="true" /><strong>{t('pageChooseImage')}</strong></button>}
        </div>
      )
    }
    case 'product': {
      const product = typeof value === 'string' ? products[value] : undefined
      const pick = () => onPick({ kind: 'product', apply: (v) => onChange(v) })
      return (
        <div className="field">
          <span className="field__label">{label}</span>
          {product
            ? (
              <div className="editor-product">
                <span className="data-table__thumb">{product.image && <img src={product.image.url} alt="" />}</span>
                <span className="editor-product__name" title={product.name}>{product.name}</span>
                <Button onClick={pick}>{t('pageChangeProduct')}</Button>
              </div>
            )
            : <Button onClick={pick}><Plus size={16} aria-hidden="true" />{t('pageChooseProduct')}</Button>}
          {product && product.status === 'draft' && <p className="field__help field__help--error">{t('pageProductDraft')}</p>}
        </div>
      )
    }
  }
}

function SectionForm({ section, onChange, onPick, media, products, group = 'content' }: {
  section: Section; group?: 'content' | 'layout'; onChange: (key: string, v: Value, typing?: boolean) => void; onPick: (p: Pick) => void
  media: Record<string, MediaItem>; products: Record<string, PreviewProduct | null>
}) {
  const { t, lang, num } = useLang()
  const uid = useId()
  const [expanded, setExpanded] = useState<Record<string, number | null>>({})
  const L = (label: Label) => label[lang === 'bn' ? 0 : 1]
  return (
    <>
      {defOf(section.type).fields.filter((field) => (('group' in field ? field.group : undefined) ?? 'content') === group).map((field) => {
        const value = section.settings[field.key] ?? defOf(section.type).defaults[field.key] ?? null
        const id = `${uid}-${section.id}-${field.key}`
        if (field.kind !== 'list') return <LeafEditor key={field.key} id={id} field={field} value={value} onChange={(v, typing) => onChange(field.key, field.kind === 'select' && v === '' ? defOf(section.type).defaults[field.key] ?? '' : v, typing)} onPick={onPick} media={media} products={products} />
        const list = Array.isArray(value) ? value : []
        const setList = (next: typeof list, typing?: boolean) => onChange(field.key, next, typing)
        const blank = Object.fromEntries(field.fields.map((f) => [f.key, f.kind === 'image' ? null : '']))
        return (
          <div key={field.key} className="editor-list">
            <div className="editor-list__head">
              <span className="field__label">{L(field.label)}</span>
              <span className="muted">{t('pageListMax', { n: num(field.max) })}</span>
            </div>
            {list.map((item, i) => {
              const name = `${L(field.item)} ${num(i + 1)}`
              return (
                <details key={i} className="editor-list__item" open={expanded[field.key] === i}>
                  <summary onClick={(e) => { e.preventDefault(); setExpanded((v) => ({ ...v, [field.key]: v[field.key] === i ? null : i })) }}><ChevronDown size={14} aria-hidden="true" /><span>{short(item.title || item.question || item.name) || name}</span></summary>
                  <div className="editor-list__fields">
                    <div className="editor-list__item-head">
                      <strong>{name}</strong>
                      <div className="row">
                      <IconButton label={`${t('pageMoveUp')}: ${name}`} disabled={i === 0} onClick={() => { const next = [...list]; [next[i - 1], next[i]] = [next[i], next[i - 1]]; setList(next) }}><ArrowUp size={16} aria-hidden="true" /></IconButton>
                      <IconButton label={`${t('pageMoveDown')}: ${name}`} disabled={i === list.length - 1} onClick={() => { const next = [...list]; [next[i], next[i + 1]] = [next[i + 1], next[i]]; setList(next) }}><ArrowDown size={16} aria-hidden="true" /></IconButton>
                      <IconButton label={t('pageRemoveItem', { value: name })} onClick={() => setList(list.filter((_, j) => j !== i))}><X size={16} aria-hidden="true" /></IconButton>
                    </div>
                  </div>
                  {field.fields.map((sub) => (
                    <LeafEditor key={sub.key} id={`${id}-${i}-${sub.key}`} field={sub} value={item[sub.key] ?? null} media={media} products={products} onPick={onPick}
                      onChange={(v, typing) => setList(list.map((x, j) => (j === i ? { ...x, [sub.key]: v as string | null } : x)), typing)} />
                  ))}
                  </div>
                </details>
              )
            })}
            {list.length < field.max && <Button onClick={() => { setExpanded((v) => ({ ...v, [field.key]: list.length })); setList([...list, { ...blank }]) }}><Plus size={16} aria-hidden="true" />{t('pageAddItem', { value: L(field.item) })}</Button>}
          </div>
        )
      })}
    </>
  )
}

function AddSectionDialog({ onClose, onAdd }: { onClose: () => void; onAdd: (preset: (typeof sectionPresets)[number]) => void }) {
  const { t, lang } = useLang()
  const L = (label: Label) => label[lang === 'bn' ? 0 : 1]
  const { ref: dialog, close, props: dialogProps } = useDialog(onClose)
  const titleId = useId()
  const [search, setSearch] = useState('')
  const matches = sectionPresets.filter((preset) => [...preset.label, ...preset.help].some((label) => label.toLowerCase().includes(search.toLowerCase().trim())))
  const previews = useMemo(() => {
    let n = 0
    return Object.fromEntries(sectionPresets.map((preset) => [preset.key, { ...newSection('layout', `thumb-${preset.key}`), children: preset.build(() => `t${n++}`) }]))
  }, [])
  useEffect(() => { dialog.current?.showModal(); dialog.current?.querySelector('input')?.focus() }, [])
  return <dialog {...dialogProps} className="modal editor-add-modal" aria-labelledby={titleId}>
    <DialogHead id={titleId} title={t('pageAddSection')} onClose={() => close()} />
    <div className="dialog__body">
      <SearchInput label={t('pageSearchSections')} value={search} onChange={(e) => setSearch(e.target.value)} autoFocus />
      <ul className="editor-add__choices">
        {matches.map((preset) => <li key={preset.key}><button type="button" title={L(preset.help)} onClick={() => close(() => onAdd(preset))}><SectionThumbnail section={previews[preset.key]} /><span className="editor-section-label"><RectangleHorizontal size={16} aria-hidden="true" />{L(preset.label)}<Plus size={14} aria-hidden="true" /></span></button></li>)}
      </ul>
      {matches.length === 0 && <p className="muted">{t('pageNoMatches')}</p>}
      <p className="muted editor-add__note">{L(['অর্ডার ফর্ম, রিভিউ, প্রশ্নোত্তরের মতো জিনিস সেকশনের ভেতরে "এলিমেন্ট যোগ করুন" থেকে ব্লক হিসেবে বসান।', 'Order forms, reviews, questions and similar pieces go inside a section: use "Add element" and pick a block.'])}</p>
    </div>
  </dialog>
}

function AddNodeDialog({ onClose, onAdd }: { onClose: () => void; onAdd: (build: (id: () => string) => PageNode) => void }) {
  const { lang } = useLang()
  const L = (label: Label) => label[lang === 'bn' ? 0 : 1]
  const { ref: dialog, close, props: dialogProps } = useDialog(onClose)
  const titleId = useId()
  useEffect(() => { dialog.current?.showModal() }, [])
  return <dialog {...dialogProps} className="modal node-add" aria-labelledby={titleId}>
    <DialogHead id={titleId} title={L(['কী যোগ করবেন?', 'Add to the layout'])} onClose={() => close()} />
    <div className="dialog__body">
      <p className="node-add__label">{L(['কাঠামো', 'Structure'])}</p>
      <ul className="node-add__grid node-add__structure">
        {[1, 2, 3, 4].map((n) => <li key={n}><button type="button" onClick={() => close(() => onAdd((id) => columns(n, id)))}>
          <span className="node-add__cols" aria-hidden="true">{Array.from({ length: n }, (_, i) => <span key={i} />)}</span>
          <span>{n === 1 ? L(['এক কলাম', 'One column']) : L([`${['', '', 'দুই', 'তিন', 'চার'][n]} কলাম`, `${['', '', 'Two', 'Three', 'Four'][n]} columns`])}</span>
        </button></li>)}
      </ul>
      <p className="node-add__label">{L(['এলিমেন্ট', 'Elements'])}</p>
      <ul className="node-add__grid">
        {nodeKinds.filter((kind) => kind !== 'box' && kind !== 'block').map((kind) => {
          const Icon = nodeIcons[kind]
          return <li key={kind}><button type="button" onClick={() => close(() => onAdd((id) => newNode(kind, id)))}><Icon size={20} strokeWidth={1.75} aria-hidden="true" /><span>{L(nodeDefs[kind].label)}</span></button></li>
        })}
      </ul>
      <p className="node-add__label">{L(['ব্লক', 'Blocks'])}</p>
      <ul className="node-add__grid node-add__grid--blocks">
        {blockTypes.map((type) => {
          const Icon = sectionIcons[type]
          return <li key={type}><button type="button" onClick={() => close(() => onAdd((id) => newBlock(type, id)))}><Icon size={18} strokeWidth={1.75} aria-hidden="true" /><span>{L(defOf(type).label)}</span></button></li>
        })}
      </ul>
    </div>
  </dialog>
}

type MenuItem = { label: string; hint?: string; Icon: typeof Copy; run: () => void; disabled?: boolean; danger?: boolean } | 'rule'

// The editor's right-click menu: the same actions as the panel's bottom bar. Closes on a click elsewhere, Esc or scroll.
function ContextMenu({ x, y, items, onClose }: { x: number; y: number; items: MenuItem[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x, y })
  useEffect(() => {
    const el = ref.current
    if (el) setPos({ x: Math.min(x, window.innerWidth - el.offsetWidth - 8), y: Math.min(y, window.innerHeight - el.offsetHeight - 8) })
    el?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
    const away = (e: Event) => { if (!el?.contains(e.target as Node)) onClose() }
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const list = [...(el?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])]
        const i = list.indexOf(document.activeElement as HTMLButtonElement)
        list[(i + (e.key === 'ArrowDown' ? 1 : list.length - 1)) % list.length]?.focus()
      }
    }
    window.addEventListener('pointerdown', away, true)
    window.addEventListener('keydown', key)
    window.addEventListener('blur', onClose)
    document.addEventListener('scroll', onClose, true)
    return () => { window.removeEventListener('pointerdown', away, true); window.removeEventListener('keydown', key); window.removeEventListener('blur', onClose); document.removeEventListener('scroll', onClose, true) }
  }, [])
  return <div ref={ref} className="editor-menu" role="menu" style={{ left: pos.x, top: pos.y }}>
    {items.map((item, i) => item === 'rule'
      ? <hr key={i} />
      : <button key={i} type="button" role="menuitem" className={item.danger ? 'editor-menu__item editor-menu__item--danger' : 'editor-menu__item'} disabled={item.disabled} onClick={() => { onClose(); item.run() }}>
        <item.Icon size={15} aria-hidden="true" /><span>{item.label}</span>{item.hint && <kbd>{item.hint}</kbd>}
      </button>)}
  </div>
}

function LeaveDialog({ onClose, onLeave, onSave, busy }: { onClose: () => void; onLeave: () => void; onSave: () => void; busy: boolean }) {
  const { t } = useLang()
  const { ref, close: dismiss, props: leaveProps } = useDialog(onClose)
  useEffect(() => { ref.current?.showModal() }, [ref])
  return <dialog {...leaveProps} className="modal" aria-labelledby="leave-title" onCancel={(e) => { e.preventDefault(); if (!busy) dismiss() }}>
    <DialogHead id="leave-title" title={t('pageLeaveTitle')} disabled={busy} onClose={() => dismiss()} />
    <div className="dialog__body"><p className="muted">{t('pageLeaveHelp')}</p></div>
    <div className="dialog__foot">
      <Button disabled={busy} onClick={() => dismiss()}>{t('cancel')}</Button>
      <Button disabled={busy} onClick={onLeave}>{t('pageLeaveDiscard')}</Button>
      <Button disabled={busy} variant="primary" onClick={onSave}>{t('pageLeaveSave')}</Button>
    </div>
  </dialog>
}

export function PageEditor() {
  const { t, lang, num } = useLang()
  const { id } = useParams()
  const navigate = useNavigate()
  const path = useStorePath()
  const current = useCurrentStore()!
  const base = `/stores/${current.store.handle}/pages/${id}`
  const L = (label: Label) => label[lang === 'bn' ? 0 : 1]

  const [page, setPage] = useState<Saved | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [doc, setDoc] = useState<Doc | null>(null)
  const [baseline, setBaseline] = useState('')
  const [past, setPast] = useState<Doc[]>([])
  const [future, setFuture] = useState<Doc[]>([])
  const lastEdit = useRef({ key: '', at: 0 })
  const [media, setMedia] = useState<Record<string, MediaItem>>({})
  const [products, setProducts] = useState<Record<string, PreviewProduct | null>>({})
  const [shipping, setShipping] = useState<ShippingOption[]>([])
  const [theme, setTheme] = useState<PresetId>('fresh')
  const [settingsTab, setSettingsTab] = useState<'content' | 'layout' | 'style'>('content')
  const [selected, setSelected] = useState<string | null>(null)
  const [device, setDevice] = useState<Device>('desktop')
  const [open, setOpen] = useState<Set<string>>(() => new Set())
  const toggle = (id: string) => setOpen((o) => { const next = new Set(o); if (next.has(id)) next.delete(id); else next.add(id); return next })
  const [addingNode, setAddingNode] = useState<{ sectionId: string; parentId: string | null; index: number } | null>(null)
  const [view, setView] = useState<'sections' | 'page'>('sections')
  const settingsPanel = useRef<HTMLElement>(null)
  useEffect(() => { settingsPanel.current?.scrollTo({ top: 0 }) }, [selected, settingsTab])
  const [pane, setPane] = useState<'sections' | 'preview' | 'edit'>('sections')
  const [mobile, setMobile] = useState(false)
  const [adding, setAdding] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const working = useRef(false)
  const [picking, setPicking] = useState<Pick | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [resetting, setResetting] = useState<string | null>(null)
  const [menuAt, setMenuAt] = useState<{ id: string; x: number; y: number } | null>(null)
  const dragFrom = useRef<number | null>(null)
  const [dragging, setDragging] = useState<number | null>(null)
  const [dropAt, setDropAt] = useState<number | null>(null)
  const nodeDrag = useRef<string | null>(null)
  const [nodeDrop, setNodeDrop] = useState<{ id: string; where: 'before' | 'after' | 'inside' } | null>(null)

  const show = (saved: Saved) => {
    setPage(saved)
    setDoc(toDoc(saved))
    setBaseline(JSON.stringify(toDoc(saved)))
    setMedia((m) => ({ ...m, ...saved.media }))
  }

  const load = async () => {
    setLoadFailed(false)
    try {
      show(await api<Saved>(base))
      setPast([])
      setFuture([])
    } catch {
      setLoadFailed(true)
    }
  }

  useEffect(() => {
    void load()
  }, [base])

  useEffect(() => {
    api<StoreSettingsData>(`/stores/${current.store.handle}/settings`).then((s) => {
      if (isPreset(s.theme)) setTheme(s.theme)
    }).catch(() => {})
    // The preview shows the same delivery options the live order form will.
    loadRates(current.store.handle).then((rates) => setShipping(rates.filter((r) => r.active).map((r) => ({ ...r, freeProducts: r.freeProducts.map((p) => p.id) })))).catch(() => {})
  }, [current.store.handle])

  // Products shown by order forms, loaded once each for the preview.
  const productIds = useMemo(() => (doc ? orderBlocks(doc.content).flatMap((o) => (typeof o.settings.product === 'string' ? [o.settings.product] : [])) : []), [doc])
  useEffect(() => {
    for (const pid of productIds) {
      if (pid in products) continue
      setProducts((p) => ({ ...p, [pid]: null }))
      api<{ id: string; name: string; status: ProductStatus; media: MediaItem[]; variants: { id: string; options: string[]; price: number; comparePrice: number | null; stock: number | null }[] }>(`/stores/${current.store.handle}/products/${pid}`)
        .then((r) => setProducts((p) => ({
          ...p,
          [pid]: {
            id: r.id, name: r.name, status: r.status,
            image: r.media[0] ? { url: r.media[0].url, alt: r.media[0].alt, width: r.media[0].width, height: r.media[0].height } : null,
            variants: r.variants.map((v) => ({ id: v.id, label: v.options.join(' / ') || r.name, price: v.price, comparePrice: v.comparePrice, available: v.stock === null || v.stock > 0 })),
          },
        })))
        .catch(() => {})
    }
  }, [productIds])

  const dirty = doc !== null && JSON.stringify(doc) !== baseline
  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 5000)
    return () => clearTimeout(timer)
  }, [toast])

  // Typing into one field within a second counts as one step, so undo goes back a word or more, not a letter.
  const edit = (next: Doc, key = '') => {
    if (!doc || working.current) return
    const now = Date.now()
    const merge = key !== '' && key === lastEdit.current.key && now - lastEdit.current.at < 1000
    lastEdit.current = { key, at: now }
    if (!merge) setPast((p) => [...p.slice(-historyLimit + 1), doc])
    setFuture([])
    setDoc(next)
    if (error === 'pageHandleTaken' && next.handle !== doc.handle) setError(null)
  }
  const undo = () => {
    if (!doc || working.current || past.length === 0) return
    setFuture((f) => [doc, ...f])
    setDoc(past[past.length - 1])
    setPast((p) => p.slice(0, -1))
    lastEdit.current = { key: '', at: 0 }
  }
  const redo = () => {
    if (!doc || working.current || future.length === 0) return
    setPast((p) => [...p, doc])
    setDoc(future[0])
    setFuture((f) => f.slice(1))
    lastEdit.current = { key: '', at: 0 }
  }

  const save = async () => {
    if (!doc || !page) return null
    setError(null)
    if (!doc.title.trim()) {
      setView('page')
      setPane('edit')
      setError('nameRequired')
      return null
    }
    try {
      const saved = await api<Saved>(base, { method: 'PUT', body: { title: doc.title, handle: doc.handle, seoTitle: doc.seoTitle, seoDescription: doc.seoDescription, draft: doc.content, revision: page.revision } })
      show(saved)
      return saved
    } catch (err) {
      setError(errorCode(err))
      if (errorCode(err) === 'pageHandleTaken') {
        setView('page')
        setPane('edit')
      }
      return null
    }
  }

  const run = async (work: () => Promise<void>) => {
    if (working.current) return
    working.current = true
    setBusy(true)
    try {
      await work()
    } finally {
      working.current = false
      setBusy(false)
    }
  }

  const onSave = () => run(async () => {
    if (await save()) setToast(t(page?.isPublished ? 'pageSaved' : 'pageDraftSaved'))
  })
  const publish = () => run(async () => {
    const saved = dirty ? await save() : page
    if (!saved) return
    try {
      show(await api<Saved>(`${base}/publish`, { method: 'POST', body: { revision: saved.revision } }))
      setToast(t('pagePublishedToast'))
    } catch (err) {
      setError(errorCode(err))
    }
  })
  const unpublish = () => run(async () => {
    try {
      const saved = await api<Saved>(`${base}/unpublish`, { method: 'POST' })
      setPage(saved)
      setToast(t('pageUnpublishedToast'))
    } catch (err) {
      setError(errorCode(err))
    }
  })
  const remove = () => run(async () => {
    try {
      await api(base, { method: 'DELETE' })
      navigate(path('/landing-pages'), { replace: true })
    } catch (err) {
      setConfirming(false)
      setError(errorCode(err))
    }
  })

  const keys = useRef({ undo, redo, onSave, copy: () => {}, paste: () => {}, duplicate: () => {} })
  keys.current = { ...keys.current, undo, redo, onSave }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return
      const typing = (e.target as Element).closest('input, textarea, select, [contenteditable]')
      const selecting = !(window.getSelection()?.isCollapsed ?? true)
      if (!typing && !selecting && ['c', 'v', 'd'].includes(e.key.toLowerCase())) {
        e.preventDefault()
        if (e.key.toLowerCase() === 'c') keys.current.copy()
        else if (e.key.toLowerCase() === 'v') keys.current.paste()
        else keys.current.duplicate()
        return
      }
      if (e.key === 's') {
        e.preventDefault()
        void keys.current.onSave()
      } else if (!typing && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) keys.current.redo()
        else keys.current.undo()
      } else if (!typing && e.key === 'y') {
        e.preventDefault()
        keys.current.redo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const ctx: Ctx = useMemo(() => ({
    preview: true,
    shipping,
    image: (mid) => {
      const item = mid ? media[mid] : undefined
      return item && { url: item.url, alt: item.alt || item.name, width: item.width, height: item.height }
    },
    product: (pid) => (pid ? products[pid] ?? undefined : undefined),
  }), [media, products, shipping])

  if (loadFailed) {
    return <div className="editor-loading"><section className="card card--flush"><Notice role="alert" title={t('pageLoadFailed')} action={<Button onClick={() => void load()}>{t('retry')}</Button>} /></section></div>
  }
  if (!doc || !page) return <div className="editor-loading" role="status" aria-label={t('loading')}><Skeleton width="16rem" /></div>

  const sections = doc.content.sections
  const setSections = (next: Section[], key?: string) => edit({ ...doc, content: { ...doc.content, sections: next } }, key)
  const updateSection = (sid: string, change: Partial<Section>, key?: string) => setSections(sections.map((s) => (s.id === sid ? { ...s, ...change } : s)), key)
  const move = (from: number, to: number) => {
    if (to < 0 || to >= sections.length) return
    const next = [...sections]
    const [item] = next.splice(from, 1)
    next.splice(to, 0, item)
    setSections(next)
  }
  const endDrag = () => {
    dragFrom.current = null
    setDragging(null)
    setDropAt(null)
  }
  const finishDrop = () => {
    if (dragFrom.current !== null && dropAt !== null) {
      const to = dropAt > dragFrom.current ? dropAt - 1 : dropAt
      if (to !== dragFrom.current) move(dragFrom.current, to)
    }
    endDrag()
  }
  const dropSpace = (at: number) => (
    <li
      aria-hidden="true"
      data-drop-at={at}
      className={`editor-sections__drop-space${dropAt === at ? ' editor-sections__drop-space--open' : ''}`}
      onDragOver={(e) => {
        if (dragFrom.current === null) return
        e.preventDefault()
        e.stopPropagation()
        e.dataTransfer.dropEffect = 'move'
        setDropAt(at)
      }}
    ><span /></li>
  )
  const add = (preset: (typeof sectionPresets)[number]) => {
    const section: Section = { ...newSection('layout', newId()), settings: { name: L(preset.label) }, children: preset.build(newId) }
    setOpen((o) => new Set([...o, section.id, ...section.children!.map((n) => n.id)]))
    const at = sections.findIndex((s) => s.id === (findNode(sections, selected)?.section.id ?? selected))
    const next = [...sections]
    next.splice(at === -1 ? next.length : at + 1, 0, section)
    setSections(next)
    setSelected(section.id)
    setSettingsTab('content')
    setAdding(false)
    setPane('edit')
  }
  const duplicate = (s: Section) => {
    const copy = reIdSection(s, newId)
    const next = [...sections]
    next.splice(sections.indexOf(s) + 1, 0, copy)
    setSections(next)
    setSelected(copy.id)
  }
  const choose = (sid: string) => {
    setOpen((o) => new Set([...o, ...pathTo(sections, sid)]))
    setView('sections')
    setSettingsTab('content')
    setAdding(false)
    setSelected(sid)
    setPane('edit')
  }

  const found = findNode(sections, selected)
  const tabLabel = (tab: 'content' | 'layout' | 'style') => {
    const Icon = tab === 'content' ? PenLine : tab === 'layout' ? SlidersHorizontal : Palette
    return <><Icon size={15} aria-hidden="true" /><span>{L(tab === 'content' ? ['কন্টেন্ট', 'Content'] : tab === 'layout' ? ['বিন্যাস', 'Layout'] : ['স্টাইল', 'Style'])}</span></>
  }
  const sTab = section0(selected)?.type === 'layout' && settingsTab === 'content' ? 'layout' : settingsTab
  // A layout section is listed by what it shows: its block, or its first heading or text.
  // Sections are listed by the name the seller gives them (or their place on the page until they do).
  const sectionName = (s: Section) => {
    if (s.type !== 'layout') return L(defOf(s.type).label)
    if (typeof s.settings.name === 'string' && s.settings.name.trim()) return s.settings.name.trim()
    return `${L(["সেকশন", "Section"])} ${num(sections.findIndex((x) => x.id === s.id) + 1)}`
  }
  const sectionIcon = (s: Section) => {
    const only = s.children?.length === 1 ? s.children[0] : undefined
    return only?.block ? sectionIcons[only.block.type] : sectionIcons[s.type]
  }
  function section0(id: string | null) { return sections.find((x) => x.id === id) }
  const editTree = (sectionId: string, fn: (nodes: PageNode[]) => PageNode[], key?: string) => setSections(sections.map((s) => (s.id === sectionId ? { ...s, children: fn(s.children ?? []) } : s)), key)
  const addNode = (build: (id: () => string) => PageNode) => {
    if (!addingNode) return
    const node = build(newId)
    editTree(addingNode.sectionId, (nodes) => insertNode(nodes, addingNode.parentId, addingNode.index, node))
    setAddingNode(null)
    choose(node.id)
  }
  const addAfter = (f: Found) => setAddingNode(f.node.kind === 'box' ? { sectionId: f.section.id, parentId: f.node.id, index: f.node.children?.length ?? 0 } : { sectionId: f.section.id, parentId: f.parent?.id ?? null, index: f.index + 1 })
  const duplicateNode = (sectionId: string, id: string) => {
    const hit = findNode(sections, id)
    if (!hit) return
    const copy = reId(hit.node, newId)
    editTree(sectionId, (nodes) => insertNode(nodes, hit.parent?.id ?? null, hit.index + 1, copy))
    setSelected(copy.id)
  }
  const copySelected = () => {
    const hit = findNode(sections, selected)
    const sec = sections.find((x) => x.id === selected)
    if (hit) writeClip({ kind: 'node', node: hit.node })
    else if (sec?.type === 'layout') writeClip({ kind: 'section', section: sec })
    else return
    setToast(L(['কপি হয়েছে', 'Copied']))
  }
  // Paste: a section goes after the current section; an element goes into a selected box, after a selected element,
  // or at the end of a selected section (or a new section when nothing is selected).
  const paste = () => {
    const clip = readClip()
    if (!clip) return
    const hit = findNode(sections, selected)
    const current = hit?.section ?? sections.find((x) => x.id === selected)
    if (clip.kind === 'section') {
      if (sections.length >= maxSections) return
      const copy = reIdSection(clip.section, newId)
      const at = current ? sections.indexOf(current) + 1 : sections.length
      setSections([...sections.slice(0, at), copy, ...sections.slice(at)])
      setSelected(copy.id)
    } else {
      const node = reId(clip.node, newId)
      if (hit) editTree(hit.section.id, (nodes) => hit.node.kind === 'box' ? insertNode(nodes, hit.node.id, hit.node.children?.length ?? 0, node) : insertNode(nodes, hit.parent?.id ?? null, hit.index + 1, node))
      else if (current?.type === 'layout') editTree(current.id, (nodes) => [...nodes, node])
      else setSections([...sections, { ...newSection('layout', newId()), settings: { name: '' }, children: [node] }])
      setOpen((o) => new Set([...o, ...(current ? [current.id] : [])]))
      setSelected(node.id)
    }
    setToast(L(['পেস্ট হয়েছে', 'Pasted']))
  }
  keys.current.copy = copySelected
  keys.current.paste = paste
  keys.current.duplicate = () => {
    const hit = findNode(sections, selected)
    const sec = sections.find((x) => x.id === selected)
    if (hit) duplicateNode(hit.section.id, hit.node.id)
    else if (sec && sections.length < maxSections) duplicate(sec)
  }
  const openMenu = (id: string, x: number, y: number) => { choose(id); setMenuAt({ id, x, y }) }
  const menuItems = (id: string) => {
    const hit = findNode(sections, id)
    const sec = sections.find((x) => x.id === id)
    const hidden = hit ? hit.node.hide === 'all' : Boolean(sec?.hidden)
    const index = sec ? sections.indexOf(sec) : -1
    return [
      { label: L(['কপি', 'Copy']), hint: '⌘C', Icon: ClipboardCopy, run: copySelected },
      { label: L(['পেস্ট', 'Paste']), hint: '⌘V', Icon: ClipboardPaste, run: paste },
      { label: t('pageDuplicateSection'), hint: '⌘D', Icon: Copy, run: () => (hit ? duplicateNode(hit.section.id, hit.node.id) : sec && duplicate(sec)) },
      'rule' as const,
      { label: t('pageMoveUp'), Icon: ArrowUp, disabled: hit ? hit.index === 0 : index <= 0, run: () => (hit ? editTree(hit.section.id, (n) => moveNode(n, hit, -1)) : move(index, index - 1)) },
      { label: t('pageMoveDown'), Icon: ArrowDown, disabled: hit ? hit.index === hit.siblings.length - 1 : index === sections.length - 1, run: () => (hit ? editTree(hit.section.id, (n) => moveNode(n, hit, 1)) : move(index, index + 1)) },
      { label: L(hidden ? ['দেখান', 'Show'] : ['লুকান', 'Hide']), Icon: hidden ? Eye : EyeOff, run: () => (hit ? editTree(hit.section.id, (n) => updateNode(n, hit.node.id, (x) => { const next = { ...x }; if (x.hide === 'all') delete next.hide; else next.hide = 'all'; return next })) : sec && updateSection(sec.id, { hidden: !sec.hidden })) },
      ...(hit ? [{ label: L(['বাইরের স্তর বাছুন', 'Select the box around it']), Icon: CornerLeftUp, run: () => choose(hit.parent?.id ?? hit.section.id) }] : []),
      'rule' as const,
      { label: L(['মুছুন', 'Delete']), Icon: Trash2, danger: true, run: () => {
        if (hit) { editTree(hit.section.id, (n) => removeNode(n, hit.node.id)); setSelected(hit.parent?.id ?? hit.section.id) }
        else if (sec) { setSections(sections.filter((x) => x.id !== sec.id)); setSelected(null); setPane('sections') }
      } },
    ]
  }
  // "Add element" at the end of every open container, at the level of its children.
  const addRow = (sectionId: string, parentId: string | null, index: number, depth: number) => (
    <div className="editor-tree__row editor-tree__row--add" style={{ ['--depth' as string]: depth }}>
      {Array.from({ length: depth }, (_, i) => <span key={i} className="editor-tree__guide" aria-hidden="true" />)}
      <button type="button" className="editor-tree__add" onClick={() => setAddingNode({ sectionId, parentId, index })}><Plus size={14} aria-hidden="true" />{L(['এলিমেন্ট যোগ করুন', 'Add element'])}</button>
    </div>
  )
  const tree = (sectionId: string, nodes: PageNode[], depth: number): ReactNode => nodes.map((n) => {
    const Icon = n.block ? sectionIcons[n.block.type] : n.kind === 'box' ? (String(n.style?.direction ?? '').startsWith('row') ? Columns3 : Rows3) : nodeIcons[n.kind]
    const name = nodeName(n, L)
    const isOpen = open.has(n.id)
    return <Fragment key={n.id}>
      <div onContextMenu={(e) => { e.preventDefault(); openMenu(n.id, e.clientX, e.clientY) }} className={`editor-tree__row${n.id === selected ? ' editor-tree__row--selected' : ''}${n.hide ? ' editor-tree__row--partial' : ''}${nodeDrop?.id === n.id ? ` editor-tree__row--drop-${nodeDrop.where}` : ''}`} style={{ ['--depth' as string]: depth }}
        draggable
        onDragStart={(e) => { e.stopPropagation(); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', n.id); nodeDrag.current = n.id }}
        onDragEnd={() => { nodeDrag.current = null; setNodeDrop(null) }}
        onDragOver={(e) => {
          if (!nodeDrag.current || nodeDrag.current === n.id) return
          e.preventDefault()
          e.stopPropagation()
          const box = e.currentTarget.getBoundingClientRect()
          const y = (e.clientY - box.top) / box.height
          const where = n.kind === 'box' && y > 0.3 && y < 0.7 ? 'inside' : y < 0.5 ? 'before' : 'after'
          if (nodeDrop?.id !== n.id || nodeDrop.where !== where) setNodeDrop({ id: n.id, where })
        }}
        onDrop={(e) => {
          e.preventDefault()
          e.stopPropagation()
          const from = nodeDrag.current
          nodeDrag.current = null
          setNodeDrop(null)
          if (!from || !nodeDrop) return
          const next = relocate(sections.find((x) => x.id === sectionId)?.children ?? [], from, n.id, nodeDrop.where)
          if (next) { editTree(sectionId, () => next); setSelected(from) }
        }}>
        {Array.from({ length: depth }, (_, i) => <span key={i} className="editor-tree__guide" aria-hidden="true" />)}
        {n.kind === 'box'
          ? <button type="button" className="editor-tree__toggle" aria-expanded={isOpen} aria-label={`${L(isOpen ? ['বন্ধ করুন', 'Collapse'] : ['খুলুন', 'Expand'])}: ${name}`} onClick={() => toggle(n.id)}><ChevronDown size={13} aria-hidden="true" /></button>
          : <span className="editor-tree__toggle" aria-hidden="true" />}
        <span className="editor-tree__handle" aria-hidden="true"><Icon className="editor-tree__icon" size={14} /><GripVertical className="editor-tree__drag" size={14} /></span>
        <button type="button" className="editor-tree__name" aria-current={n.id === selected ? 'true' : undefined} title={name} onClick={() => choose(n.id)}><span>{name}</span></button>
        <span className="editor-tree__actions">
          <span className="editor-tree__delete"><IconButton label={`${t('pageDuplicateSection')}: ${name}`} title={t('pageDuplicateSection')} onClick={() => duplicateNode(sectionId, n.id)}><Copy size={14} aria-hidden="true" /></IconButton></span>
          <span className="editor-tree__delete"><IconButton label={`${t('pageRemoveSection')}: ${name}`} title={t('pageRemoveSection')} onClick={() => {
            editTree(sectionId, (list) => removeNode(list, n.id))
            if (n.id === selected || pathTo(sections, selected ?? '').includes(n.id)) setSelected(sectionId)
          }}><Trash2 size={14} aria-hidden="true" /></IconButton></span>
          <IconButton label={`${L(n.hide === 'all' ? ['দেখান', 'Show'] : ['লুকান', 'Hide'])}: ${name}`} title={L(n.hide === 'all' ? ['দেখান', 'Show'] : ['লুকান', 'Hide'])} onClick={() => editTree(sectionId, (list) => updateNode(list, n.id, (x) => { const next = { ...x }; if (x.hide === 'all') delete next.hide; else next.hide = 'all'; return next }))}>
            {n.hide === 'all' ? <EyeOff size={14} aria-hidden="true" /> : <Eye size={14} aria-hidden="true" />}
          </IconButton>
        </span>
      </div>
      {n.children && isOpen && <>{tree(sectionId, n.children, depth + 1)}{addRow(sectionId, n.id, n.children.length, depth + 1)}</>}
    </Fragment>
  })
  const nodePanel = (f: Found) => {
    const def = f.node.block ? { ...nodeDefs.block, label: defOf(f.node.block.type).label } : nodeDefs[f.node.kind]
    const hasContent = def.fields.length > 0 || Boolean(f.node.block)
    const tab = !hasContent && settingsTab === 'content' ? 'layout' : settingsTab
    const at = (fn: (n: PageNode) => PageNode, key?: string) => editTree(f.section.id, (nodes) => updateNode(nodes, f.node.id, fn), key)
    const patch = (values: Record<string, string | number | undefined>, typingKey?: string) => at((n) => {
      const slot = device === 'mobile' ? 'mobile' : 'style'
      const style = { ...(n[slot] ?? {}) }
      for (const [k, v] of Object.entries(values)) {
        if (v === undefined || v === '') delete style[k]
        else style[k] = v
      }
      const next = { ...n }
      if (Object.keys(style).length) next[slot] = style
      else delete next[slot]
      return next
    }, typingKey ? `${f.node.id}:${device}:${typingKey}` : undefined)
    const remove = () => {
      editTree(f.section.id, (nodes) => removeNode(nodes, f.node.id))
      setSelected(f.parent?.id ?? f.section.id)
    }
    return <>
      <div className="editor__settings-head">
        <h2 className="editor__heading">{L(def.label)}</h2>
        <div className="row">
          <IconButton label={L(['বাইরের স্তর বাছুন', 'Select the box around it'])} title={L(['বাইরের স্তর বাছুন', 'Select the box around it'])} onClick={() => choose(f.parent?.id ?? f.section.id)}><CornerLeftUp size={16} aria-hidden="true" /></IconButton>
          <button type="button" className="media__dismiss" aria-label={t('mediaClose')} onClick={() => { setSelected(null); setPane('sections') }}><X size={16} aria-hidden="true" /></button>
        </div>
      </div>
      <div className="editor-setting-tabs" role="group" aria-label={L(def.label)}>
        {(['content', 'style', 'layout'] as const).filter((x) => x !== 'content' || hasContent).map((x) => <button key={x} type="button" aria-pressed={tab === x} onClick={() => setSettingsTab(x)}>{tabLabel(x)}</button>)}
      </div>
      <div className="editor__form">
        {tab !== 'content' && <DeviceSwitch device={device} onChange={(d) => { setDevice(d); setMobile(d === 'mobile') }} />}
        {tab === 'content'
          ? f.node.block ? <div className="editor__fields">{(['content', 'layout'] as const).map((group) => <SectionForm key={`${f.node.id}:${group}`} group={group} section={{ id: f.node.id, type: f.node.block!.type, hidden: false, settings: f.node.block!.settings }} media={media} products={products} onPick={setPicking}
              onChange={(key, v, typing) => at((n) => ({ ...n, block: { type: n.block!.type, settings: { ...n.block!.settings, [key]: v } } }), typing ? `${f.node.id}:${key}` : undefined)} />)}</div>
          : <div className="editor__fields">{['heading', 'text', 'button'].includes(f.node.kind) && <p className="design-help">{L(['টিপ: প্রিভিউতে লেখার উপর আবার ক্লিক করে সরাসরি লিখুন।', 'Tip: click the text in the preview again to type straight on the page.'])}</p>}{def.fields.map((field) => <LeafEditor key={`${f.node.id}:${field.key}`} id={`node-${f.node.id}-${field.key}`} field={field} value={f.node.props[field.key] ?? null} media={media} products={products} onPick={setPicking}
              onChange={(v, typing) => at((n) => ({ ...n, props: { ...n.props, [field.key]: v } }), typing ? `${f.node.id}:${field.key}` : undefined)} />)}</div>
          : <NodeDesignControls key={`${f.node.id}:${tab}:${device}`} node={f.node} tab={tab} device={device} media={media} onPatch={patch}
              onHide={(hide) => at((n) => { const next = { ...n }; if (hide) next.hide = hide; else delete next.hide; return next })}
              onPickImage={(apply) => setPicking({ kind: 'image', apply })}
              grid={f.node.kind === 'box' && f.node.style?.display === 'grid' || f.node.kind === 'box' && (f.node.children ?? []).every((c) => c.kind === 'box') ? { columns: Number(f.node.style?.gridColumns ?? Math.max(1, f.node.children?.length ?? 1)), rows: Number(f.node.style?.gridRows ?? 1), set: (c, r) => {
                const result = setGrid(f.node, c, r, newId)
                at(() => result.node)
                return !result.blocked
              } } : undefined}
              parentGrid={f.parent?.style?.display === 'grid' ? { columns: Number(f.parent.style.gridColumns ?? 1), rows: Number(f.parent.style.gridRows ?? 1) } : undefined} />}
        <Button onClick={() => addAfter(f)}><Plus size={16} aria-hidden="true" />{f.node.kind === 'box' ? L(['এই বক্সের ভেতরে যোগ করুন', 'Add inside this box']) : L(['এর নিচে যোগ করুন', 'Add below this'])}</Button>
      </div>
      <div className="editor__section-actions" role="group" aria-label={t('pageEditTab')}>
        <IconButton label={t('pageMoveUp')} title={t('pageMoveUp')} disabled={f.index === 0} onClick={() => editTree(f.section.id, (nodes) => moveNode(nodes, f, -1))}><ArrowUp size={16} aria-hidden="true" /><span className="editor__action-label">{t('pageMoveUp')}</span></IconButton>
        <IconButton label={t('pageMoveDown')} title={t('pageMoveDown')} disabled={f.index === f.siblings.length - 1} onClick={() => editTree(f.section.id, (nodes) => moveNode(nodes, f, 1))}><ArrowDown size={16} aria-hidden="true" /><span className="editor__action-label">{t('pageMoveDown')}</span></IconButton>
        <IconButton label={L(['কপি', 'Copy'])} title={L(['কপি (⌘C)', 'Copy (⌘C)'])} onClick={copySelected}><ClipboardCopy size={16} aria-hidden="true" /><span className="editor__action-label">{L(['কপি', 'Copy'])}</span></IconButton>
        <IconButton label={L(['পেস্ট', 'Paste'])} title={L(['পেস্ট (⌘V)', 'Paste (⌘V)'])} onClick={paste}><ClipboardPaste size={16} aria-hidden="true" /><span className="editor__action-label">{L(['পেস্ট', 'Paste'])}</span></IconButton>
        <IconButton label={t('pageDuplicateSection')} title={t('pageDuplicateSection')} onClick={() => { const copy = reId(f.node, newId); editTree(f.section.id, (nodes) => insertNode(nodes, f.parent?.id ?? null, f.index + 1, copy)); setSelected(copy.id) }}><Copy size={16} aria-hidden="true" /><span className="editor__action-label">{t('pageDuplicateSection')}</span></IconButton>
        <IconButton label={t('pageRemoveSection')} title={t('pageRemoveSection')} onClick={remove}><Trash2 size={16} aria-hidden="true" /><span className="editor__action-label">{t('pageRemoveSection')}</span></IconButton>
      </div>
    </>
  }


  const section = sections.find((s) => s.id === selected)
  const index = section ? sections.indexOf(section) : -1
  const liveUrl = `${storefrontUrl(current.store.handle)}${pageHref(page.publishedHandle ?? page.handle)}`
  const incompleteOrders = orderBlocks(doc.content).filter((o) => !o.settings.product || (typeof o.settings.product === 'string' && products[o.settings.product]?.status === 'draft'))
  const status = { isPublished: page.isPublished, hasChanges: page.isPublished && (page.hasChanges || dirty) }

  // Shown in the top bar on wide screens and, with short labels, in the bottom dock on phones.
  const dockLabel = (dock: boolean, text: string) => dock && <span className="editor__dock-label">{text}</span>
  const views = (dock: boolean) => ({
    sections:     <IconButton label={t('pageSections')} title={t('pageSections')} aria-pressed={view === 'sections' && pane !== 'preview'} onClick={() => { setView('sections'); setPane('sections') }}><LayoutTemplate size={dock ? 20 : 16} aria-hidden="true" />{dockLabel(dock, t('pageSections'))}</IconButton>,
    page: <IconButton label={t('pageSettings')} title={t('pageSettings')} aria-pressed={view === 'page' && pane !== 'preview'} onClick={() => { setView('page'); setPane('edit') }}><Settings size={dock ? 20 : 16} aria-hidden="true" />{dockLabel(dock, L(['পেজ', 'Page']))}</IconButton>,
    preview: <IconButton label={t('pagePreview')} title={t('pagePreview')} aria-pressed={pane === 'preview'} onClick={() => setPane('preview')}><Eye size={dock ? 20 : 16} aria-hidden="true" />{dockLabel(dock, t('pagePreview'))}</IconButton>,
  })
  const history = (dock: boolean) => <>
    <IconButton label={t('pageUndo')} title={t('pageUndo')} disabled={busy || past.length === 0} onClick={undo}><Undo2 size={dock ? 20 : 16} aria-hidden="true" />{dockLabel(dock, L(['আনডু', 'Undo']))}</IconButton>
    <IconButton label={t('pageRedo')} title={t('pageRedo')} disabled={busy || future.length === 0} onClick={redo}><Redo2 size={dock ? 20 : 16} aria-hidden="true" />{dockLabel(dock, L(['রিডু', 'Redo']))}</IconButton>
  </>

  return (
    <div className="editor" data-pane={pane}>
      <PageTitle title={doc.title || t('pages')} />
      <header className="editor__bar">
        <div className="editor__nav">
          <Link onClick={(e) => { if (dirty) { e.preventDefault(); setLeaving(true) } }} className="detail-head__back" to={path('/landing-pages')} aria-label={t('pageBack')} title={t('pageBack')}><ArrowLeft size={16} aria-hidden="true" /></Link>
          <span className="editor__views">{(({ sections, page, preview }) => <>{sections}{page}{preview}</>)(views(false))}</span>
        </div>
        <div className="editor__title">
          <h1 title={doc.title}>{doc.title || t('pages')}</h1>
          <PageStatus page={status} />
        </div>
        <div className="editor__tools">
          <span className="editor__save-state" role="status">{t(busy ? 'pageSaving' : dirty ? 'pageUnsaved' : 'pageAllSaved')}</span>
          <span className="editor__history">{history(false)}</span>
          <div className="editor__devices">
            <IconButton label={t('pageMobile')} title={t(mobile ? 'pageDesktop' : 'pageMobile')} aria-pressed={mobile} onClick={() => setMobile((value) => !value)}><Smartphone size={16} aria-hidden="true" /></IconButton>
          </div>
          {page.isPublished && <a className="btn btn--icon" href={liveUrl} target="_blank" rel="noopener" aria-label={t('pageView')} title={t('pageView')}><ExternalLink size={16} aria-hidden="true" /></a>}
          <Button disabled={busy || !dirty} aria-busy={busy} onClick={() => void onSave()}>{t('pageSave')}</Button>
          <Button variant="primary" disabled={busy || (page.isPublished && !page.hasChanges && !dirty)} aria-busy={busy} onClick={() => void publish()}>{t('pagePublish')}</Button>
        </div>
      </header>

      <nav className="editor__dock" aria-label={t('pageEditTab')}>{(({ sections, page, preview }) => <>{page}{history(true)}{sections}{preview}</>)(views(true))}</nav>

      {error && (
        <div className="editor__error" role="alert">
          <p className="form-error">{t(errorLabel(error))}</p>
          {error === 'pageChanged' && <Button onClick={() => void load()}>{t('pageReload')}</Button>}
        </div>
      )}

      <div className="editor__sidebar" data-view={view} data-editing={view !== 'sections' || Boolean(section || found)}>
      {view === 'sections' && <>
      <aside className="editor__sections" inert={busy} aria-label={t('pageSections')}>
        <div className="editor__settings-head"><h2 className="editor__heading">{t('pageSections')}</h2><span className="muted">{sections.length}/{maxSections}</span></div>
        {incompleteOrders.length > 0 && <div className="editor__readiness">
          <p>{t('pageOrderNotReady')}</p>
          {incompleteOrders.map((o) => <button key={o.id} type="button" onClick={() => choose(o.id)}>{L(defOf('order').label)}</button>)}
        </div>}
        <ul className="editor-sections" onDragOver={(e) => {
          if (dragFrom.current === null) return
          e.preventDefault()
          e.dataTransfer.dropEffect = 'move'
        }} onDragLeave={(e) => {
          const bounds = e.currentTarget.getBoundingClientRect()
          if (e.clientX < bounds.left || e.clientX > bounds.right || e.clientY < bounds.top || e.clientY > bounds.bottom) setDropAt(null)
        }} onDrop={(e) => {
          if (dragFrom.current === null) return
          e.preventDefault()
          finishDrop()
        }}>
          {sections.map((s, i) => (
            <Fragment key={s.id}>
            {dropSpace(i)}
            <li
              data-section-index={i}
              onContextMenu={(e) => { e.preventDefault(); openMenu(s.id, e.clientX, e.clientY) }}
              className={`editor-sections__row${s.id === selected ? ' editor-sections__row--selected' : ''}${s.hidden ? ' editor-sections__row--hidden' : ''}${dragging === i ? ' editor-sections__row--dragging' : ''}`}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = 'move'
                e.dataTransfer.setData('text/plain', s.id)
                dragFrom.current = i
                setDragging(i)
              }}
              onDragEnd={endDrag}
              onDragOver={(e) => {
                if (dragFrom.current === null) return
                e.preventDefault()
                const bounds = e.currentTarget.getBoundingClientRect()
                setDropAt(e.clientY < bounds.top + bounds.height / 2 ? i : i + 1)
              }}
            >
              {(() => {
                return <button type="button" className="editor-sections__toggle" aria-expanded={open.has(s.id)} aria-label={`${L(open.has(s.id) ? ['বন্ধ করুন', 'Collapse'] : ['খুলুন', 'Expand'])}: ${sectionName(s)}`} onClick={() => toggle(s.id)}><ChevronDown size={14} aria-hidden="true" /></button>
              })()}
              <button type="button" className="editor-sections__grip" aria-label={`${t('pageReorder')}: ${L(defOf(s.type).label)}`} title={t('pageReorder')}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                    e.preventDefault()
                    move(i, i + (e.key === 'ArrowUp' ? -1 : 1))
                  }
                }}
                onPointerDown={(e) => {
                  if (e.pointerType === 'mouse') return
                  e.preventDefault()
                  e.currentTarget.setPointerCapture(e.pointerId)
                  dragFrom.current = i
                  setDragging(i)
                  setDropAt(null)
                }}
                onPointerMove={(e) => {
                  if (!e.currentTarget.hasPointerCapture(e.pointerId) || dragFrom.current === null) return
                  const list = e.currentTarget.closest('.editor-sections')!
                  const target = e.currentTarget.ownerDocument.elementFromPoint(e.clientX, e.clientY)
                  const slot = target?.closest<HTMLElement>('[data-drop-at]')
                  const row = target?.closest<HTMLElement>('[data-section-index]')
                  if (slot && list.contains(slot)) setDropAt(Number(slot.dataset.dropAt))
                  else if (row && list.contains(row)) {
                    const bounds = row.getBoundingClientRect()
                    setDropAt(Number(row.dataset.sectionIndex) + (e.clientY >= bounds.top + bounds.height / 2 ? 1 : 0))
                  } else setDropAt(null)
                  const scroller = list.closest('aside')!
                  const bounds = scroller.getBoundingClientRect()
                  if (e.clientY < bounds.top + 48) scroller.scrollBy(0, -12)
                  else if (e.clientY > bounds.bottom - 48) scroller.scrollBy(0, 12)
                }}
                onPointerUp={(e) => {
                  if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
                  finishDrop()
                  e.currentTarget.releasePointerCapture(e.pointerId)
                }}
                onPointerCancel={endDrag}
                onLostPointerCapture={endDrag}
              >{(() => { const Icon = sectionIcon(s); return <Icon className="editor-sections__icon" size={15} aria-hidden="true" /> })()}<GripVertical className="editor-sections__drag" size={16} aria-hidden="true" /></button>
              <button type="button" className="editor-sections__name" title={sectionName(s)} aria-current={s.id === selected ? 'true' : undefined} onClick={() => choose(s.id)}>
                <span className="editor-sections__label"><span className="editor-sections__text">{sectionName(s)}</span></span>
              </button>
              <span className="editor-sections__delete"><IconButton label={`${t('pageDuplicateSection')}: ${sectionName(s)}`} title={t('pageDuplicateSection')} disabled={sections.length >= maxSections} onClick={() => duplicate(s)}><Copy size={15} aria-hidden="true" /></IconButton></span>
              <span className="editor-sections__delete"><IconButton label={`${t('pageRemoveSection')}: ${sectionName(s)}`} title={t('pageRemoveSection')} onClick={() => {
                setSections(sections.filter((x) => x.id !== s.id))
                if (s.id === selected || found?.section.id === s.id) { setSelected(null); setPane('sections') }
              }}><Trash2 size={15} aria-hidden="true" /></IconButton></span>
              <IconButton label={t(s.hidden ? 'pageShow' : 'pageHide', { value: L(defOf(s.type).label) })} title={t(s.hidden ? 'pageShow' : 'pageHide', { value: L(defOf(s.type).label) })} onClick={() => updateSection(s.id, { hidden: !s.hidden })}>
                {s.hidden ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
              </IconButton>
            </li>
            {s.type === 'layout' && open.has(s.id) && <li className="editor-tree">
              {tree(s.id, s.children ?? [], 1)}
              {addRow(s.id, null, s.children?.length ?? 0, 1)}
            </li>}
            </Fragment>
          ))}
          {dropSpace(sections.length)}
        </ul>
        {sections.length === 0 && <p className="muted">{t('pageNoSections')}</p>}
        {sections.length < maxSections && <Button onClick={() => setAdding(true)}><Plus size={16} aria-hidden="true" />{t('pageAddSection')}</Button>}
      </aside>

      <aside ref={settingsPanel} className="editor__settings" inert={busy} aria-label={t('pageEditTab')}>
        {found ? nodePanel(found) : section ? (
          <>
            <div className="editor__settings-head">
              {section.type === 'layout'
                ? <input className="editor__name-input" aria-label={L(['সেকশনের নাম', 'Section name'])} maxLength={60} placeholder={sectionName({ ...section, settings: { name: '' } })} value={typeof section.settings.name === 'string' ? section.settings.name : ''} onChange={(e) => updateSection(section.id, { settings: { ...section.settings, name: e.target.value } }, `${section.id}:name`)} />
                : <h2 className="editor__heading">{L(defOf(section.type).label)}</h2>}
              <button type="button" className="media__dismiss" aria-label={t('mediaClose')} onClick={() => { setSelected(null); setPane('sections') }}><X size={16} aria-hidden="true" /></button>
            </div>
            {section.hidden && <p className="muted">{t('pageHidden')}</p>}
            <div className="editor-setting-tabs" role="group" aria-label={L(['সেকশন সেটিংস', 'Section settings'])}>
              {(['content', 'style', 'layout'] as const).filter((tab) => tab !== 'content' || section.type !== 'layout').map((tab) => <button key={tab} type="button" aria-pressed={sTab === tab} onClick={() => setSettingsTab(tab)}>{tabLabel(tab)}</button>)}
            </div>
            <div className="editor__form">
              {sTab !== 'style' && <div className={sTab === 'layout' ? 'design-structure' : 'editor__fields'}><SectionForm
                key={`${section.id}:${sTab}`}
                group={sTab === 'layout' ? 'layout' : 'content'}
                section={section}
                media={media}
                products={products}
                onPick={setPicking}
                onChange={(key, value, typing) => updateSection(section.id, { settings: { ...section.settings, [key]: value } }, typing ? `${section.id}:${key}` : undefined)}
              /></div>}

              {sTab !== 'content' && <>
                <SectionDesignControls key={`${section.id}:${sTab}`} section={section} tab={sTab} theme={theme} media={media} onPickImage={(apply) => setPicking({ kind: 'image', apply })} onPatch={(patch, typingKey) => {
                  const style = { ...section.style }
                  for (const [key, value] of Object.entries(patch)) {
                    if (value === undefined || value === '') delete style[key]
                    else style[key] = value
                  }
                  updateSection(section.id, { style: Object.keys(style).length ? style : undefined }, typingKey ? `${section.id}:style:${typingKey}` : undefined)
                }} />
                {sTab === 'layout' && <details className="design-group design-anchor"><summary><span className="design-group__icon"><Link2 size={15} aria-hidden="true" /></span><strong>{L(['সেকশনের লিংক', 'Section link'])}</strong><ChevronDown size={14} aria-hidden="true" /></summary><div className="design-group__body"><Field id="section-anchor" label={L(['হেডার বা বাটনে ব্যবহার করুন', 'Use in a header or button'])} value={`#${section.id}`} readOnly /></div></details>}
                <div className="editor__reset-all" hidden={resetting !== `${section.id}:${sTab}`}>
                  {resetting === `${section.id}:${sTab}`
                    ? <>
                      <span>{L(sTab === 'layout' ? ['এই সেকশনের সব বিন্যাস মুছবেন?', 'Reset all layout settings of this section?'] : ['এই সেকশনের সব স্টাইল মুছবেন?', 'Reset all style settings of this section?'])}</span>
                      <Button onClick={() => setResetting(null)}>{t('cancel')}</Button>
                      <Button variant="danger" onClick={() => {
                        const style = { ...section.style }
                        for (const field of styleFieldsFor(section.type).filter((f) => f.group === sTab)) delete style[field.key]
                        updateSection(section.id, { style: Object.keys(style).length ? style : undefined })
                        setResetting(null)
                      }}>{L(['রিসেট', 'Reset'])}</Button>
                    </>
                    : null}
                </div>
              </>}
              {section.type === 'order' && sTab === 'content' && <p className="muted">{t('pageDeliveryNote')} <Link to={path('/settings/delivery')} target="_blank">{t('shippingTitle')}</Link></p>}
            </div>
            <div className="editor__section-actions" role="group" aria-label={t('pageEditTab')}>
              <IconButton label={t('pageMoveUp')} title={t('pageMoveUp')} disabled={index === 0} onClick={() => move(index, index - 1)}><ArrowUp size={16} aria-hidden="true" /><span className="editor__action-label">{t('pageMoveUp')}</span></IconButton>
              <IconButton label={t('pageMoveDown')} title={t('pageMoveDown')} disabled={index === sections.length - 1} onClick={() => move(index, index + 1)}><ArrowDown size={16} aria-hidden="true" /><span className="editor__action-label">{t('pageMoveDown')}</span></IconButton>
              {sTab !== 'content' && <IconButton label={L(sTab === 'layout' ? ['সব বিন্যাস রিসেট করুন', 'Reset all layout'] : ['সব স্টাইল রিসেট করুন', 'Reset all style'])} title={L(sTab === 'layout' ? ['সব বিন্যাস রিসেট করুন', 'Reset all layout'] : ['সব স্টাইল রিসেট করুন', 'Reset all style'])} aria-pressed={resetting === `${section.id}:${sTab}`} onClick={() => setResetting(resetting === `${section.id}:${sTab}` ? null : `${section.id}:${sTab}`)}><RotateCcw size={16} aria-hidden="true" /><span className="editor__action-label">{L(['রিসেট', 'Reset'])}</span></IconButton>}
              <IconButton label={L(['কপি', 'Copy'])} title={L(['কপি (⌘C)', 'Copy (⌘C)'])} onClick={copySelected}><ClipboardCopy size={16} aria-hidden="true" /><span className="editor__action-label">{L(['কপি', 'Copy'])}</span></IconButton>
              <IconButton label={L(['পেস্ট', 'Paste'])} title={L(['পেস্ট (⌘V)', 'Paste (⌘V)'])} onClick={paste}><ClipboardPaste size={16} aria-hidden="true" /><span className="editor__action-label">{L(['পেস্ট', 'Paste'])}</span></IconButton>
              <IconButton label={t('pageDuplicateSection')} title={t('pageDuplicateSection')} disabled={sections.length >= maxSections} onClick={() => duplicate(section)}><Copy size={16} aria-hidden="true" /><span className="editor__action-label">{t('pageDuplicateSection')}</span></IconButton>
              <IconButton label={t('pageRemoveSection')} title={t('pageRemoveSection')} onClick={() => { setSections(sections.filter((s) => s.id !== section.id)); setSelected(null); setPane('sections') }}><Trash2 size={16} aria-hidden="true" /><span className="editor__action-label">{t('pageRemoveSection')}</span></IconButton>
            </div>
          </>
        ) : <p className="muted editor__empty">{t('pageSelectHint')}</p>}
      </aside>
      </>}

      {view === 'page' && (
          <aside className="editor__settings" inert={busy} aria-label={t('pageSettings')}>
            <div className="editor__settings-head">
              <h2 className="editor__heading">{t('pageSettings')}</h2>
            </div>
            <div className="editor__form">
              <fieldset className="editor-canvas"><legend>{L(['পেজ ক্যানভাস', 'Page canvas'])}</legend>
                <p className="muted">{L(['নিজের হেডার ও ফুটার যোগ করতে দোকানের বার বন্ধ রাখুন।', 'Turn off store bars to add your own header and footer sections.'])}</p>
                {(['header', 'footer'] as const).map((key) => <label key={key}><input type="checkbox" checked={doc.content.canvas?.[key] !== false} onChange={(e) => edit({ ...doc, content: { ...doc.content, canvas: { header: doc.content.canvas?.header !== false, footer: doc.content.canvas?.footer !== false, [key]: e.target.checked } } })} />{L(key === 'header' ? ['দোকানের হেডার দেখান', 'Show store header'] : ['দোকানের ফুটার দেখান', 'Show store footer'])}</label>)}
              </fieldset>
              <Field id="page-title" label={t('pageTitle')} maxLength={200} value={doc.title} error={error === 'nameRequired' && !doc.title.trim() ? t('errNameRequired') : undefined} onChange={(e) => edit({ ...doc, title: e.target.value }, 'title')} />
              <Field id="page-handle" label={t('pageAddress')} unit="/" maxLength={200} value={doc.handle} help={t('pageAddressHelp')} error={error === 'pageHandleTaken' ? t('errPageHandleTaken') : undefined} onChange={(e) => edit({ ...doc, handle: e.target.value }, 'handle')} />
              <p className="muted editor__url">
                {page.isPublished ? <a href={liveUrl} target="_blank" rel="noopener">{liveUrl}</a> : t('pageNotLive')}
              </p>
              <Field id="page-seo-title" label={t('pageSeoTitle')} maxLength={300} placeholder={doc.title} value={doc.seoTitle} help={t('pageSeoHelp')} onChange={(e) => edit({ ...doc, seoTitle: e.target.value }, 'seoTitle')} />
              <div className="field">
                <label htmlFor="page-seo-description">{t('pageSeoDescription')}</label>
                <textarea id="page-seo-description" className="input input--area" rows={3} maxLength={1000} value={doc.seoDescription} onChange={(e) => edit({ ...doc, seoDescription: e.target.value }, 'seoDescription')} />
              </div>
              <div className="field">
                <label>{L(['কাস্টম CSS', 'Custom CSS'])}</label>
                <Suspense fallback={<div className="css-editor css-editor--loading" />}>
                  <CssEditor value={doc.content.css ?? ''} label={L(['কাস্টম CSS', 'Custom CSS'])} describedBy="page-css-help" maxLength={maxCss} onChange={(css) => edit({ ...doc, content: { ...doc.content, css } }, 'css')} />
                </Suspense>
                {doc.content.css?.includes('<')
                  ? <p className="field__help field__help--error" role="alert">{L(['CSS-এ < চিহ্ন রাখা যাবে না।', 'CSS cannot contain the < character.'])}</p>
                  : <p className="field__help" id="page-css-help">{L(['শুধু এই পেজে কাজ করবে। পুরো পেজ .sf-page, আর প্রতিটি সেকশন [data-section="…"] দিয়ে ধরুন।', 'Applies to this page only. Target the page with .sf-page and a section with [data-section="…"].'])}</p>}
              </div>
            </div>
            <div className="editor__section-actions">
              {page.isPublished && <Button disabled={busy} onClick={() => void unpublish()}>{t('pageUnpublish')}</Button>}
              {current.role !== 'staff' && (
                confirming
                  ? (
                    <div className="stack">
                      <p className="muted">{t('pageDeleteWarning')}</p>
                      <div className="row">
                        <Button onClick={() => setConfirming(false)}>{t('cancel')}</Button>
                        <Button variant="danger" onClick={() => void remove()}>{t('productConfirmDelete')}</Button>
                      </div>
                    </div>
                  )
                  : <Button variant="danger" onClick={() => setConfirming(true)}><Trash2 size={16} aria-hidden="true" />{t('pageDelete')}</Button>
              )}
            </div>
          </aside>
      )}

      </div>

      <section className={`editor__preview${mobile ? ' editor__preview--mobile' : ''}`} aria-label={t('pagePreview')}>
        <Preview content={doc.content} ctx={ctx} storeName={current.store.name} theme={theme} mobile={mobile} selected={found?.node.id ?? section?.id ?? null} onSelect={choose} onMenu={openMenu} onAddInto={(cid) => {
          const sec = sections.find((x) => x.id === cid)
          if (sec) { setAddingNode({ sectionId: sec.id, parentId: null, index: sec.children?.length ?? 0 }); return }
          const hit = findNode(sections, cid)
          if (hit) setAddingNode({ sectionId: hit.section.id, parentId: cid, index: hit.node.children?.length ?? 0 })
        }} onText={(nid, text) => {
          const hit = findNode(sections, nid)
          if (!hit) return
          const field = nodeDefs[hit.node.kind].fields.find((f) => f.key === 'text')
          if (!field || !('max' in field)) return
          editTree(hit.section.id, (nodes) => updateNode(nodes, nid, (n) => ({ ...n, props: { ...n.props, text: text.slice(0, field.max) } })))
        }} />
      </section>

      {adding && <AddSectionDialog onClose={() => setAdding(false)} onAdd={add} />}
      {addingNode && <AddNodeDialog onClose={() => setAddingNode(null)} onAdd={addNode} />}

      {leaving && <LeaveDialog onClose={() => setLeaving(false)} onLeave={() => navigate(path('/landing-pages'))} onSave={() => void run(async () => { if (await save()) navigate(path('/landing-pages')); else setLeaving(false) })} busy={busy} />}

      {picking?.kind === 'image' && (
        <MediaPicker selected={[]} max={1} onClose={() => setPicking(null)} onDone={(items) => {
          if (items[0]) {
            setMedia((m) => ({ ...m, [items[0].id]: items[0] }))
            picking.apply(items[0].id)
          }
          setPicking(null)
        }} />
      )}
      {picking?.kind === 'product' && (
        <ProductPicker selected={[]} max={1} onClose={() => setPicking(null)} onDone={(items) => {
          if (items[0]) picking.apply(items[0].id)
          setPicking(null)
        }} />
      )}

      {menuAt && <ContextMenu x={menuAt.x} y={menuAt.y} items={menuItems(menuAt.id)} onClose={() => setMenuAt(null)} />}

      <div className="editor__toast" role="status">
        {toast && <p className="toast"><CircleCheck size={18} aria-hidden="true" />{toast}</p>}
      </div>
    </div>
  )
}
