import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useNavigate, useParams } from 'react-router'
import {
  ArrowDown, ArrowLeft, ArrowUp, CircleCheck, Copy, ExternalLink, Eye, EyeOff, GripVertical, ImagePlus, Monitor, Plus, Redo2, Settings2, Smartphone, Trash2, Undo2, X,
} from 'lucide-react'
import { defOf, maxSections, newSection, sectionTypes, videoEmbed, type Content, type Field as SchemaField, type Label, type Section, type SectionType, type Value } from 'storefront/schema'
import { css as storefrontCss, PageView, type Ctx, type Product } from 'storefront/sections'
import { isPreset, presetCss, presetFontsHref, type PresetId } from 'storefront/themes'
import { useCurrentStore, useStorePath } from '../account-context'
import { api, errorCode, storefrontUrl, type MediaItem } from '../api'
import { MediaPicker } from '../components/MediaPicker'
import { ProductPicker } from '../components/ProductPicker'
import { Button, Field, IconButton, Notice, PageTitle, Skeleton } from '../components/ui'
import { errorLabel, useLang } from '../i18n'
import type { ProductStatus } from '../product-form'
import type { StoreSettingsData } from './StoreSettings'
import { PageStatus } from './Pages'

type Saved = {
  id: string; title: string; handle: string; seoTitle: string; seoDescription: string; draft: Content; revision: number
  isPublished: boolean; hasChanges: boolean; media: Record<string, MediaItem>
}
type Doc = { title: string; handle: string; seoTitle: string; seoDescription: string; content: Content }
type PreviewProduct = Product & { status: ProductStatus }
type Pick = { kind: 'image' | 'product'; apply: (id: string | null) => void }

