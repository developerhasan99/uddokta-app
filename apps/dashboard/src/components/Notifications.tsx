import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import * as Dropdown from '@radix-ui/react-dropdown-menu'
import { Bell, ClipboardList, PackageCheck, PackageMinus, Settings, ShoppingBag, Undo2, UserPlus, type LucideIcon } from 'lucide-react'
import { api } from '../api'
import { useLang } from '../i18n'
import { roleLabels } from './AppMenu'

export const notificationKinds = ['order_new', 'checkout_draft', 'order_returned', 'order_delivered', 'low_stock', 'member_joined'] as const
export type NotificationKind = (typeof notificationKinds)[number]
type Item = { id: string; kind: NotificationKind; data: Record<string, unknown>; createdAt: string; readAt: string | null }
type Page = { items: Item[]; more: boolean; unread: number }

const pollMs = 30_000
const icons: Record<NotificationKind, LucideIcon> = {
  order_new: ShoppingBag, checkout_draft: ClipboardList, order_delivered: PackageCheck, order_returned: Undo2, low_stock: PackageMinus, member_joined: UserPlus,
}

// Per-device choices, kept in this browser only. They change how news reaches this screen, not what the member receives.
export const devicePrefs = {
  get: (name: 'popups' | 'sound') => {
    try { return localStorage.getItem(`notify.${name}`) === 'on' } catch { return false }
  },
  set: (name: 'popups' | 'sound', on: boolean) => {
    try { localStorage.setItem(`notify.${name}`, on ? 'on' : 'off') } catch {}
  },
}

// A short two-note chime, made in the browser so no sound file is needed.
export function chime() {
  try {
    const audio = new AudioContext()
    for (const [i, freq] of [880, 1320].entries()) {
      const tone = audio.createOscillator()
      const gain = audio.createGain()
      const start = audio.currentTime + i * 0.12
      tone.frequency.value = freq
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(0.15, start + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.25)
      tone.connect(gain).connect(audio.destination)
      tone.start(start)
      tone.stop(start + 0.3)
    }
    setTimeout(() => void audio.close(), 1000)
  } catch {}
}

type Lang = ReturnType<typeof useLang>
// What a notification says and where it leads, from the snapshot the database took.
function describe(n: Item, { t, money, num }: Lang): { title: string; body: string; path: string; flag?: string } {
  const d = n.data as Record<string, string | number | boolean | undefined>
  // Like the order page: local digits, no thousands separator.
  const number = num(Number(d.number ?? 0)).replace(/[,،]/g, '')
  switch (n.kind) {
    case 'order_new': {
      const extra = Number(d.lines) > 1 ? ` ${t('notifMoreLines', { n: num(Number(d.lines) - 1) })}` : ''
      return { title: t('notifOrderNew', { number }), body: [d.name, `${d.product ?? ''}${extra}`, money(Number(d.total))].filter(Boolean).join(' · '), path: `/orders/${d.orderId}`, flag: d.duplicate ? t('notifRepeat') : undefined }
    }
    case 'checkout_draft':
      return { title: t('notifDraft'), body: [d.name || t('notifDraftNoName'), d.product].filter(Boolean).join(' · '), path: '/orders/incomplete' }
    case 'order_delivered':
    case 'order_returned':
      return { title: t(n.kind === 'order_delivered' ? 'notifDelivered' : 'notifReturned', { number }), body: [d.name, money(Number(d.total))].join(' · '), path: `/orders/${d.orderId}` }
    case 'low_stock':
      return { title: t(d.out ? 'notifOutOfStock' : 'notifLowStock', { product: String(d.product ?? '') }), body: [d.variant, t('notifStockLeft', { n: num(Number(d.stock)) })].filter(Boolean).join(' · '), path: `/products/${d.productId}` }
    case 'member_joined':
      return { title: t('notifJoined', { name: String(d.name ?? '') }), body: t(roleLabels[d.role as keyof typeof roleLabels] ?? 'roleStaff'), path: '/settings/members' }
  }
}

