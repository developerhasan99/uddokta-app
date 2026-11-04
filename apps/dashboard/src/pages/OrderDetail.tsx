import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { ArrowLeft, CircleCheck, Copy, Phone } from 'lucide-react'
import { useCurrentStore, useStorePath } from '../account-context'
import { api, errorCode } from '../api'
import { Badge, Button, Notice, PageTitle, Skeleton } from '../components/ui'
import { errorLabel, useLang, type Key } from '../i18n'
import { statuses, type Status } from './Orders'

type Order = {
  id: string; number: number; status: Status; customerName: string; phone: string; address: string; area: 'inside' | 'outside'
  subtotal: number; deliveryCharge: number; discount: number; discountCode: string; total: number; source: string; note: string; createdAt: string
  items: { id: string; productName: string; variantLabel: string; price: number; quantity: number }[]
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

export function OrderDetail() {
  const { t, num, money, time } = useLang()
  const { id } = useParams()
  const path = useStorePath()
  const handle = useCurrentStore()!.store.handle
  const base = `/stores/${handle}/orders/${id}`
  const [order, setOrder] = useState<Order | null>(null)
  const [failed, setFailed] = useState(false)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [confirmCancel, setConfirmCancel] = useState(false)

  const show = (o: Order) => {
    setOrder(o)
    setNote(o.note)
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
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(timer)
  }, [toast])

  const change = async (body: { status?: Status; note?: string }) => {
    setBusy(true)
    setError(null)
    try {
      show(await api<Order>(base, { method: 'PATCH', body }))
      setToast(t('orderUpdated'))
      setConfirmCancel(false)
    } catch (err) {
      setError(errorCode(err))
    } finally {
      setBusy(false)
    }
  }

  const courierCall = async (path: 'ship' | 'track', message?: string) => {
    setBusy(true)
    setError(null)
    try {
      await api(`${base}/${path}`, { method: 'POST' })
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
  const whatsapp = `https://wa.me/88${order.phone}`

  return (
    <div className="page page--detail">
      <PageTitle title={t('orderTitle', { n: orderNo })} />
      <header className="detail-head">
        <div className="detail-head__title">
          <Link className="detail-head__back" to={path('/orders')} aria-label={t('orderBack')} title={t('orderBack')}><ArrowLeft size={16} aria-hidden="true" /></Link>
          <h1>{t('orderTitle', { n: orderNo })}</h1>
          <Badge tone={statuses[order.status].tone}>{t(statuses[order.status].label)}</Badge>
        </div>
        <span className="muted">{t('orderPlaced')} {time(order.createdAt)}</span>
      </header>

      {order.duplicate && <p className="notice-line notice-line--warning">{t('orderDuplicateNote')}</p>}
      {order.blocked && <p className="notice-line notice-line--danger">{t('orderBlockedNote')}</p>}
      {error && <p className="form-error" role="alert">{t(error === 'copyFailed' ? 'errCopyFailed' : errorLabel(error))}</p>}

      <div className="detail-layout">
        <div className="detail-layout__main">
          <section className="card">
            <h2>{t('orderNext')}</h2>
            {steps.length === 0 && <p className="muted">{t('orderDone')}</p>}
            {confirmCancel
              ? (
                <div className="stack">
                  <p className="muted">{t('orderCancelWarning')}</p>
                  <div className="row">
                    <Button onClick={() => setConfirmCancel(false)}>{t('cancel')}</Button>
                    <Button variant="danger" disabled={busy} onClick={() => void change({ status: 'cancelled' })}>{t('orderToCancelled')}</Button>
                  </div>
                </div>
              )
              : steps.length > 0 && (
                <div className="row">
                  {steps.map((s, i) => (
                    <Button key={s} variant={i === 0 ? 'primary' : s === 'cancelled' ? 'danger' : 'default'} disabled={busy} aria-busy={busy}
                      onClick={() => (s === 'cancelled' ? setConfirmCancel(true) : void change({ status: s }))}>
                      {t(stepLabel(s))}
                    </Button>
                  ))}
                </div>
              )}
          </section>

          {(order.shipment || order.status === 'confirmed' || order.status === 'packed') && (
            <section className="card">
              <h2>{t('orderShipment')}</h2>
              {order.shipment
                ? (
                  <>
                    <p>{t('courierSteadfast')} · {t('orderTracking', { value: order.shipment.trackingCode })}</p>
                    {order.shipment.courierStatus && <p className="muted">{t('orderCourierStatus', { value: order.shipment.courierStatus })} · {time(order.shipment.checkedAt)}</p>}
                    {order.status === 'courier' && <div className="row"><Button disabled={busy} onClick={() => void courierCall('track')}>{t('orderTrack')}</Button></div>}
                  </>
                )
                : (
                  <div className="row">
                    <Button variant="primary" disabled={busy} aria-busy={busy} onClick={() => void courierCall('ship', t('orderShipped'))}>{t('orderShip')}</Button>
                    {error === 'courierNotConnected' && <Link to={path('/settings/couriers')}>{t('orderShipConnect')}</Link>}
                  </div>
                )}
            </section>
          )}

          <section className="card">
            <h2>{t('orderItems')}</h2>
            <ul className="order-items">
              {order.items.map((item) => (
                <li key={item.id}>
                  <span className="order-items__name">{item.productName}{item.variantLabel && <span className="muted"> · {item.variantLabel}</span>}</span>
                  <span className="muted num">{money(item.price)} × {num(item.quantity)}</span>
                  <span className="num">{money(item.price * item.quantity)}</span>
                </li>
              ))}
            </ul>
            <dl className="order-totals">
              <div><dt>{t('orderSubtotal')}</dt><dd className="num">{money(order.subtotal)}</dd></div>
              <div><dt>{t('orderDelivery')} · {t(order.area === 'outside' ? 'orderOutside' : 'orderInside')}</dt><dd className="num">{money(order.deliveryCharge)}</dd></div>
              {order.discount > 0 && <div><dt>{t('orderDiscount', { value: order.discountCode })}</dt><dd className="num">−{money(order.discount)}</dd></div>}
              <div className="order-totals__total"><dt>{t('orderCollect')}</dt><dd className="num">{money(order.total)}</dd></div>
            </dl>
          </section>

          <section className="card">
            <h2><label htmlFor="order-note">{t('orderNote')}</label></h2>
            <textarea id="order-note" className="input input--area" rows={3} maxLength={2000} placeholder={t('orderNoteHint')} value={note} onChange={(e) => setNote(e.target.value)} />
            <p className="field__help">{t('orderNoteHelp')}</p>
            {note.trim() !== order.note && <div className="row"><Button disabled={busy} onClick={() => void change({ note })}>{t('orderNoteSave')}</Button></div>}
          </section>
        </div>

        <aside className="detail-side">
          <section className="card">
            <h2>{t('orderCustomer')}</h2>
            <p><strong>{order.customerName}</strong></p>
            <p className="num">{order.phone}</p>
            <div className="row">
              <a className="btn" href={`tel:${order.phone}`}><Phone size={16} aria-hidden="true" />{t('orderCall')}</a>
              <a className="btn" href={whatsapp} target="_blank" rel="noopener">{t('orderWhatsApp')}</a>
              <Button onClick={() => void copy(`${order.customerName}\n${order.phone}\n${order.address}`)}><Copy size={16} aria-hidden="true" />{t('orderCopy')}</Button>
            </div>
            <p className="order-address">{order.address}</p>
            <p className="muted">{t(order.area === 'outside' ? 'orderOutside' : 'orderInside')}</p>
            <div className="row"><Button variant={order.blocked ? 'default' : 'danger'} disabled={busy} onClick={() => void toggleBlock()}>{t(order.blocked ? 'orderUnblock' : 'orderBlock')}</Button></div>
          </section>

          <section className="card">
            <h2>{t('orderHistory')}</h2>
            {order.history.total === 0
              ? <p className="muted">{t('orderHistoryNone')}</p>
              : <p>{t('orderHistoryLine', { total: num(order.history.total), delivered: num(order.history.delivered), returned: num(order.history.returned), cancelled: num(order.history.cancelled) })}</p>}
            {order.history.returned > 0 && <Badge tone="warning">{t('statusReturned')} {num(order.history.returned)}</Badge>}
          </section>

          <section className="card">
            <h2>{t('orderSource')}</h2>
            {order.source === 'landing_page' && (
              order.page
                ? <Link to={path(`/landing-pages/${order.page.id}`)}>{t('orderFromPage', { value: order.page.title })}</Link>
                : <p className="muted">{t('orderFromPageGone')}</p>
            )}
            {order.source !== 'landing_page' && <p>{t(`source_${order.source}` as Key)}</p>}
            {order.warehouse && <p className="muted">{t('orderShipsFrom', { value: order.warehouse.name })}</p>}
          </section>
        </aside>
      </div>

      <div className="toast-anchor" role="status">
        {toast && <p className="toast"><CircleCheck size={18} aria-hidden="true" />{toast}</p>}
      </div>
    </div>
  )
}
