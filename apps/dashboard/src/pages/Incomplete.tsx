import { useCallback, useEffect, useState } from 'react'
import { Phone } from 'lucide-react'
import { useCurrentStore, useStorePath } from '../account-context'
import { api } from '../api'
import { Button, LinkButton, Notice, PageHeader, Skeleton } from '../components/ui'
import { useLang, type Key } from '../i18n'

type Draft = { id: string; phone: string; name: string; address: string; productName: string; status: string; updatedAt: string }
type Page = { items: Draft[]; counts: Partial<Record<string, number>> }
const tabs: { status: string; label: Key }[] = [
  { status: 'open', label: 'draftsToCall' },
  { status: 'ordered', label: 'draftsOrdered' },
  { status: 'dismissed', label: 'draftsDismissed' },
]

export function Incomplete() {
  const { t, num, time } = useLang()
  const path = useStorePath()
  const base = `/stores/${useCurrentStore()!.store.handle}/drafts`
  const [status, setStatus] = useState('open')
  const [page, setPage] = useState<Page | null>(null)
  const [failed, setFailed] = useState(false)
  const [moving, setMoving] = useState<string | null>(null)
  const [moveFailed, setMoveFailed] = useState(false)

  const load = useCallback(async () => {
    setFailed(false)
    try {
      setPage(await api<Page>(`${base}?status=${status}`))
    } catch {
      setFailed(true)
    }
  }, [base, status])

  useEffect(() => {
    void load()
  }, [load])

  const move = async (draft: Draft, next: 'open' | 'dismissed') => {
    setMoving(draft.id)
    setMoveFailed(false)
    try {
      await api(`${base}/${draft.id}`, { method: 'PATCH', body: { status: next } })
      await load()
    } catch {
      setMoveFailed(true)
    } finally {
      setMoving(null)
    }
  }

  const recoveryPath = (draft: Draft) => {
    const query = new URLSearchParams({ name: draft.name, phone: draft.phone, address: draft.address, product: draft.productName })
    return path(`/orders/new?${query}`)
  }

  return (
    <div className="page">
      <PageHeader title={t('incomplete')} description={t('incomplete.d')} />
      <section className="data-list">
        <div className="filter-bar">
          <nav className="tabs" aria-label={t('incomplete')}>
            {tabs.map((tab) => (
              <button key={tab.status} type="button" className="tab" aria-current={status === tab.status ? 'page' : undefined} onClick={() => setStatus(tab.status)}>
                {t(tab.label)} <span className="tab__count">{num(page?.counts[tab.status] ?? 0)}</span>
              </button>
            ))}
          </nav>
        </div>
        {failed && <Notice role="alert" title={t('draftsLoadFailed')} action={<Button onClick={() => void load()}>{t('retry')}</Button>} />}
        {moveFailed && <Notice role="alert" title={t('draftsMoveFailed')} action={<Button onClick={() => void load()}>{t('retry')}</Button>} />}
        {!failed && !page && <div className="skeleton-rows" role="status" aria-label={t('loading')}><div className="skeleton-row"><Skeleton width="10rem" /><Skeleton width="8rem" /></div></div>}
        {page && page.items.length === 0 && <Notice title={status === 'open' ? t('draftsEmpty') : t('draftsEmptyOther')} />}
        {page && page.items.length > 0 && (
          <table className="data-table data-table--stack">
            <thead>
              <tr>
                <th scope="col">{t('colCustomer')}</th>
                <th scope="col">{t('colPhone')}</th>
                <th scope="col">{t('colAddress')}</th>
                <th scope="col">{t('newOrderProduct')}</th>
                <th scope="col">{t('colTime')}</th>
                <th scope="col" className="end"><span className="visually-hidden">{t('orderNext')}</span></th>
              </tr>
            </thead>
            <tbody>
              {page.items.map((d) => (
                <tr key={d.id}>
                  <td data-label={t('colCustomer')}>{d.name || '—'}</td>
                  <td className="num" data-label={t('colPhone')}>{d.phone}</td>
                  <td className="data-table__truncate" data-label={t('colAddress')} title={d.address ?? undefined}>{d.address || '—'}</td>
                  <td data-label={t('newOrderProduct')}>{d.productName}</td>
                  <td className="muted" data-label={t('colTime')}>{time(d.updatedAt)}</td>
                  <td data-label={t('orderNext')}>
                    <div className="row row--end">
                      {status === 'open' && <a className="btn" href={`tel:${d.phone}`}><Phone size={16} aria-hidden="true" />{t('orderCall')}</a>}
                      {status === 'open' && <a className="btn" href={`https://wa.me/88${d.phone}`} target="_blank" rel="noopener">{t('orderWhatsApp')}</a>}
                      {status === 'open' && <LinkButton to={recoveryPath(d)}>{t('draftsCreateOrder')}</LinkButton>}
                      {status === 'open' && <Button disabled={moving === d.id} aria-busy={moving === d.id} onClick={() => void move(d, 'dismissed')}>{t('draftsDismiss')}</Button>}
                      {status === 'dismissed' && <Button disabled={moving === d.id} aria-busy={moving === d.id} onClick={() => void move(d, 'open')}>{t('draftsReopen')}</Button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      <p className="muted">{t('draftsNote')}</p>
    </div>
  )
}
