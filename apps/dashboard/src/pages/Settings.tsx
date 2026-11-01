import { NavLink, Outlet } from 'react-router'
import { useStorePath } from '../account-context'
import { useLang } from '../i18n'
import { settingsNav } from '../nav'

export function SettingsLayout() {
  const { t } = useLang()
  const path = useStorePath()
  return (
    <div className="settings">
      <nav className="settings__nav" aria-label={t('settings')}>
        <h2>{t('settings')}</h2>
        {settingsNav.map((item) => (
          <NavLink key={item.path} to={path(item.path)} end className="nav-link">{t(item.key)}</NavLink>
        ))}
      </nav>
      <div className="settings__body"><Outlet /></div>
    </div>
  )
}
