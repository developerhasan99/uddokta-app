import { useEffect, useRef, useState, type DragEvent } from 'react'
import { DialogHead } from './DialogHead'
import { Check, ImagePlus, Upload } from 'lucide-react'
import { useCurrentStore } from '../account-context'
import { api, errorCode, type MediaItem } from '../api'
import { errorLabel, useLang } from '../i18n'
import { Button, Notice, SearchInput, Skeleton } from './ui'
import { useDialog } from './dialog'

type Page = { items: MediaItem[]; hasMore: boolean }

// The one gallery picker: a full-height panel on the right. The order images are ticked in is the order they are returned.
export function MediaPicker({ selected, max, onDone, onClose }: { selected: MediaItem[]; max: number; onDone: (items: MediaItem[]) => void; onClose: () => void }) {
  const { t, num } = useLang()
  const base = `/stores/${useCurrentStore()!.store.handle}/media`
  const { ref: dialog, close, props: dialogProps } = useDialog(onClose)
  const file = useRef<HTMLInputElement>(null)
  const latest = useRef(0)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState<Page | null>(null)
  const [failed, setFailed] = useState(false)
  const [picked, setPicked] = useState(selected)
  const [uploading, setUploading] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    dialog.current?.showModal()
  }, [])

  const load = async (q: string) => {
    const request = ++latest.current
    setFailed(false)
    try {
      const result = await api<Page>(`${base}?q=${encodeURIComponent(q)}`)
      if (request === latest.current) setPage(result)
    } catch {
      if (request === latest.current) setFailed(true)
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => void load(search.trim()), search ? 250 : 0)
    return () => clearTimeout(timer)
  }, [search, base])

  // With room for one image, a new choice replaces the old one.
  const add = (all: MediaItem[], item: MediaItem) => (max === 1 ? [item] : all.length < max ? [...all, item] : all)
  const toggle = (item: MediaItem) => {
    setPicked((all) => all.some((x) => x.id === item.id) ? all.filter((x) => x.id !== item.id) : add(all, item))
  }

  const upload = async (files: File[]) => {
    if (files.length === 0) return
    setError(null)
    setUploading(files.length)
    for (const f of files) {
      const body = new FormData()
      body.set('file', f)
      try {
        const item = await api<MediaItem>(base, { method: 'POST', form: body })
        setPage((p) => p && { ...p, items: [item, ...p.items] })
        setPicked((all) => add(all, item))
      } catch (err) {
        setError(`${f.name}: ${t(errorLabel(errorCode(err)))}`)
      }
      setUploading((n) => n - 1)
    }
  }

  // Only files dragged in from outside count; dragging a tile around the panel does nothing.
  const hasFiles = (e: DragEvent) => e.dataTransfer.types.includes('Files')
  const drop = {
    onDragOver: (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      setDragging(true)
    },
    onDragLeave: (e: DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false)
    },
    onDrop: (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      setDragging(false)
      void upload(Array.from(e.dataTransfer.files))
    },
  }

  const more = async () => {
    if (!page) return
    const next = await api<Page>(`${base}?q=${encodeURIComponent(search.trim())}&offset=${page.items.length}`)
    setPage({ ...next, items: [...page.items, ...next.items] })
  }

  return (
    <dialog {...dialogProps} {...drop} className="picker" aria-labelledby="picker-title">
      <DialogHead id="picker-title" title={t('pickerTitle')} onClose={() => close()} />
      <div className="picker__tools">
        <SearchInput label={t('mediaSearch')} value={search} onChange={(e) => setSearch(e.target.value)} />
        <Button onClick={() => file.current?.click()}><Upload size={16} aria-hidden="true" />{t('mediaUpload')}</Button>
        <input ref={file} className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp,image/avif,image/svg+xml" multiple tabIndex={-1} aria-label={t('mediaUpload')} onChange={(e) => {
          void upload(Array.from(e.target.files ?? []))
          e.target.value = ''
        }} />
      </div>

      <div className="dialog__body">
        {uploading > 0 && <p className="muted" role="status">{t('mediaUploading', { n: num(uploading) })}</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
        {failed && <Notice role="alert" title={t('mediaLoadFailed')} action={<Button onClick={() => void load(search.trim())}>{t('retry')}</Button>} />}
        {!failed && !page && <div className="picker__grid" role="status" aria-label={t('loading')}>{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} width="100%" />)}</div>}
        {page && page.items.length === 0 && (
          search
            ? <Notice title={t('mediaNoMatch')} body={t('mediaNoMatchBody')} />
            : (
              <button type="button" className="media__empty" onClick={() => file.current?.click()}>
                <ImagePlus size={32} strokeWidth={1.5} aria-hidden="true" />
                <strong>{t('mediaEmptyTitle')}</strong>
                <span className="muted">{t('mediaEmptyBody')}</span>
              </button>
            )
        )}
        {page && page.items.length > 0 && (
          <ul className="picker__grid">
            {page.items.map((item) => {
              const isPicked = picked.some((x) => x.id === item.id)
              return (
                <li key={item.id}>
                  <button type="button" className="picker__tile" aria-pressed={isPicked} title={item.name} disabled={!isPicked && max > 1 && picked.length >= max} onClick={() => toggle(item)}>
                    <img src={item.thumbUrl} alt={item.alt || item.name} loading="lazy" />
                    {isPicked && <span className="picker__check"><Check size={14} aria-hidden="true" /></span>}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
        {page?.hasMore && <div className="media__more"><Button onClick={() => void more()}>{t('mediaLoadMore')}</Button></div>}
      </div>

      {dragging && <div className="media__drop" aria-hidden="true"><Upload size={24} />{t('mediaDrop')}</div>}
      <div className="dialog__foot dialog__foot--split">
        <span className="muted">{t('pickerCount', { n: num(picked.length), max: num(max) })}</span>
        <div className="row">
          <Button onClick={() => close()}>{t('cancel')}</Button>
          <Button variant="primary" disabled={uploading > 0} onClick={() => close(() => onDone(picked))}>{t('pickerDone')}</Button>
        </div>
      </div>
    </dialog>
  )
}
