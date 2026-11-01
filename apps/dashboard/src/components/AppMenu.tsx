import { useLocation, useNavigate } from 'react-router'
import * as Dropdown from '@radix-ui/react-dropdown-menu'
import { Check, ChevronsUpDown, LayoutGrid, Plus } from 'lucide-react'
import type { Role } from '../account'
import { useAccount, useCurrentStore } from '../account-context'
import { useLang, type Key, type Lang } from '../i18n'

export const roleLabels: Record<Role, Key> = { owner: 'roleOwner', admin: 'roleAdmin', staff: 'roleStaff' }

// Square for a store, round for a person.
export function StoreMark({ name, round }: { name: string; round?: boolean }) {
  return <span className={round ? 'store-mark store-mark--round' : 'store-mark'} aria-hidden="true">{name.charAt(0).toUpperCase()}</span>
}

// Store switcher inside a store; account and language menu everywhere.
export function AppMenu({ side = 'bottom', align = 'end', container }: { side?: 'top' | 'bottom'; align?: 'start' | 'end'; container?: HTMLElement | null }) {
  const { t, lang, setLang } = useLang()
  const { me, myStores } = useAccount()
  const current = useCurrentStore()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const label = current?.store.name ?? me.name

  // Switching keeps the seller on the same screen in the other store.
  const switchTo = (handle: string) => {
    const rest = current ? pathname.slice(`/store/${current.store.handle}`.length) : ''
    navigate(`/store/${handle}${rest}`)
  }

  return (
    <Dropdown.Root modal={false}>
      <Dropdown.Trigger className="store-button">
        <StoreMark name={label} round={!current} />
        <span className="store-button__name">{label}</span>
        <ChevronsUpDown size={14} aria-hidden="true" />
      </Dropdown.Trigger>
      <Dropdown.Portal container={container}>
        <Dropdown.Content className="menu" side={side} align={align} sideOffset={6} collisionPadding={8}>
          {myStores.length > 0 && (
            <Dropdown.Group className="menu__section">
              <Dropdown.Label className="menu__label">{t('switchStore')}</Dropdown.Label>
              <div className="menu__stores">
                {myStores.map(({ store, role }) => {
                  const active = store.id === current?.store.id
                  return (
                    <Dropdown.Item
                      key={store.id}
                      className={active ? 'menu__item menu__store menu__store--active' : 'menu__item menu__store'}
                      onSelect={() => switchTo(store.handle)}
                    >
                      <StoreMark name={store.name} />
                      <span className="menu__text">
                        <span className="menu__title">{store.name}</span>
                        <span className="menu__sub">{t(roleLabels[role])}</span>
                      </span>
                      {active && <Check className="menu__check" size={16} aria-label={t('currentStore')} />}
                    </Dropdown.Item>
                  )
                })}
              </div>
            </Dropdown.Group>
          )}

          <Dropdown.Group className="menu__section menu__section--ruled">
            <Dropdown.Item className="menu__item menu__action" onSelect={() => navigate('/stores')}>
              <LayoutGrid size={16} aria-hidden="true" />
              {t('allStores')}
            </Dropdown.Item>
            <Dropdown.Item className="menu__item menu__action" onSelect={() => navigate('/stores/new')}>
              <Plus size={16} aria-hidden="true" />
              {t('createStore')}
            </Dropdown.Item>
          </Dropdown.Group>

          <Dropdown.Group className="menu__section menu__section--ruled menu__language">
            <Dropdown.Label className="menu__language-label">{t('language')}</Dropdown.Label>
            <Dropdown.RadioGroup className="menu__segments" value={lang} onValueChange={(value) => setLang(value as Lang)}>
              {/* Stays open so the seller sees the language change take effect. */}
              <Dropdown.RadioItem className="menu__segment" value="bn" onSelect={(e) => e.preventDefault()}>বাংলা</Dropdown.RadioItem>
              <Dropdown.RadioItem className="menu__segment" value="en" onSelect={(e) => e.preventDefault()}>English</Dropdown.RadioItem>
            </Dropdown.RadioGroup>
          </Dropdown.Group>

          <div className="menu__account">
            <StoreMark name={me.name} round />
            <span className="menu__text">
              <span className="menu__title">{me.name}</span>
              <span className="menu__sub">{me.email}</span>
            </span>
          </div>
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  )
}
