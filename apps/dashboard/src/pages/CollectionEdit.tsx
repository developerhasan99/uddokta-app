import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ArrowLeft, ArrowUp, CircleCheck, GripVertical, ImagePlus, Plus, Trash2, X } from 'lucide-react'
import { useCurrentStore, useStorePath } from '../account-context'
import { api, errorCode, type MediaItem } from '../api'
import { MediaPicker } from '../components/MediaPicker'
import { ProductPicker, type ProductRow } from '../components/ProductPicker'
import { RichText } from '../components/RichText'
import { SeoCard } from '../components/SeoCard'
import { Badge, Button, Field, Notice, PageTitle, Skeleton } from '../components/ui'
import { errorLabel, useLang } from '../i18n'
import { statusInfo, storeAddress } from '../product-form'

type Form = { name: string; description: string; handle: string; seoTitle: string; seoDescription: string; media: MediaItem | null; products: ProductRow[] }
type Saved = Form & { id: string }

const maxProducts = 1000
const maxDescription = 50_000
const blank = (): Form => ({ name: '', description: '', handle: '', seoTitle: '', seoDescription: '', media: null, products: [] })
const toForm = ({ id: _id, ...form }: Saved): Form => form

export function CollectionEdit() {
  const { t, num, money } = useLang()
  const { id } = useParams()
  const navigate = useNavigate()
  const path = useStorePath()
  const current = useCurrentStore()!
  const base = `/stores/${current.store.handle}/collections`
  const uid = useId()
  const loaded = useRef<string | null>(null)
  const dragFrom = useRef<number | null>(null)
  const [form, setForm] = useState<Form | null>(id ? null : blank())
  const [baseline, setBaseline] = useState(() => JSON.stringify(blank()))
  const [loadFailed, setLoadFailed] = useState(false)
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [justSaved, setJustSaved] = useState(false)
  const [picking, setPicking] = useState<'products' | 'image' | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [seoOpen, setSeoOpen] = useState(false)

  const show = (next: Form) => {
    setForm(next)
    setBaseline(JSON.stringify(next))
    setTried(false)
    setError(null)
  }

  const load = async (collectionId: string) => {
    setLoadFailed(false)
    setForm(null)
    try {
      show(toForm(await api<Saved>(`${base}/${collectionId}`)))
    } catch {
      setLoadFailed(true)
    }
  }

  // Stays put after the first save moves the URL from /new to the collection's own address.
  useEffect(() => {
    if (id === (loaded.current ?? undefined)) return
    loaded.current = id ?? null
    setJustSaved(false)
    if (id) void load(id)
    else show(blank())
  }, [id])

  useEffect(() => {
    if (!justSaved) return
    const timer = setTimeout(() => setJustSaved(false), 5000)
    return () => clearTimeout(timer)
  }, [justSaved])

  const dirty = form !== null && JSON.stringify(form) !== baseline
  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  if (loadFailed) {
    return (
      <div className="page">
        <section className="card card--flush"><Notice role="alert" title={t('collectionLoadFailed')} action={<Button onClick={() => void load(id!)}>{t('retry')}</Button>} /></section>
      </div>
    )
  }
  if (!form) {
    return <div className="page" role="status" aria-label={t('loading')}><Skeleton width="16rem" /><section className="card"><Skeleton /><Skeleton width="60%" /></section></div>
  }

  const change = (changes: Partial<Form>) => {
    setForm({ ...form, ...changes })
    setJustSaved(false)
    if (error === 'collectionHandleTaken' && changes.handle !== undefined && changes.handle !== form.handle) setError(null)
  }

  const descriptionLong = form.description.length > maxDescription

  const save = async (e: FormEvent) => {
    e.preventDefault()
    setTried(true)
    setError(null)
    if (!form.name.trim() || descriptionLong) {
      setError('productFix')
      return
    }
    setBusy(true)
    try {
      const { media, products, ...fields } = form
      const body = { ...fields, mediaId: media?.id ?? null, productIds: products.map((p) => p.id) }
      const saved = await api<Saved>(id ? `${base}/${id}` : base, { method: id ? 'PUT' : 'POST', body })
      show(toForm(saved))
      setJustSaved(true)
      if (!id) {
        loaded.current = saved.id
        navigate(path(`/products/collections/${saved.id}`), { replace: true })
      }
    } catch (err) {
      setError(errorCode(err))
      if (errorCode(err) === 'collectionHandleTaken') setSeoOpen(true)
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    setError(null)
    try {
      await api(`${base}/${id}`, { method: 'DELETE' })
      navigate(path('/products/collections'), { replace: true })
    } catch (err) {
      setConfirming(false)
      setError(errorCode(err))
    }
  }

  const discard = () => {
    setForm(JSON.parse(baseline) as Form)
    setTried(false)
    setError(null)
  }

  const move = (from: number, to: number) => {
    const products = [...form.products]
    const [item] = products.splice(from, 1)
    products.splice(to, 0, item)
    change({ products })
  }

  const savedName = (JSON.parse(baseline) as Form).name
  const hasHidden = form.products.some((p) => p.status !== 'active')

  return (
    <form className="page page--detail" onSubmit={(e) => void save(e)} noValidate>
      <PageTitle title={form.name || t('collectionNew')} />
      <header className="detail-head">
        <div className="detail-head__title">
          <Link className="detail-head__back" to={path('/products/collections')} aria-label={t('collectionBack')} title={t('collectionBack')}><ArrowLeft size={16} aria-hidden="true" /></Link>
          <h1>{id ? (savedName || t('collectionNew')) : t('collectionNew')}</h1>
        </div>
        <div className="detail-head__actions">
          {dirty && <Button onClick={discard}>{t('productDiscard')}</Button>}
          <Button type="submit" variant="primary" aria-busy={busy} disabled={busy || (Boolean(id) && !dirty)}>{t('productSave')}</Button>
        </div>
      </header>

      {error && <p className="form-error" role="alert">{t(error === 'productFix' ? 'productFix' : errorLabel(error))}</p>}

      <div className="detail-layout">
        <div className="detail-layout__main">
          <section className="card card--form">
            <Field id="collection-name" name="name" label={t('collectionName')} maxLength={200} autoComplete="off" placeholder={t('collectionNameHint')} value={form.name} error={tried && !form.name.trim() ? t('errNameRequired') : undefined} onChange={(e) => change({ name: e.target.value })} />
            <div className="field">
              <span id={`${uid}-description`} className="field__label">{t('productDescription')}</span>
              <RichText labelledBy={`${uid}-description`} value={form.description} invalid={descriptionLong} onChange={(description) => change({ description })} />
              {descriptionLong && <p className="field__help field__help--error" role="alert">{t('productDescriptionLong')}</p>}
            </div>
          </section>

          <section className="card">
            <div className="card__head">
              <div>
                <h2>{t('collectionProducts')}{form.products.length > 0 && <span className="tab__count"> {num(form.products.length)}</span>}</h2>
                {form.products.length > 1 && <p className="muted">{t('collectionProductsHelp')}</p>}
              </div>
              {form.products.length > 0 && <Button onClick={() => setPicking('products')}><Plus size={16} aria-hidden="true" />{t('collectionPickProducts')}</Button>}
            </div>
            {form.products.length === 0
              ? (
                <button type="button" className="media__empty" onClick={() => setPicking('products')}>
                  <Plus size={24} strokeWidth={1.5} aria-hidden="true" />
                  <strong>{t('collectionPickProducts')}</strong>
                  <span className="muted">{t('collectionProductsEmpty')}</span>
                </button>
              )
              : (
                <ul className="collection-products">
                  {form.products.map((product, i) => (
                    <li
                      key={product.id}
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
                      <span className="data-table__thumb">{product.thumbUrl && <img src={product.thumbUrl} alt="" loading="lazy" draggable={false} />}</span>
                      <Link className="collection-products__name" to={path(`/products/${product.id}`)} target="_blank" title={product.name}>{product.name}</Link>
                      {product.status !== 'active' && <Badge tone={statusInfo[product.status].tone}>{t(statusInfo[product.status].label)}</Badge>}
                      <span className="collection-products__price">{product.minPrice === product.maxPrice ? money(product.minPrice) : `${money(product.minPrice)} – ${money(product.maxPrice)}`}</span>
                      <button type="button" className="media__dismiss" disabled={i === 0} aria-label={t('collectionMoveUp', { value: product.name })} title={t('collectionMoveUp', { value: product.name })} onClick={() => move(i, i - 1)}><ArrowUp size={16} aria-hidden="true" /></button>
                      <button type="button" className="media__dismiss" aria-label={t('collectionRemoveProduct', { value: product.name })} title={t('collectionRemoveProduct', { value: product.name })} onClick={() => change({ products: form.products.filter((p) => p.id !== product.id) })}><X size={16} aria-hidden="true" /></button>
                    </li>
                  ))}
                </ul>
              )}
            {hasHidden && <p className="card-note">{t('collectionHiddenNote')}</p>}
          </section>

          <SeoCard
            section="collections"
            name={form.name}
            description={form.description}
            seoTitle={form.seoTitle}
            seoDescription={form.seoDescription}
            handle={form.handle}
            storeName={current.store.name}
            address={storeAddress(current.store.handle)}
            open={seoOpen}
            handleError={error === 'collectionHandleTaken' ? t('errCollectionHandleTaken') : undefined}
            onToggle={() => setSeoOpen(!seoOpen)}
            onChange={change}
          />
        </div>

        <aside className="detail-side">
          <section className="card">
            <h2>{t('collectionImage')}</h2>
            {form.media
              ? (
                <div className="collection-image">
                  <img src={form.media.url} alt={form.media.alt || form.media.name} />
                  <div className="row">
                    <Button onClick={() => setPicking('image')}>{t('collectionChangeImage')}</Button>
                    <Button onClick={() => change({ media: null })}>{t('collectionRemoveImage')}</Button>
                  </div>
                </div>
              )
              : (
                <button type="button" className="media__empty" onClick={() => setPicking('image')}>
                  <ImagePlus size={24} strokeWidth={1.5} aria-hidden="true" />
                  <strong>{t('collectionPickImage')}</strong>
                </button>
              )}
          </section>

          {id && current.role !== 'staff' && (
            confirming
              ? (
                <section className="card">
                  <p className="muted">{t('collectionDeleteWarning')}</p>
                  <div className="row">
                    <Button onClick={() => setConfirming(false)}>{t('cancel')}</Button>
                    <Button variant="danger" onClick={() => void remove()}>{t('productConfirmDelete')}</Button>
                  </div>
                </section>
              )
              : (
                <button type="button" className="media-details__delete" onClick={() => setConfirming(true)}>
                  <Trash2 size={16} aria-hidden="true" />
                  {t('collectionDelete')}
                </button>
              )
          )}
        </aside>
      </div>

      {picking === 'products' && (
        <ProductPicker
          selected={form.products}
          max={maxProducts}
          onClose={() => setPicking(null)}
          onDone={(products) => {
            change({ products })
            setPicking(null)
          }}
        />
      )}
      {picking === 'image' && (
        <MediaPicker
          selected={form.media ? [form.media] : []}
          max={1}
          onClose={() => setPicking(null)}
          onDone={(items) => {
            change({ media: items[0] ?? null })
            setPicking(null)
          }}
        />
      )}

      <div className="toast-anchor" role="status">
        {justSaved && <p className="toast"><CircleCheck size={18} aria-hidden="true" />{t('collectionSaved')}</p>}
      </div>
    </form>
  )
}
