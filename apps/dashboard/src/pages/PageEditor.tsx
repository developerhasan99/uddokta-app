import { Fragment, useEffect, useId, useMemo, useRef, useState } from 'react'
import { DialogHead } from '../components/DialogHead'
import { createPortal } from 'react-dom'
import { Link, useNavigate, useParams } from 'react-router'
import {
  Sparkles, ArrowDown, ArrowLeft, ArrowUp, ChevronDown, LayoutTemplate, Type, Image, Video, ListChecks, MessageSquare, CircleHelp, ShoppingBag, Images, Timer, Phone, CircleCheck, Copy, ExternalLink, Eye, EyeOff, GripVertical, ImagePlus, Plus, Redo2, Settings, Settings2, Smartphone, Trash2, Undo2, X,
} from 'lucide-react'
import { pageHref } from 'storefront/paths'
import { defOf, isSectionLink, maxCss, maxSections, newSection, sectionTypes, styleFieldsFor, videoEmbed, type Content, type Field as SchemaField, type Leaf, type Label, type Section, type SectionType, type Value } from 'storefront/schema'
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

const sectionIcons = { icon: Sparkles, iconCards: LayoutTemplate, iconList: ListChecks, announcement: MessageSquare, header: LayoutTemplate, footer: LayoutTemplate, imageText: Image, trust: CircleCheck, steps: ListChecks, specifications: ListChecks, comparison: ListChecks, cards: Images, cta: ShoppingBag, hero: LayoutTemplate, text: Type, image: Image, features: ListChecks, video: Video, reviews: MessageSquare, faq: CircleHelp, order: ShoppingBag, gallery: Images, countdown: Timer, contact: Phone }
const historyLimit = 100
const toDoc = (p: Saved): Doc => ({ title: p.title, handle: p.handle, seoTitle: p.seoTitle, seoDescription: p.seoDescription, content: p.draft })
const newId = () => crypto.randomUUID().slice(0, 8)
const frameShell = `<!doctype html><html lang="bn"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${storefrontCss}</style></head><body></body></html>`

