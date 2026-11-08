import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { ArrowDown, ArrowUp, CircleCheck, Pencil, Plus, Trash2, X } from 'lucide-react'
import { useCurrentStore } from '../account-context'
import { api, errorCode } from '../api'
import { useDialog } from '../components/dialog'
import { ProductPicker, type ProductRow } from '../components/ProductPicker'
import { Badge, Button, Field, IconButton, Notice, PageHeader, Skeleton } from '../components/ui'
import { errorLabel, useLang, type Key } from '../i18n'
import { loadRates, type ShippingRate } from '../shipping'

const digits = (text: string) => text.replace(/[০-৯]/g, (d) => String('০১২৩৪৫৬৭৮৯'.indexOf(d))).replace(/\D/g, '').slice(0, 8)

export function Delivery() {
  const { t, money, num } = useLang()
  const current = useCurrentStore()!
  const handle = current.store.handle
  const canEdit = current.role !== 'staff'
  const [rates, setRates] = useState<ShippingRate[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [editing, setEditing] = useState<ShippingRate | 'new' | null>(null)
  const [toast, setToast] = useState<Key | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setFailed(false)
    try {
      setRates(await loadRates(handle))
    } catch {
      setFailed(true)
    }
  }, [handle])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 5000)
    return () => clearTimeout(timer)
  }, [toast])

  const move = async (index: number, by: -1 | 1) => {
    if (!rates) return
    const ids = rates.map((r) => r.id)
    ;[ids[index], ids[index + by]] = [ids[index + by], ids[index]]
    setRates(ids.map((id) => rates.find((r) => r.id === id)!))
    setError(null)
    try {
      setRates(await api<ShippingRate[]>(`/stores/${handle}/shipping-rates-order`, { method: 'PUT', body: { ids } }))
    } catch (err) {
      setError(errorCode(err))
      void load()
    }
  }

  // "Free on ৳1,000 or more · 3 or more items · 2 products"
  const freeSummary = (r: ShippingRate) => [
    r.freeOver !== null && t('shippingFreeOverShort', { amount: money(r.freeOver) }),
    r.freeMinQty !== null && t('shippingFreeQtyShort', { n: num(r.freeMinQty) }),
    r.freeProducts.length > 0 && t('shippingFreeProductsShort', { n: num(r.freeProducts.length) }),
  ].filter(Boolean).join(' · ')

  const activeCount = rates?.filter((r) => r.active).length ?? 0

  return (
    <div className="page page--narrow">
      <PageHeader title={t('shippingTitle')} description={t('shippingTitle.d')}
        action={canEdit ? <Button variant="primary" onClick={() => setEditing('new')} disabled={!rates}><Plus size={16} aria-hidden="true" />{t('shippingAdd')}</Button> : undefined} />
      {error && <p className="form-error" role="alert">{t(errorLabel(error))}</p>}

      <section className="card card--flush">
        <div className="card__intro">
          <h2>{t('shippingOptions')}</h2>
          <p className="muted">{t('shippingOptionsHelp')}</p>
        </div>
        {failed && <Notice role="alert" title={t('shippingLoadFailed')} action={<Button onClick={() => void load()}>{t('retry')}</Button>} />}
        {!failed && !rates && <div className="card__intro" role="status" aria-label={t('loading')}><Skeleton /></div>}
        {rates && rates.length === 0 && <Notice title={t('shippingEmptyTitle')} body={t('shippingEmptyBody')} action={canEdit ? <Button variant="primary" onClick={() => setEditing('new')}>{t('shippingAdd')}</Button> : undefined} />}
        {rates && rates.length > 0 && (
          <ul className="rate-list">
            {rates.map((r, i) => {
              const free = freeSummary(r)
              return (
                <li key={r.id} className="rate-row">
                  <button type="button" className="rate-row__main" onClick={() => setEditing(r)}>
                    <span className="rate-row__name">
                      {r.name}
                      {!r.active && <Badge>{t('shippingOff')}</Badge>}
                    </span>
                    {r.note && <span className="muted rate-row__sub">{r.note}</span>}
                    {free && <span className="rate-row__free">{t('shippingFreeWhen', { rules: free })}</span>}
                  </button>
                  <strong className="num rate-row__price">{r.price === 0 ? t('shippingFree') : money(r.price)}</strong>
                  {canEdit && (
                    <span className="rate-row__move">
                      {rates.length > 1 && <>
                      <IconButton label={t('shippingMoveUp', { name: r.name })}  disabled={i === 0} onClick={() => void move(i, -1)}><ArrowUp size={14} aria-hidden="true" /></IconButton>
                      <IconButton label={t('shippingMoveDown', { name: r.name })}  disabled={i === rates.length - 1} onClick={() => void move(i, 1)}><ArrowDown size={14} aria-hidden="true" /></IconButton>
                      </>}
                      <IconButton label={t('shippingEditNamed', { name: r.name })} onClick={() => setEditing(r)}><Pencil size={14} aria-hidden="true" /></IconButton>
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>


      {editing && (
        <RatePanel
          handle={handle}
          rate={editing === 'new' ? null : editing}
          canEdit={canEdit}
          lastActive={editing !== 'new' && editing.active && activeCount === 1}
          onClose={() => setEditing(null)}
          onDone={(message) => { setEditing(null); setToast(message); void load() }}
        />
      )}

      <div className="toast-anchor" role="status">
        {toast && <p className="toast"><CircleCheck size={18} aria-hidden="true" />{t(toast)}</p>}
      </div>
    </div>
  )
}

function RatePanel({ handle, rate, canEdit, lastActive, onClose, onDone }: { handle: string; rate: ShippingRate | null; canEdit: boolean; lastActive: boolean; onClose: () => void; onDone: (message: Key) => void }) {
  const { t } = useLang()
  const base = `/stores/${handle}/shipping-rates`
  const { ref: dialog, close, props: dialogProps } = useDialog(onClose)
  const [form, setForm] = useState(() => ({
    name: rate?.name ?? '', note: rate?.note ?? '', price: rate ? String(rate.price) : '', active: rate?.active ?? true,
    overOn: rate?.freeOver != null, over: rate?.freeOver != null ? String(rate.freeOver) : '',
    qtyOn: rate?.freeMinQty != null, qty: rate?.freeMinQty != null ? String(rate.freeMinQty) : '',
    productsOn: (rate?.freeProducts.length ?? 0) > 0, products: rate?.freeProducts ?? [],
  }))
  const [picking, setPicking] = useState(false)
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    dialog.current?.showModal()
  }, [])

  const set = (changes: Partial<typeof form>) => setForm({ ...form, ...changes })
  const problems = {
    name: !form.name.trim(),
    price: form.price === '' || Number(form.price) > 100_000,
    over: form.overOn && (form.over === '' || Number(form.over) < 1),
    qty: form.qtyOn && (form.qty === '' || Number(form.qty) < 2 || Number(form.qty) > 1000),
    products: form.productsOn && form.products.length === 0,
  }

  const save = async (e: FormEvent) => {
    e.preventDefault()
    setTried(true)
    setError(null)
    if (Object.values(problems).some(Boolean)) return
    setBusy(true)
    try {
      await api(rate ? `${base}/${rate.id}` : base, {
        method: rate ? 'PUT' : 'POST',
        body: {
          name: form.name, note: form.note, price: Number(form.price), active: form.active,
          freeOver: form.overOn ? Number(form.over) : null, freeMinQty: form.qtyOn ? Number(form.qty) : null,
          productIds: form.productsOn ? form.products.map((p) => p.id) : [],
        },
      })
      close(() => onDone('shippingSaved'))
    } catch (err) {
      setError(errorCode(err))
      setBusy(false)
    }
  }

  const remove = async () => {
    setError(null)
    try {
      await api(`${base}/${rate!.id}`, { method: 'DELETE' })
      close(() => onDone('shippingDeleted'))
    } catch (err) {
      setConfirming(false)
      setError(errorCode(err))
    }
  }

  return (
    <dialog {...dialogProps} className="picker" aria-labelledby="rate-title">
      <div className="picker__head">
        <h2 id="rate-title">{t(rate ? (canEdit ? 'shippingEdit' : 'shippingView') : 'shippingAdd')}</h2>
        <button type="button" className="media__dismiss" aria-label={t('mediaClose')} onClick={() => close()}><X size={18} aria-hidden="true" /></button>
      </div>
      <form className="warehouse-form" onSubmit={(e) => void save(e)} noValidate>
        <fieldset className="picker__body rate-form" disabled={!canEdit}>
          {error && <p className="form-error" role="alert">{t(errorLabel(error))}</p>}
          <Field id="rate-name" label={t('shippingName')} maxLength={60} autoComplete="off" placeholder={t('shippingNameHint')} value={form.name}
            error={tried && problems.name ? t('errNameRequired') : undefined} onChange={(e) => set({ name: e.target.value })} />
          <Field id="rate-note" label={t('shippingNote')} maxLength={120} autoComplete="off" placeholder={t('productOptional')} help={t('shippingNoteHelp')} value={form.note} onChange={(e) => set({ note: e.target.value })} />
          <Field id="rate-price" label={t('shippingPrice')} unit="৳" inputMode="numeric" value={form.price}
            error={tried && problems.price ? t('shippingPriceInvalid') : undefined} onChange={(e) => set({ price: digits(e.target.value) })} />
          <label className="switch-row">
            <input type="checkbox" className="check" checked={form.active} disabled={lastActive && form.active} onChange={(e) => set({ active: e.target.checked })} />
            <span className="switch-row__text">
              <span className="switch-row__title">{t('shippingActive')}</span>
              <span className="muted">{t(lastActive ? 'shippingLastActive' : 'shippingActiveHelp')}</span>
            </span>
          </label>

          <div className="rate-form__free">
            <div>
              <h3>{t('shippingFreeTitle')}</h3>
              <p className="muted">{t('shippingFreeHelp')}</p>
            </div>
            <div className="switch-list">
              <div className="switch-row switch-row--with-field">
                <input id="free-over" type="checkbox" className="check" checked={form.overOn} onChange={(e) => set({ overOn: e.target.checked })} />
                <span className="switch-row__text">
                  <label htmlFor="free-over" className="switch-row__title">{t('shippingFreeOver')}</label>
                  <span className="muted">{t('shippingFreeOverHelp')}</span>
                  {form.overOn && <Field id="free-over-amount" label={t('shippingFreeOverLabel')} unit="৳" inputMode="numeric" value={form.over}
                    error={tried && problems.over ? t('shippingAmountRequired') : undefined} onChange={(e) => set({ over: digits(e.target.value) })} />}
                </span>
              </div>
              <div className="switch-row switch-row--with-field">
                <input id="free-qty" type="checkbox" className="check" checked={form.qtyOn} onChange={(e) => set({ qtyOn: e.target.checked })} />
                <span className="switch-row__text">
                  <label htmlFor="free-qty" className="switch-row__title">{t('shippingFreeQty')}</label>
                  <span className="muted">{t('shippingFreeQtyHelp')}</span>
                  {form.qtyOn && <Field id="free-qty-count" label={t('shippingFreeQtyLabel')} inputMode="numeric" value={form.qty}
                    error={tried && problems.qty ? t('shippingQtyInvalid') : undefined} onChange={(e) => set({ qty: digits(e.target.value).slice(0, 4) })} />}
                </span>
              </div>
              <div className="switch-row switch-row--with-field">
                <input id="free-products" type="checkbox" className="check" checked={form.productsOn} onChange={(e) => set({ productsOn: e.target.checked })} />
                <span className="switch-row__text">
                  <label htmlFor="free-products" className="switch-row__title">{t('shippingFreeProducts')}</label>
                  <span className="muted">{t('shippingFreeProductsHelp')}</span>
                  {form.productsOn && (
                    <span className="rate-form__products">
                      {form.products.length > 0 && (
                        <span className="chips">
                          {form.products.map((p) => (
                            <span key={p.id} className="chip">{p.name}
                              {canEdit && <button type="button" aria-label={t('shippingRemoveProduct', { name: p.name })} onClick={() => set({ products: form.products.filter((x) => x.id !== p.id) })}><X size={12} aria-hidden="true" /></button>}
                            </span>
                          ))}
                        </span>
                      )}
                      {tried && problems.products && <span className="field__help field__help--error">{t('shippingProductsRequired')}</span>}
                      {canEdit && <span><Button onClick={() => setPicking(true)}>{t('shippingPickProducts')}</Button></span>}
                    </span>
                  )}
                </span>
              </div>
            </div>
          </div>

          {rate && canEdit && (
            confirming
              ? (
                <div className="stack">
                  <p className="muted">{t('shippingDeleteWarning')}</p>
                  <div className="row">
                    <Button onClick={() => setConfirming(false)}>{t('cancel')}</Button>
                    <Button variant="danger" onClick={() => void remove()}>{t('productConfirmDelete')}</Button>
                  </div>
                </div>
              )
              : lastActive
                ? <p className="field__help">{t('shippingLastDeleteNote')}</p>
                : <button type="button" className="media-details__delete" onClick={() => setConfirming(true)}><Trash2 size={16} aria-hidden="true" />{t('shippingDelete')}</button>
          )}
        </fieldset>
        <div className="picker__foot row--end">
          <Button onClick={() => close()}>{t(canEdit ? 'cancel' : 'mediaClose')}</Button>
          {canEdit && <Button type="submit" variant="primary" aria-busy={busy} disabled={busy}>{t('productSave')}</Button>}
        </div>
      </form>
      {picking && (
        <ProductPicker
          max={50}
          selected={form.products as unknown as ProductRow[]}
          onClose={() => setPicking(false)}
          onDone={(picked) => { setPicking(false); set({ products: picked.map((p) => ({ id: p.id, name: p.name })) }) }}
        />
      )}
    </dialog>
  )
}
