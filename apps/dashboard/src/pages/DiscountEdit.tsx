import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { ArrowLeft, CircleCheck, Plus, Trash2, X } from 'lucide-react'
import { useCurrentStore, useStorePath } from '../account-context'
import { api, errorCode } from '../api'
import { ProductPicker, type ProductRow } from '../components/ProductPicker'
import { Badge, Button, Field, Notice, PageTitle, Skeleton } from '../components/ui'
import { describeDiscount, discountStatus, statusInfo, typeLabel, type Discount, type DiscountType } from '../discounts'
import { errorLabel, useLang, type Key } from '../i18n'

type Form = {
  type: DiscountType; method: 'code' | 'automatic'; code: string; title: string; kind: 'percent' | 'amount'; value: string
  appliesAll: boolean; getProducts: ProductRow[]; buysAll: boolean; buyProducts: ProductRow[]
  buyQty: string; getQty: string; at: 'free' | 'percent'; maxPerOrder: string
  min: 'none' | 'amount' | 'qty'; minSubtotal: string; minQty: string
  limitTotal: boolean; maxUses: string; oncePerPhone: boolean; startsAt: string; hasEnd: boolean; endsAt: string
}

const digits = (text: string) => text.replace(/[০-৯]/g, (d) => String('০১২৩৪৫৬৭৮৯'.indexOf(d))).replace(/\D/g, '')
const types: DiscountType[] = ['order', 'products', 'bxgy', 'shipping']
// datetime-local inputs work in the browser's own time; the API stores instants.
const toLocal = (iso: string) => {
  const d = new Date(iso)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}
// No 0/O or 1/I, so a code read out on the phone is typed right.
const newCode = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), (n) => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[n % 32]).join('')

function blank(type: DiscountType): Form {
  return {
    type, method: type === 'bxgy' ? 'automatic' : 'code', code: '', title: '', kind: 'percent', value: '',
    appliesAll: type !== 'products', getProducts: [], buysAll: true, buyProducts: [],
    buyQty: '1', getQty: '1', at: 'free', maxPerOrder: '',
    min: 'none', minSubtotal: '', minQty: '', limitTotal: false, maxUses: '', oncePerPhone: false,
    startsAt: toLocal(new Date().toISOString()), hasEnd: false, endsAt: '',
  }
}

function toForm(d: Discount): Form {
  return {
    type: d.type, method: d.code ? 'code' : 'automatic', code: d.code ?? '', title: d.title, kind: d.kind, value: d.type === 'bxgy' && d.value === 100 ? '' : String(d.value),
    appliesAll: d.appliesAll, getProducts: d.getProducts ?? [], buysAll: d.buysAll, buyProducts: d.buyProducts ?? [],
    buyQty: String(d.buyQty ?? 1), getQty: String(d.getQty ?? 1), at: d.type === 'bxgy' && d.value < 100 ? 'percent' : 'free', maxPerOrder: d.maxPerOrder ? String(d.maxPerOrder) : '',
    min: d.minSubtotal > 0 ? 'amount' : d.minQty > 0 ? 'qty' : 'none', minSubtotal: d.minSubtotal ? String(d.minSubtotal) : '', minQty: d.minQty ? String(d.minQty) : '',
    limitTotal: d.maxUses !== null, maxUses: d.maxUses ? String(d.maxUses) : '', oncePerPhone: d.oncePerPhone,
    startsAt: toLocal(d.startsAt), hasEnd: d.endsAt !== null, endsAt: d.endsAt ? toLocal(d.endsAt) : '',
  }
}

const whole = (text: string) => (text ? Number(text) : 0)

