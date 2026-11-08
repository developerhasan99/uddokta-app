import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router'
import { Menu, X } from 'lucide-react'
import { rememberStore, useCurrentStore, useStorePath } from '../account-context'
import { useLang } from '../i18n'
import { channels, nav, settingsItem, type NavItem } from '../nav'
import { AppMenu } from './AppMenu'
import { LinkButton, Notice, PageHeader } from './ui'
import { animateOut } from './dialog'
import { NotificationBell, useNotificationFeed, type NotificationFeed } from './Notifications'

function NavRow({ item }: { item: NavItem }) {
  const { t } = useLang()
  const { pathname } = useLocation()
  const path = useStorePath()
  const Icon = item.icon
  const to = path(item.path)
  const isOpen = item.path !== '/' && (pathname === to || pathname.startsWith(`${to}/`))

  return (
    <li>
      <NavLink to={to} end={item.path === '/'} className="nav-link">
        <Icon size={16} aria-hidden="true" />
        {t(item.key)}
        {item.planned && <span className="nav-soon" title={t('comingSoon')}>{t('navSoon')}</span>}
      </NavLink>
      {isOpen && item.children && (
        <ul className="nav-sub">
          {item.children.map((child) => (
            <li key={child.path}>
              <NavLink to={path(child.path)} className="nav-link nav-link--sub">{t(child.key)}{child.planned && <span className="nav-soon" title={t('comingSoon')}>{t('navSoon')}</span>}</NavLink>
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

// The phone drawer passes no feed: on phones the bell lives in the top bar instead.
function Sidebar({ menuContainer, feed }: { menuContainer?: HTMLElement | null; feed?: NotificationFeed }) {
  const { t } = useLang()
  const path = useStorePath()
  const handle = useCurrentStore()!.store.handle
  return (
    <nav className="sidebar" aria-label={t('mainNav')}>
      <div className="sidebar__top">
        <Link to={path('/')} className="brand">
          <img src="/favicon.svg" width="28" height="28" alt="" />
          {t('appName')}
        </Link>
        {feed && <NotificationBell feed={feed} handle={handle} />}
      </div>
      <ul className="nav-list">
        {nav.map((item) => <NavRow key={item.path} item={item} />)}
      </ul>
      <h2 className="nav-heading">{t('salesChannels')}</h2>
      <ul className="nav-list">
        {channels.map((item) => <NavRow key={item.path} item={item} />)}
      </ul>
      <div className="nav-bottom">
        <ul className="nav-list">
          <NavRow item={settingsItem} />
        </ul>
        <AppMenu side="top" align="start" container={menuContainer} />
      </div>
    </nav>
  )
}

function StoreShell() {
  const { t } = useLang()
  const { pathname } = useLocation()
  const handle = useCurrentStore()!.store.handle
  const feed = useNotificationFeed(handle)
  const unread = feed.page?.unread ?? 0

  // "(3) Orders" in the tab. Pages set their own titles (some after loading), so the count is put back whenever the title changes.
  useEffect(() => {
    const apply = () => {
      const base = document.title.replace(/^\(\d+\+?\) /, '')
      const wanted = unread ? `(${unread > 99 ? '99+' : unread}) ${base}` : base
      if (document.title !== wanted) document.title = wanted
    }
    apply()
    const title = document.querySelector('title')
    if (!title) return
    const watcher = new MutationObserver(apply)
    watcher.observe(title, { childList: true })
    return () => watcher.disconnect()
  }, [unread])
  const [drawerOpen, setDrawerOpen] = useState(false)
  const drawer = useRef<HTMLDialogElement>(null)
  // Kept on screen while the drawer slides out, so its contents do not vanish first.
  const [drawerShown, setDrawerShown] = useState(false)

  useEffect(() => {
    const el = drawer.current
    if (!el) return
    if (drawerOpen) {
      delete el.dataset.closing
      setDrawerShown(true)
      if (!el.open) el.showModal()
    } else if (el.open) {
      void animateOut(el).then(() => {
        if (el.dataset.closing === undefined) return // reopened meanwhile
        el.close()
        delete el.dataset.closing
        setDrawerShown(false)
      })
    }
  }, [drawerOpen])

  useEffect(() => setDrawerOpen(false), [pathname])

  return (
    <div className="shell">
      <a className="skip-link" href="#main">{t('skip')}</a>
      <aside className="shell__sidebar"><Sidebar feed={feed} /></aside>
      <dialog ref={drawer} className="drawer" onCancel={(e) => { e.preventDefault(); setDrawerOpen(false) }} onClose={() => { setDrawerOpen(false); setDrawerShown(false) }}>
        <button type="button" className="icon-button drawer__close" aria-label={t('closeMenu')} onClick={() => setDrawerOpen(false)}>
          <X size={20} aria-hidden="true" />
        </button>
        {drawerShown && <Sidebar menuContainer={drawer.current} />}
      </dialog>
      <header className="mobilebar">
        <button type="button" className="icon-button" aria-label={t('openMenu')} onClick={() => setDrawerOpen(true)}>
          <Menu size={20} aria-hidden="true" />
        </button>
        <span className="brand">{t('appName')}</span>
        <span className="mobilebar__end"><NotificationBell feed={feed} handle={handle} align="end" /></span>
      </header>
      <main id="main" className="shell__main" tabIndex={-1}>
        <Outlet />
      </main>
    </div>
  )
}

// Everything under /store/:handle needs a membership in that store.
export function Shell({ bare = false }: { bare?: boolean }) {
  const { t } = useLang()
  const current = useCurrentStore()
  const handle = current?.store.handle

  useEffect(() => {
    if (handle) rememberStore(handle)
  }, [handle])

  if (current) return bare ? <Outlet /> : <StoreShell />
  return (
    <AccountLayout>
      <div className="page page--narrow">
        <PageHeader title={t('noAccessTitle')} />
        <section className="card card--flush">
          <Notice title={t('noAccessTitle')} body={t('noAccessBody')} action={<LinkButton to="/stores">{t('allStores')}</LinkButton>} />
        </section>
      </div>
    </AccountLayout>
  )
}

// The frame for screens outside any store: a user may have no store at all.
export function AccountLayout({ children }: { children?: React.ReactNode }) {
  const { t } = useLang()
  return (
    <div className="account">
      <a className="skip-link" href="#main">{t('skip')}</a>
      <header className="account__bar">
        <Link to="/stores" className="brand">
          <img src="/favicon.svg" width="28" height="28" alt="" />
          {t('appName')}
        </Link>
        <AppMenu />
      </header>
      <main id="main" className="account__panel" tabIndex={-1}>
        {children ?? <Outlet />}
      </main>
    </div>
  )
}
