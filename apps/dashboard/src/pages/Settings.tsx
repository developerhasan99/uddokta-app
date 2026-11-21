import { NavLink, Outlet } from 'react-router'
import { ScreenBoundary } from '../components/ScreenError'
import { useStorePath } from '../account-context'
import { useLang } from '../i18n'
import { settingsNav, type NavLeaf } from '../nav'
import { LockMark, useHasFeature } from '../components/Plan'

function Locked({ item }: { item: NavLeaf }) {
  return useHasFeature(item.feature) ? null : <LockMark />
}

export function SettingsLayout() {
  const { t } = useLang()
  const path = useStorePath()
  return (
    <div className="settings">
      <nav className="settings__nav" aria-label={t('settings')}>
        <h2>{t('settings')}</h2>
        {settingsNav.map((item) => (
          <NavLink key={item.path} to={path(item.path)} end className="nav-link">{t(item.key)}{item.planned && <span className="nav-soon" title={t('comingSoon')}>{t('navSoon')}</span>}<Locked item={item} /></NavLink>
        ))}
      </nav>
      <div className="settings__body"><ScreenBoundary><Outlet /></ScreenBoundary></div>
    </div>
  )
}