const historyLimit = 100
const toDoc = (p: Saved): Doc => ({ title: p.title, handle: p.handle, seoTitle: p.seoTitle, seoDescription: p.seoDescription, content: p.draft })
const newId = () => crypto.randomUUID().slice(0, 8)
const frameShell = `<!doctype html><html lang="bn"><head><meta charset="utf-8"><style>${storefrontCss}</style></head><body></body></html>`

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
  field: Exclude<SchemaField, { kind: 'list' }>; value: Value; id: string; onChange: (v: Value, typing?: boolean) => void; onPick: (p: Pick) => void
  media: Record<string, MediaItem>; products: Record<string, PreviewProduct | null>
}) {
  const { t, lang } = useLang()
  const label = field.label[lang === 'bn' ? 0 : 1]
  switch (field.kind) {
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

function SectionForm({ section, onChange, onPick, media, products }: {
  section: Section; onChange: (key: string, v: Value, typing?: boolean) => void; onPick: (p: Pick) => void
  media: Record<string, MediaItem>; products: Record<string, PreviewProduct | null>
}) {
  const { t, lang, num } = useLang()
  const uid = useId()
  const L = (label: Label) => label[lang === 'bn' ? 0 : 1]
  return (
    <>
      {defOf(section.type).fields.map((field) => {
        const value = section.settings[field.key] ?? null
        const id = `${uid}-${section.id}-${field.key}`
        if (field.kind !== 'list') return <LeafEditor key={field.key} id={id} field={field} value={value} onChange={(v, typing) => onChange(field.key, v, typing)} onPick={onPick} media={media} products={products} />
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
                <fieldset key={i} className="editor-list__item">
                  <legend className="visually-hidden">{name}</legend>
                  <div className="editor-list__item-head">
                    <strong>{name}</strong>
                    <div className="row">
                      <IconButton label={`${t('pageMoveUp')}: ${name}`} disabled={i === 0} onClick={() => { const next = [...list]; [next[i - 1], next[i]] = [next[i], next[i - 1]]; setList(next) }}><ArrowUp size={16} aria-hidden="true" /></IconButton>
                      <IconButton label={t('pageRemoveItem', { value: name })} onClick={() => setList(list.filter((_, j) => j !== i))}><X size={16} aria-hidden="true" /></IconButton>
                    </div>
                  </div>
                  {field.fields.map((sub) => (
                    <LeafEditor key={sub.key} id={`${id}-${i}-${sub.key}`} field={sub} value={item[sub.key] ?? null} media={media} products={products} onPick={onPick}
                      onChange={(v, typing) => setList(list.map((x, j) => (j === i ? { ...x, [sub.key]: v as string | null } : x)), typing)} />
                  ))}
                </fieldset>
              )
            })}
            {list.length < field.max && <Button onClick={() => setList([...list, { ...blank }])}><Plus size={16} aria-hidden="true" />{t('pageAddItem', { value: L(field.item) })}</Button>}
          </div>
        )
      })}
    </>
  )
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
  const [delivery, setDelivery] = useState({ inside: 0, outside: 0 })
  const [theme, setTheme] = useState<PresetId>('fresh')
  const [selected, setSelected] = useState<string | 'page' | null>(null)
  const [pane, setPane] = useState<'sections' | 'preview' | 'edit'>('preview')
  const [mobile, setMobile] = useState(false)
  const [adding, setAdding] = useState(false)
  const [picking, setPicking] = useState<Pick | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const dragFrom = useRef<number | null>(null)

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
      setDelivery({ inside: s.deliveryInside, outside: s.deliveryOutside })
      if (isPreset(s.theme)) setTheme(s.theme)
    }).catch(() => {})
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
    if (!doc) return
    const now = Date.now()
    const merge = key !== '' && key === lastEdit.current.key && now - lastEdit.current.at < 1000
    lastEdit.current = { key, at: now }
    if (!merge) setPast((p) => [...p.slice(-historyLimit + 1), doc])
    setFuture([])
    setDoc(next)
    if (error === 'pageHandleTaken' && next.handle !== doc.handle) setError(null)
  }
  const undo = () => {
    if (!doc || past.length === 0) return
    setFuture((f) => [doc, ...f])
    setDoc(past[past.length - 1])
    setPast((p) => p.slice(0, -1))
    lastEdit.current = { key: '', at: 0 }
  }
  const redo = () => {
    if (!doc || future.length === 0) return
    setPast((p) => [...p, doc])
    setDoc(future[0])
    setFuture((f) => f.slice(1))
    lastEdit.current = { key: '', at: 0 }
  }

  const save = async () => {
    if (!doc || !page) return null
    setError(null)
    if (!doc.title.trim()) {
      setSelected('page')
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
        setSelected('page')
        setPane('edit')
      }
      return null
    }
  }

  const run = async (work: () => Promise<void>) => {
    setBusy(true)
    try {
      await work()
    } finally {
      setBusy(false)
    }
  }

  const onSave = () => run(async () => {
    if (await save()) setToast(t('pageSaved'))
  })
  const publish = () => run(async () => {
    if (dirty && !await save()) return
    try {
      show(await api<Saved>(`${base}/publish`, { method: 'POST' }))
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
    delivery,
    image: (mid) => {
      const item = mid ? media[mid] : undefined
      return item && { url: item.url, alt: item.alt || item.name, width: item.width, height: item.height }
    },
    product: (pid) => (pid ? products[pid] ?? undefined : undefined),
  }), [media, products, delivery])

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
  const add = (type: SectionType) => {
    const section = newSection(type, newId())
    const at = sections.findIndex((s) => s.id === selected)
    const next = [...sections]
    next.splice(at === -1 ? next.length : at + 1, 0, section)
    setSections(next)
    setSelected(section.id)
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
    setSelected(sid)
    setPane('edit')
  }

  const section = sections.find((s) => s.id === selected)
  const index = section ? sections.indexOf(section) : -1
  const liveUrl = `${storefrontUrl(current.store.handle)}/pages/${encodeURIComponent(page.handle)}`
  const status = { isPublished: page.isPublished, hasChanges: page.isPublished && (page.hasChanges || dirty) }

  return (
    <div className="editor" data-pane={pane}>
      <PageTitle title={doc.title || t('pages')} />
      <header className="editor__bar">
        <div className="editor__title">
          <Link className="detail-head__back" to={path('/landing-pages')} aria-label={t('pageBack')} title={t('pageBack')}><ArrowLeft size={16} aria-hidden="true" /></Link>
          <h1 title={doc.title}>{doc.title || t('pages')}</h1>
          <PageStatus page={status} />
        </div>
        <div className="editor__tools">
          <IconButton label={t('pageUndo')} title={t('pageUndo')} disabled={past.length === 0} onClick={undo}><Undo2 size={16} aria-hidden="true" /></IconButton>
          <IconButton label={t('pageRedo')} title={t('pageRedo')} disabled={future.length === 0} onClick={redo}><Redo2 size={16} aria-hidden="true" /></IconButton>
          <div className="editor__devices" role="group">
            <IconButton label={t('pageDesktop')} title={t('pageDesktop')} aria-pressed={!mobile} onClick={() => setMobile(false)}><Monitor size={16} aria-hidden="true" /></IconButton>
            <IconButton label={t('pageMobile')} title={t('pageMobile')} aria-pressed={mobile} onClick={() => setMobile(true)}><Smartphone size={16} aria-hidden="true" /></IconButton>
          </div>
          <IconButton label={t('pageSettings')} title={t('pageSettings')} aria-pressed={selected === 'page'} onClick={() => choose('page')}><Settings2 size={16} aria-hidden="true" /></IconButton>
          {page.isPublished && <a className="btn btn--icon" href={liveUrl} target="_blank" rel="noopener" aria-label={t('pageView')} title={t('pageView')}><ExternalLink size={16} aria-hidden="true" /></a>}
          <Button disabled={busy || !dirty} aria-busy={busy} onClick={() => void onSave()}>{t('pageSave')}</Button>
          <Button variant="primary" disabled={busy || (page.isPublished && !page.hasChanges && !dirty)} aria-busy={busy} onClick={() => void publish()}>{t('pagePublish')}</Button>
        </div>
      </header>

      <nav className="editor__panes" aria-label={t('pageSections')}>
        {(['sections', 'preview', 'edit'] as const).map((p) => (
          <button key={p} type="button" className="tab" aria-current={pane === p ? 'page' : undefined} onClick={() => setPane(p)}>
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

      <aside className="editor__sections" aria-label={t('pageSections')}>
        <h2 className="editor__heading">{t('pageSections')}</h2>
        <ul className="editor-sections">
          {sections.map((s, i) => (
            <li
              key={s.id}
              className={s.id === selected ? 'editor-sections__row editor-sections__row--selected' : 'editor-sections__row'}
              draggable
              onDragStart={() => { dragFrom.current = i }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                if (dragFrom.current !== null && dragFrom.current !== i) move(dragFrom.current, i)
                dragFrom.current = null
              }}
            >
              <GripVertical className="collection-products__grip" size={16} aria-hidden="true" />
              <button type="button" className="editor-sections__name" aria-current={s.id === selected ? 'true' : undefined} onClick={() => choose(s.id)}>
                <span>{L(defOf(s.type).label)}</span>
                {short(s.settings.heading) && <span className="muted">{short(s.settings.heading)}</span>}
              </button>
              <IconButton label={t(s.hidden ? 'pageShow' : 'pageHide', { value: L(defOf(s.type).label) })} title={t(s.hidden ? 'pageShow' : 'pageHide', { value: L(defOf(s.type).label) })} onClick={() => updateSection(s.id, { hidden: !s.hidden })}>
                {s.hidden ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
              </IconButton>
            </li>
          ))}
        </ul>
        {sections.length === 0 && <p className="muted">{t('pageNoSections')}</p>}
        {sections.length < maxSections && (
          adding
            ? (
              <div className="editor-add">
                <div className="editor-add__head">
                  <strong>{t('pageAddSection')}</strong>
                  <button type="button" className="media__dismiss" aria-label={t('cancel')} onClick={() => setAdding(false)}><X size={16} aria-hidden="true" /></button>
                </div>
                <ul>
                  {sectionTypes.map((type) => <li key={type}><button type="button" onClick={() => add(type)}>{L(defOf(type).label)}</button></li>)}
                </ul>
              </div>
            )
            : <Button onClick={() => setAdding(true)}><Plus size={16} aria-hidden="true" />{t('pageAddSection')}</Button>
        )}
      </aside>

      <section className="editor__preview" aria-label={t('pagePreview')}>
        <Preview content={doc.content} ctx={ctx} storeName={current.store.name} theme={theme} mobile={mobile} selected={section?.id ?? null} onSelect={choose} />
      </section>

      <aside className="editor__settings" aria-label={t('pageEditTab')}>
        {section && (
          <>
            <div className="editor__settings-head">
              <h2 className="editor__heading">{L(defOf(section.type).label)}</h2>
              <button type="button" className="media__dismiss" aria-label={t('mediaClose')} onClick={() => setSelected(null)}><X size={16} aria-hidden="true" /></button>
            </div>
            {section.hidden && <p className="muted">{t('pageHidden')}</p>}
            <div className="editor__form">
              <SectionForm
                key={section.id}
                section={section}
                media={media}
                products={products}
                onPick={setPicking}
                onChange={(key, value, typing) => updateSection(section.id, { settings: { ...section.settings, [key]: value } }, typing ? `${section.id}:${key}` : undefined)}
              />
              {section.type === 'order' && <p className="muted">{t('pageDeliveryNote')} <Link to={path('/settings')} target="_blank">{t('sStore')}</Link></p>}
            </div>
            <div className="editor__section-actions">
              <Button disabled={index === 0} onClick={() => move(index, index - 1)}><ArrowUp size={16} aria-hidden="true" />{t('pageMoveUp')}</Button>
              <Button disabled={index === sections.length - 1} onClick={() => move(index, index + 1)}><ArrowDown size={16} aria-hidden="true" />{t('pageMoveDown')}</Button>
              <Button disabled={sections.length >= maxSections} onClick={() => duplicate(section)}><Copy size={16} aria-hidden="true" />{t('pageDuplicateSection')}</Button>
              <Button variant="danger" onClick={() => { setSections(sections.filter((s) => s.id !== section.id)); setSelected(null) }}><Trash2 size={16} aria-hidden="true" />{t('pageRemoveSection')}</Button>
            </div>
          </>
        )}

        {selected === 'page' && (
          <>
            <div className="editor__settings-head">
              <h2 className="editor__heading">{t('pageSettings')}</h2>
              <button type="button" className="media__dismiss" aria-label={t('mediaClose')} onClick={() => setSelected(null)}><X size={16} aria-hidden="true" /></button>
            </div>
            <div className="editor__form">
              <Field id="page-title" label={t('pageTitle')} maxLength={200} value={doc.title} error={error === 'nameRequired' && !doc.title.trim() ? t('errNameRequired') : undefined} onChange={(e) => edit({ ...doc, title: e.target.value }, 'title')} />
              <Field id="page-handle" label={t('pageAddress')} unit="/pages/" maxLength={200} value={doc.handle} help={t('pageAddressHelp')} error={error === 'pageHandleTaken' ? t('errPageHandleTaken') : undefined} onChange={(e) => edit({ ...doc, handle: e.target.value }, 'handle')} />
              <p className="muted editor__url">
                {page.isPublished ? <a href={liveUrl} target="_blank" rel="noopener">{liveUrl}</a> : t('pageNotLive')}
              </p>
              <Field id="page-seo-title" label={t('pageSeoTitle')} maxLength={300} placeholder={doc.title} value={doc.seoTitle} help={t('pageSeoHelp')} onChange={(e) => edit({ ...doc, seoTitle: e.target.value }, 'seoTitle')} />
              <div className="field">
                <label htmlFor="page-seo-description">{t('pageSeoDescription')}</label>
                <textarea id="page-seo-description" className="input input--area" rows={3} maxLength={1000} value={doc.seoDescription} onChange={(e) => edit({ ...doc, seoDescription: e.target.value }, 'seoDescription')} />
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
          </>
        )}

        {!section && selected !== 'page' && <p className="muted editor__empty">{t('pageSelectHint')}</p>}
      </aside>

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
