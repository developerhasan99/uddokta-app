import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ArrowLeft, CircleCheck, CirclePlus, ImagePlus, Lock, Pencil, Plus, Star, Trash2, X } from 'lucide-react'
import { useCurrentStore, useStorePath } from '../account-context'
import { api, errorCode, type MediaItem } from '../api'
import { MediaPicker } from '../components/MediaPicker'
import { RichText } from '../components/RichText'
import { Badge, Button, Field, Notice, Skeleton } from '../components/ui'
import { errorLabel, useLang } from '../i18n'
import { maxVariants, parseAmount, productStatuses, searchDescription, seoDescriptionLimit, seoTitleLimit, slugify, statusInfo, storeAddress, variantsFor, variantTotal, type Option, type ProductStatus, type VariantDraft } from '../product-form'

type Saved = {
  id: string; name: string; description: string; status: ProductStatus; productType: string; brand: string; tags: string[]; handle: string; seoTitle: string; seoDescription: string; options: Option[]; media: MediaItem[]
  variants: { id: string; options: string[]; price: number; comparePrice: number | null; cost: number | null; sku: string; stock: number | null; mediaId: string | null }[]
}
type Form = { name: string; description: string; status: ProductStatus; productType: string; brand: string; tags: string[]; handle: string; seoTitle: string; seoDescription: string; options: Option[]; variants: VariantDraft[]; media: MediaItem[] }
type Suggestions = { types: string[]; brands: string[]; tags: string[] }
type BulkField = 'price' | 'comparePrice' | 'cost' | 'stock'

const maxImages = 20
const maxDescription = 50_000
const maxTags = 30
const text = (n: number | null) => (n === null ? '' : String(n))
const blank = (): Form => ({ name: '', description: '', status: 'active', productType: '', brand: '', tags: [], handle: '', seoTitle: '', seoDescription: '', options: [], variants: variantsFor([], []), media: [] })
const toForm = (p: Saved): Form => ({
  name: p.name,
  description: p.description,
  status: p.status,
  productType: p.productType,
  brand: p.brand,
  tags: p.tags,
  handle: p.handle,
  seoTitle: p.seoTitle,
  seoDescription: p.seoDescription,
  options: p.options,
  media: p.media,
  variants: p.variants.map((v) => ({ id: v.id, options: v.options, price: text(v.price), comparePrice: text(v.comparePrice), cost: text(v.cost), sku: v.sku, stock: text(v.stock), mediaId: v.mediaId })),
})
// Blank is fine for everything except the selling price.
const badAmount = (value: string, required = false) => (value.trim() === '' ? required : parseAmount(value) === null)
const optional = (value: string) => (value.trim() === '' ? null : parseAmount(value))
const variantKey = (v: VariantDraft) => JSON.stringify(v.options)
const stayInForm = (e: KeyboardEvent) => {
  if (e.key === 'Enter') e.preventDefault()
}

