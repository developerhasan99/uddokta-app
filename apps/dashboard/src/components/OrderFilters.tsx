import { useEffect, useRef, useState, type FormEvent } from 'react'
import { X } from 'lucide-react'
import { emptyOrderFilters, orderSources, orderStatusValues, readOrderFilters, type OrderFilters as Filters } from 'storefront/order-filters'
import { useLang, type Key } from '../i18n'
import { Button } from './ui'

export function OrderFilters({ filters, counts, onApply, onClose }: { filters: Filters; counts: Partial<Record<string, number>>; onApply: (filters: Filters) => void; onClose: () => void }) {
  const { t, num } = useLang()
  const dialog = useRef<HTMLDialogElement>(null)
  const [period, setPeriod] = useState(filters.period)
  const [invalid, setInvalid] = useState(false)
  useEffect(() => { dialog.current?.showModal() }, [])
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const next = readOrderFilters({ ...filters, ...Object.fromEntries(new FormData(e.currentTarget)) })
    setInvalid(!next)
    if (next) { onApply(next); onClose() }
  }
  const labels: Record<string, Key> = { new: 'statusNew', hold: 'statusHold', confirmed: 'statusConfirmed', packed: 'statusPacked', courier: 'statusCourier', delivered: 'statusDelivered', returned: 'statusReturned', cancelled: 'statusCancelled' }
  return <dialog ref={dialog} className="modal order-filter-dialog" aria-labelledby="order-filter-title" onClose={onClose}>
    <form className="order-filter-form" onSubmit={submit} noValidate>
      <header className="order-filter-dialog__head"><h2 id="order-filter-title">{t('orderFilterTitle')}</h2><button type="button" className="media__dismiss" aria-label={t('mediaClose')} onClick={onClose}><X size={18} aria-hidden="true" /></button></header>
      <div className="order-filter-dialog__body">
        <label>{t('colStatus')}<select className="input" name="status" defaultValue={filters.status}><option value="">{t('statusAll')}</option>{orderStatusValues.map((status) => <option key={status} value={status}>{t(labels[status])} ({num(counts[status] ?? 0)})</option>)}</select></label>
        <label>{t('orderFilterSource')}<select className="input" name="source" defaultValue={filters.source}><option value="">{t('orderSourceAll')}</option>{orderSources.map((source) => <option key={source} value={source}>{t(`source_${source}` as Key)}</option>)}</select></label>
        <label className="order-filter-dialog__wide">{t('orderFilterPeriod')}<select className="input" name="period" value={period} onChange={(e) => setPeriod(e.target.value)}><option value="">{t('orderPeriodAll')}</option><option value="today">{t('orderPeriodToday')}</option><option value="7d">{t('orderPeriod7')}</option><option value="30d">{t('orderPeriod30')}</option><option value="custom">{t('orderPeriodCustom')}</option></select></label>
        {period === 'custom' && <><label>{t('orderFilterFrom')}<input type="date" className="input" name="from" defaultValue={filters.from} /></label><label>{t('orderFilterTo')}<input type="date" className="input" name="to" defaultValue={filters.to} /></label></>}
        <p className="muted order-filter-dialog__wide">{t('orderDateHelp')}</p>
        {invalid && <p className="form-error order-filter-dialog__wide" role="alert">{t('errInvalidOrderFilters')}</p>}
      </div>
      <footer className="order-filter-dialog__footer"><Button onClick={() => { onApply({ ...emptyOrderFilters }); onClose() }}>{t('orderClearFilters')}</Button><Button type="submit" variant="primary">{t('orderApplyFilters')}</Button></footer>
    </form>
  </dialog>
}
