import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import * as Dropdown from '@radix-ui/react-dropdown-menu'
import { ArrowLeft, ChevronLeft, ChevronRight, CircleCheck, Copy, MoreHorizontal, Pencil, Phone, Printer, Truck } from 'lucide-react'
import { useCurrentStore, useStorePath } from '../account-context'
import { api, errorCode } from '../api'
import { Badge, Button, Field, Notice, PageTitle, Skeleton, type Tone } from '../components/ui'
import { errorLabel, useLang, type Key } from '../i18n'
import { OrderTagsField } from '../components/OrderTags'
import { OrderLines, linesSubtotal, type Line, type Product } from '../components/OrderLines'
import { loadRates, previewCharge, type ShippingRate } from '../shipping'
import { statuses, type Status } from './Orders'
import type { StoreSettingsData } from './StoreSettings'

type OrderEvent = { id: string; kind: 'placed' | 'status' | 'edited' | 'contact' | 'note' | 'tags' | 'shipped' | 'comment'; data: Record<string, any>; userName: string; hasUser: boolean; createdAt: string }

type Order = {
  id: string; number: number; status: Status; customerName: string; phone: string; address: string; shippingRateId: string | null; shippingName: string
  subtotal: number; deliveryCharge: number; discount: number; discountCode: string; total: number; source: string; note: string; tags: string[]; createdAt: string
  items: { id: string; variantId: string | null; productName: string; variantLabel: string; price: number; quantity: number; productId: string | null; thumbUrl: string | null }[]
  newer: string | null; older: string | null
  events: OrderEvent[]
  page: { id: string; title: string } | null; warehouse: { id: string; name: string } | null
  history: { total: number; delivered: number; returned: number; cancelled: number }
  duplicate: boolean; blocked: boolean
  shipment: { courier: string; consignmentId: string; trackingCode: string; courierStatus: string; checkedAt: string } | null
}

// Mirrors set_order_status in the database, which is what actually decides. This only chooses which buttons to show.
const nextSteps: Record<Status, Status[]> = {
  new: ['confirmed', 'hold', 'cancelled'],
  hold: ['confirmed', 'cancelled'],
  confirmed: ['packed', 'hold', 'cancelled'],
  packed: ['courier', 'cancelled'],
  courier: ['delivered', 'returned'],
  delivered: [],
  returned: [],
  cancelled: [],
}
const stepLabel = (s: Status) => `orderTo${s[0].toUpperCase()}${s.slice(1)}` as Key
const editable: Status[] = ['new', 'hold', 'confirmed']