// The real section components, drawn inside an iframe so the storefront's styles and breakpoints apply exactly as they will live.
function Preview({ content, ctx, storeName, theme, mobile, selected, onSelect }: { content: Content; ctx: Ctx; storeName: string; theme: PresetId; mobile: boolean; selected: string | null; onSelect: (id: string) => void }) {
  const { t } = useLang()
  const [body, setBody] = useState<HTMLElement | null>(null)
  const select = useRef(onSelect)
  select.current = onSelect

  useEffect(() => {
    if (!body || !selected) return
    body.querySelector(`[data-section="${selected}"]`)?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }, [body, selected])

  const attach = (frame: HTMLIFrameElement) => {
    const doc = frame.contentDocument
    if (!doc) return
    // A srcdoc frame resolves links against the dashboard, so links never navigate here; in-page links still scroll.
    doc.addEventListener('click', (e) => {
      const target = e.target as Element
      const link = target.closest('a')
      if (link) {
        e.preventDefault()
        const hash = link.getAttribute('href')
        if (hash?.startsWith('#')) doc.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth' })
      }
      const section = target.closest('[data-section]')
      if (section) select.current(section.getAttribute('data-section')!)
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
          <style>{`[data-section]{cursor:pointer}[data-section]:hover{outline:1px dashed #1f7a4d;outline-offset:-1px}${selected ? `[data-section="${selected}"]{outline:2px solid #1f7a4d!important;outline-offset:-2px}` : ''}`}</style>
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
    case 'textarea':
      return (
        <div className="field">
          <label htmlFor={id}>{label}</label>
          <textarea id={id} className="input input--area" rows={field.max > 1000 ? 6 : 3} maxLength={field.max} value={String(value ?? '')} onChange={(e) => onChange(e.target.value, true)} />
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

function AddSectionDialog({ onClose, onAdd }: { onClose: () => void; onAdd: (type: SectionType) => void }) {
  const { t, lang } = useLang()
  const { ref: dialog, close, props: dialogProps } = useDialog(onClose)
  const titleId = useId()
  const [search, setSearch] = useState('')
  const matches = sectionTypes.filter((type) => defOf(type).label.some((label) => label.toLowerCase().includes(search.toLowerCase().trim())))
  useEffect(() => { dialog.current?.showModal(); dialog.current?.querySelector('input')?.focus() }, [])
  return <dialog {...dialogProps} className="modal editor-add-modal" aria-labelledby={titleId}>
    <DialogHead id={titleId} title={t('pageAddSection')} onClose={() => close()} />
    <div className="dialog__body">
      <SearchInput label={t('pageSearchSections')} value={search} onChange={(e) => setSearch(e.target.value)} autoFocus />
      <ul className="editor-add__choices">
        {matches.map((type) => {
          const Icon = sectionIcons[type]
          return <li key={type}><button type="button" onClick={() => close(() => onAdd(type))}><SectionThumbnail type={type} /><span className="editor-section-label"><Icon size={16} aria-hidden="true" />{defOf(type).label[lang === 'bn' ? 0 : 1]}<Plus size={14} aria-hidden="true" /></span></button></li>
        })}
      </ul>
      {matches.length === 0 && <p className="muted">{t('pageNoMatches')}</p>}
    </div>
  </dialog>
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
  const { t, lang } = useLang()
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
  const [view, setView] = useState<'sections' | 'page'>('sections')
  const settingsPanel = useRef<HTMLElement>(null)
  useEffect(() => { settingsPanel.current?.scrollTo({ top: 0 }) }, [selected, settingsTab])
  const [pane, setPane] = useState<'sections' | 'preview' | 'edit'>(() => window.matchMedia('(max-width: 860px)').matches ? 'sections' : 'preview')
  const [mobile, setMobile] = useState(false)
  const [adding, setAdding] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const working = useRef(false)
  const [picking, setPicking] = useState<Pick | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const dragFrom = useRef<number | null>(null)
  const [dragging, setDragging] = useState<number | null>(null)
  const [dropAt, setDropAt] = useState<number | null>(null)

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
  const productIds = useMemo(() => (doc ? doc.content.sections.flatMap((s) => (s.type === 'order' && typeof s.settings.product === 'string' ? [s.settings.product] : [])) : []), [doc])
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

  const keys = useRef({ undo, redo, onSave })
  keys.current = { undo, redo, onSave }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return
      const typing = (e.target as Element).closest('input, textarea')
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
  const add = (type: SectionType) => {
    const section = newSection(type, newId())
    const at = sections.findIndex((s) => s.id === selected)
    const next = [...sections]
    next.splice(at === -1 ? next.length : at + 1, 0, section)
    setSections(next)
    setSelected(section.id)
    setSettingsTab('content')
    setAdding(false)
    setPane('edit')
  }
  const duplicate = (s: Section) => {
    const copy = { ...structuredClone(s), id: newId() }
    const next = [...sections]
    next.splice(sections.indexOf(s) + 1, 0, copy)
    setSections(next)
    setSelected(copy.id)
  }
  const choose = (sid: string) => {
    setView('sections')
    setSettingsTab('content')
    setAdding(false)
    setSelected(sid)
    setPane('edit')
  }


  const section = sections.find((s) => s.id === selected)
  const index = section ? sections.indexOf(section) : -1
  const liveUrl = `${storefrontUrl(current.store.handle)}${pageHref(page.publishedHandle ?? page.handle)}`
  const incompleteOrders = sections.filter((s) => !s.hidden && s.type === 'order' && (!s.settings.product || (typeof s.settings.product === 'string' && products[s.settings.product]?.status === 'draft')))
  const status = { isPublished: page.isPublished, hasChanges: page.isPublished && (page.hasChanges || dirty) }

  return (
    <div className="editor" data-pane={pane}>
      <PageTitle title={doc.title || t('pages')} />
      <header className="editor__bar">
        <div className="editor__nav">
          <Link onClick={(e) => { if (dirty) { e.preventDefault(); setLeaving(true) } }} className="detail-head__back" to={path('/landing-pages')} aria-label={t('pageBack')} title={t('pageBack')}><ArrowLeft size={16} aria-hidden="true" /></Link>
          <span className="editor__views">
            <IconButton label={t('pageSections')} title={t('pageSections')} aria-pressed={view === 'sections'} onClick={() => setView('sections')}><LayoutTemplate size={16} aria-hidden="true" /></IconButton>
            <IconButton label={t('pageSettings')} title={t('pageSettings')} aria-pressed={view === 'page'} onClick={() => { setView('page'); setPane('edit') }}><Settings size={16} aria-hidden="true" /></IconButton>
          </span>
        </div>
        <div className="editor__title">
          <h1 title={doc.title}>{doc.title || t('pages')}</h1>
          <PageStatus page={status} />
        </div>
        <div className="editor__tools">
          <span className="editor__save-state" role="status">{t(busy ? 'pageSaving' : dirty ? 'pageUnsaved' : 'pageAllSaved')}</span>
          <IconButton label={t('pageUndo')} title={t('pageUndo')} disabled={busy || past.length === 0} onClick={undo}><Undo2 size={16} aria-hidden="true" /></IconButton>
          <IconButton label={t('pageRedo')} title={t('pageRedo')} disabled={busy || future.length === 0} onClick={redo}><Redo2 size={16} aria-hidden="true" /></IconButton>
          <div className="editor__devices">
            <IconButton label={t('pageMobile')} title={t(mobile ? 'pageDesktop' : 'pageMobile')} aria-pressed={mobile} onClick={() => setMobile((value) => !value)}><Smartphone size={16} aria-hidden="true" /></IconButton>
          </div>
          {page.isPublished && <a className="btn btn--icon" href={liveUrl} target="_blank" rel="noopener" aria-label={t('pageView')} title={t('pageView')}><ExternalLink size={16} aria-hidden="true" /></a>}
          <Button disabled={busy || !dirty} aria-busy={busy} onClick={() => void onSave()}>{t('pageSave')}</Button>
          <Button variant="primary" disabled={busy || (page.isPublished && !page.hasChanges && !dirty)} aria-busy={busy} onClick={() => void publish()}>{t('pagePublish')}</Button>
        </div>
      </header>

      <nav className="editor__panes" aria-label={t('pageSections')}>
        {(['sections', 'preview', 'edit'] as const).map((p) => (
          <button key={p} type="button" className="tab" aria-current={pane === p ? 'page' : undefined} onClick={() => { setPane(p); if (p === 'sections') setView('sections') }}>
            <span className="editor__pane-icon">{p === 'sections' ? <LayoutTemplate size={18} aria-hidden="true" /> : p === 'preview' ? <Eye size={18} aria-hidden="true" /> : <Settings2 size={18} aria-hidden="true" />}</span>
            {t(p === 'sections' ? 'pageSections' : p === 'preview' ? 'pagePreview' : 'pageEditTab')}
          </button>
        ))}
      </nav>

      {error && (
        <div className="editor__error" role="alert">
          <p className="form-error">{t(errorLabel(error))}</p>
          {error === 'pageChanged' && <Button onClick={() => void load()}>{t('pageReload')}</Button>}
        </div>
      )}

      <div className="editor__sidebar" data-view={view} data-editing={view !== 'sections' || Boolean(section)}>
      {view === 'sections' && <>
      <aside className="editor__sections" inert={busy} aria-label={t('pageSections')}>
        <div className="editor__settings-head"><h2 className="editor__heading">{t('pageSections')}</h2><span className="muted">{sections.length}/{maxSections}</span></div>
        {incompleteOrders.length > 0 && <div className="editor__readiness">
          <p>{t('pageOrderNotReady')}</p>
          {incompleteOrders.map((s) => <button key={s.id} type="button" onClick={() => choose(s.id)}>{L(defOf(s.type).label)}</button>)}
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
              ><GripVertical size={16} aria-hidden="true" /></button>
              <button type="button" className="editor-sections__name" title={short(s.settings.heading) || L(defOf(s.type).label)} aria-current={s.id === selected ? 'true' : undefined} onClick={() => choose(s.id)}>
                <span className="editor-sections__label">{(() => { const Icon = sectionIcons[s.type]; return <Icon size={15} aria-hidden="true" /> })()}{L(defOf(s.type).label)}</span>
              </button>
              <IconButton label={t(s.hidden ? 'pageShow' : 'pageHide', { value: L(defOf(s.type).label) })} title={t(s.hidden ? 'pageShow' : 'pageHide', { value: L(defOf(s.type).label) })} onClick={() => updateSection(s.id, { hidden: !s.hidden })}>
                {s.hidden ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
              </IconButton>
            </li>
            </Fragment>
          ))}
          {dropSpace(sections.length)}
        </ul>
        {sections.length === 0 && <p className="muted">{t('pageNoSections')}</p>}
        {sections.length < maxSections && <Button onClick={() => setAdding(true)}><Plus size={16} aria-hidden="true" />{t('pageAddSection')}</Button>}
      </aside>

      <aside ref={settingsPanel} className="editor__settings" inert={busy} aria-label={t('pageEditTab')}>
        {section ? (
          <>
            <div className="editor__settings-head">
              <h2 className="editor__heading">{L(defOf(section.type).label)}</h2>
              <button type="button" className="media__dismiss" aria-label={t('mediaClose')} onClick={() => { setSelected(null); setPane('sections') }}><X size={16} aria-hidden="true" /></button>
            </div>
            {section.hidden && <p className="muted">{t('pageHidden')}</p>}
            <div className="editor-setting-tabs" role="group" aria-label={L(['সেকশন সেটিংস', 'Section settings'])}>
              {(['content', 'layout', 'style'] as const).map((tab) => <button key={tab} type="button" aria-pressed={settingsTab === tab} onClick={() => setSettingsTab(tab)}>{L(tab === 'content' ? ['কন্টেন্ট', 'Content'] : tab === 'layout' ? ['বিন্যাস', 'Layout'] : ['স্টাইল', 'Style'])}</button>)}
            </div>
            <div className="editor__form">
              {settingsTab !== 'style' && <div className={settingsTab === 'layout' ? 'design-structure' : undefined}><SectionForm
                key={`${section.id}:${settingsTab}`}
                group={settingsTab === 'layout' ? 'layout' : 'content'}
                section={section}
                media={media}
                products={products}
                onPick={setPicking}
                onChange={(key, value, typing) => updateSection(section.id, { settings: { ...section.settings, [key]: value } }, typing ? `${section.id}:${key}` : undefined)}
              /></div>}

              {settingsTab !== 'content' && <>
                <SectionDesignControls key={`${section.id}:${settingsTab}`} section={section} tab={settingsTab} theme={theme} onPatch={(patch, typingKey) => {
                  const style = { ...section.style }
                  for (const [key, value] of Object.entries(patch)) {
                    if (value === undefined || value === '') delete style[key]
                    else style[key] = value
                  }
                  updateSection(section.id, { style: Object.keys(style).length ? style : undefined }, typingKey ? `${section.id}:style:${typingKey}` : undefined)
                }} />
                {settingsTab === 'layout' && <details className="design-group design-anchor"><summary><strong>{L(['সেকশনের লিংক', 'Section link'])}</strong><ChevronDown size={14} aria-hidden="true" /></summary><div className="design-group__body"><Field id="section-anchor" label={L(['হেডার বা বাটনে ব্যবহার করুন', 'Use in a header or button'])} value={`#${section.id}`} readOnly /></div></details>}
                <Button onClick={() => {
                  const style = { ...section.style }
                  for (const field of styleFieldsFor(section.type).filter((f) => f.group === settingsTab)) delete style[field.key]
                  updateSection(section.id, { style: Object.keys(style).length ? style : undefined })
                }}>{L(settingsTab === 'layout' ? ['বিন্যাস রিসেট করুন', 'Reset layout overrides'] : ['স্টাইল রিসেট করুন', 'Reset style overrides'])}</Button>
              </>}
              {section.type === 'order' && settingsTab === 'content' && <p className="muted">{t('pageDeliveryNote')} <Link to={path('/settings/delivery')} target="_blank">{t('shippingTitle')}</Link></p>}
            </div>
            <div className="editor__section-actions" role="group" aria-label={t('pageEditTab')}>
              <IconButton label={t('pageMoveUp')} title={t('pageMoveUp')} disabled={index === 0} onClick={() => move(index, index - 1)}><ArrowUp size={16} aria-hidden="true" /><span className="editor__action-label">{t('pageMoveUp')}</span></IconButton>
              <IconButton label={t('pageMoveDown')} title={t('pageMoveDown')} disabled={index === sections.length - 1} onClick={() => move(index, index + 1)}><ArrowDown size={16} aria-hidden="true" /><span className="editor__action-label">{t('pageMoveDown')}</span></IconButton>
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
                <label htmlFor="page-css">{L(['কাস্টম CSS', 'Custom CSS'])}</label>
                <textarea id="page-css" className="input editor__css-input" aria-describedby="page-css-help" spellCheck={false} autoCapitalize="off" autoCorrect="off" rows={12} maxLength={maxCss}
                  placeholder={'.sf-page h2 {\n  letter-spacing: -0.02em;\n}'} value={doc.content.css ?? ''} onChange={(e) => edit({ ...doc, content: { ...doc.content, css: e.target.value } }, 'css')} />
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
        <Preview content={doc.content} ctx={ctx} storeName={current.store.name} theme={theme} mobile={mobile} selected={section?.id ?? null} onSelect={choose} />
      </section>

      {adding && <AddSectionDialog onClose={() => setAdding(false)} onAdd={add} />}

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

      <div className="editor__toast" role="status">
        {toast && <p className="toast"><CircleCheck size={18} aria-hidden="true" />{toast}</p>}
      </div>
    </div>
  )
}
