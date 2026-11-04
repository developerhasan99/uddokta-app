import { useCallback, useEffect, useRef, useState, type ChangeEvent, type DragEvent, type FormEvent, type KeyboardEvent, type PointerEvent } from 'react'
import { Link } from 'react-router'
import { Check, Crop, ImagePlus, Link2, Trash2, Upload, X } from 'lucide-react'
import { useCurrentStore, useStorePath } from '../account-context'
import { api, errorCode, type MediaItem as Item } from '../api'
import { Button, Notice, PageHeader, SearchInput, Skeleton } from '../components/ui'
import { centered, moved, resized, toPixels, type Corner, type Rect } from '../crop'
import { errorLabel, useLang } from '../i18n'
import { useUrlSearch } from '../use-url-search'

type Page = { items: Item[]; hasMore: boolean; usedBytes: number; limitBytes: number }
type Upload = { id: number; name: string; error?: string }

const formatLabels: Record<string, string> = { jpeg: 'JPG', png: 'PNG', webp: 'WebP', avif: 'AVIF' }
const formatLabel = (format: string) => formatLabels[format] ?? format.toUpperCase()

const accepted = 'image/jpeg,image/png,image/webp,image/avif'
const parallelUploads = 3

export function Media() {
  const { t, num, date } = useLang()
  const current = useCurrentStore()!
  const base = `/stores/${current.store.handle}/media`
  const { query, text: searchText, setText: setSearchText } = useUrlSearch()
  const latestLoad = useRef(0)
  const [page, setPage] = useState<Page | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [uploads, setUploads] = useState<Upload[]>([])
  const [dragging, setDragging] = useState(false)
  const [selected, setSelected] = useState<Item | null>(null)
  const [croppedId, setCroppedId] = useState<string | null>(null)
  const [cropping, setCropping] = useState(false)
  const picker = useRef<HTMLInputElement>(null)
  const nextUpload = useRef(0)

  const size = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${num(bytes === 0 ? 0 : Math.max(Math.round(bytes / 1024), 1))} KB`
    if (bytes < 1024 ** 3) return `${num(Math.round((bytes / 1024 / 1024) * 10) / 10)} MB`
    return `${num(Math.round((bytes / 1024 ** 3) * 10) / 10)} GB`
  }

  const load = useCallback(async () => {
    const request = ++latestLoad.current
    setLoadFailed(false)
    try {
      const result = await api<Page>(`${base}?q=${encodeURIComponent(query)}`)
      // A slower, older search must not replace newer results.
      if (request === latestLoad.current) setPage(result)
    } catch {
      if (request === latestLoad.current) setLoadFailed(true)
    }
  }, [base, query])

  useEffect(() => {
    void load()
  }, [load])

  const loadMore = async () => {
    if (!page) return
    const more = await api<Page>(`${base}?q=${encodeURIComponent(query)}&offset=${page.items.length}`)
    setPage({ ...more, items: [...page.items, ...more.items] })
  }

  const uploadOne = async (file: File, id: number) => {
    const body = new FormData()
    body.set('file', file)
    try {
      const item = await api<Item>(base, { method: 'POST', form: body })
      setUploads((all) => all.filter((u) => u.id !== id))
      setPage((p) => p && { ...p, items: [item, ...p.items], usedBytes: p.usedBytes + item.sizeBytes })
    } catch (err) {
      setUploads((all) => all.map((u) => (u.id === id ? { ...u, error: errorCode(err) } : u)))
    }
  }

  const addFiles = async (files: File[]) => {
    const queued = files.map((file) => ({ file, id: nextUpload.current++ }))
    setUploads((all) => [...queued.map(({ file, id }) => ({ id, name: file.name })), ...all])
    const worker = async () => {
      for (let next = queued.shift(); next; next = queued.shift()) await uploadOne(next.file, next.id)
    }
    await Promise.all(Array.from({ length: parallelUploads }, worker))
  }

  const onPick = (e: ChangeEvent<HTMLInputElement>) => {
    void addFiles(Array.from(e.target.files ?? []))
    e.target.value = ''
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    void addFiles(Array.from(e.dataTransfer.files))
  }

  const closeDetails = useCallback(() => setSelected(null), [])
  const pending = uploads.filter((u) => !u.error)
  const failed = uploads.filter((u) => u.error)
  const usedPercent = page ? Math.min((page.usedBytes / page.limitBytes) * 100, 100) : 0

  if (cropping && selected) {
    return (
      <div className="media-shell">
        <CropWorkspace
                      key={selected.id}
                      item={selected}
                      base={base}
                      onCancel={() => setCropping(false)}
                      onDone={(item) => {
                        setCropping(false)
                        setCroppedId(item.id)
                        setSelected(item)
                        setPage((p) => p && { ...p, items: [item, ...p.items], usedBytes: p.usedBytes + item.sizeBytes })
                      }}
                    />
      </div>
    )
  }

  return (
    <div className={selected ? 'media-shell media-shell--open' : 'media-shell'}>
        <div
          className={dragging ? 'page media media--dragging' : 'page media'}
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false)
          }}
          onDrop={onDrop}
        >
          <PageHeader
            title={t('media')}
            description={t('media.d')}
            action={(
              <Button variant="primary" onClick={() => picker.current?.click()}>
                <Upload size={16} aria-hidden="true" />
                {t('mediaUpload')}
              </Button>
            )}
          />
          <input ref={picker} className="visually-hidden" type="file" accept={accepted} multiple tabIndex={-1} aria-label={t('mediaUpload')} onChange={onPick} />

          {page && (
            <div className="media__usage">
              <span className="muted">{t('mediaUsage', { used: size(page.usedBytes), limit: size(page.limitBytes) })}</span>
              <span className="bars__track" role="progressbar" aria-label={t('mediaStorage')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(usedPercent)}>
                <span className="bars__fill" style={{ width: `${usedPercent}%` }} />
              </span>
            </div>
          )}

          {pending.length > 0 && <p className="muted" role="status">{t('mediaUploading', { n: num(pending.length) })}</p>}

          {failed.length > 0 && (
            <ul className="media__failures" role="alert">
              {failed.map((u) => (
                <li key={u.id} className="form-error">
                  <span className="media__failure-text"><strong>{u.name}</strong>: {t(errorLabel(u.error!))}</span>
                  <button type="button" className="media__dismiss" aria-label={t('mediaDismiss')} onClick={() => setUploads((all) => all.filter((x) => x.id !== u.id))}>
                    <X size={16} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {loadFailed && (
            <section className="card card--flush">
              <Notice role="alert" title={t('mediaLoadFailed')} action={<Button onClick={() => void load()}>{t('retry')}</Button>} />
            </section>
          )}

          {!loadFailed && !page && (
            <div className="data-list" role="status" aria-label={t('loading')}>
          {Array.from({ length: 6 }, (_, i) => <div key={i} className="skeleton-row"><Skeleton width="16rem" /><Skeleton width="5rem" /></div>)}
        </div>
          )}

          {page && (page.usedBytes > 0 || query) && (
        <SearchInput label={t('mediaSearch')} value={searchText} onChange={(e) => setSearchText(e.target.value)} />
      )}

      {page && page.items.length === 0 && pending.length === 0 && query && (
        <section className="data-list">
          <Notice title={t('mediaNoMatch')} body={t('mediaNoMatchBody')} action={<Button onClick={() => setSearchText('')}>{t('clearFilters')}</Button>} />
        </section>
      )}

      {page && page.items.length === 0 && pending.length === 0 && !query && (
            <button type="button" className="media__empty" onClick={() => picker.current?.click()}>
              <ImagePlus size={32} strokeWidth={1.5} aria-hidden="true" />
              <strong>{t('mediaEmptyTitle')}</strong>
              <span className="muted">{t('mediaEmptyBody')}</span>
            </button>
          )}

          {page && (page.items.length > 0 || pending.length > 0) && (
            <div className="data-list">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">{t('mediaName')}</th>
                <th scope="col" className="data-table__meta">{t('mediaFormat')}</th>
                <th scope="col" className="data-table__meta">{t('mediaSize')}</th>
                <th scope="col" className="data-table__meta data-table__wide">{t('mediaDimensions')}</th>
                <th scope="col" className="data-table__meta data-table__wide">{t('mediaAdded')}</th>
              </tr>
            </thead>
            <tbody>
              {pending.map((u) => (
                <tr key={u.id} aria-label={u.name}>
                  <td colSpan={5}><span className="data-table__file"><span className="data-table__thumb" /><span className="muted data-table__name">{u.name}</span></span></td>
                </tr>
              ))}
              {page.items.map((item) => (
                <tr key={item.id} className={selected?.id === item.id ? 'data-table__row data-table__row--selected' : 'data-table__row'} onClick={() => setSelected(item)}>
                  <td>
                    <button type="button" className="data-table__file" aria-pressed={selected?.id === item.id} onClick={(e) => {
                      e.stopPropagation()
                      setSelected(item)
                    }}>
                      <span className="data-table__thumb"><img src={item.thumbUrl} alt="" loading="lazy" /></span>
                      <span className="data-table__text">
                        <span className="data-table__name" title={item.name}>{item.name}</span>
                        <span className="muted data-table__sub">{formatLabel(item.sourceFormat)}, {size(item.sizeBytes)}</span>
                      </span>
                    </button>
                  </td>
                  <td className="data-table__meta">{formatLabel(item.sourceFormat)}</td>
                  <td className="data-table__meta">{size(item.sizeBytes)}</td>
                  <td className="data-table__meta data-table__wide">{num(item.width).replace(/[,،]/g, '')} × {num(item.height).replace(/[,،]/g, '')}</td>
                  <td className="data-table__meta data-table__wide">{date(new Date(item.createdAt))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
          )}

          {page?.hasMore && <div className="media__more"><Button onClick={() => void loadMore()}>{t('mediaLoadMore')}</Button></div>}


          {dragging && <div className="media__drop" aria-hidden="true"><Upload size={24} />{t('mediaDrop')}</div>}

        </div>
      {selected && (
        <MediaDetails
                        key={selected.id}
                        item={selected}
                        base={base}
                        canDelete={current.role !== 'staff'}
                        wasCropped={croppedId === selected.id}
                        size={size}
                        dateText={date(new Date(selected.createdAt))}
                        dimensions={`${num(selected.width).replace(/[,،]/g, '')} × ${num(selected.height).replace(/[,،]/g, '')}`}
                        onClose={closeDetails}
                        onCrop={() => setCropping(true)}
                        onSaved={(item) => {
                          setSelected(item)
                          setPage((p) => p && { ...p, items: p.items.map((x) => (x.id === item.id ? item : x)) })
                        }}
                        onDeleted={(item) => {
                          setSelected(null)
                          setPage((p) => p && { ...p, items: p.items.filter((x) => x.id !== item.id), usedBytes: p.usedBytes - item.sizeBytes })
                        }}
                      />
      )}
    </div>
  )
}

const ratios: { label: string; value: number | null }[] = [
  { label: '1:1', value: 1 },
  { label: '4:5', value: 4 / 5 },
  { label: '16:9', value: 16 / 9 },
]

function Cropper({ item, rect, ratio, onChange }: { item: Item; rect: Rect; ratio: number | null; onChange: (rect: Rect) => void }) {
  const { t } = useLang()
  const image = useRef<HTMLImageElement>(null)
  const drag = useRef<{ corner: Corner | null; startX: number; startY: number; start: Rect } | null>(null)

  const begin = (e: PointerEvent<HTMLElement>, corner: Corner | null) => {
    e.preventDefault()
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { corner, startX: e.clientX, startY: e.clientY, start: rect }
  }

  const follow = (e: PointerEvent<HTMLElement>) => {
    const active = drag.current
    if (!active || !image.current) return
    const scale = item.width / image.current.getBoundingClientRect().width
    const dx = (e.clientX - active.startX) * scale
    const dy = (e.clientY - active.startY) * scale
    onChange(active.corner
      ? resized(active.start, active.corner, dx, dy, ratio, item.width, item.height)
      : moved(active.start, dx, dy, item.width, item.height))
  }

  const onKey = (e: KeyboardEvent<HTMLElement>) => {
    const step = Math.max(item.width / 100, 1)
    const delta = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key]
    if (!delta) return
    e.preventDefault()
    onChange(moved(rect, delta[0], delta[1], item.width, item.height))
  }

  const percent = (value: number, total: number) => `${(value / total) * 100}%`

  return (
    <div className="cropper">
      <img ref={image} src={item.url} alt={item.alt} draggable={false} />
      <div
        className="cropper__box"
        role="group"
        tabIndex={0}
        aria-label={t('mediaCropArea')}
        style={{ left: percent(rect.x, item.width), top: percent(rect.y, item.height), width: percent(rect.w, item.width), height: percent(rect.h, item.height) }}
        onPointerDown={(e) => begin(e, null)}
        onPointerMove={follow}
        onPointerUp={() => { drag.current = null }}
        onKeyDown={onKey}
      >
        {(['nw', 'ne', 'sw', 'se'] as Corner[]).map((corner) => (
          <span
            key={corner}
            className={`cropper__handle cropper__handle--${corner}`}
            onPointerDown={(e) => begin(e, corner)}
            onPointerMove={follow}
            onPointerUp={() => { drag.current = null }}
          />
        ))}
      </div>
    </div>
  )
}

function CropWorkspace({ item, base, onCancel, onDone }: { item: Item; base: string; onCancel: () => void; onDone: (item: Item) => void }) {
  const { t, num } = useLang()
  const [ratio, setRatio] = useState<number | null>(null)
  const [rect, setRect] = useState<Rect>(() => centered(null, item.width, item.height))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pixels = toPixels(rect, item.width, item.height)

  const chooseRatio = (value: number | null) => {
    setRatio(value)
    setRect(centered(value, item.width, item.height))
  }

  const save = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      onDone(await api<Item>(`${base}/${item.id}/crop`, { method: 'POST', body: pixels }))
    } catch (err) {
      setError(errorCode(err))
      setBusy(false)
    }
  }

  return (
    <>
      <div className="page media">
        <PageHeader title={t('mediaCrop')} description={item.name} />
        <div className="media__work"><Cropper item={item} rect={rect} ratio={ratio} onChange={setRect} /></div>
      </div>
      <aside className="media-details media-details--crop" aria-labelledby="crop-title">
        <div className="media-details__body">
          <h2 id="crop-title">{t('mediaCropOptions')}</h2>
          {error && <p className="form-error" role="alert">{t(errorLabel(error))}</p>}
          <div className="field">
            <span className="media-details__label" id="crop-shape">{t('mediaCropShape')}</span>
            <div className="crop-shapes" role="group" aria-labelledby="crop-shape">
              <button type="button" aria-pressed={ratio === null} onClick={() => chooseRatio(null)}>{t('mediaCropFree')}</button>
              {ratios.map((r) => (
                <button key={r.label} type="button" aria-pressed={ratio === r.value} onClick={() => chooseRatio(r.value)}>{r.label}</button>
              ))}
            </div>
          </div>
          <dl className="media-details__facts">
            <div><dt className="muted">{t('mediaDimensions')}</dt><dd>{num(pixels.width).replace(/[,،]/g, '')} × {num(pixels.height).replace(/[,،]/g, '')}</dd></div>
          </dl>
          <p className="muted">{t('mediaCropNote')}</p>
          <div className="media-details__buttons">
            <Button variant="primary" aria-busy={busy} onClick={() => void save()}>{t('mediaCropSave')}</Button>
            <Button onClick={onCancel}>{t('cancel')}</Button>
          </div>
        </div>
      </aside>
    </>
  )
}

function MediaDetails({ item, base, canDelete, wasCropped, size, dateText, dimensions, onClose, onCrop, onSaved, onDeleted }: {
  item: Item
  base: string
  canDelete: boolean
  wasCropped: boolean
  size: (bytes: number) => string
  dateText: string
  dimensions: string
  onClose: () => void
  onCrop: () => void
  onSaved: (item: Item) => void
  onDeleted: (item: Item) => void
}) {
  const { t } = useLang()
  const path = useStorePath()
  const panel = useRef<HTMLElement>(null)
  const [usedIn, setUsedIn] = useState<{ id: string; name: string; to: string }[] | null>(null)
  const [alt, setAlt] = useState(item.alt)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const link = new URL(item.url, location.origin).href

  useEffect(() => {
    panel.current?.focus({ preventScroll: true })
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    let current = true
    api<{ products: { id: string; name: string }[]; collections: { id: string; name: string }[]; pages: { id: string; name: string }[] }>(`${base}/${item.id}/usage`)
      .then((result) => {
        if (current) setUsedIn([...result.products.map((p) => ({ ...p, to: `/products/${p.id}` })), ...result.collections.map((c) => ({ ...c, to: `/products/collections/${c.id}` })), ...result.pages.map((p) => ({ ...p, to: `/landing-pages/${p.id}` }))])
      })
      .catch(() => {})
    return () => { current = false }
  }, [base, item.id])

  const save = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    try {
      onSaved(await api<Item>(`${base}/${item.id}`, { method: 'PATCH', body: { alt } }))
    } catch (err) {
      setError(errorCode(err))
    }
  }

  const remove = async () => {
    setError(null)
    try {
      await api(`${base}/${item.id}`, { method: 'DELETE' })
      onDeleted(item)
    } catch (err) {
      setConfirming(false)
      setError(errorCode(err))
    }
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('copyFailed')
    }
  }

  return (
    <aside ref={panel} className="media-details" tabIndex={-1} aria-labelledby="media-details-name">
      <div className="media-details__head">
        <h2 id="media-details-name" title={item.name}>{item.name}</h2>
        <button type="button" className="media__dismiss" aria-label={t('mediaClose')} onClick={onClose}>
          <X size={18} aria-hidden="true" />
        </button>
      </div>
      <div className="media-details__preview"><img src={item.url} alt={item.alt} /></div>

      <div className="media-details__body">
        {wasCropped && <p className="success-note" role="status">{t('mediaCropDone')}</p>}
        {error && <p className="form-error" role="alert">{t(errorLabel(error))}</p>}

        <div className="media-details__actions">
          <Button onClick={() => void copy()}>
            {copied ? <Check size={16} aria-hidden="true" /> : <Link2 size={16} aria-hidden="true" />}
            {copied ? t('copied') : t('mediaCopyLink')}
          </Button>
          <Button onClick={onCrop}>
            <Crop size={16} aria-hidden="true" />
            {t('mediaCrop')}
          </Button>
        </div>

        <dl className="media-details__facts">
          <div><dt className="muted">{t('mediaFormat')}</dt><dd>{item.sourceFormat === 'webp' ? 'WebP' : t('mediaFormatConverted', { format: formatLabel(item.sourceFormat) })}</dd></div>
          <div><dt className="muted">{t('mediaSize')}</dt><dd>{size(item.sizeBytes)}</dd></div>
          <div><dt className="muted">{t('mediaDimensions')}</dt><dd>{dimensions}</dd></div>
          <div><dt className="muted">{t('mediaAdded')}</dt><dd>{dateText}</dd></div>
        </dl>

        <form className="field media-details__alt" onSubmit={save}>
          <label htmlFor="media-alt">{t('mediaAlt')}</label>
          <textarea id="media-alt" name="alt" className="input input--area" rows={2} maxLength={500} aria-describedby="media-alt-help" value={alt} onChange={(e) => setAlt(e.target.value)} />
          <p id="media-alt-help" className="field__help">{t('mediaAltHelp')}</p>
          {alt.trim() !== item.alt && <Button type="submit">{t('mediaSave')}</Button>}
        </form>

        {usedIn && (
          <div className="media-details__usage">
            <span className="media-details__label">{t('mediaUsedIn')}</span>
            {usedIn.length === 0
              ? <p className="muted">{t('mediaNotUsed')}</p>
              : <ul>{usedIn.map((p) => <li key={p.id}><Link to={path(p.to)}>{p.name}</Link></li>)}</ul>}
          </div>
        )}

        {canDelete && usedIn !== null && usedIn.length > 0 && <p className="muted media-details__locked">{t('mediaUsedNoDelete')}</p>}
        {canDelete && usedIn?.length === 0 && (
          confirming
            ? (
              <div className="media-details__confirm">
                <p className="muted">{t('mediaDeleteWarning')}</p>
                <div className="row">
                  <Button onClick={() => setConfirming(false)}>{t('cancel')}</Button>
                  <Button variant="danger" onClick={() => void remove()}>{t('mediaConfirmDelete')}</Button>
                </div>
              </div>
            )
            : (
              <button type="button" className="media-details__delete" onClick={() => setConfirming(true)}>
                <Trash2 size={16} aria-hidden="true" />
                {t('mediaDelete')}
              </button>
            )
        )}
      </div>
    </aside>
  )
}