function toBody(f: Form) {
  return {
    type: f.type, method: f.method, code: f.code, title: f.title, kind: f.kind,
    value: f.type === 'bxgy' ? (f.at === 'free' ? 100 : whole(f.value)) : f.type === 'shipping' ? 100 : whole(f.value),
    appliesAll: f.appliesAll, getProducts: f.appliesAll ? [] : f.getProducts.map((p) => p.id),
    buysAll: f.buysAll, buyProducts: f.buysAll ? [] : f.buyProducts.map((p) => p.id),
    ...(f.type === 'bxgy' ? { buyQty: whole(f.buyQty), getQty: whole(f.getQty), maxPerOrder: f.maxPerOrder ? whole(f.maxPerOrder) : null } : {}),
    minSubtotal: f.min === 'amount' ? whole(f.minSubtotal) : 0, minQty: f.min === 'qty' ? whole(f.minQty) : 0,
    maxUses: f.limitTotal ? whole(f.maxUses) : null, oncePerPhone: f.oncePerPhone,
    startsAt: new Date(f.startsAt).toISOString(), endsAt: f.hasEnd && f.endsAt ? new Date(f.endsAt).toISOString() : null,
  }
}

// What is still missing before the API would accept it, shown under each field once Save is pressed.
function problemsOf(f: Form) {
  const percent = f.type === 'bxgy' || f.kind === 'percent'
  const value = whole(f.value)
  return {
    code: f.method === 'code' && !/^[A-Z0-9]{2,30}$/.test(f.code),
    title: f.method === 'automatic' && !f.title.trim(),
    value: f.type !== 'shipping' && !(f.type === 'bxgy' && f.at === 'free') && (value < 1 || (percent && value > 100)),
    getProducts: (f.type === 'products' || f.type === 'bxgy') && !f.appliesAll && f.getProducts.length === 0,
    buyProducts: f.type === 'bxgy' && !f.buysAll && f.buyProducts.length === 0,
    buyQty: f.type === 'bxgy' && !(whole(f.buyQty) >= 1 && whole(f.buyQty) <= 100),
    getQty: f.type === 'bxgy' && !(whole(f.getQty) >= 1 && whole(f.getQty) <= 100),
    min: (f.min === 'amount' && whole(f.minSubtotal) < 1) || (f.min === 'qty' && whole(f.minQty) < 1),
    maxUses: f.limitTotal && whole(f.maxUses) < 1,
    dates: !f.startsAt || (f.hasEnd && (!f.endsAt || new Date(f.endsAt) <= new Date(f.startsAt))),
  }
}

