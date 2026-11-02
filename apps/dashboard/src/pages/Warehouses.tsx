import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { CircleCheck, Plus, X } from 'lucide-react'
import { useCurrentStore } from '../account-context'
import { api, errorCode } from '../api'
import { Button, Field, Notice, PageHeader, Skeleton } from '../components/ui'
import { errorLabel, useLang, type Key } from '../i18n'

type Warehouse = { id: string; name: string; phone: string; address: string; units: number; hasStock: boolean }

export function Warehouses() {
  const { t, num } = useLang()
  const current = useCurrentStore()!
  const base = `/stores/${current.store.handle}/warehouses`
  const [items, setItems] = useState<Warehouse[] | null>(null)
  const [failed, setFailed] = useState(false)
  // The panel: null is closed, 'new' is adding, otherwise the warehouse being edited.
  const [editing, setEditing] = useState<Warehouse | 'new' | null>(null)
  const [toast, setToast] = useState<Key | null>(null)

  const load = useCallback(async () => {
    setFailed(false)
    try {
      setItems(await api<Warehouse[]>(base))
    } catch {
      setFailed(true)
    }
  }, [base])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 5000)
    return () => clearTimeout(timer)
  }, [toast])

  const finished = (message: Key) => {
    setEditing(null)
    setToast(message)
    void load()
  }

  const addButton = <Button variant="primary" onClick={() => setEditing('new')}><Plus size={16} aria-hidden="true" />{t('warehouseAdd')}</Button>

  return (
    <div className="page">
      <PageHeader title={t('warehouses')} description={t('warehouses.d')} action={addButton} />

      {failed && (
        <section className="card card--flush">
          <Notice role="alert" title={t('warehouseLoadFailed')} action={<Button onClick={() => void load()}>{t('retry')}</Button>} />
        </section>
      )}

      {!failed && (
        <div className="data-list">
          {!items && <div role="status" aria-label={t('loading')}><div className="skeleton-row"><Skeleton width="16rem" /><Skeleton width="5rem" /></div></div>}
          {items && (
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">{t('warehouseName')}</th>
                  <th scope="col" className="data-table__meta">{t('productStock')}</th>
                  <th scope="col" className="data-table__meta data-table__meta--price">{t('warehousePhone')}</th>
                  <th scope="col" className="warehouse-address">{t('warehouseAddress')}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="data-table__row" onClick={() => setEditing(item)}>
                    <td>
                      <button type="button" className="data-table__file" onClick={(e) => { e.stopPropagation(); setEditing(item) }}>
                        <span className="data-table__text">
                          <span className="data-table__name" title={item.name}>{item.name}</span>
                          {item.phone && <span className="muted data-table__sub">{item.phone}</span>}
                        </span>
                      </button>
                    </td>
                    <td className="data-table__meta">{num(item.units)}</td>
                    <td className="data-table__meta data-table__meta--price">{item.phone || '-'}</td>
                    <td className="warehouse-address" title={item.address}>{item.address || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {editing && (
        <WarehousePanel
          item={editing === 'new' ? null : editing}
          others={(items ?? []).filter((w) => editing === 'new' || w.id !== editing.id)}
          base={base}
          canDelete={current.role !== 'staff'}
          onClose={() => setEditing(null)}
          onDone={finished}
        />
      )}

      <div className="toast-anchor" role="status">
        {toast && <p className="toast"><CircleCheck size={18} aria-hidden="true" />{t(toast)}</p>}
      </div>
    </div>
  )
}

function WarehousePanel({ item, others, base, canDelete, onClose, onDone }: { item: Warehouse | null; others: Warehouse[]; base: string; canDelete: boolean; onClose: () => void; onDone: (message: Key) => void }) {
  const { t, num } = useLang()
  const dialog = useRef<HTMLDialogElement>(null)
  const [name, setName] = useState(item?.name ?? '')
  const [phone, setPhone] = useState(item?.phone ?? '')
  const [address, setAddress] = useState(item?.address ?? '')
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [moveTo, setMoveTo] = useState(others[0]?.id ?? '')

  useEffect(() => {
    dialog.current?.showModal()
  }, [])

  const save = async (e: FormEvent) => {
    e.preventDefault()
    setTried(true)
    setError(null)
    if (!name.trim()) return
    setBusy(true)
    try {
      await api(item ? `${base}/${item.id}` : base, { method: item ? 'PUT' : 'POST', body: { name, phone, address } })
      onDone('warehouseSaved')
    } catch (err) {
      setError(errorCode(err))
      setBusy(false)
    }
  }

  const remove = async () => {
    setError(null)
    try {
      await api(`${base}/${item!.id}${item!.hasStock ? `?moveTo=${moveTo}` : ''}`, { method: 'DELETE' })
      onDone('warehouseDeleted')
    } catch (err) {
      setConfirming(false)
      setError(errorCode(err))
    }
  }

  const nameTaken = error === 'warehouseNameTaken'

  return (
    <dialog ref={dialog} className="picker" aria-labelledby="warehouse-title" onClose={onClose}>
      <div className="picker__head">
        <h2 id="warehouse-title">{t(item ? 'warehouseEdit' : 'warehouseAdd')}</h2>
        <button type="button" className="media__dismiss" aria-label={t('mediaClose')} onClick={onClose}><X size={18} aria-hidden="true" /></button>
      </div>
      <form className="warehouse-form" onSubmit={(e) => void save(e)} noValidate>
        <div className="picker__body">
          {error && !nameTaken && <p className="form-error" role="alert">{t(errorLabel(error))}</p>}
          <Field id="warehouse-name" label={t('warehouseName')} maxLength={100} autoComplete="off" placeholder={t('warehouseNameHint')} value={name} error={nameTaken ? t('errWarehouseNameTaken') : tried && !name.trim() ? t('errNameRequired') : undefined} onChange={(e) => { setName(e.target.value); setError(null) }} />
          <Field id="warehouse-phone" label={t('warehousePhone')} type="tel" maxLength={30} autoComplete="off" placeholder={t('productOptional')} value={phone} onChange={(e) => setPhone(e.target.value)} />
          <div className="field">
            <label htmlFor="warehouse-address">{t('warehouseAddress')}</label>
            <textarea id="warehouse-address" className="input input--area" rows={3} maxLength={500} placeholder={t('productOptional')} value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
          {item && canDelete && others.length === 0 && <p className="field__help">{t('warehouseLastNote')}</p>}
          {item && canDelete && others.length > 0 && (
            confirming
              ? (
                <div className="stack">
                  {item.hasStock
                    ? (
                      <div className="field">
                        <label htmlFor="warehouse-move">{t('warehouseMoveTo', { n: num(item.units) })}</label>
                        <select id="warehouse-move" className="input" value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
                          {others.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                        </select>
                      </div>
                    )
                    : <p className="muted">{t('warehouseDeleteWarning')}</p>}
                  <div className="row">
                    <Button onClick={() => setConfirming(false)}>{t('cancel')}</Button>
                    <Button variant="danger" onClick={() => void remove()}>{t('productConfirmDelete')}</Button>
                  </div>
                </div>
              )
              : <button type="button" className="media-details__delete" onClick={() => setConfirming(true)}>{t('warehouseDelete')}</button>
          )}
        </div>
        <div className="picker__foot row--end">
          <Button onClick={onClose}>{t('cancel')}</Button>
          <Button type="submit" variant="primary" aria-busy={busy} disabled={busy}>{t('productSave')}</Button>
        </div>
      </form>
    </dialog>
  )
}