// One feed per open store, shared by the sidebar and phone bells. Polls every 30 seconds (browsers slow this
// in background tabs), and tells this device about arrivals in the way the member chose in Settings › Notifications.
// ponytail: polling; switch to server-sent events with LISTEN/NOTIFY if stores outgrow it.
export function useNotificationFeed(handle: string) {
  const lang = useLang()
  const navigate = useNavigate()
  const [page, setPage] = useState<Page | null>(null)
  const [failed, setFailed] = useState(false)
  const known = useRef<Set<string> | null>(null)
  const langRef = useRef(lang)
  langRef.current = lang

  const markRead = useCallback(async (ids?: string[]) => {
    setPage((p) => p && {
      ...p,
      items: p.items.map((n) => (!ids || ids.includes(n.id)) && !n.readAt ? { ...n, readAt: new Date().toISOString() } : n),
      unread: ids ? Math.max(0, p.unread - p.items.filter((n) => ids.includes(n.id) && !n.readAt).length) : 0,
    })
    try {
      const { unread } = await api<{ unread: number }>(`/stores/${handle}/notifications/read`, { method: 'POST', body: ids ? { ids } : {} })
      setPage((p) => p && { ...p, unread })
    } catch {}
  }, [handle])

  const announce = useCallback((fresh: Item[]) => {
    if (devicePrefs.get('sound')) chime()
    if (!document.hidden || !devicePrefs.get('popups') || typeof Notification === 'undefined' || Notification.permission !== 'granted') return
    for (const n of fresh.slice(0, 3)) {
      const { title, body, path } = describe(n, langRef.current)
      const popup = new Notification(title, { body, tag: n.id, icon: '/favicon.svg' })
      popup.onclick = () => {
        window.focus()
        navigate(`/store/${handle}${path}`)
        void markRead([n.id])
        popup.close()
      }
    }
  }, [handle, navigate, markRead])

  const refresh = useCallback(async () => {
    try {
      const latest = await api<Page>(`/stores/${handle}/notifications`)
      setFailed(false)
      const fresh = known.current ? latest.items.filter((n) => !known.current!.has(n.id) && !n.readAt) : []
      known.current = new Set([...(known.current ?? []), ...latest.items.map((n) => n.id)])
      // Keeps older pages the member already opened below the newest ones.
      setPage((p) => {
        if (!p) return latest
        const ids = new Set(latest.items.map((n) => n.id))
        const older = p.items.filter((n) => !ids.has(n.id) && n.createdAt < (latest.items.at(-1)?.createdAt ?? ''))
        return { items: [...latest.items, ...older], more: older.length ? p.more : latest.more, unread: latest.unread }
      })
      if (fresh.length) announce(fresh)
    } catch {
      setFailed(true)
    }
  }, [handle, announce])

  const loadMore = useCallback(async () => {
    const last = page?.items.at(-1)
    if (!last) return
    const older = await api<Page>(`/stores/${handle}/notifications?before=${last.id}`)
    for (const n of older.items) known.current?.add(n.id)
    setPage((p) => p && { items: [...p.items, ...older.items.filter((n) => !p.items.some((m) => m.id === n.id))], more: older.more, unread: older.unread })
  }, [handle, page])

  useEffect(() => {
    known.current = null
    setPage(null)
    void refresh()
    const timer = setInterval(() => void refresh(), pollMs)
    const onVisible = () => { if (!document.hidden) void refresh() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
    // refresh changes with handle only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handle])

  return { page, failed, refresh, markRead, loadMore }
}

export type NotificationFeed = ReturnType<typeof useNotificationFeed>

export function NotificationBell({ feed, handle, container, side = 'bottom', align = 'start' }: { feed: NotificationFeed; handle: string; container?: HTMLElement | null; side?: 'bottom' | 'right'; align?: 'start' | 'end' }) {
  const lang = useLang()
  const { t, ago, num } = lang
  const navigate = useNavigate()
  const { page, failed } = feed
  const unread = page?.unread ?? 0
  const [loadingMore, setLoadingMore] = useState(false)

  const open = (n: Item) => {
    if (!n.readAt) void feed.markRead([n.id])
    navigate(`/store/${handle}${describe(n, lang).path}`)
  }

  return (
    <Dropdown.Root modal={false} onOpenChange={(isOpen) => { if (isOpen) void feed.refresh() }}>
      <Dropdown.Trigger className="icon-button notif-bell" aria-label={unread ? t('notifOpenUnread', { n: num(unread) }) : t('notifOpen')}>
        <Bell size={18} aria-hidden="true" />
        {unread > 0 && <span className="notif-bell__count" aria-hidden="true">{unread > 99 ? `${num(99)}+` : num(unread)}</span>}
      </Dropdown.Trigger>
      <Dropdown.Portal container={container}>
        <Dropdown.Content className="menu notif-panel" side={side} align={align} sideOffset={6} collisionPadding={8}>
          <div className="notif-panel__head">
            <h2>{t('notifOpen')}</h2>
            {unread > 0 && <button type="button" className="link-button" onClick={() => void feed.markRead()}>{t('notifMarkAll')}</button>}
          </div>
          <div className="notif-panel__list">
            {!page && !failed && <p className="notif-panel__note">…</p>}
            {failed && !page && <p className="notif-panel__note" role="alert">{t('notifLoadFailed')}</p>}
            {page && page.items.length === 0 && (
              <div className="notif-panel__empty">
                <Bell size={20} aria-hidden="true" />
                <p className="notif-panel__empty-title">{t('notifEmptyTitle')}</p>
                <p className="muted">{t('notifEmptyBody')}</p>
              </div>
            )}
            {page?.items.map((n) => {
              const { title, body, flag } = describe(n, lang)
              const Icon = icons[n.kind]
              return (
                <Dropdown.Item key={n.id} className={n.readAt ? 'menu__item notif' : 'menu__item notif notif--unread'} onSelect={() => open(n)}>
                  <span className="notif__icon" aria-hidden="true"><Icon size={16} /></span>
                  <span className="notif__text">
                    <span className="notif__title">{title}</span>
                    {body && <span className="notif__body">{body}</span>}
                    <span className="notif__meta">
                      <time dateTime={n.createdAt}>{ago(n.createdAt)}</time>
                      {flag && <span className="badge badge--warning">{flag}</span>}
                    </span>
                  </span>
                  {!n.readAt && <span className="notif__dot"><span className="visually-hidden">{t('notifUnread')}</span></span>}
                </Dropdown.Item>
              )
            })}
            {page?.more && (
              <Dropdown.Item className="menu__item menu__action notif-panel__more" disabled={loadingMore}
                onSelect={(e) => { e.preventDefault(); setLoadingMore(true); void feed.loadMore().finally(() => setLoadingMore(false)) }}>
                {t('notifLoadMore')}
              </Dropdown.Item>
            )}
          </div>
          <Dropdown.Group className="menu__section menu__section--ruled">
            <Dropdown.Item className="menu__item menu__action" onSelect={() => navigate(`/store/${handle}/settings/notifications`)}>
              <Settings size={16} aria-hidden="true" />
              {t('notifSettings')}
            </Dropdown.Item>
          </Dropdown.Group>
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  )
}