export function DiscountEdit() {
  const lang = useLang()
  const { t, num, money } = lang
  const { id } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const path = useStorePath()
  const current = useCurrentStore()!
  const base = `/stores/${current.store.handle}/discounts`
  const startType = types.includes(params.get('type') as DiscountType) ? params.get('type') as DiscountType : 'order'
  const [saved, setSaved] = useState<Discount | null>(null)
  const [form, setForm] = useState<Form | null>(id ? null : blank(startType))
  const [baseline, setBaseline] = useState(id ? '' : JSON.stringify(blank(startType)))
  const [failed, setFailed] = useState(false)
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [justSaved, setJustSaved] = useState(false)
  const [picking, setPicking] = useState<'get' | 'buy' | null>(null)
  const [confirming, setConfirming] = useState(false)
  const loaded = useRef<string | null>(null)

  const show = (d: Discount) => {
    const next = toForm(d)
    setSaved(d)
    setForm(next)
    setBaseline(JSON.stringify(next))
  }

  useEffect(() => {
    if (!id || loaded.current === id) return
    loaded.current = id
    setFailed(false)
    api<Discount>(`${base}/${id}`).then(show, () => setFailed(true))
  }, [id, base])

  useEffect(() => {
    if (!justSaved) return
    const timer = setTimeout(() => setJustSaved(false), 4000)
    return () => clearTimeout(timer)
  }, [justSaved])

  if (failed) return <div className="page page--detail"><section className="card card--flush"><Notice role="alert" title={t('discLoadFailed')} action={<Button onClick={() => { loaded.current = null; setFailed(false) }}>{t('retry')}</Button>} /></section></div>
  if (!form) return <div className="page page--detail" role="status" aria-label={t('loading')}><Skeleton width="16rem" /><section className="card"><Skeleton /><Skeleton width="60%" /></section></div>

  const change = (patch: Partial<Form>) => setForm({ ...form, ...patch })
  const dirty = JSON.stringify(form) !== baseline
  const problems = problemsOf(form)
  const show_ = (key: keyof typeof problems) => tried && problems[key]
  const canDelete = current.role !== 'staff'

  const save = async (e: FormEvent) => {
    e.preventDefault()
    setTried(true)
    setError(null)
    if (Object.values(problems).some(Boolean)) {
      setError('productFix')
      return
    }
    setBusy(true)
    try {
      const result = await api<Discount>(id ? `${base}/${id}` : base, { method: id ? 'PUT' : 'POST', body: toBody(form) })
      show(result)
      setTried(false)
      setJustSaved(true)
      if (!id) {
        loaded.current = result.id
        navigate(path(`/discounts/${result.id}`), { replace: true })
      }
    } catch (err) {
      setError(errorCode(err))
    } finally {
      setBusy(false)
    }
  }

  const toggle = async () => {
    if (!saved) return
    setError(null)
    try {
      const row = await api<Discount>(`${base}/${saved.id}`, { method: 'PATCH', body: { active: !saved.active } })
      setSaved({ ...saved, active: row.active })
    } catch (err) {
      setError(errorCode(err))
    }
  }

  const remove = async () => {
    setError(null)
    try {
      await api(`${base}/${id}`, { method: 'DELETE' })
      navigate(path('/discounts'), { replace: true })
    } catch (err) {
      setConfirming(false)
      setError(errorCode(err))
    }
  }

  // The summary reads the form as it is now, so the seller sees the offer before saving.
  const preview: Discount = {
    ...(saved ?? { id: '', uses: 0, active: true, createdAt: '' }),
    ...toBody(form), code: form.method === 'code' ? form.code || null : null, kind: form.type === 'bxgy' || form.type === 'shipping' ? 'percent' : form.kind,
    buyQty: whole(form.buyQty), getQty: whole(form.getQty), maxPerOrder: form.maxPerOrder ? whole(form.maxPerOrder) : null,
    getProducts: form.getProducts, buyProducts: form.buyProducts, getCount: undefined, buyCount: undefined,
  } as Discount
  const name = form.method === 'code' ? form.code : form.title
  const status = saved && statusInfo[discountStatus(saved)]
  const listed = form.type === 'products' || form.type === 'bxgy'

  const products = (role: 'get' | 'buy') => {
    const items = role === 'get' ? form.getProducts : form.buyProducts
    const key = role === 'get' ? 'getProducts' : 'buyProducts'
    return (
      <div className="discount-products">
        {items.length > 0 && (
          <ul className="collection-products">
            {items.map((p) => (
              <li key={p.id}>
                <span className="data-table__thumb">{p.thumbUrl && <img src={p.thumbUrl} alt="" loading="lazy" />}</span>
                <span className="collection-products__name" title={p.name}>{p.name}</span>
                <span className="collection-products__price">{p.minPrice === p.maxPrice ? money(p.minPrice) : `${money(p.minPrice)} – ${money(p.maxPrice)}`}</span>
                <button type="button" className="media__dismiss" aria-label={t('discRemoveProduct', { value: p.name })} title={t('discRemoveProduct', { value: p.name })} onClick={() => change({ [key]: items.filter((x) => x.id !== p.id) })}><X size={16} aria-hidden="true" /></button>
              </li>
            ))}
          </ul>
        )}
        <div><Button onClick={() => setPicking(role)}><Plus size={16} aria-hidden="true" />{t(items.length ? 'discChangeProducts' : 'discPickProducts')}</Button></div>
        {show_(key) && <p className="field__help field__help--error" role="alert">{t('errDiscountProductsRequired')}</p>}
      </div>
    )
  }

  const segmented = <T extends string>(name: string, value: T, options: [T, Key][], onChange: (v: T) => void) => (
    <div className="segmented" role="radiogroup">
      {options.map(([v, label]) => (
        <label key={v}><input type="radio" name={`disc-${name}`} value={v} checked={value === v} onChange={() => onChange(v)} /><span>{t(label)}</span></label>
      ))}
    </div>
  )
  const box = (key: 'limitTotal' | 'oncePerPhone' | 'hasEnd', label: Key, help?: Key, extra?: ReactNode) => (
    <div className="switch-row switch-row--with-field">
      <input id={`disc-${key}`} type="checkbox" className="check" checked={form[key]} onChange={(e) => change({ [key]: e.target.checked })} />
      <span className="switch-row__text">
        <label htmlFor={`disc-${key}`} className="switch-row__title">{t(label)}</label>
        {help && <span className="muted">{t(help)}</span>}
        {form[key] && extra}
      </span>
    </div>
  )

  // Minimum purchase: inside the Value card where there is one, its own card for buy X get Y.
  const minimum = (
    <div className="discount-row">
      {segmented('min', form.min, [['none', 'discMinNone'], ['amount', 'discMinAmountShort'], ['qty', 'discMinQtyShort']], (min) => change({ min }))}
      {form.min === 'amount' && <div className="discount-num">
        <Field id="disc-min-amount" label={t('discMinAmount')} unit="৳" inputMode="numeric" value={form.minSubtotal} error={show_('min') ? t('discNumberInvalid') : undefined} onChange={(e) => change({ minSubtotal: digits(e.target.value).slice(0, 7) })} />
      </div>}
      {form.min === 'qty' && <div className="discount-num">
        <Field id="disc-min-qty" label={t('discMinQty')} inputMode="numeric" value={form.minQty} error={show_('min') ? t('discNumberInvalid') : undefined} onChange={(e) => change({ minQty: digits(e.target.value).slice(0, 4) })} />
      </div>}
    </div>
  )

  return (
    <form className="page page--detail" onSubmit={(e) => void save(e)} noValidate>
      <PageTitle title={name || t('discNew')} />
      <header className="detail-head">
        <div className="detail-head__title">
          <Link className="detail-head__back" to={path('/discounts')} aria-label={t('discBack')} title={t('discBack')}><ArrowLeft size={16} aria-hidden="true" /></Link>
          <h1>{saved ? (saved.code ?? saved.title) : t(typeLabel(form.type))}</h1>
          {status && <Badge tone={status.tone}>{t(status.label)}</Badge>}
        </div>
        <div className="detail-head__actions">
          {dirty && id && <Button onClick={() => { setForm(JSON.parse(baseline) as Form); setTried(false); setError(null) }}>{t('productDiscard')}</Button>}
          <Button type="submit" variant="primary" aria-busy={busy} disabled={busy || (Boolean(id) && !dirty)}>{t('productSave')}</Button>
        </div>
      </header>

      {error && <p className="form-error" role="alert">{t(error === 'productFix' ? 'productFix' : errorLabel(error))}</p>}

      <div className="detail-layout">
        <div className="detail-layout__main discount-form">
          <section className="card card--form">
            <div>
              <h2>{t(typeLabel(form.type))}</h2>
              <p className="muted">{t(`${typeLabel(form.type)}D` as Key)}</p>
            </div>
            <div className="field">
              <span className="field__label">{t('discMethod')}</span>
              {segmented('method', form.method, [['code', 'discMethodCode'], ['automatic', 'discMethodAuto']], (method) => change({ method }))}
              <p className="field__help">{t(form.method === 'code' ? 'discMethodCodeD' : 'discMethodAutoD')}</p>
            </div>
            {form.method === 'code'
              ? <div className="field-action">
                  <Field id="disc-code" label={t('discCode')} help={t('discCodeHelp')} maxLength={30} autoComplete="off" value={form.code}
                    error={show_('code') ? t('errCouponCodeInvalid') : undefined} onChange={(e) => change({ code: e.target.value.toUpperCase().replace(/\s/g, '') })} />
                  <Button onClick={() => change({ code: newCode() })}>{t('discGenerate')}</Button>
                </div>
              : <Field id="disc-title" label={t('discTitle')} help={t('discTitleHelp')} maxLength={100} value={form.title}
                  error={show_('title') ? t('errDiscountTitleRequired') : undefined} onChange={(e) => change({ title: e.target.value })} />}
          </section>

          {(form.type === 'order' || form.type === 'products') && (
            <section className="card card--form">
              <h2>{t('discValueTitle')}</h2>
              <div className="discount-row">
                {segmented('kind', form.kind, [['percent', 'discPercent'], ['amount', 'discAmount']], (kind) => change({ kind }))}
                <div className="discount-num">
                  <Field id="disc-value" label={t('discValue')} unit={form.kind === 'percent' ? '%' : '৳'} inputMode="numeric" value={form.value}
                    error={show_('value') ? t('discNumberInvalid') : undefined} onChange={(e) => change({ value: digits(e.target.value).slice(0, 7) })} />
                </div>
              </div>
              {form.type === 'products' && form.kind === 'amount' && <p className="field__help">{t('discAmountEach')}</p>}
              {form.type === 'products' && (
                <div className="field">
                  <span className="field__label">{t('discAppliesTo')}</span>
                  {segmented('applies', form.appliesAll ? 'all' : 'some', [['all', 'discAllProducts'], ['some', 'discSpecificProducts']], (v) => change({ appliesAll: v === 'all' }))}
                  {!form.appliesAll && products('get')}
                </div>
              )}
              <div className="form-section"><h3>{t('discMinTitle')}</h3>{minimum}</div>
            </section>
          )}

          {form.type === 'bxgy' && <>
            <section className="card card--form">
              <h2>{t('discBuys')}</h2>
              <div className="discount-row">
                <div className="discount-num">
                  <Field id="disc-buy-qty" label={t('discQty')} inputMode="numeric" value={form.buyQty} error={show_('buyQty') ? t('discNumberInvalid') : undefined} onChange={(e) => change({ buyQty: digits(e.target.value).slice(0, 3) })} />
                </div>
                {segmented('buys', form.buysAll ? 'all' : 'some', [['all', 'discAnyProducts'], ['some', 'discSpecificProducts']], (v) => change({ buysAll: v === 'all' }))}
              </div>
              {!form.buysAll && products('buy')}
            </section>
            <section className="card card--form">
              <div>
                <h2>{t('discGets')}</h2>
                <p className="muted">{t('discGetsHelp')}</p>
              </div>
              <div className="discount-row">
                <div className="discount-num">
                  <Field id="disc-get-qty" label={t('discQty')} inputMode="numeric" value={form.getQty} error={show_('getQty') ? t('discNumberInvalid') : undefined} onChange={(e) => change({ getQty: digits(e.target.value).slice(0, 3) })} />
                </div>
                {segmented('gets', form.appliesAll ? 'all' : 'some', [['all', 'discAnyProducts'], ['some', 'discSpecificProducts']], (v) => change({ appliesAll: v === 'all' }))}
              </div>
              {!form.appliesAll && products('get')}
              <div className="field">
                <span className="field__label">{t('discAt')}</span>
                <div className="discount-row">
                  {segmented('at', form.at, [['free', 'discFree'], ['percent', 'discPercentOff']], (at) => change({ at }))}
                  {form.at === 'percent' && <div className="discount-num">
                    <Field id="disc-at-value" label={t('discValue')} unit="%" inputMode="numeric" value={form.value} error={show_('value') ? t('discNumberInvalid') : undefined} onChange={(e) => change({ value: digits(e.target.value).slice(0, 3) })} />
                  </div>}
                </div>
              </div>
              <div className="discount-num discount-num--wide">
                <Field id="disc-per-order" label={t('discMaxPerOrder')} help={t('discMaxPerOrderHelp')} inputMode="numeric" value={form.maxPerOrder} onChange={(e) => change({ maxPerOrder: digits(e.target.value).slice(0, 3) })} />
              </div>
            </section>
          </>}

          {form.type === 'shipping' && (
            <section className="card card--form">
              <div>
                <h2>{t('discTypeShipping')}</h2>
                <p className="muted">{t('discShippingNote')}</p>
              </div>
              <div className="form-section"><h3>{t('discMinTitle')}</h3>{minimum}</div>
            </section>
          )}

          {form.type === 'bxgy' && <section className="card card--form"><h2>{t('discMinTitle')}</h2>{minimum}</section>}

          <section className="card card--form">
            <h2>{t('discLimits')}</h2>
            <div className="switch-list">
              {box('limitTotal', 'discLimitTotal', undefined,
                <div className="discount-num"><Field id="disc-max-uses" label={t('discLimits')} inputMode="numeric" value={form.maxUses} error={show_('maxUses') ? t('discNumberInvalid') : undefined} onChange={(e) => change({ maxUses: digits(e.target.value).slice(0, 7) })} /></div>)}
              {box('oncePerPhone', 'discOncePerPhone', 'discOncePerPhoneHelp')}
            </div>
          </section>

          <section className="card card--form">
            <h2>{t('discDates')}</h2>
            <div className="price-grid price-grid--two">
              <Field id="disc-starts" type="datetime-local" label={t('discStarts')} value={form.startsAt} onChange={(e) => change({ startsAt: e.target.value })} />
              {form.hasEnd && <Field id="disc-ends" type="datetime-local" label={t('discEnds')} value={form.endsAt} error={show_('dates') ? t('errDiscountDatesInvalid') : undefined} onChange={(e) => change({ endsAt: e.target.value })} />}
            </div>
            <label className="check-line"><input type="checkbox" className="check" checked={form.hasEnd} onChange={(e) => change({ hasEnd: e.target.checked })} />{t('discSetEnd')}</label>
          </section>
        </div>

        <aside className="detail-side">
          <section className="card detail-side__card">
            <h2>{t('discSummary')}</h2>
            <div className="discount-summary">
              <strong>{name || '—'}</strong>
              <span className="muted">{t(form.method === 'code' ? 'discMethodCode' : 'discMethodAuto')} · {t(typeLabel(form.type))}</span>
            </div>
            <ul className="discount-summary__lines">{describeDiscount(preview, lang).map((line) => <li key={line}>{line}</li>)}</ul>
            {saved && <p className="muted">{t('discUsedTimes', { n: num(saved.uses) })}</p>}
            {saved && <p className="card-note">{t('discEditNote')}</p>}
            {saved && <div><Button onClick={() => void toggle()}>{t(saved.active ? 'discTurnOff' : 'discTurnOn')}</Button></div>}
          </section>
          {saved && canDelete && (confirming
            ? (
              <section className="card">
                <p className="muted">{t('discDeleteWarning')}</p>
                <div className="row">
                  <Button onClick={() => setConfirming(false)}>{t('cancel')}</Button>
                  <Button variant="danger" onClick={() => void remove()}>{t('productConfirmDelete')}</Button>
                </div>
              </section>
            )
            : <button type="button" className="media-details__delete" onClick={() => setConfirming(true)}><Trash2 size={16} aria-hidden="true" />{t('discDeleteThis')}</button>)}
        </aside>
      </div>

      {picking && (
        <ProductPicker
          selected={picking === 'get' ? form.getProducts : form.buyProducts}
          max={100}
          onClose={() => setPicking(null)}
          onDone={(items) => {
            change(picking === 'get' ? { getProducts: items } : { buyProducts: items })
            setPicking(null)
          }}
        />
      )}

      <div className="toast-anchor" role="status">
        {justSaved && <p className="toast"><CircleCheck size={18} aria-hidden="true" />{t('discSaved')}</p>}
      </div>
    </form>
  )
}
