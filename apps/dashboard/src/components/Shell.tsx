import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router'
import { Menu, X } from 'lucide-react'
import { rememberStore, useCurrentStore, useStorePath } from '../account-context'
import { useLang } from '../i18n'
import { channels, nav, settingsItem, type NavItem } from '../nav'
import { AppMenu } from './AppMenu'
import { LinkButton, Notice, PageHeader } from './ui'

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
      </NavLink>
      {isOpen && item.children && (
        <ul className="nav-sub">
          {item.children.map((child) => (
            <li key={child.path}>
              <NavLink to={path(child.path)} className="nav-link nav-link--sub">{t(child.key)}</NavLink>
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

function Sidebar({ menuContainer }: { menuContainer?: HTMLElement | null }) {
  const { t } = useLang()
  const path = useStorePath()
  return (
    <nav className="sidebar" aria-label={t('mainNav')}>
      <Link to={path('/')} className="brand">
        <img src="/favicon.svg" width="28" height="28" alt="" />
        {t('appName')}
      </Link>
      <ul className="nav-list">
        {nav.map((item) => <NavRow key={item.path} item={item} />)}
      </ul>
      <h2 className="nav-heading">{t('salesChannels')}</h2>
      <ul className="nav-list">
        <NavRow item={channels} />
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
  const [drawerOpen, setDrawerOpen] = useState(false)
  const drawer = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    if (drawerOpen) drawer.current?.showModal()
    else drawer.current?.close()
  }, [drawerOpen])

  useEffect(() => setDrawerOpen(false), [pathname])

  return (
    <div className="shell">
      <a className="skip-link" href="#main">{t('skip')}</a>
      <aside className="shell__sidebar"><Sidebar /></aside>
      <dialog ref={drawer} className="drawer" onClose={() => setDrawerOpen(false)}>
        <button type="button" className="icon-button drawer__close" aria-label={t('closeMenu')} onClick={() => setDrawerOpen(false)}>
          <X size={20} aria-hidden="true" />
        </button>
        {drawerOpen && <Sidebar menuContainer={drawer.current} />}
      </dialog>
      <header className="mobilebar">
        <button type="button" className="icon-button" aria-label={t('openMenu')} onClick={() => setDrawerOpen(true)}>
          <Menu size={20} aria-hidden="true" />
        </button>
        <span className="brand">{t('appName')}</span>
      </header>
      <main id="main" className="shell__main" tabIndex={-1}>
        <Outlet />
      </main>
    </div>
  )
}

// Everything under /store/:handle needs a membership in that store.
export function Shell() {
  const { t } = useLang()
  const current = useCurrentStore()
  const handle = current?.store.handle

  useEffect(() => {
    if (handle) rememberStore(handle)
  }, [handle])

  if (current) return <StoreShell />
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
