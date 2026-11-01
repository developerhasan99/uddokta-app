import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { Check, ImagePlus, Upload, X } from 'lucide-react'
import { useCurrentStore } from '../account-context'
import { api, errorCode, type MediaItem } from '../api'
import { errorLabel, useLang } from '../i18n'
import { Button, Notice, SearchInput, Skeleton } from './ui'

type Page = { items: MediaItem[]; hasMore: boolean }

// The one gallery picker: a full-height panel on the right. The order images are ticked in is the order they are returned.
export function MediaPicker({ selected, max, onDone, onClose }: { selected: MediaItem[]; max: number; onDone: (items: MediaItem[]) => void; onClose: () => void }) {
  const { t, num } = useLang()
  const base = `/stores/${useCurrentStore()!.store.handle}/media`
  const dialog = useRef<HTMLDialogElement>(null)
  const file = useRef<HTMLInputElement>(null)
  const latest = useRef(0)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState<Page | null>(null)
  const [failed, setFailed] = useState(false)
  const [picked, setPicked] = useState(selected)
  const [uploading, setUploading] = useState(0)
  const [error, setError] = useState<string | null>(null)

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

  const toggle = (item: MediaItem) => {
    setPicked((all) => all.some((x) => x.id === item.id) ? all.filter((x) => x.id !== item.id) : all.length < max ? [...all, item] : all)
  }

  const onFiles = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    setError(null)
    setUploading(files.length)
    for (const f of files) {
      const body = new FormData()
      body.set('file', f)
      try {
        const item = await api<MediaItem>(base, { method: 'POST', form: body })
        setPage((p) => p && { ...p, items: [item, ...p.items] })
        setPicked((all) => (all.length < max ? [...all, item] : all))
      } catch (err) {
        setError(`${f.name}: ${t(errorLabel(errorCode(err)))}`)
      }
      setUploading((n) => n - 1)
    }
  }

  const more = async () => {
    if (!page) return
    const next = await api<Page>(`${base}?q=${encodeURIComponent(search.trim())}&offset=${page.items.length}`)
    setPage({ ...next, items: [...page.items, ...next.items] })
  }

  return (
    <dialog ref={dialog} className="picker" aria-labelledby="picker-title" onClose={onClose}>
      <div className="picker__head">
        <h2 id="picker-title">{t('pickerTitle')}</h2>
        <button type="button" className="media__dismiss" aria-label={t('mediaClose')} onClick={onClose}><X size={18} aria-hidden="true" /></button>
      </div>
      <div className="picker__tools">
        <SearchInput label={t('mediaSearch')} value={search} onChange={(e) => setSearch(e.target.value)} />
        <Button onClick={() => file.current?.click()}><Upload size={16} aria-hidden="true" />{t('mediaUpload')}</Button>
        <input ref={file} className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple tabIndex={-1} aria-label={t('mediaUpload')} onChange={(e) => void onFiles(e)} />
      </div>

      <div className="picker__body">
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
                  <button type="button" className="picker__tile" aria-pressed={isPicked} title={item.name} disabled={!isPicked && picked.length >= max} onClick={() => toggle(item)}>
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

      <div className="picker__foot">
        <span className="muted">{t('pickerCount', { n: num(picked.length), max: num(max) })}</span>
        <div className="row">
          <Button onClick={onClose}>{t('cancel')}</Button>
          <Button variant="primary" disabled={uploading > 0} onClick={() => onDone(picked)}>{t('pickerDone')}</Button>
        </div>
      </div>
    </dialog>
  )
}
