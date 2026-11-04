import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { ArrowLeft } from 'lucide-react'
import { readPhone } from 'storefront/schema'
import { useCurrentStore, useStorePath } from '../account-context'
import { api, errorCode } from '../api'
import { ProductPicker } from '../components/ProductPicker'
import { Button, Field } from '../components/ui'
import { errorLabel, useLang, type Key } from '../i18n'
import type { StoreSettingsData } from './StoreSettings'

type Product = { id: string; name: string; variants: { id: string; options: string[]; price: number; stock: number | null }[] }
const sources = ['messenger', 'whatsapp', 'phone', 'facebook_comment', 'instagram', 'shop', 'other'] as const

export function NewOrder() {
  const { t, money, num } = useLang()
  const navigate = useNavigate()
  const path = useStorePath()
  const handle = useCurrentStore()!.store.handle
  const [product, setProduct] = useState<Product | null>(null)
  const [picking, setPicking] = useState(false)
  const [delivery, setDelivery] = useState<StoreSettingsData | null>(null)
  const [form, setForm] = useState({ variantId: '', quantity: '1', customerName: '', phone: '', address: '', area: 'inside', source: 'messenger', note: '', coupon: '' })
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api<StoreSettingsData>(`/stores/${handle}/settings`).then(setDelivery).catch(() => {})
  }, [handle])

  const set = (changes: Partial<typeof form>) => setForm({ ...form, ...changes })
  const choose = async (id: string) => {
    const p = await api<Product>(`/stores/${handle}/products/${id}`)
    setProduct(p)
    set({ variantId: (p.variants.find((v) => v.stock === null || v.stock > 0) ?? p.variants[0]).id })
  }

  const variant = product?.variants.find((v) => v.id === form.variantId)
  const quantity = Math.min(Math.max(Number(form.quantity) || 1, 1), 100)
  const charge = delivery ? (form.area === 'outside' ? delivery.deliveryOutside : delivery.deliveryInside) : 0
  const problems = {
    name: !form.customerName.trim(),
    phone: !readPhone(form.phone),
    address: !form.address.trim(),
  }

  const save = async (e: FormEvent) => {
    e.preventDefault()
    setTried(true)
    setError(null)
    if (!variant || problems.name || problems.phone || problems.address) return
    setBusy(true)
    try {
      const order = await api<{ id: string }>(`/stores/${handle}/orders`, { method: 'POST', body: { ...form, quantity } })
      navigate(path(`/orders/${order.id}`), { replace: true })
    } catch (err) {
      setError(errorCode(err))
      setBusy(false)
    }
  }

  return (
    <form className="page page--detail" onSubmit={(e) => void save(e)} noValidate>
      <title>{t('newOrder')}</title>
      <header className="detail-head">
        <div className="detail-head__title">
          <Link className="detail-head__back" to={path('/orders')} aria-label={t('orderBack')} title={t('orderBack')}><ArrowLeft size={16} aria-hidden="true" /></Link>
          <h1>{t('newOrder')}</h1>
        </div>
        <div className="detail-head__actions">
          <Button type="submit" variant="primary" disabled={busy} aria-busy={busy}>{t('newOrderSave')}</Button>
        </div>
      </header>
      <p className="muted">{t('newOrderD')}</p>
      {error && <p className="form-error" role="alert">{t(errorLabel(error))}</p>}

      <div className="detail-layout">
        <div className="detail-layout__main">
          <section className="card card--form">
            <h2>{t('newOrderProduct')}</h2>
            {product
              ? (
                <div className="editor-product">
                  <span className="editor-product__name">{product.name}</span>
                  <Button onClick={() => setPicking(true)}>{t('pageChangeProduct')}</Button>
                </div>
              )
              : <div><Button onClick={() => setPicking(true)}>{t('newOrderPick')}</Button>{tried && <p className="field__help field__help--error">{t('newOrderPick')}</p>}</div>}
            {product && (
              <div className="price-grid price-grid--two">
                <div className="field">
                  <label htmlFor="order-variant">{t('newOrderOption')}</label>
                  <select id="order-variant" className="input" value={form.variantId} onChange={(e) => set({ variantId: e.target.value })}>
                    {product.variants.map((v) => (
                      <option key={v.id} value={v.id}>{v.options.join(' / ') || product.name} · {money(v.price)}{v.stock === 0 ? ` (${t('newOrderOutOfStock')})` : v.stock !== null ? ` (${num(v.stock)})` : ''}</option>
                    ))}
                  </select>
                </div>
                <Field id="order-quantity" label={t('newOrderQuantity')} inputMode="numeric" value={form.quantity} onChange={(e) => set({ quantity: e.target.value.replace(/\D/g, '').slice(0, 3) })} />
              </div>
            )}
          </section>

          <section className="card card--form">
            <h2>{t('orderCustomer')}</h2>
            <Field id="order-name" label={t('newOrderName')} maxLength={100} autoComplete="off" value={form.customerName} error={tried && problems.name ? t('errNameRequired') : undefined} onChange={(e) => set({ customerName: e.target.value })} />
            <Field id="order-phone" label={t('newOrderPhone')} type="tel" inputMode="tel" maxLength={20} placeholder="01XXXXXXXXX" value={form.phone} error={tried && problems.phone ? t('errPhoneInvalid') : undefined} onChange={(e) => set({ phone: e.target.value })} />
            <div className="field">
              <label htmlFor="order-address">{t('newOrderAddress')}</label>
              <textarea id="order-address" className="input input--area" rows={3} maxLength={500} aria-invalid={tried && problems.address ? true : undefined} value={form.address} onChange={(e) => set({ address: e.target.value })} />
              {tried && problems.address && <p className="field__help field__help--error">{t('errAddressRequired')}</p>}
            </div>
            <fieldset className="field">
              <legend className="field__label">{t('newOrderArea')}</legend>
              <div className="row">
                {(['inside', 'outside'] as const).map((a) => (
                  <label key={a} className="row"><input type="radio" name="area" checked={form.area === a} onChange={() => set({ area: a })} />{t(a === 'inside' ? 'orderInside' : 'orderOutside')}</label>
                ))}
              </div>
            </fieldset>
          </section>
        </div>

        <aside className="detail-side">
          <section className="card">
            <div className="field">
              <label htmlFor="order-source">{t('newOrderSource')}</label>
              <select id="order-source" className="input" value={form.source} onChange={(e) => set({ source: e.target.value })}>
                {sources.map((s) => <option key={s} value={s}>{t(`source_${s}` as Key)}</option>)}
              </select>
            </div>
            <Field id="order-coupon" label={t('newOrderCoupon')} maxLength={30} autoComplete="off" value={form.coupon} onChange={(e) => set({ coupon: e.target.value.toUpperCase() })} />
            <div className="field">
              <label htmlFor="order-new-note">{t('orderNote')}</label>
              <textarea id="order-new-note" className="input input--area" rows={3} maxLength={2000} placeholder={t('orderNoteHint')} value={form.note} onChange={(e) => set({ note: e.target.value })} />
            </div>
          </section>
          {variant && (
            <section className="card">
              <dl className="order-totals">
                <div><dt>{t('orderSubtotal')}</dt><dd className="num">{money(variant.price * quantity)}</dd></div>
                <div><dt>{t('orderDelivery')}</dt><dd className="num">{money(charge)}</dd></div>
                <div className="order-totals__total"><dt>{t('orderCollect')}</dt><dd className="num">{money(variant.price * quantity + charge)}</dd></div>
              </dl>
              <p className="muted">{t('newOrderSummaryNote')}</p>
            </section>
          )}
        </aside>
      </div>

      {picking && <ProductPicker selected={[]} max={1} onClose={() => setPicking(false)} onDone={(items) => { setPicking(false); if (items[0]) void choose(items[0].id) }} />}
    </form>
  )
}