export function OrderDetail() {
  const { t, num, money, time } = useLang()
  const { id } = useParams()
  const path = useStorePath()
  const handle = useCurrentStore()!.store.handle
  const base = `/stores/${handle}/orders/${id}`
  const [order, setOrder] = useState<Order | null>(null)
  // Which ways of sending are on. Until it loads (or if it fails) the Steadfast button shows, as before.
  const [couriers, setCouriers] = useState<string[]>([])
  const selfOn = couriers.includes('self'), steadfastOn = couriers.includes('steadfast')
  const [failed, setFailed] = useState(false)
  const [note, setNote] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const tagSaves = useRef(Promise.resolve())
  const tagRequest = useRef(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [editing, setEditing] = useState(false)
  // rateId '' keeps the order's own option, which matters when that option was deleted since.
  const [itemsEdit, setItemsEdit] = useState<{ lines: Line[]; rateId: string; rates: ShippingRate[] } | null>(null)
  const [comment, setComment] = useState('')
  const [contact, setContact] = useState({ customerName: '', phone: '', address: '' })

  const show = (o: Order) => {
    setOrder(o)
    setNote(o.note)
    setTags(o.tags)
  }

  const load = async () => {
    setFailed(false)
    try {
      show(await api<Order>(base))
    } catch {
      setFailed(true)
    }
  }

  useEffect(() => {
    void load()
  }, [base])

  useEffect(() => {
    api<{ courier: string }[]>(`/stores/${handle}/couriers`).then((rows) => setCouriers(rows.map((r) => r.courier)), () => {})
  }, [handle])

  // The store's details head and foot the printed invoice; without them it prints as before.
  const [shop, setShop] = useState<StoreSettingsData | null>(null)
  useEffect(() => {
    api<StoreSettingsData>(`/stores/${handle}/settings`).then(setShop, () => {})
  }, [handle])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(timer)
  }, [toast])

  const change = async (body: { status?: Status; note?: string; customerName?: string; phone?: string; address?: string }) => {
    setBusy(true)
    setError(null)
    try {
      show(await api<Order>(base, { method: 'PATCH', body }))
      setToast(t('orderUpdated'))
      setConfirmCancel(false)
      setEditing(false)
    } catch (err) {
      setError(errorCode(err))
    } finally {
      setBusy(false)
    }
  }

  // Each change sends the whole list; saves run one after another and only the newest answer is shown.
  const saveTags = (next: string[]) => {
    setTags(next)
    const request = ++tagRequest.current
    tagSaves.current = tagSaves.current.then(async () => {
      try {
        const saved = await api<Order>(base, { method: 'PATCH', body: { tags: next } })
        if (request === tagRequest.current) { setOrder(saved); setToast(t('orderUpdated')) }
      } catch (err) {
        if (request === tagRequest.current) { setError(errorCode(err)); void load() }
      }
    })
  }

  const courierCall = async (path: 'ship' | 'track', message?: string, courier?: 'self') => {
    setBusy(true)
    setError(null)
    try {
      await api(`${base}/${path}`, { method: 'POST', body: courier ? { courier } : undefined })
      show(await api<Order>(base))
      setToast(message ?? t('orderUpdated'))
    } catch (err) {
      setError(errorCode(err))
    } finally {
      setBusy(false)
    }
  }

  const toggleBlock = async () => {
    if (!order) return
    setBusy(true)
    setError(null)
    try {
      const blocked = `/stores/${handle}/blocked`
      if (order.blocked) await api(`${blocked}/${order.phone}`, { method: 'DELETE' })
      else await api(blocked, { method: 'POST', body: { phone: order.phone, reason: t('orderTitle', { n: String(order.number) }) } })
      setOrder({ ...order, blocked: !order.blocked })
      setToast(t('orderUpdated'))
    } catch (err) {
      setError(errorCode(err))
    } finally {
      setBusy(false)
    }
  }

  // Load each product's variants so lines can change size, colour and quantity.
  const startItemsEdit = async () => {
    if (!order) return
    setBusy(true)
    setError(null)
    try {
      const ids = [...new Set(order.items.map((item) => item.productId!))]
      const [products, rates] = await Promise.all([
        Promise.all(ids.map((pid) => api<Product>(`/stores/${handle}/products/${pid}`))),
        loadRates(handle),
      ])
      const byId = new Map(products.map((p) => [p.id, p]))
      setItemsEdit({
        rateId: order.shippingRateId ?? '',
        rates: rates.filter((r) => r.active || r.id === order.shippingRateId),
        lines: order.items.map((item) => ({ product: byId.get(item.productId!)!, thumbUrl: item.thumbUrl, variantId: item.variantId!, quantity: item.quantity })),
      })
    } catch (err) {
      setError(errorCode(err))
    } finally {
      setBusy(false)
    }
  }

  const saveItems = async () => {
    if (!itemsEdit || itemsEdit.lines.length === 0) return
    setBusy(true)
    setError(null)
    try {
      show(await api<Order>(`${base}/items`, { method: 'PUT', body: { shippingRateId: itemsEdit.rateId || null, items: itemsEdit.lines.map((line) => ({ variantId: line.variantId, quantity: line.quantity })) } }))
      setItemsEdit(null)
      setToast(t('orderUpdated'))
    } catch (err) {
      setError(errorCode(err))
    } finally {
      setBusy(false)
    }
  }

  const addComment = async () => {
    const text = comment.trim()
    if (!text) return
    setBusy(true)
    setError(null)
    try {
      show(await api<Order>(`${base}/comments`, { method: 'POST', body: { text } }))
      setComment('')
    } catch (err) {
      setError(errorCode(err))
    } finally {
      setBusy(false)
    }
  }

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setToast(t('orderCopied'))
    } catch {
      setError('copyFailed')
    }
  }

  if (failed) return <div className="page"><section className="card card--flush"><Notice role="alert" title={t('orderLoadFailed')} action={<Button onClick={() => void load()}>{t('retry')}</Button>} /></section></div>
  if (!order) return <div className="page" role="status" aria-label={t('loading')}><Skeleton width="16rem" /><section className="card"><Skeleton /><Skeleton width="60%" /></section></div>

  const orderNo = num(order.number).replace(/[,،]/g, '')
  const steps = nextSteps[order.status]
  const [primary, ...others] = steps
  const whatsapp = `https://wa.me/88${order.phone}`
  const units = order.items.reduce((sum, item) => sum + item.quantity, 0)
  const cod: { label: Key; tone: Tone } = order.status === 'delivered' ? { label: 'orderCodCollected', tone: 'success' }
    : order.status === 'cancelled' || order.status === 'returned' ? { label: 'orderCodNone', tone: 'neutral' } : { label: 'orderCodDue', tone: 'warning' }
  const finished = order.history.delivered + order.history.returned
  const rate = finished ? Math.round((order.history.delivered / finished) * 100) : null
  const canEdit = editable.includes(order.status)
  const itemsEditable = order.items.every((item) => item.productId && item.variantId)
  const sold = new Map(order.items.flatMap((item) => item.variantId ? [[item.variantId, item.price] as const] : []))
  // What delivery would cost after the edit, by the database's rule (edit_order_lines): the order's own option keeps its
  // agreed price unless free-delivery conditions now say free (or no longer do); another option is priced afresh.
  const editCharge = (rateId: string) => {
    if (!itemsEdit) return 0
    const r = itemsEdit.rates.find((x) => x.id === (rateId || order.shippingRateId))
    if (!r) return order.deliveryCharge
    const fresh = previewCharge(r, itemsEdit.lines.map((line) => line.product.id), linesSubtotal(itemsEdit.lines, sold), itemsEdit.lines.reduce((n, line) => n + line.quantity, 0))
    return r.id !== order.shippingRateId || fresh === 0 ? fresh : order.deliveryCharge > 0 ? order.deliveryCharge : fresh
  }
  const startEdit = () => { setContact({ customerName: order.customerName, phone: order.phone, address: order.address }); setEditing(true) }
  const actor = (event: OrderEvent) => event.hasUser ? event.userName || t('activityFormer')
    : event.kind === 'placed' ? t(['landing_page', 'website'].includes(event.data.source) ? 'activityCustomer' : 'activityUnknown') : t('activitySystem')
  const statusName = (s: string) => statuses[s as Status] ? t(statuses[s as Status].label) : s
  const describe = (event: OrderEvent): string => {
    switch (event.kind) {
      case 'placed': return t('activityPlaced', { source: t(`source_${event.data.source}` as Key), total: money(event.data.total) })
      case 'status': return t('activityStatus', { from: statusName(event.data.from), to: statusName(event.data.to) })
      case 'edited': return [event.data.before !== event.data.after ? t('activityItems', { items: event.data.after }) : '',
        // Older entries recorded inside or outside Dhaka; newer ones the option's name.
        'toShipping' in event.data ? (event.data.fromShipping !== event.data.toShipping ? t('activityArea', { area: event.data.toShipping }) : '')
          : event.data.fromArea !== event.data.toArea ? t('activityArea', { area: t(event.data.toArea === 'outside' ? 'orderOutside' : 'orderInside') }) : '',
        event.data.fromTotal !== event.data.toTotal ? t('activityTotal', { from: money(event.data.fromTotal), to: money(event.data.toTotal) }) : ''].filter(Boolean).join(' ') || t('activityEditedSame')
      case 'contact': return t('activityContact', { name: event.data.name, phone: event.data.phone })
      case 'note': return event.data.note ? t('activityNote', { note: event.data.note }) : t('activityNoteCleared')
      case 'tags': return event.data.tags.length ? t('activityTags', { tags: event.data.tags.join(', ') }) : t('activityTagsCleared')
      case 'shipped': return event.data.courier === 'self' ? t('activityShippedSelf') : t('activityShipped', { code: event.data.tracking || '—' })
      case 'comment': return event.data.text
    }
  }
  const shopContact = shop && [shop.phone, shop.whatsapp && shop.whatsapp !== shop.phone ? `${t('storeWhatsapp')}: ${shop.whatsapp}` : '', shop.email, shop.facebook].filter(Boolean).join(' · ')
  const shopLegal = shop && [shop.legalName, shop.tradeLicence && `${t('storeTradeLicence')}: ${shop.tradeLicence}`, shop.bin && `${t('storeBin')}: ${shop.bin}`].filter(Boolean).join(' · ')
  const sourceLabel = order.source === 'landing_page' && order.page ? order.page.title : t(`source_${order.source}` as Key)

  return (
    <div className="page page--detail order-page">
      <PageTitle title={t('orderTitle', { n: orderNo })} />
      {shop && <header className="invoice-head">
        {shop.logo && <img src={shop.logo.thumbUrl} alt="" />}
        <div>
          <strong>{shop.name}</strong>
          {shop.address && <p>{shop.address}</p>}
          {shopContact && <p>{shopContact}</p>}
          {shopLegal && <p>{shopLegal}</p>}
        </div>
      </header>}
      <header className="detail-head order-head">
        <div className="detail-head__title">
          <Link className="detail-head__back" to={path('/orders')} aria-label={t('orderBack')} title={t('orderBack')}><ArrowLeft size={16} aria-hidden="true" /></Link>
          <h1>{t('orderTitle', { n: orderNo })}</h1>
          <Badge tone={statuses[order.status].tone}>{t(statuses[order.status].label)}</Badge>
          {order.duplicate && <Badge tone="warning">{t('orderDuplicate')}</Badge>}
          {order.blocked && <Badge tone="danger">{t('orderBlocked')}</Badge>}
        </div>
        <div className="detail-head__actions order-head__actions">
          {primary && <Button variant="primary" disabled={busy} aria-busy={busy} onClick={() => (primary === 'cancelled' ? setConfirmCancel(true) : void change({ status: primary }))}>{t(stepLabel(primary))}</Button>}
          <Button onClick={() => window.print()}><Printer size={14} aria-hidden="true" />{t('orderPrint')}</Button>
          {others.length > 0 && <Dropdown.Root>
            <Dropdown.Trigger className="btn btn--icon" aria-label={t('orderMore')} disabled={busy}><MoreHorizontal size={16} aria-hidden="true" /></Dropdown.Trigger>
            <Dropdown.Portal><Dropdown.Content className="menu" align="end" sideOffset={6} collisionPadding={8}>
              {others.map((s) => <Dropdown.Item key={s} className={s === 'cancelled' || s === 'returned' ? 'menu__item menu__action menu__item--danger' : 'menu__item menu__action'} onSelect={() => (s === 'cancelled' ? setConfirmCancel(true) : void change({ status: s }))}>{t(stepLabel(s))}</Dropdown.Item>)}
            </Dropdown.Content></Dropdown.Portal>
          </Dropdown.Root>}
          <span className="order-head__pager">
            {order.newer ? <Link className="btn btn--icon" to={path(`/orders/${order.newer}`)} aria-label={t('orderNewer')} title={t('orderNewer')}><ChevronLeft size={16} aria-hidden="true" /></Link> : <span className="btn btn--icon" aria-hidden="true" data-disabled><ChevronLeft size={16} /></span>}
            {order.older ? <Link className="btn btn--icon" to={path(`/orders/${order.older}`)} aria-label={t('orderOlder')} title={t('orderOlder')}><ChevronRight size={16} aria-hidden="true" /></Link> : <span className="btn btn--icon" aria-hidden="true" data-disabled><ChevronRight size={16} /></span>}
          </span>
        </div>
      </header>
      <p className="muted order-head__meta">{t('orderPlaced')} {time(order.createdAt)} · {sourceLabel}{order.warehouse && <> · {t('orderShipsFrom', { value: order.warehouse.name })}</>}</p>

      {confirmCancel && <div className="notice-line notice-line--danger order-confirm" role="alert">
        <span>{t('orderCancelWarning')}</span>
        <span className="row"><Button onClick={() => setConfirmCancel(false)}>{t('cancel')}</Button><Button variant="danger" disabled={busy} onClick={() => void change({ status: 'cancelled' })}>{t('orderToCancelled')}</Button></span>
      </div>}
      {order.duplicate && <p className="notice-line notice-line--warning">{t('orderDuplicateNote')}</p>}
      {order.blocked && <p className="notice-line notice-line--danger">{t('orderBlockedNote')}</p>}
      {error && <p className="form-error" role="alert">{t(error === 'copyFailed' ? 'errCopyFailed' : errorLabel(error))}</p>}

      <div className="detail-layout">
        <div className="detail-layout__main">
          <section className="card" aria-labelledby="order-items-title">
            <div className="card__head order-card-head">
              <h2 id="order-items-title">{t('orderItems')} <span className="muted">{t('newOrderItems', { n: num(units) })}</span></h2>
              {canEdit && !itemsEdit && <Button disabled={busy || !itemsEditable} title={itemsEditable ? undefined : t('orderEditGone')} onClick={() => void startItemsEdit()}><Pencil size={14} aria-hidden="true" />{t('orderEditItems')}</Button>}
            </div>
            {itemsEdit ? <>
              <OrderLines handle={handle} lines={itemsEdit.lines} sold={sold} onChange={(update) => setItemsEdit((current) => current && { ...current, lines: update(current.lines) })} invalid={itemsEdit.lines.length === 0} />
              <dl className="order-sum">
                <div><dt>{t('orderSubtotal')}</dt><dd className="num">{money(linesSubtotal(itemsEdit.lines, sold))}</dd></div>
                <div>
                  <dt>{t('orderDelivery')}</dt>
                  <dd><select className="input input--compact order-sum__rate" aria-label={t('newOrderArea')} value={itemsEdit.rateId} onChange={(e) => setItemsEdit({ ...itemsEdit, rateId: e.target.value })}>
                    {!order.shippingRateId && <option value="">{order.shippingName || t('orderDelivery')} · {money(order.deliveryCharge)}</option>}
                    {itemsEdit.rates.map((r) => <option key={r.id} value={r.id}>{r.name} · {editCharge(r.id) === 0 ? t('shippingFree') : money(editCharge(r.id))}</option>)}
                  </select></dd>
                </div>
                {!order.discountCode && <div className="order-sum__total"><dt>{t('orderCollect')}</dt><dd className="num">{money(linesSubtotal(itemsEdit.lines, sold) + editCharge(itemsEdit.rateId))}</dd></div>}
              </dl>
              <p className="muted order-sum__note">{t(order.discountCode ? 'orderEditCouponNote' : 'orderEditNote')}</p>
              <div className="row row--end"><Button disabled={busy} onClick={() => setItemsEdit(null)}>{t('cancel')}</Button><Button variant="primary" disabled={busy || itemsEdit.lines.length === 0} aria-busy={busy} onClick={() => void saveItems()}>{t('orderEditSaveItems')}</Button></div>
            </> : <>
            <ul className="order-items-list">
              {order.items.map((item) => (
                <li key={item.id} className="order-item">
                  <span className="data-table__thumb order-item__thumb">{item.thumbUrl && <img src={item.thumbUrl} alt="" />}</span>
                  <span className="order-item__main">
                    {item.productId ? <Link className="order-item__name" to={path(`/products/${item.productId}`)}>{item.productName}</Link> : <span className="order-item__name">{item.productName}</span>}
                    {item.variantLabel && <span className="order-item__variant">{item.variantLabel}</span>}
                  </span>
                  <span className="muted num order-item__unit">{money(item.price)} × {num(item.quantity)}</span>
                  <strong className="num order-item__total">{money(item.price * item.quantity)}</strong>
                </li>
              ))}
            </ul>
            <dl className="order-sum">
              <div><dt>{t('orderSubtotal')}</dt><dd className="num">{money(order.subtotal)}</dd></div>
              {order.discount > 0 && <div><dt>{t('orderDiscount', { value: order.discountCode })}</dt><dd className="num">−{money(order.discount)}</dd></div>}
              <div><dt>{t('orderDelivery')} <span className="muted">{order.shippingName}</span></dt><dd className="num">{money(order.deliveryCharge)}</dd></div>
              <div className="order-sum__total"><dt>{t('orderCollect')}</dt><dd className="num">{money(order.total)}</dd></div>
              <div><dt>{t('orderCod')}</dt><dd><Badge tone={cod.tone}>{t(cod.label)}</Badge></dd></div>
            </dl>
            </>}
          </section>

          <section className="card" aria-labelledby="order-shipment-title">
            <h2 id="order-shipment-title">{t('orderShipment')}</h2>
            {order.shipment
              ? <dl className="order-facts">
                  <div><dt>{t('orderCourier')}</dt><dd>{t(order.shipment.courier === 'self' ? 'courierSelf' : 'courierSteadfast')}</dd></div>
                  {order.shipment.courier === 'self' && order.status === 'courier' && <div><dt /><dd className="muted">{t('orderSelfHint')}</dd></div>}
                  {order.shipment.courier !== 'self' && <div><dt>{t('orderTrackingCode')}</dt><dd className="row"><span className="num">{order.shipment.trackingCode}</span><button type="button" className="btn btn--icon order-facts__copy" aria-label={t('orderCopy')} onClick={() => void copy(order.shipment!.trackingCode)}><Copy size={14} aria-hidden="true" /></button></dd></div>}
                  {order.shipment.courierStatus && <div><dt>{t('orderCourierState')}</dt><dd>{order.shipment.courierStatus} <span className="muted">· {time(order.shipment.checkedAt)}</span></dd></div>}
                  {order.status === 'courier' && order.shipment.courier !== 'self' && <div><dt /><dd><Button disabled={busy} onClick={() => void courierCall('track')}>{t('orderTrack')}</Button></dd></div>}
                </dl>
              : <div className="order-empty">
                  <Truck size={22} strokeWidth={1.5} aria-hidden="true" />
                  <p>{t(order.status === 'confirmed' || order.status === 'packed' ? 'orderShipReady' : order.status === 'new' || order.status === 'hold' ? 'orderShipHint' : 'orderNoShipment')}</p>
                  {(order.status === 'confirmed' || order.status === 'packed') && <div className="row">
                    {(!selfOn || steadfastOn) && <Button variant="primary" disabled={busy} aria-busy={busy} onClick={() => void courierCall('ship', t('orderShipped'))}>{t('orderShip')}</Button>}
                    {selfOn && <Button variant={steadfastOn ? 'default' : 'primary'} disabled={busy} aria-busy={busy} onClick={() => void courierCall('ship', t('orderUpdated'), 'self')}>{t('orderShipSelf')}</Button>}
                    {error === 'courierNotConnected' && <Link to={path('/settings/couriers')}>{t('orderShipConnect')}</Link>}
                  </div>}
                </div>}
          </section>

          <section className="card">
            <h2><label htmlFor="order-note">{t('orderNote')}</label></h2>
            <textarea id="order-note" className="input input--area" rows={3} maxLength={2000} placeholder={t('orderNoteHint')} value={note} onChange={(e) => setNote(e.target.value)} />
            <p className="field__help">{t('orderNoteHelp')}</p>
            {note.trim() !== order.note && <div className="row"><Button disabled={busy} onClick={() => void change({ note })}>{t('orderNoteSave')}</Button></div>}
          </section>

          <section className="card" aria-labelledby="order-activity-title">
            <h2 id="order-activity-title">{t('orderActivity')}</h2>
            <form className="activity-form" onSubmit={(e) => { e.preventDefault(); void addComment() }}>
              <textarea className="input input--area" rows={2} maxLength={2000} aria-label={t('orderComment')} placeholder={t('orderCommentHint')} value={comment} onChange={(e) => setComment(e.target.value)} />
              <div className="row row--end"><Button type="submit" disabled={busy || !comment.trim()}>{t('orderCommentSend')}</Button></div>
            </form>
            <ol className="activity">
              {order.events.map((event) => <li key={event.id} className={event.kind === 'comment' ? 'activity__item activity__item--comment' : 'activity__item'}>
                <span className="activity__avatar" aria-hidden="true">{actor(event).slice(0, 1).toUpperCase()}</span>
                <div className="activity__body">
                  <p><strong>{actor(event)}</strong> <span className="muted">{time(event.createdAt)}</span></p>
                  <p className={event.kind === 'comment' ? 'activity__comment' : 'activity__text'}>{describe(event)}</p>
                </div>
              </li>)}
            </ol>
          </section>
        </div>

        <aside className="detail-side">
          <section className="card" aria-labelledby="order-customer-title">
            <div className="card__head order-card-head">
              <h2 id="order-customer-title">{t('orderCustomer')}</h2>
              {canEdit && !editing && <button type="button" className="btn btn--icon order-card-head__edit" aria-label={t('orderEditCustomer')} title={t('orderEditCustomer')} onClick={startEdit}><Pencil size={14} aria-hidden="true" /></button>}
            </div>
            {editing
              ? <form className="stack" onSubmit={(e) => { e.preventDefault(); void change(contact) }}>
                  <Field id="order-edit-name" label={t('newOrderName')} maxLength={100} value={contact.customerName} onChange={(e) => setContact({ ...contact, customerName: e.target.value })} />
                  <Field id="order-edit-phone" label={t('newOrderPhone')} type="tel" inputMode="tel" maxLength={20} value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} />
                  <div className="field">
                    <label htmlFor="order-edit-address">{t('newOrderAddress')}</label>
                    <textarea id="order-edit-address" className="input input--area" rows={3} maxLength={500} value={contact.address} onChange={(e) => setContact({ ...contact, address: e.target.value })} />
                  </div>
                  <div className="row"><Button onClick={() => setEditing(false)}>{t('cancel')}</Button><Button type="submit" variant="primary" disabled={busy} aria-busy={busy}>{t('orderEditSave')}</Button></div>
                </form>
              : <div className="order-customer">
                  <strong>{order.customerName}</strong>
                  <div className="order-customer__phone">
                    <span className="num">{order.phone}</span>
                    <a className="btn btn--icon" href={`tel:${order.phone}`} aria-label={t('orderCall')} title={t('orderCall')}><Phone size={14} aria-hidden="true" /></a>
                    <a className="btn btn--icon" href={whatsapp} target="_blank" rel="noopener" aria-label={t('orderWhatsApp')} title={t('orderWhatsApp')}><WhatsAppMark /></a>
                    <button type="button" className="btn btn--icon" aria-label={t('orderCopyAll')} title={t('orderCopyAll')} onClick={() => void copy(`${order.customerName}\n${order.phone}\n${order.address}`)}><Copy size={14} aria-hidden="true" /></button>
                  </div>
                  <p className="order-address">{order.address}</p>
                  {order.shippingName && <p className="muted">{order.shippingName}</p>}
                </div>}
          </section>

          <section className="card" aria-labelledby="order-record-title">
            <h2 id="order-record-title">{t('orderRecord')}</h2>
            {order.history.total === 0
              ? <p className="muted">{t('orderRecordNew')}</p>
              : <>
                  {rate === null
                    ? <p className="muted">{t('orderRecordNone')}</p>
                    : <div className="order-rate">
                        <div className="order-rate__head"><strong className="num">{num(rate)}%</strong><span className="muted">{t('orderRecordRate')}</span>{rate < 60 && <Badge tone="warning">{t('orderRecordRisk')}</Badge>}</div>
                        <span className="order-rate__bar" aria-hidden="true"><span style={{ width: `${rate}%` }} /></span>
                      </div>}
                  <dl className="order-record">
                    <div><dt>{t('colOrders')}</dt><dd className="num">{num(order.history.total)}</dd></div>
                    <div><dt>{t('colDelivered')}</dt><dd className="num">{num(order.history.delivered)}</dd></div>
                    <div><dt>{t('colReturned')}</dt><dd className="num">{num(order.history.returned)}</dd></div>
                    <div><dt>{t('statusCancelled')}</dt><dd className="num">{num(order.history.cancelled)}</dd></div>
                  </dl>
                </>}
            <p className="field__help">{t('orderRecordHelp')}</p>
            <div className="row"><Button disabled={busy} onClick={() => void toggleBlock()}>{t(order.blocked ? 'orderUnblock' : 'orderBlock')}</Button></div>
          </section>

          <section className="card">
            <h2><label htmlFor="order-tags">{t('orderTags')}</label></h2>
            <OrderTagsField id="order-tags" handle={handle} values={tags} onChange={saveTags} />
          </section>

          {order.source === 'landing_page' && <section className="card">
            <h2>{t('orderSource')}</h2>
            {order.page ? <Link to={path(`/landing-pages/${order.page.id}`)}>{t('orderFromPage', { value: order.page.title })}</Link> : <p className="muted">{t('orderFromPageGone')}</p>}
          </section>}
        </aside>
      </div>

      {shop?.invoiceNote && <p className="invoice-foot">{shop.invoiceNote}</p>}
      <div className="toast-anchor" role="status">
        {toast && <p className="toast"><CircleCheck size={18} aria-hidden="true" />{toast}</p>}
      </div>
    </div>
  )
}

// The WhatsApp button needs no brand logo: a plain speech-bubble mark keeps it ours.
function WhatsAppMark() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 21l1.7-5A8.5 8.5 0 1 1 8 19.3L3 21z" /></svg>
}