export function ProductEdit() {
  const { t, num, money } = useLang()
  const { id } = useParams()
  const navigate = useNavigate()
  const path = useStorePath()
  const current = useCurrentStore()!
  const base = `/stores/${current.store.handle}/products`
  const seesCost = current.role !== 'staff'
  const loaded = useRef<string | null>(null)
  const dragFrom = useRef<number | null>(null)
  const uid = useId()
  const [form, setForm] = useState<Form | null>(id ? null : blank())
  const [baseline, setBaseline] = useState(() => JSON.stringify(blank()))
  const [loadFailed, setLoadFailed] = useState(false)
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [justSaved, setJustSaved] = useState(false)
  // Which picker is open: the product's images, or the variant at this position.
  const [picking, setPicking] = useState<'product' | number | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [seoOpen, setSeoOpen] = useState(false)
  const [suggestions, setSuggestions] = useState<Suggestions>({ types: [], brands: [], tags: [] })

  const show = (next: Form) => {
    setForm(next)
    setBaseline(JSON.stringify(next))
    setTried(false)
    setError(null)
  }

  const load = async (productId: string) => {
    setLoadFailed(false)
    setForm(null)
    try {
      show(toForm(await api<Saved>(`${base}/${productId}`)))
    } catch {
      setLoadFailed(true)
    }
  }

  // Stays put after the first save moves the URL from /new to the product's own address.
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

  // Only suggestions, so the form works without them.
  useEffect(() => {
    api<Suggestions>(`${base}/suggestions`).then(setSuggestions).catch(() => {})
  }, [base])

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
        <section className="card card--flush"><Notice role="alert" title={t('productLoadFailed')} action={<Button onClick={() => void load(id!)}>{t('retry')}</Button>} /></section>
      </div>
    )
  }
  if (!form) {
    return <div className="page" role="status" aria-label={t('loading')}><Skeleton width="16rem" /><section className="card"><Skeleton /><Skeleton width="60%" /></section></div>
  }

  const change = (changes: Partial<Form>) => {
    setForm({ ...form, ...changes })
    setJustSaved(false)
    if (error === 'productHandleTaken' && changes.handle !== undefined && changes.handle !== form.handle) setError(null)
  }
  const setOptions = (options: Option[]) => change({ options, variants: variantsFor(options, form.variants) })
  const setVariant = (index: number, changes: Partial<VariantDraft>) => change({ variants: form.variants.map((v, i) => (i === index ? { ...v, ...changes } : v)) })
  // A variant can only show one of the product's images, so removing an image clears it from variants too.
  const setMedia = (media: MediaItem[]) => change({ media, variants: form.variants.map((v) => (v.mediaId && !media.some((m) => m.id === v.mediaId) ? { ...v, mediaId: null } : v)) })

  const pickVariantImage = (index: number, item: MediaItem | undefined) => {
    setPicking(null)
    const isNew = item && !form.media.some((m) => m.id === item.id)
    if (isNew && form.media.length >= maxImages) {
      setError('productImagesFull')
      return
    }
    change({
      media: isNew ? [...form.media, item] : form.media,
      variants: form.variants.map((v, i) => (i === index ? { ...v, mediaId: item?.id ?? null } : v)),
    })
  }

  const usedOptions = form.options.filter((o) => o.values.length > 0)
  const optionNameBad = (option: Option) => option.values.length > 0 && (!option.name.trim() || usedOptions.filter((o) => o.name.trim() === option.name.trim()).length > 1)
  const descriptionLong = form.description.length > maxDescription
  const hasErrors = !form.name.trim()
    || descriptionLong
    || form.options.some(optionNameBad)
    || form.variants.some((v) => badAmount(v.price, true) || badAmount(v.comparePrice) || badAmount(v.stock) || (seesCost && badAmount(v.cost)))

  const save = async (e: FormEvent) => {
    e.preventDefault()
    setTried(true)
    setError(null)
    if (hasErrors) {
      setError('productFix')
      return
    }
    setBusy(true)
    try {
      const body = {
        name: form.name,
        description: form.description,
        status: form.status,
        productType: form.productType,
        brand: form.brand,
        tags: form.tags,
        handle: form.handle,
        seoTitle: form.seoTitle,
        seoDescription: form.seoDescription,
        options: usedOptions,
        mediaIds: form.media.map((m) => m.id),
        variants: form.variants.map((v) => ({
          id: v.id,
          options: v.options,
          price: parseAmount(v.price),
          comparePrice: optional(v.comparePrice),
          sku: v.sku,
          stock: optional(v.stock),
          mediaId: v.mediaId ?? null,
          // Staff leave buying prices out, so their save does not touch them.
          ...(seesCost ? { cost: optional(v.cost) } : {}),
        })),
      }
      const saved = await api<Saved>(id ? `${base}/${id}` : base, { method: id ? 'PUT' : 'POST', body })
      show(toForm(saved))
      setJustSaved(true)
      if (!id) {
        loaded.current = saved.id
        navigate(path(`/products/${saved.id}`), { replace: true })
      }
    } catch (err) {
      setError(errorCode(err))
      if (errorCode(err) === 'productHandleTaken') setSeoOpen(true)
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    setError(null)
    try {
      await api(`${base}/${id}`, { method: 'DELETE' })
      navigate(path('/products'), { replace: true })
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

  const moveImage = (from: number, to: number) => {
    const media = [...form.media]
    const [item] = media.splice(from, 1)
    media.splice(to, 0, item)
    change({ media })
  }

  const single = form.variants.length === 1 && form.variants[0].options.length === 0 ? form.variants[0] : null
  const singlePrice = single && parseAmount(single.price)
  const singleCost = single && parseAmount(single.cost)
  const singleOld = single && parseAmount(single.comparePrice)
  const oldPriceLow = typeof singleOld === 'number' && typeof singlePrice === 'number' && singleOld <= singlePrice
  const discount = !oldPriceLow && typeof singleOld === 'number' && singleOld > 0 && typeof singlePrice === 'number' ? Math.round(((singleOld - singlePrice) / singleOld) * 100) : null
  const profit = seesCost && typeof singlePrice === 'number' && singlePrice > 0 && typeof singleCost === 'number' ? singlePrice - singleCost : null
  const prices = form.variants.map((v) => parseAmount(v.price)).filter((n) => n !== null)
  const stockCounts = form.variants.map((v) => parseAmount(v.stock)).filter((n) => n !== null)
  const priceRange = prices.length === 0 ? '-' : Math.min(...prices) === Math.max(...prices) ? money(prices[0]) : `${money(Math.min(...prices))} – ${money(Math.max(...prices))}`
  const invalid = (bad: boolean) => (tried && bad ? t('productBadNumber') : undefined)

  const picked = form.variants.filter((v) => selected.includes(variantKey(v)))
  const toggleVariant = (v: VariantDraft) => setSelected(selected.includes(variantKey(v)) ? selected.filter((k) => k !== variantKey(v)) : [...selected, variantKey(v)])
  const applyToSelected = (field: BulkField, value: string) => change({ variants: form.variants.map((v) => (selected.includes(variantKey(v)) ? { ...v, [field]: value } : v)) })

  return (
    <form className="page page--detail" onSubmit={(e) => void save(e)} noValidate>
      <title>{form.name || t('productNew')}</title>
      <header className="detail-head">
        <div className="detail-head__title">
          <Link className="detail-head__back" to={path('/products')} aria-label={t('productBack')} title={t('productBack')}><ArrowLeft size={16} aria-hidden="true" /></Link>
          <h1>{id ? (baselineName(baseline) || t('productNew')) : t('productNew')}</h1>
          <Badge tone={statusInfo[form.status].tone}>{t(statusInfo[form.status].label)}</Badge>
        </div>
        <div className="detail-head__actions">
          {dirty && <Button onClick={discard}>{t('productDiscard')}</Button>}
          <Button type="submit" variant="primary" aria-busy={busy} disabled={busy || (Boolean(id) && !dirty)}>{t('productSave')}</Button>
        </div>
      </header>

      {error && <p className="form-error" role="alert">{t(error === 'productFix' || error === 'productImagesFull' ? error : errorLabel(error))}</p>}

      <div className="detail-layout">
        <div className="detail-layout__main">
          <section className="card card--form">
            <Field id="product-name" name="name" label={t('productName')} maxLength={200} autoComplete="off" value={form.name} error={tried && !form.name.trim() ? t('errNameRequired') : undefined} onChange={(e) => change({ name: e.target.value })} />

            <div className="field">
              <span id={`${uid}-description`} className="field__label">{t('productDescription')}</span>
              <RichText labelledBy={`${uid}-description`} value={form.description} invalid={descriptionLong} onChange={(description) => change({ description })} />
              {descriptionLong && <p className="field__help field__help--error" role="alert">{t('productDescriptionLong')}</p>}
            </div>

            <div className="field">
              <div className="field__head">
                <span className="field__label">{t('productImages')}</span>
                {form.media.length > 1 && <span className="muted field__help">{t('productImagesHelp')}</span>}
              </div>
              {form.media.length === 0
                ? (
                  <button type="button" className="media__empty" onClick={() => setPicking('product')}>
                    <ImagePlus size={24} strokeWidth={1.5} aria-hidden="true" />
                    <strong>{t('productPickImages')}</strong>
                    <span className="muted">{t('productImagesEmpty')}</span>
                  </button>
                )
                : (
                  <ul className="product-images">
                    {form.media.map((item, i) => (
                      <li
                        key={item.id}
                        className="product-images__item"
                        draggable
                        onDragStart={() => { dragFrom.current = i }}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault()
                          if (dragFrom.current !== null && dragFrom.current !== i) moveImage(dragFrom.current, i)
                          dragFrom.current = null
                        }}
                      >
                        <img src={i === 0 ? item.url : item.thumbUrl} alt={item.alt || item.name} draggable={false} />
                        {i === 0 && <span className="product-images__main">{t('productMainImage')}</span>}
                        <div className="product-images__actions">
                          {i > 0 && (
                            <button type="button" aria-label={t('productMakeMain')} title={t('productMakeMain')} onClick={() => moveImage(i, 0)}>
                              <Star size={14} aria-hidden="true" />
                            </button>
                          )}
                          <button type="button" aria-label={t('productRemoveImage')} title={t('productRemoveImage')} onClick={() => setMedia(form.media.filter((x) => x.id !== item.id))}>
                            <X size={14} aria-hidden="true" />
                          </button>
                        </div>
                      </li>
                    ))}
                    {form.media.length < maxImages && (
                      <li>
                        <button type="button" className="product-images__add" aria-label={t('productPickImages')} title={t('productPickImages')} onClick={() => setPicking('product')}>
                          <Plus size={18} aria-hidden="true" />
                        </button>
                      </li>
                    )}
                  </ul>
                )}
            </div>

            {single && (
              <div className="form-section">
                <h2>{t('productPriceStock')}</h2>
                <div className={seesCost ? 'price-grid' : 'price-grid price-grid--two'}>
                  <Field id="price" label={t('productPrice')} unit="৳" inputMode="numeric" autoComplete="off" value={single.price} error={tried && badAmount(single.price, true) ? t('productPriceRequired') : undefined} onChange={(e) => setVariant(0, { price: e.target.value })} />
                  <Field id="compare-price" label={t('productOldPrice')} unit="৳" inputMode="numeric" autoComplete="off" placeholder={t('productOptional')} value={single.comparePrice} error={invalid(badAmount(single.comparePrice))} help={oldPriceLow ? t('productOldPriceLow') : undefined} trailing={discount !== null && <span className="field__hint">{t('productOldPriceOff', { n: num(discount) })}</span>} onChange={(e) => setVariant(0, { comparePrice: e.target.value })} />
                  {seesCost && <Field id="cost" label={t('productCost')} unit="৳" inputMode="numeric" autoComplete="off" placeholder={t('productOptional')} value={single.cost} error={invalid(badAmount(single.cost))} onChange={(e) => setVariant(0, { cost: e.target.value })} />}
                  <Field id="stock" label={t('productStock')} inputMode="numeric" autoComplete="off" placeholder={t('productUntracked')} value={single.stock} error={invalid(badAmount(single.stock))} onChange={(e) => setVariant(0, { stock: e.target.value })} />
                  <Field id="sku" label={t('productSku')} maxLength={100} autoComplete="off" placeholder={t('productOptional')} value={single.sku} onChange={(e) => setVariant(0, { sku: e.target.value })} />
                  {seesCost && (
                    <div className="field">
                      <span className="field__label">{t('productProfitLabel')}</span>
                      <output className={profit !== null && profit < 0 ? 'readout readout--loss' : 'readout'}>{profit === null ? '-' : `${money(profit)} (${num(Math.round((profit / singlePrice!) * 100))}%)`}</output>
                    </div>
                  )}
                </div>
                {seesCost && <p className="price-note"><Lock size={14} aria-hidden="true" />{t('productPriceNote')}</p>}
              </div>
            )}
          </section>

          <section className="card variant-card">
            <div className="variant-card__head">
              <h2>{t('productVariantsCol')}</h2>
              <p className="muted">{t('productOptionsHelp')}</p>
            </div>
            <div>
              <datalist id="option-names">
                <option value={t('productOptionSize')} />
                <option value={t('productOptionColor')} />
              </datalist>
              <div className="option-box">
                {form.options.map((option, i) => (
                  <OptionRow
                    key={i}
                    option={option}
                    nameBad={tried && optionNameBad(option)}
                    others={form.options.filter((_, n) => n !== i)}
                    onChange={(next) => setOptions(form.options.map((o, n) => (n === i ? next : o)))}
                    onRemove={() => setOptions(form.options.filter((_, n) => n !== i))}
                  />
                ))}
                {form.options.length < 3 && (
                  <button type="button" className="option-add" onClick={() => setOptions([...form.options, { name: form.options.length === 0 ? t('productOptionSize') : '', values: [] }])}>
                    <CirclePlus size={16} aria-hidden="true" />
                    {t(form.options.length === 0 ? 'productAddOption' : 'productAddAnother')}
                  </button>
                )}
              </div>
              {!single && (
                <>
                  {picked.length > 0 && <BulkBar count={picked.length} seesCost={seesCost} onApply={applyToSelected} onClear={() => setSelected([])} />}
                  <div className="variant-table">
                    <table>
                      <thead>
                        <tr>
                          <th scope="col" className="variant-table__check">
                            <input
                              type="checkbox"
                              aria-label={t('productSelectAll')}
                              ref={(el) => { if (el) el.indeterminate = picked.length > 0 && picked.length < form.variants.length }}
                              checked={picked.length === form.variants.length}
                              onChange={() => setSelected(picked.length === form.variants.length ? [] : form.variants.map(variantKey))}
                            />
                          </th>
                          <th scope="col">{t('productVariant')}</th>
                          <th scope="col" className="variant-table__num">{t('productPrice')} (৳)</th>
                          <th scope="col" className="variant-table__num">{t('productOldPrice')} (৳)</th>
                          {seesCost && <th scope="col" className="variant-table__num">{t('productCost')} (৳)</th>}
                          <th scope="col" className="variant-table__num">{t('productStock')}</th>
                          <th scope="col">{t('productSku')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {form.variants.map((v, i) => {
                          const label = v.options.join(' / ')
                          const image = form.media.find((m) => m.id === v.mediaId)
                          const cell = (name: BulkField, title: string, bad: boolean, placeholder?: string) => (
                            <td className="variant-table__num">
                              <input className="input" inputMode="numeric" autoComplete="off" placeholder={placeholder} aria-label={`${label}: ${title}`} aria-invalid={tried && bad ? true : undefined} value={v[name]} onChange={(e) => setVariant(i, { [name]: e.target.value })} />
                            </td>
                          )
                          const startsGroup = i > 0 && form.options.length > 1 && v.options[0] !== form.variants[i - 1].options[0]
                          const rowClass = [selected.includes(variantKey(v)) && 'variant-table__row--selected', startsGroup && 'variant-table__row--group'].filter(Boolean).join(' ')
                          return (
                            <tr key={variantKey(v)} className={rowClass || undefined}>
                              <td className="variant-table__check"><input type="checkbox" aria-label={t('productSelectVariant', { value: label })} checked={selected.includes(variantKey(v))} onChange={() => toggleVariant(v)} /></td>
                              <th scope="row">
                                <span className="variant-table__name">
                                  <button type="button" className="variant-table__image" aria-label={t('productVariantImage', { value: label })} title={t('productVariantImage', { value: label })} onClick={() => setPicking(i)}>
                                    {image ? <img src={image.thumbUrl} alt="" /> : <ImagePlus size={16} aria-hidden="true" />}
                                  </button>
                                  <span>{v.options[0]}{v.options.length > 1 && <span className="muted"> / {v.options.slice(1).join(' / ')}</span>}</span>
                                </span>
                              </th>
                              {cell('price', t('productPrice'), badAmount(v.price, true))}
                              {cell('comparePrice', t('productOldPrice'), badAmount(v.comparePrice))}
                              {seesCost && cell('cost', t('productCost'), badAmount(v.cost))}
                              {cell('stock', t('productStock'), badAmount(v.stock), t('productUntracked'))}
                              <td><input className="input" maxLength={100} autoComplete="off" aria-label={`${label}: ${t('productSku')}`} value={v.sku} onChange={(e) => setVariant(i, { sku: e.target.value })} /></td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="variant-foot">
                    <span>{t('productVariantTotal', { n: num(form.variants.length) })}{stockCounts.length > 0 && `, ${t('productStockTotal', { n: num(stockCounts.reduce((a, b) => a + b, 0)) })}`}</span>
                    <span>{seesCost ? `${t('productVariantCostNote')} ${t('productStockHelp')}` : t('productStockHelp')}</span>
                  </div>
                </>
              )}
            </div>
          </section>

          <SeoCard
            form={form}
            storeName={current.store.name}
            address={storeAddress(current.store.handle)}
            price={prices.length > 0 ? priceRange : null}
            open={seoOpen}
            handleTaken={error === 'productHandleTaken'}
            onToggle={() => setSeoOpen(!seoOpen)}
            onChange={change}
          />
        </div>

        <aside className="detail-side">
          <section className="card detail-side__card">
            <div className="field">
              <label htmlFor="product-status">{t('productStatus')}</label>
              <select id="product-status" name="status" className="input" value={form.status} onChange={(e) => change({ status: e.target.value as ProductStatus })}>
                {productStatuses.map((status) => <option key={status} value={status}>{t(statusInfo[status].label)}</option>)}
              </select>
              <p className="field__help">{t(statusInfo[form.status].help)}</p>
            </div>

            <div className="detail-side__group">
              <h2>{t('productSummary')}</h2>
              <dl className="media-details__facts">
                <div><dt className="muted">{t('productPriceCol')}</dt><dd>{priceRange}</dd></div>
                <div><dt className="muted">{t('productStockCol')}</dt><dd>{stockCounts.length > 0 ? num(stockCounts.reduce((a, b) => a + b, 0)) : t('productUntracked')}</dd></div>
                <div><dt className="muted">{t('productVariantsCol')}</dt><dd>{num(form.variants.length)}</dd></div>
                <div><dt className="muted">{t('productImages')}</dt><dd>{num(form.media.length)}</dd></div>
              </dl>
            </div>

            <div className="detail-side__group">
              <h2>{t('productOrganization')}</h2>
              <Field id="product-type" name="productType" label={t('productType')} list="product-types" maxLength={100} autoComplete="off" placeholder={t('productTypeHint')} value={form.productType} onChange={(e) => change({ productType: e.target.value })} />
              <datalist id="product-types">{suggestions.types.map((value) => <option key={value} value={value} />)}</datalist>
              <Field id="product-brand" name="brand" label={t('productBrand')} list="product-brands" maxLength={100} autoComplete="off" value={form.brand} onChange={(e) => change({ brand: e.target.value })} />
              <datalist id="product-brands">{suggestions.brands.map((value) => <option key={value} value={value} />)}</datalist>
              <div className="field">
                <label htmlFor="product-tags">{t('productTags')}</label>
                <ChipsInput id="product-tags" list="product-tag-list" maxLength={50} max={maxTags} placeholder={t('productTagsHint')} values={form.tags} onChange={(tags) => change({ tags })} />
                <datalist id="product-tag-list">{suggestions.tags.filter((tag) => !form.tags.includes(tag)).map((value) => <option key={value} value={value} />)}</datalist>
              </div>
            </div>
          </section>

          {id && current.role !== 'staff' && (
            confirming
              ? (
                <section className="card">
                  <p className="muted">{t('productDeleteWarning')}</p>
                  <div className="row">
                    <Button onClick={() => setConfirming(false)}>{t('cancel')}</Button>
                    <Button variant="danger" onClick={() => void remove()}>{t('productConfirmDelete')}</Button>
                  </div>
                </section>
              )
              : (
                <button type="button" className="media-details__delete" onClick={() => setConfirming(true)}>
                  <Trash2 size={16} aria-hidden="true" />
                  {t('productDelete')}
                </button>
              )
          )}
        </aside>
      </div>

      {picking === 'product' && (
        <MediaPicker
          selected={form.media}
          max={maxImages}
          onClose={() => setPicking(null)}
          onDone={(media) => {
            setMedia(media)
            setPicking(null)
          }}
        />
      )}
      {typeof picking === 'number' && (
        <MediaPicker
          selected={form.media.filter((m) => m.id === form.variants[picking]?.mediaId)}
          max={1}
          onClose={() => setPicking(null)}
          onDone={(items) => pickVariantImage(picking, items[0])}
        />
      )}
      <div className="toast-anchor" role="status">
        {justSaved && <p className="toast"><CircleCheck size={18} aria-hidden="true" />{t('productSaved')}</p>}
      </div>
    </form>
  )
}

const baselineName = (baseline: string) => (JSON.parse(baseline) as Form).name

// A preview of the search result, with the fields behind a pencil. Blank fields fall back to the product's name and description.
function SeoCard({ form, storeName, address, price, open, handleTaken, onToggle, onChange }: { form: Form; storeName: string; address: string; price: string | null; open: boolean; handleTaken: boolean; onToggle: () => void; onChange: (changes: Partial<Form>) => void }) {
  const { t, num } = useLang()
  const title = form.seoTitle || form.name
  const description = form.seoDescription || searchDescription(form.description)
  const handle = slugify(form.handle) || slugify(form.name) || 'product'
  const count = (n: number, max: number) => `${t('productSeoCount', { n: num(n), max: num(max) })}${n > max ? ` ${t('productSeoOver')}` : ''}`
  return (
    <section className="card card--flush seo-card">
      <div className="seo-card__head">
        <h2>{t('productSeo')}</h2>
        <button type="button" className="media__dismiss" aria-expanded={open} aria-label={t(open ? 'productSeoClose' : 'productSeoEdit')} title={t(open ? 'productSeoClose' : 'productSeoEdit')} onClick={onToggle}>
          {open ? <X size={16} aria-hidden="true" /> : <Pencil size={16} aria-hidden="true" />}
        </button>
      </div>
      <div className="seo-preview">
        <p className="seo-preview__store">{storeName}</p>
        <p className="muted seo-preview__url">{address} › products › {handle}</p>
        <p className="seo-preview__title">{title || t('productNew')}</p>
        <p className="muted seo-preview__text">{description || t('productSeoNoDescription')}</p>
        {price && <p className="muted">{price}</p>}
      </div>
      {open && (
        <div className="seo-card__fields">
          <Field id="seo-title" name="seoTitle" label={t('productSeoTitle')} maxLength={300} autoComplete="off" placeholder={form.name} value={form.seoTitle} help={count(title.length, seoTitleLimit)} onChange={(e) => onChange({ seoTitle: e.target.value })} />
          <div className="field">
            <label htmlFor="seo-description">{t('productSeoDescription')}</label>
            <textarea id="seo-description" name="seoDescription" className="input input--area" rows={3} maxLength={1000} placeholder={searchDescription(form.description)} aria-describedby="seo-description-help" value={form.seoDescription} onChange={(e) => onChange({ seoDescription: e.target.value })} />
            <p id="seo-description-help" className="field__help">{count(description.length, seoDescriptionLimit)}</p>
          </div>
          <div className="field">
            <label htmlFor="seo-handle">{t('productHandle')}</label>
            <div className={handleTaken ? 'input-affix input-affix--invalid' : 'input-affix'}>
              <span aria-hidden="true">products/</span>
              <input id="seo-handle" name="handle" maxLength={100} autoComplete="off" placeholder={slugify(form.name)} aria-invalid={handleTaken ? true : undefined} aria-describedby="seo-handle-help" value={form.handle} onChange={(e) => onChange({ handle: e.target.value })} onBlur={() => onChange({ handle: slugify(form.handle) })} />
            </div>
            <div id="seo-handle-help">
              {handleTaken && <p className="field__help field__help--error">{t('errProductHandleTaken')}</p>}
              <p className="field__help seo-card__url">{address}/products/{handle}</p>
              <p className="field__help">{t('productHandleHelp')}</p>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

// Sets one value on every ticked variant. Only the selling price has to have a value.
function BulkBar({ count, seesCost, onApply, onClear }: { count: number; seesCost: boolean; onApply: (field: BulkField, value: string) => void; onClear: () => void }) {
  const { t, num } = useLang()
  const uid = useId()
  const [field, setField] = useState<BulkField>('price')
  const [value, setValue] = useState('')
  const bad = badAmount(value, field === 'price')
  const apply = () => {
    if (bad) return
    onApply(field, value.trim())
    setValue('')
  }
  return (
    <div className="bulk-bar" role="group" aria-label={t('productBulkLabel')}>
      <strong>{t('productBulkSelected', { n: num(count) })}</strong>
      <select className="input input--compact" aria-label={t('productBulkField')} value={field} onChange={(e) => setField(e.target.value as BulkField)}>
        <option value="price">{t('productPrice')}</option>
        <option value="comparePrice">{t('productOldPrice')}</option>
        {seesCost && <option value="cost">{t('productCost')}</option>}
        <option value="stock">{t('productStock')}</option>
      </select>
      <input
        id={`${uid}-value`}
        className="input bulk-bar__value"
        inputMode="numeric"
        autoComplete="off"
        aria-label={t('productBulkValue')}
        value={value}
        aria-invalid={value !== '' && bad ? true : undefined}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            apply()
          }
        }}
      />
      <Button disabled={bad} onClick={apply}>{t('productBulkApply')}</Button>
      <Button onClick={onClear}>{t('productBulkClear')}</Button>
    </div>
  )
}

// Commits on Enter, a comma or leaving the box. `accepts` can refuse a new list, which keeps what was typed.
function ChipsInput({ id, values, onChange, placeholder, list, max, maxLength, accepts = () => true }: { id: string; values: string[]; onChange: (values: string[]) => void; placeholder?: string; list?: string; max: number; maxLength: number; accepts?: (values: string[]) => boolean }) {
  const { t } = useLang()
  const [draft, setDraft] = useState('')

  const commit = (raw: string) => {
    const added = raw.split(/[,،]/).map((v) => v.trim().slice(0, maxLength)).filter((v) => v && !values.includes(v))
    const next = [...values, ...new Set(added)].slice(0, max)
    if (!accepts(next)) return
    setDraft('')
    if (next.length !== values.length) onChange(next)
  }

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      commit(draft)
    } else if (e.key === 'Backspace' && !draft && values.length > 0) {
      onChange(values.slice(0, -1))
    }
  }

  return (
    <div className="chips">
      {values.map((value) => (
        <span key={value} className="chip">
          {value}
          <button type="button" aria-label={t('productRemoveValue', { value })} onClick={() => onChange(values.filter((v) => v !== value))}><X size={12} aria-hidden="true" /></button>
        </span>
      ))}
      <input id={id} list={list} autoComplete="off" placeholder={values.length === 0 ? placeholder : undefined} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={onKey} onBlur={() => commit(draft)} />
    </div>
  )
}

function OptionRow({ option, nameBad, others, onChange, onRemove }: { option: Option; nameBad: boolean; others: Option[]; onChange: (option: Option) => void; onRemove: () => void }) {
  const { t } = useLang()
  const uid = useId()
  const [editing, setEditing] = useState(option.values.length === 0)
  const [tooMany, setTooMany] = useState(false)

  if (!editing && !nameBad) {
    return (
      <button type="button" className="option-summary" aria-label={`${t('productOptionEdit')}: ${option.name}`} onClick={() => setEditing(true)}>
        <span className="option-summary__text">
          <strong>{option.name}</strong>
          <span className="option-summary__values">{option.values.map((value) => <span key={value} className="chip chip--static">{value}</span>)}</span>
        </span>
        <Pencil size={14} aria-hidden="true" />
      </button>
    )
  }

  const accepts = (values: string[]) => {
    const fits = variantTotal([...others, { ...option, values }]) <= maxVariants
    setTooMany(!fits)
    return fits
  }

  return (
    <div className="option-row">
      <div className="field option-row__name">
        <label htmlFor={`${uid}-name`}>{t('productOptionName')}</label>
        <input id={`${uid}-name`} className="input" list="option-names" maxLength={50} autoComplete="off" aria-invalid={nameBad ? true : undefined} value={option.name} onKeyDown={stayInForm} onChange={(e) => onChange({ ...option, name: e.target.value })} />
      </div>
      <div className="field option-row__values">
        <label htmlFor={`${uid}-values`}>{t('productOptionValues')}</label>
        <ChipsInput id={`${uid}-values`} max={50} maxLength={100} placeholder={t('productOptionHint')} values={option.values} accepts={accepts} onChange={(values) => onChange({ ...option, values })} />
        {tooMany && <p className="field__help field__help--error" role="alert">{t('productTooManyVariants')}</p>}
      </div>
      <div className="option-row__actions">
        <Button onClick={onRemove}><Trash2 size={14} aria-hidden="true" />{t('productRemoveOption')}</Button>
        <Button onClick={() => (option.values.length === 0 ? onRemove() : setEditing(false))}>{t('productOptionDone')}</Button>
      </div>
    </div>
  )
}
