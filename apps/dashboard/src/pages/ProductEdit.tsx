import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ArrowLeft, CirclePlus, ImagePlus, Plus, Star, Trash2, X } from 'lucide-react'
import { useCurrentStore, useStorePath } from '../account-context'
import { api, errorCode, type MediaItem } from '../api'
import { MediaPicker } from '../components/MediaPicker'
import { Badge, Button, Field, Notice, Skeleton } from '../components/ui'
import { errorLabel, useLang } from '../i18n'
import { maxVariants, parseAmount, variantsFor, variantTotal, type Option, type VariantDraft } from '../product-form'

type Status = 'active' | 'draft'
type Saved = {
  id: string; name: string; description: string; status: Status; options: Option[]; media: MediaItem[]
  variants: { id: string; options: string[]; price: number; comparePrice: number | null; cost: number | null; sku: string; stock: number | null }[]
}
type Form = { name: string; description: string; status: Status; options: Option[]; variants: VariantDraft[]; media: MediaItem[] }

const maxImages = 20
const text = (n: number | null) => (n === null ? '' : String(n))
const blank = (): Form => ({ name: '', description: '', status: 'active', options: [], variants: variantsFor([], []), media: [] })
const toForm = (p: Saved): Form => ({
  name: p.name,
  description: p.description,
  status: p.status,
  options: p.options,
  media: p.media,
  variants: p.variants.map((v) => ({ id: v.id, options: v.options, price: text(v.price), comparePrice: text(v.comparePrice), cost: text(v.cost), sku: v.sku, stock: text(v.stock) })),
})
// Blank is fine for everything except the selling price.
const badAmount = (value: string, required = false) => (value.trim() === '' ? required : parseAmount(value) === null)
const optional = (value: string) => (value.trim() === '' ? null : parseAmount(value))

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
  const [form, setForm] = useState<Form | null>(id ? null : blank())
  const [baseline, setBaseline] = useState(() => JSON.stringify(blank()))
  const [loadFailed, setLoadFailed] = useState(false)
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [justSaved, setJustSaved] = useState(false)
  const [picking, setPicking] = useState(false)
  const [confirming, setConfirming] = useState(false)

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
  }
  const setOptions = (options: Option[]) => change({ options, variants: variantsFor(options, form.variants) })
  const setVariant = (index: number, changes: Partial<VariantDraft>) => change({ variants: form.variants.map((v, i) => (i === index ? { ...v, ...changes } : v)) })

  const usedOptions = form.options.filter((o) => o.values.length > 0)
  const optionNameBad = (option: Option) => option.values.length > 0 && (!option.name.trim() || usedOptions.filter((o) => o.name.trim() === option.name.trim()).length > 1)
  const hasErrors = !form.name.trim()
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
        options: usedOptions,
        mediaIds: form.media.map((m) => m.id),
        variants: form.variants.map((v) => ({
          id: v.id,
          options: v.options,
          price: parseAmount(v.price),
          comparePrice: optional(v.comparePrice),
          sku: v.sku,
          stock: optional(v.stock),
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
  const profit = seesCost && typeof singlePrice === 'number' && singlePrice > 0 && typeof singleCost === 'number' ? singlePrice - singleCost : null
  const prices = form.variants.map((v) => parseAmount(v.price)).filter((n) => n !== null)
  const stockCounts = form.variants.map((v) => parseAmount(v.stock)).filter((n) => n !== null)
  const invalid = (bad: boolean) => (tried && bad ? t('productBadNumber') : undefined)

  return (
    <form className="page page--detail" onSubmit={(e) => void save(e)} noValidate>
      <title>{form.name || t('productNew')}</title>
      <header className="detail-head">
        <div className="detail-head__title">
          <Link className="detail-head__back" to={path('/products')} aria-label={t('productBack')} title={t('productBack')}><ArrowLeft size={16} aria-hidden="true" /></Link>
          <h1>{id ? (baselineName(baseline) || t('productNew')) : t('productNew')}</h1>
          <Badge tone={form.status === 'active' ? 'success' : 'neutral'}>{t(form.status === 'active' ? 'productStatusActive' : 'productStatusDraft')}</Badge>
        </div>
        <div className="detail-head__actions">
          {dirty && <Button onClick={discard}>{t('productDiscard')}</Button>}
          <Button type="submit" variant="primary" aria-busy={busy} disabled={busy || (Boolean(id) && !dirty)}>{t('productSave')}</Button>
        </div>
      </header>

      {justSaved && <p className="success-note" role="status">{t('productSaved')}</p>}
      {error && <p className="form-error" role="alert">{t(error === 'productFix' ? 'productFix' : errorLabel(error))}</p>}

      <div className="detail-layout">
        <div className="detail-layout__main">
          <section className="card">
            <h2>{t('productDetails')}</h2>
            <Field id="product-name" name="name" label={t('productName')} maxLength={200} autoComplete="off" value={form.name} error={tried && !form.name.trim() ? t('errNameRequired') : undefined} onChange={(e) => change({ name: e.target.value })} />
            <div className="field">
              <label htmlFor="product-description">{t('productDescription')}</label>
              <textarea id="product-description" name="description" className="input input--area" rows={5} maxLength={20000} value={form.description} onChange={(e) => change({ description: e.target.value })} />
            </div>
          </section>

          <section className="card">
            <div>
              <h2>{t('productImages')}</h2>
              <p className="muted">{t('productImagesHelp')}</p>
            </div>
            {form.media.length === 0
              ? (
                <button type="button" className="media__empty" onClick={() => setPicking(true)}>
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
                        <button type="button" aria-label={t('productRemoveImage')} title={t('productRemoveImage')} onClick={() => change({ media: form.media.filter((x) => x.id !== item.id) })}>
                          <X size={14} aria-hidden="true" />
                        </button>
                      </div>
                    </li>
                  ))}
                  {form.media.length < maxImages && (
                    <li>
                      <button type="button" className="product-images__add" aria-label={t('productPickImages')} title={t('productPickImages')} onClick={() => setPicking(true)}>
                        <Plus size={18} aria-hidden="true" />
                      </button>
                    </li>
                  )}
                </ul>
              )}
          </section>

          {single && (
            <section className="card">
              <h2>{t('productPriceStock')}</h2>
              <div className="price-grid">
                <Field id="price" label={t('productPrice')} inputMode="numeric" autoComplete="off" value={single.price} error={tried && badAmount(single.price, true) ? t('productPriceRequired') : undefined} onChange={(e) => setVariant(0, { price: e.target.value })} />
                <Field id="compare-price" label={t('productOldPrice')} inputMode="numeric" autoComplete="off" value={single.comparePrice} error={invalid(badAmount(single.comparePrice))} help={t('productOldPriceHelp')} onChange={(e) => setVariant(0, { comparePrice: e.target.value })} />
                {seesCost && <Field id="cost" label={t('productCost')} inputMode="numeric" autoComplete="off" value={single.cost} error={invalid(badAmount(single.cost))} help={t('productCostHelp')} onChange={(e) => setVariant(0, { cost: e.target.value })} />}
              </div>
              <div className="price-grid">
                <Field id="stock" label={t('productStock')} inputMode="numeric" autoComplete="off" value={single.stock} error={invalid(badAmount(single.stock))} help={t('productStockHelp')} onChange={(e) => setVariant(0, { stock: e.target.value })} />
                <Field id="sku" label={t('productSku')} maxLength={100} autoComplete="off" value={single.sku} onChange={(e) => setVariant(0, { sku: e.target.value })} />
              </div>
            </section>
          )}

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
                  <div className="variant-table">
                    <table>
                      <thead>
                        <tr>
                          <th scope="col">{t('productVariant')}</th>
                          <th scope="col">{t('productPrice')}</th>
                          <th scope="col">{t('productOldPrice')}</th>
                          {seesCost && <th scope="col">{t('productCost')}</th>}
                          <th scope="col">{t('productStock')}</th>
                          <th scope="col">{t('productSku')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {form.variants.map((v, i) => {
                          const label = v.options.join(' / ')
                          const cell = (name: 'price' | 'comparePrice' | 'cost' | 'stock', title: string, bad: boolean) => (
                            <td><input className="input" inputMode="numeric" autoComplete="off" aria-label={`${label}: ${title}`} aria-invalid={tried && bad ? true : undefined} value={v[name]} onChange={(e) => setVariant(i, { [name]: e.target.value })} /></td>
                          )
                          return (
                            <tr key={JSON.stringify(v.options)}>
                              <th scope="row">{label}</th>
                              {cell('price', t('productPrice'), badAmount(v.price, true))}
                              {cell('comparePrice', t('productOldPrice'), badAmount(v.comparePrice))}
                              {seesCost && cell('cost', t('productCost'), badAmount(v.cost))}
                              {cell('stock', t('productStock'), badAmount(v.stock))}
                              <td><input className="input" maxLength={100} autoComplete="off" aria-label={`${label}: ${t('productSku')}`} value={v.sku} onChange={(e) => setVariant(i, { sku: e.target.value })} /></td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="variant-foot">
                    <span>{t('productVariantTotal', { n: num(form.variants.length) })}{stockCounts.length > 0 && `, ${t('productStockTotal', { n: num(stockCounts.reduce((a, b) => a + b, 0)) })}`}</span>
                    <span>{seesCost ? `${t('productCostHelp')} ${t('productStockHelp')}` : t('productStockHelp')}</span>
                  </div>
                </>
              )}
            </div>
          </section>
        </div>

        <aside className="detail-side">
          <section className="card">
            <div className="field">
              <label htmlFor="product-status">{t('productStatus')}</label>
              <select id="product-status" name="status" className="input" value={form.status} onChange={(e) => change({ status: e.target.value as Status })}>
                <option value="active">{t('productStatusActive')}</option>
                <option value="draft">{t('productStatusDraft')}</option>
              </select>
              <p className="field__help">{t('productStatusHelp')}</p>
            </div>
          </section>

          <section className="card">
            <h2>{t('productSummary')}</h2>
            <dl className="media-details__facts">
              <div><dt className="muted">{t('productPriceCol')}</dt><dd>{prices.length === 0 ? '-' : Math.min(...prices) === Math.max(...prices) ? money(prices[0]) : `${money(Math.min(...prices))} – ${money(Math.max(...prices))}`}</dd></div>
              {profit !== null && <div><dt className="muted">{t('productProfitLabel')}</dt><dd>{money(profit)} ({num(Math.round((profit / singlePrice!) * 100))}%)</dd></div>}
              <div><dt className="muted">{t('productStockCol')}</dt><dd>{stockCounts.length > 0 ? num(stockCounts.reduce((a, b) => a + b, 0)) : t('productUntracked')}</dd></div>
              <div><dt className="muted">{t('productVariantsCol')}</dt><dd>{num(form.variants.length)}</dd></div>
              <div><dt className="muted">{t('productImages')}</dt><dd>{num(form.media.length)}</dd></div>
            </dl>
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

      {picking && (
        <MediaPicker
          selected={form.media}
          max={maxImages}
          onClose={() => setPicking(false)}
          onDone={(media) => {
            change({ media })
            setPicking(false)
          }}
        />
      )}
    </form>
  )
}

const baselineName = (baseline: string) => (JSON.parse(baseline) as Form).name

function OptionRow({ option, nameBad, others, onChange, onRemove }: { option: Option; nameBad: boolean; others: Option[]; onChange: (option: Option) => void; onRemove: () => void }) {
  const { t } = useLang()
  const uid = useId()
  const [draft, setDraft] = useState('')
  const [tooMany, setTooMany] = useState(false)

  // Commits on Enter, a comma or leaving the box. Refuses a value that would pass the variant limit.
  const commit = (raw: string) => {
    const added = raw.split(/[,،]/).map((v) => v.trim().slice(0, 100)).filter((v) => v && !option.values.includes(v))
    const values = [...option.values, ...new Set(added)].slice(0, 50)
    if (variantTotal([...others, { ...option, values }]) > maxVariants) {
      setTooMany(true)
      return
    }
    setTooMany(false)
    setDraft('')
    if (values.length !== option.values.length) onChange({ ...option, values })
  }

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      commit(draft)
    } else if (e.key === 'Backspace' && !draft && option.values.length > 0) {
      onChange({ ...option, values: option.values.slice(0, -1) })
    }
  }

  return (
    <div className="option-row">
      <div className="field option-row__name">
        <label htmlFor={`${uid}-name`}>{t('productOptionName')}</label>
        <input id={`${uid}-name`} className="input" list="option-names" maxLength={50} autoComplete="off" aria-invalid={nameBad ? true : undefined} value={option.name} onChange={(e) => onChange({ ...option, name: e.target.value })} />
      </div>
      <div className="field option-row__values">
        <label htmlFor={`${uid}-values`}>{t('productOptionValues')}</label>
        <div className="chips">
          {option.values.map((value) => (
            <span key={value} className="chip">
              {value}
              <button type="button" aria-label={t('productRemoveValue', { value })} onClick={() => onChange({ ...option, values: option.values.filter((v) => v !== value) })}><X size={12} aria-hidden="true" /></button>
            </span>
          ))}
          <input id={`${uid}-values`} autoComplete="off" placeholder={option.values.length === 0 ? t('productOptionHint') : undefined} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={onKey} onBlur={() => commit(draft)} />
        </div>
        {tooMany && <p className="field__help field__help--error" role="alert">{t('productTooManyVariants')}</p>}
      </div>
      <button type="button" className="media__dismiss option-row__remove" aria-label={t('productRemoveOption')} title={t('productRemoveOption')} onClick={onRemove}><Trash2 size={16} aria-hidden="true" /></button>
    </div>
  )
}
