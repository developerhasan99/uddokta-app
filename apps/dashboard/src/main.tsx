import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import '@fontsource-variable/inter'
import '@fontsource-variable/noto-sans-bengali'
import './styles/app.css'
import { AccountProvider, lastStoreHandle, RequireAccount, useAccount } from './account-context'
import { LangProvider } from './i18n'
import { channels, nav, settingsNav } from './nav'
import { AccountLayout, Shell } from './components/Shell'
import { Invite, Login, Signup } from './pages/Auth'
import { Home } from './pages/Home'
import { Media } from './pages/Media'
import { Members } from './pages/Members'
import { Orders } from './pages/Orders'
import { Placeholder, NotFound } from './pages/Placeholder'
import { SettingsLayout } from './pages/Settings'
import { DesignSystem } from './pages/DesignSystem'
import { NewStore, Stores } from './pages/Stores'

const built = new Set(['/', '/orders', '/media'])
const placeholders = [...nav, channels]
  .flatMap((item) => [item, ...(item.children ?? [])])
  .filter((item) => !built.has(item.path))

// Back to the last store used, otherwise the store list (which also covers users with no store).
function Start() {
  const { myStores } = useAccount()
  const last = lastStoreHandle()
  return <Navigate replace to={myStores.some((m) => m.store.handle === last) ? `/store/${last}` : '/stores'} />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LangProvider>
      <AccountProvider>
        <BrowserRouter>
          <Routes>
            <Route path="login" element={<Login />} />
            <Route path="signup" element={<Signup />} />
            <Route path="invite/:token" element={<Invite />} />
            <Route element={<RequireAccount />}>
              <Route index element={<Start />} />
              <Route element={<AccountLayout />}>
                <Route path="stores" element={<Stores />} />
                <Route path="stores/new" element={<NewStore />} />
                <Route path="*" element={<NotFound />} />
              </Route>
              <Route path="store/:handle" element={<Shell />}>
                <Route index element={<Home />} />
                <Route path="orders" element={<Orders />} />
                <Route path="media" element={<Media />} />
                <Route path="orders/new" element={<Placeholder item="newOrder" />} />
                {placeholders.map((item) => (
                  <Route key={item.path} path={item.path.slice(1)} element={<Placeholder item={item.key} />} />
                ))}
                <Route path="settings" element={<SettingsLayout />}>
                  {settingsNav.map((item) => (
                    item.key === 'sStore'
                      ? <Route key={item.path} index element={<Placeholder item={item.key} />} />
                      : <Route key={item.path} path={item.path.slice('/settings/'.length)} element={item.key === 'members' ? <Members /> : <Placeholder item={item.key} />} />
                  ))}
                </Route>
                <Route path="design-system" element={<DesignSystem />} />
                <Route path="*" element={<NotFound />} />
              </Route>
            </Route>
          </Routes>
        </BrowserRouter>
      </AccountProvider>
    </LangProvider>
  </StrictMode>,
)
