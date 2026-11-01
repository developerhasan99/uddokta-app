import type { FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { Search } from 'lucide-react'
import { useStorePath } from '../account-context'
import { Badge, LinkButton, Notice, PageHeader, Skeleton, type Tone } from '../components/ui'
import { useLang, type Key } from '../i18n'

type Status = 'new' | 'hold' | 'confirmed' | 'packed' | 'courier' | 'delivered' | 'returned' | 'cancelled'

const statuses: Record<Status, { label: Key; tone: Tone }> = {
  new: { label: 'statusNew', tone: 'info' },
  hold: { label: 'statusHold', tone: 'warning' },
  confirmed: { label: 'statusConfirmed', tone: 'neutral' },
  packed: { label: 'statusPacked', tone: 'neutral' },
  courier: { label: 'statusCourier', tone: 'neutral' },
  delivered: { label: 'statusDelivered', tone: 'success' },
  returned: { label: 'statusReturned', tone: 'danger' },
  cancelled: { label: 'statusCancelled', tone: 'neutral' },
}

// Sample rows for judging the design; replaced by the API in step 4.
const sampleOrders: { no: number; name: { bn: string; en: string }; phone: string; area: { bn: string; en: string }; status: Status; at: string; total: number }[] = [
  { no: 1008, name: { bn: 'রাফি আহমেদ', en: 'Rafi Ahmed' }, phone: '01700-000001', area: { bn: 'ধানমন্ডি, ঢাকা', en: 'Dhanmondi, Dhaka' }, status: 'new', at: '2026-11-01T14:42:00+06:00', total: 1180 },
  { no: 1007, name: { bn: 'নুসরাত জাহান', en: 'Nusrat Jahan' }, phone: '01700-000002', area: { bn: 'আগ্রাবাদ, চট্টগ্রাম', en: 'Agrabad, Chattogram' }, status: 'new', at: '2026-11-01T13:15:00+06:00', total: 650 },
  { no: 1006, name: { bn: 'সাদিয়া ইসলাম', en: 'Sadia Islam' }, phone: '01700-000003', area: { bn: 'উত্তরা, ঢাকা', en: 'Uttara, Dhaka' }, status: 'hold', at: '2026-11-01T11:03:00+06:00', total: 2340 },
  { no: 1005, name: { bn: 'তানভীর হাসান', en: 'Tanvir Hasan' }, phone: '01700-000004', area: { bn: 'জিন্দাবাজার, সিলেট', en: 'Zindabazar, Sylhet' }, status: 'confirmed', at: '2026-10-31T19:30:00+06:00', total: 990 },
  { no: 1004, name: { bn: 'মারিয়া খান', en: 'Maria Khan' }, phone: '01700-000005', area: { bn: 'মিরপুর, ঢাকা', en: 'Mirpur, Dhaka' }, status: 'packed', at: '2026-10-31T16:12:00+06:00', total: 1475 },
  { no: 1003, name: { bn: 'ইমরান হোসেন', en: 'Imran Hossain' }, phone: '01700-000006', area: { bn: 'সাহেব বাজার, রাজশাহী', en: 'Saheb Bazar, Rajshahi' }, status: 'courier', at: '2026-10-30T10:47:00+06:00', total: 590 },
  { no: 1002, name: { bn: 'ফারহানা আক্তার', en: 'Farhana Akter' }, phone: '01700-000007', area: { bn: 'খালিশপুর, খুলনা', en: 'Khalishpur, Khulna' }, status: 'delivered', at: '2026-10-28T20:05:00+06:00', total: 3120 },
  { no: 1001, name: { bn: 'জাহিদ করিম', en: 'Zahid Karim' }, phone: '01700-000008', area: { bn: 'গুলশান, ঢাকা', en: 'Gulshan, Dhaka' }, status: 'returned', at: '2026-10-27T09:21:00+06:00', total: 820 },
]

const demoStates: { value: string; label: Key }[] = [
  { value: '', label: 'stateFull' },
  { value: 'loading', label: 'stateLoading' },
  { value: 'empty', label: 'stateEmpty' },
  { value: 'error', label: 'stateError' },
]

export function Orders() {
  const { t, lang, num, money, time } = useLang()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const path = useStorePath()
  const status = params.get('status') ?? ''
  const q = (params.get('q') ?? '').toLowerCase()
  const state = params.get('state') ?? ''

  const withParams = (changes: Record<string, string>) => {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value)
      else next.delete(key)
    }
    const query = next.toString()
    return query ? `${path('/orders')}?${query}` : path('/orders')
  }

  const filter = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    navigate(withParams({ q: String(new FormData(e.currentTarget).get('q') ?? '').trim() }))
  }

  const source = state === 'empty' ? [] : sampleOrders
  const matches = source.filter((o) =>
    !q || [String(o.no), o.phone, o.name.bn, o.name.en].some((v) => v.toLowerCase().includes(q)),
  )
  const rows = matches.filter((o) => !status || o.status === status)
  const count = (s: Status) => matches.filter((o) => o.status === s).length

  return (
    <div className="page">
      <PageHeader title={t('orders')} description={t('orders.d')} action={<LinkButton to={path('/orders/new')} variant="primary">{t('newOrder')}</LinkButton>} />

      <div className="sample-note">
        <Badge>{t('sampleData')}</Badge>
        <p className="muted">{t('sampleNote')}</p>
        <div className="sample-note__states" role="group" aria-label={t('previewState')}>
          {demoStates.map((d) => (
            <Link key={d.value} to={withParams({ state: d.value })} className="tab" aria-current={state === d.value ? 'true' : undefined}>
              {t(d.label)}
            </Link>
          ))}
        </div>
      </div>

      <section className="card card--flush">
        <div className="filter-bar">
        <nav className="tabs" aria-label={t('ordersLabel')}>
          <Link to={withParams({ status: '' })} className="tab" aria-current={!status ? 'page' : undefined}>
            {t('statusAll')} <span className="tab__count">{num(matches.length)}</span>
          </Link>
          {(Object.keys(statuses) as Status[]).map((s) => (
            <Link key={s} to={withParams({ status: s })} className="tab" aria-current={status === s ? 'page' : undefined}>
              {t(statuses[s].label)} <span className="tab__count">{num(count(s))}</span>
            </Link>
          ))}
        </nav>
        <form className="filter-search" role="search" onSubmit={filter}>
          <Search size={16} aria-hidden="true" />
          <input key={q} name="q" type="search" aria-label={t('search')} placeholder={t('ordersFilterHint')} defaultValue={params.get('q') ?? ''} autoComplete="off" />
        </form>
        </div>

        {state === 'loading' && (
          <div className="skeleton-rows" role="status" aria-label={t('loading')}>
            {sampleOrders.map((o) => (
              <div key={o.no} className="skeleton-row">
                <Skeleton width="4rem" /><Skeleton width="10rem" /><Skeleton width="8rem" /><Skeleton width="5rem" /><Skeleton width="4rem" />
              </div>
            ))}
          </div>
        )}

        {state === 'error' && (
          <Notice role="alert" title={t('ordersError')} body={t('ordersErrorBody')} action={<LinkButton to={withParams({ state: '' })}>{t('retry')}</LinkButton>} />
        )}

        {(state === '' || state === 'empty') && rows.length === 0 && (
          q || status
            ? <Notice title={t('ordersNoMatch')} body={t('ordersNoMatchBody')} action={<LinkButton to={withParams({ q: '', status: '' })}>{t('clearFilters')}</LinkButton>} />
            : <Notice title={t('ordersEmptyTitle')} body={t('ordersEmptyBody')} action={<LinkButton to={path('/orders/new')}>{t('newOrder')}</LinkButton>} />
        )}

        {(state === '' || state === 'empty') && rows.length > 0 && (
          <table className="table">
            <thead>
              <tr>
                <th scope="col">{t('colOrder')}</th>
                <th scope="col">{t('colCustomer')}</th>
                <th scope="col">{t('colArea')}</th>
                <th scope="col">{t('colStatus')}</th>
                <th scope="col">{t('colTime')}</th>
                <th scope="col" className="num">{t('colTotal')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.no}>
                  <th scope="row" className="num" data-label={t('colOrder')}>#{num(o.no).replace(/[,،]/g, '')}</th>
                  <td data-label={t('colCustomer')}>
                    {o.name[lang]}
                    <span className="table__sub num">{o.phone}</span>
                  </td>
                  <td data-label={t('colArea')}>{o.area[lang]}</td>
                  <td data-label={t('colStatus')}><Badge tone={statuses[o.status].tone}>{t(statuses[o.status].label)}</Badge></td>
                  <td className="muted num" data-label={t('colTime')}>{time(o.at)}</td>
                  <td className="num" data-label={t('colTotal')}>{money(o.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}
