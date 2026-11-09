import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { ChevronRight, Gift, Percent, Plus, ShoppingBag, Tag, Truck } from 'lucide-react'
import { DialogHead } from '../components/DialogHead'
import { useCurrentStore, useStorePath } from '../account-context'
import { api } from '../api'
import { useDialog } from '../components/dialog'
import { Badge, Button, Notice, PageHeader, SearchInput, Skeleton } from '../components/ui'
import { describeDiscount, discountStatus, discountTypes, statusInfo, type Discount, type DiscountStatus } from '../discounts'
import { useLang } from '../i18n'

const typeIcons = { products: Tag, bxgy: Gift, order: ShoppingBag, shipping: Truck }

const tabs: { value: DiscountStatus | ''; label: 'discAll' | 'discActive' | 'discScheduled' | 'discExpired' }[] = [
  { value: '', label: 'discAll' }, { value: 'active', label: 'discActive' }, { value: 'scheduled', label: 'discScheduled' }, { value: 'expired', label: 'discExpired' },
]

export function Discounts() {
  const lang = useLang()
  const { t, num } = lang
  const current = useCurrentStore()!
  const path = useStorePath()
  const navigate = useNavigate()
  const base = `/stores/${current.store.handle}/discounts`
  const [rows, setRows] = useState<Discount[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [tab, setTab] = useState<DiscountStatus | ''>('')
  const [search, setSearch] = useState('')
  const [choosing, setChoosing] = useState(false)

  const load = useCallback(async () => {
    setFailed(false)
    try {
      setRows(await api<Discount[]>(base))
    } catch {
      setFailed(true)
    }
  }, [base])

  useEffect(() => {
    void load()
  }, [load])

  const q = search.trim().toLowerCase()
  const shown = rows?.filter((d) => (!tab || discountStatus(d) === tab) && (!q || (d.code ?? '').toLowerCase().includes(q) || d.title.toLowerCase().includes(q))) ?? []
  const count = (value: DiscountStatus | '') => rows?.filter((d) => !value || discountStatus(d) === value).length ?? 0
  const create = <Button variant="primary" onClick={() => setChoosing(true)}><Plus size={16} aria-hidden="true" />{t('discNew')}</Button>

  return (
    <div className="page">
      <PageHeader title={t('discounts')} description={t('discounts.d')} action={rows && rows.length > 0 ? create : undefined} />

      {failed && <section className="card card--flush"><Notice role="alert" title={t('discLoadFailed')} action={<Button onClick={() => void load()}>{t('retry')}</Button>} /></section>}
      {!failed && !rows && <section className="card" role="status" aria-label={t('loading')}><Skeleton /><Skeleton width="60%" /></section>}

      {rows && rows.length === 0 && (
        <section className="empty-card">
          <Percent size={32} strokeWidth={1.5} aria-hidden="true" />
          <h2>{t('discEmptyTitle')}</h2>
          <p className="muted">{t('discEmptyBody')}</p>
          {create}
        </section>
      )}

      {rows && rows.length > 0 && (
        <div className="data-list">
          <div className="filter-bar">
            <nav className="tabs" aria-label={t('discounts')}>
              {tabs.map((item) => (
                <button key={item.value} type="button" className="tab" aria-current={tab === item.value ? 'page' : undefined} onClick={() => setTab(item.value)}>
                  {t(item.label)} <span className="tab__count">{num(count(item.value))}</span>
                </button>
              ))}
            </nav>
            <SearchInput label={t('discSearch')} value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          {shown.length === 0
            ? <Notice title={t('discNoneInTab')} />
            : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">{t('colDiscount')}</th>
                    <th scope="col" className="data-table__meta">{t('colStatus')}</th>
                    <th scope="col" className="data-table__meta data-table__wide">{t('colMethod')}</th>
                    <th scope="col" className="data-table__meta">{t('colUsed')}</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((d) => {
                    const status = statusInfo[discountStatus(d)]
                    return (
                      <tr key={d.id} className="data-table__row" onClick={() => navigate(path(`/discounts/${d.id}`))}>
                        <td>
                          <Link className="data-table__file" to={path(`/discounts/${d.id}`)} onClick={(e) => e.stopPropagation()}>
                            <span className="data-table__text">
                              <span className="data-table__name">{d.code ?? d.title}</span>
                              <span className="discount-row__sub">{describeDiscount(d, lang).join(' · ')}</span>
                            </span>
                          </Link>
                        </td>
                        <td className="data-table__meta"><Badge tone={status.tone}>{t(status.label)}</Badge></td>
                        <td className="data-table__meta data-table__wide">{t(d.code ? 'discMethodCode' : 'discMethodAuto')}</td>
                        <td className="data-table__meta">{d.maxUses ? `${num(d.uses)} / ${num(d.maxUses)}` : num(d.uses)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
        </div>
      )}

      {choosing && <TypeDialog onClose={() => setChoosing(false)} onChoose={(type) => navigate(path(`/discounts/new?type=${type}`))} />}
    </div>
  )
}

function TypeDialog({ onClose, onChoose }: { onClose: () => void; onChoose: (type: string) => void }) {
  const { t } = useLang()
  const { ref: dialog, close, props: dialogProps } = useDialog(onClose)
  useEffect(() => { dialog.current?.showModal() }, [])
  return (
    <dialog {...dialogProps} className="modal" aria-labelledby="disc-type-title">
      <DialogHead id="disc-type-title" title={t('discChooseType')} onClose={() => close()} />
      <div className="dialog__body dialog__body--flush">
        <ul className="dialog-list">
          {discountTypes.map((item) => {
            const Icon = typeIcons[item.type]
            return (
              <li key={item.type}>
                <button type="button" className="dialog-list__item" onClick={() => close(() => onChoose(item.type))}>
                  <Icon className="dialog-list__icon" size={18} aria-hidden="true" />
                  <span className="dialog-list__text"><strong>{t(item.label)}</strong><span>{t(item.help)}</span></span>
                  <ChevronRight className="dialog-list__chevron" size={18} aria-hidden="true" />
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </dialog>
  )
}
