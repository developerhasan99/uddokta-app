import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { ArrowLeft, Pencil, Plus, Search, UserRound, X } from 'lucide-react'
import { readPhone } from 'storefront/schema'
import { useCurrentStore, useStorePath } from '../account-context'
import { api, errorCode } from '../api'
import { OrderLines, linesSubtotal, type Line } from '../components/OrderLines'
import { OrderTagsField } from '../components/OrderTags'
import { Button, Field, Notice, PageTitle } from '../components/ui'
import { errorLabel, useLang, type Key } from '../i18n'
import type { StoreSettingsData } from './StoreSettings'

type Customer = { phone: string; name: string; address: string; orders: number; delivered: number; returned: number }
const sources = ['messenger', 'whatsapp', 'phone', 'facebook_comment', 'instagram', 'shop', 'other'] as const

export function NewOrder() {
  const { t, money, num } = useLang()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const path = useStorePath()
  const handle = useCurrentStore()!.store.handle
  const [lines, setLines] = useState<Line[]>([])
  const [delivery, setDelivery] = useState<StoreSettingsData | null>(null)
  const [form, setForm] = useState(() => ({
    customerName: searchParams.get('name')?.slice(0, 100) ?? '', phone: searchParams.get('phone')?.slice(0, 20) ?? '',
    address: searchParams.get('address')?.slice(0, 500) ?? '', area: 'inside', source: searchParams.get('phone') ? 'phone' : 'messenger', note: '', coupon: '', tags: [] as string[],
  }))
  const [couponOpen, setCouponOpen] = useState(false)
  const [known, setKnown] = useState<Customer | null>(null)
  const [filled, setFilled] = useState(false)
  const [picked, setPicked] = useState(false)
  const [editing, setEditing] = useState(false)
  const recoveryProduct = searchParams.get('product')?.slice(0, 300) ?? ''
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const formRef = useRef(form)
  formRef.current = form

  useEffect(() => {
    api<StoreSettingsData>(`/stores/${handle}/settings`).then(setDelivery).catch(() => {})
  }, [handle])

  // A number that has ordered before: show their record, and fill name and address only if still empty.
  const mobile = readPhone(form.phone)
  useEffect(() => {
    setKnown(null)
    setFilled(false)
    if (!mobile) return
    let live = true
    api<{ items: Customer[] }>(`/stores/${handle}/customers?q=${mobile}`).then(({ items }) => {
      const match = items.find((c) => c.phone === mobile)
      if (!live || !match) return
      setKnown(match)
      const current = formRef.current
      if (!current.customerName.trim() && !current.address.trim()) {
        setForm({ ...current, customerName: match.name, address: match.address })
        setFilled(true)
      }
    }).catch(() => {})
    return () => { live = false }
  }, [mobile, handle])

  const set = (changes: Partial<typeof form>) => setForm({ ...form, ...changes })
  const subtotal = linesSubtotal(lines)
  const units = lines.reduce((sum, line) => sum + line.quantity, 0)
  const charges = { inside: delivery?.deliveryInside ?? 0, outside: delivery?.deliveryOutside ?? 0 }
  const charge = form.area === 'outside' ? charges.outside : charges.inside
  const problems = {
    lines: lines.length === 0,
    name: !form.customerName.trim(),
    phone: !mobile,
    address: !form.address.trim(),
  }

  const save = async (e: FormEvent) => {
    e.preventDefault()
    setTried(true)
    setError(null)
    if (Object.values(problems).some(Boolean)) return
    setBusy(true)
    try {
      const items = lines.map((line) => ({ variantId: line.variantId, quantity: line.quantity }))
      const order = await api<{ id: string }>(`/stores/${handle}/orders`, { method: 'POST', body: { ...form, items } })
      navigate(path(`/orders/${order.id}`), { replace: true })
    } catch (err) {
      setError(errorCode(err))
      setBusy(false)
    }
  }

  return (
    <form className="page page--detail new-order" onSubmit={(e) => void save(e)} noValidate>
      <PageTitle title={t('newOrder')} />
      <header className="detail-head">
        <div className="detail-head__title">
          <Link className="detail-head__back" to={path('/orders')} aria-label={t('orderBack')} title={t('orderBack')}><ArrowLeft size={16} aria-hidden="true" /></Link>
          <h1>{t('newOrder')}</h1>
        </div>
        <div className="detail-head__actions">
          <Button type="submit" variant="primary" disabled={busy} aria-busy={busy}>{t(busy ? 'loading' : 'newOrderSave')}</Button>
        </div>
      </header>
      {recoveryProduct && <Notice title={t('draftsRecoveryTitle')} body={t('draftsRecoveryProduct', { product: recoveryProduct })} />}
      {error && <p className="form-error" role="alert">{t(errorLabel(error))}</p>}

      <div className="detail-layout">
        <div className="detail-layout__main">
          <section className="card new-order__products" aria-labelledby="order-products-title">
            <h2 id="order-products-title">{t('products')}</h2>
            <OrderLines handle={handle} lines={lines} onChange={setLines} invalid={tried && problems.lines} />
          </section>

          <section className="card" aria-labelledby="order-payment-title">
            <h2 id="order-payment-title">{t('newOrderPayment')}</h2>
            <dl className="order-sum">
              <div><dt>{t('orderSubtotal')} <span className="muted">{t('newOrderItems', { n: num(units) })}</span></dt><dd className="num">{money(subtotal)}</dd></div>
              <div>
                <dt>{t('orderDelivery')}</dt>
                <dd>
                  <span className="segmented" role="radiogroup" aria-label={t('newOrderArea')}>
                    {(['inside', 'outside'] as const).map((a) => <label key={a}><input type="radio" name="area" checked={form.area === a} onChange={() => set({ area: a })} /><span>{t(a === 'inside' ? 'orderInside' : 'orderOutside')} · <span className="num">{money(charges[a])}</span></span></label>)}
                  </span>
                </dd>
              </div>
              <div>
                <dt>{t('newOrderCouponShort')}</dt>
                <dd>{couponOpen || form.coupon
                  ? <input className="input input--compact order-sum__coupon" aria-label={t('newOrderCoupon')} maxLength={30} autoComplete="off" autoFocus={couponOpen && !form.coupon} value={form.coupon} onChange={(e) => set({ coupon: e.target.value.toUpperCase() })} />
                  : <button type="button" className="link-button" onClick={() => setCouponOpen(true)}><Plus size={14} aria-hidden="true" />{t('newOrderAddCoupon')}</button>}</dd>
              </div>
              <div className="order-sum__total"><dt>{t('orderCollect')}</dt><dd className="num">{money(subtotal + charge)}</dd></div>
            </dl>
            <p className="muted order-sum__note">{t('newOrderSummaryNote')}</p>
          </section>
        </div>

        <aside className="detail-side">
          <section className="card card--form" aria-labelledby="order-customer-title">
            <h2 id="order-customer-title">{t('orderCustomer')}</h2>
            {picked && !editing
              ? <div className="customer-picked">
                  <div className="customer-picked__head">
                    <strong>{form.customerName}</strong>
                    <span className="row">
                      <button type="button" className="btn btn--icon customer-picked__action" aria-label={t('newOrderEditCustomer')} onClick={() => setEditing(true)}><Pencil size={14} aria-hidden="true" /></button>
                      <button type="button" className="btn btn--icon customer-picked__action" aria-label={t('newOrderRemoveCustomer')} onClick={() => { setPicked(false); set({ customerName: '', phone: '', address: '' }) }}><X size={16} aria-hidden="true" /></button>
                    </span>
                  </div>
                  <span className="num">{form.phone}</span>
                  <span className="muted">{form.address}</span>
                  {known && <p className={known.returned > 0 ? 'customer-known customer-known--warn' : 'customer-known'}>
              <UserRound size={14} aria-hidden="true" />
              <span>{t('newOrderReturning', { orders: num(known.orders), delivered: num(known.delivered), returned: num(known.returned) })}</span>
            </p>}
                </div>
              : <>
                  {!picked && <CustomerSearch handle={handle} onPick={(c) => { setForm((current) => ({ ...current, customerName: c.name, phone: c.phone, address: c.address })); setPicked(true); setEditing(false) }} />}
                  <Field id="order-phone" label={t('newOrderPhone')} type="tel" inputMode="tel" maxLength={20} placeholder="01XXXXXXXXX" value={form.phone} error={tried && problems.phone ? t('errPhoneInvalid') : undefined} onChange={(e) => set({ phone: e.target.value })} />
                  <Field id="order-name" label={t('newOrderName')} maxLength={100} autoComplete="off" value={form.customerName} error={tried && problems.name ? t('errNameRequired') : undefined} onChange={(e) => set({ customerName: e.target.value })} />
                  <div className="field">
                    <label htmlFor="order-address">{t('newOrderAddress')}</label>
                    <textarea id="order-address" className="input input--area" rows={3} maxLength={500} aria-invalid={tried && problems.address ? true : undefined} value={form.address} onChange={(e) => set({ address: e.target.value })} />
                    {tried && problems.address && <p className="field__help field__help--error">{t('errAddressRequired')}</p>}
                  </div>
                  {known && <p className={known.returned > 0 ? 'customer-known customer-known--warn' : 'customer-known'}>
              <UserRound size={14} aria-hidden="true" />
              <span>{t('newOrderReturning', { orders: num(known.orders), delivered: num(known.delivered), returned: num(known.returned) })}{filled && <> {t('newOrderFilled')}</>}</span>
            </p>}
                </>}
          </section>

          <section className="card card--form" aria-labelledby="order-details-title">
            <h2 id="order-details-title">{t('newOrderDetails')}</h2>
            <div className="field">
              <label htmlFor="order-source">{t('newOrderSource')}</label>
              <select id="order-source" className="input" value={form.source} onChange={(e) => set({ source: e.target.value })}>
                {sources.map((s) => <option key={s} value={s}>{t(`source_${s}` as Key)}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="order-new-note">{t('orderNote')}</label>
              <textarea id="order-new-note" className="input input--area" rows={3} maxLength={2000} placeholder={t('orderNoteHint')} value={form.note} onChange={(e) => set({ note: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="order-new-tags">{t('orderTags')}</label>
              <OrderTagsField id="order-new-tags" handle={handle} values={form.tags} onChange={(tags) => setForm((current) => ({ ...current, tags }))} />
            </div>
          </section>
        </aside>
      </div>

    </form>
  )
}

// Past customers, found by name or number from earlier orders.
function CustomerSearch({ handle, onPick }: { handle: string; onPick: (customer: Customer) => void }) {
  const { t, num } = useLang()
  const [text, setText] = useState('')
  const [results, setResults] = useState<Customer[] | null>(null)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const query = text.trim()

  useEffect(() => {
    if (query.length < 2) { setResults(null); return }
    let live = true
    const timer = setTimeout(() => {
      api<{ items: Customer[] }>(`/stores/${handle}/customers?q=${encodeURIComponent(query)}`)
        .then(({ items }) => { if (live) { setResults(items.slice(0, 6)); setActive(0) } })
        .catch(() => { if (live) setResults([]) })
    }, 250)
    return () => { live = false; clearTimeout(timer) }
  }, [query, handle])

  const pick = (customer: Customer) => { onPick(customer); setText(''); setOpen(false) }
  const shown = open && results !== null
  return <div className="customer-search">
    <div className="search-field">
      <Search size={16} aria-hidden="true" />
      <input className="input" type="search" role="combobox" aria-expanded={shown} aria-controls="customer-results" aria-autocomplete="list"
        aria-activedescendant={shown && results.length ? `customer-result-${active}` : undefined}
        aria-label={t('newOrderFindCustomer')} placeholder={t('newOrderFindCustomer')} autoComplete="off" value={text}
        onChange={(e) => { setText(e.target.value); setOpen(true) }} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (!shown || !results.length) return
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive((active + 1) % results.length) }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((active - 1 + results.length) % results.length) }
          else if (e.key === 'Enter') { e.preventDefault(); pick(results[active]) }
          else if (e.key === 'Escape') setOpen(false)
        }} />
    </div>
    {shown && <ul id="customer-results" className="customer-search__list" role="listbox" aria-label={t('newOrderFindCustomer')}>
      {results.length === 0 && <li className="customer-search__empty">{t('newOrderNoCustomer')}</li>}
      {results.map((c, i) => <li key={c.phone} id={`customer-result-${i}`} role="option" aria-selected={i === active} className="customer-search__option"
        onMouseDown={(e) => { e.preventDefault(); pick(c) }} onMouseEnter={() => setActive(i)}>
        <span className="customer-search__name">{c.name}</span>
        <span className="muted num">{c.phone} · {t('newOrderCustomerOrders', { n: num(c.orders) })}</span>
      </li>)}
    </ul>}
  </div>
}
