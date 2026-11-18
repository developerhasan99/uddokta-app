import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import '@fontsource-variable/inter'
import '@fontsource-variable/noto-sans-bengali'
import './styles/app.css'
import { AccountProvider, lastStoreHandle, RequireAccount, useAccount } from './account-context'
import { LangProvider } from './i18n'
import { nav, channels, settingsNav } from './nav'
import { AccountLayout, Shell } from './components/Shell'
import { ChangeEmail, ForgotPassword, Invite, Login, ResetPassword, Signup, VerifyEmail } from './pages/Auth'
import { Profile } from './pages/Profile'
import { Billing } from './pages/Billing'
import { PlanGate } from './components/Plan'
import { Home } from './pages/Home'
import { Media } from './pages/Media'
import { Menus } from './pages/Menus'
import { MenuEdit } from './pages/MenuEdit'
import { StorePages } from './pages/StorePages'
import { StorePageEdit } from './pages/StorePageEdit'
import { Members } from './pages/Members'
import { CollectionEdit } from './pages/CollectionEdit'
import { Collections } from './pages/Collections'
import { Attributes } from './pages/Attributes'
import { Incomplete } from './pages/Incomplete'
import { Inventory } from './pages/Inventory'
import { NewOrder } from './pages/NewOrder'
import { OrderDetail } from './pages/OrderDetail'
import { OnlineStore } from './pages/OnlineStore'
import { Orders } from './pages/Orders'
import { Protection } from './pages/Protection'
import { PageEditor } from './pages/PageEditor'
import { TemplateEditor } from './pages/TemplateEditor'
import { Pages } from './pages/Pages'
import { Warehouses } from './pages/Warehouses'
import { Placeholder, NotFound } from './pages/Placeholder'
import { ProductEdit } from './pages/ProductEdit'
import { Products } from './pages/Products'
import { RepeatSales } from './pages/RepeatSales'
import { SettingsLayout } from './pages/Settings'
import { NotificationSettings } from './pages/NotificationSettings'
import { Delivery } from './pages/Delivery'
import { Tracking } from './pages/Tracking'
import { Domains } from './pages/Domains'
import { Templates } from './pages/Templates'
import { Invoices } from './pages/Invoices'
import { StoreSettings } from './pages/StoreSettings'
import { Analytics } from './pages/Analytics'
import { Couriers } from './pages/Couriers'
import { Customers } from './pages/Customers'
import { DesignSystem } from './pages/DesignSystem'
import { DiscountEdit } from './pages/DiscountEdit'
import { Discounts } from './pages/Discounts'
import { NewStore, Stores } from './pages/Stores'

// Planned destinations are explicit; working routes below keep their real screens.
const plannedPages = [...nav, ...channels].flatMap((item) => [item, ...(item.children ?? [])]).filter((item) => item.planned)

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
            <Route path="forgot-password" element={<ForgotPassword />} />
            <Route path="reset-password/:token" element={<ResetPassword />} />
            <Route path="verify-email/:token" element={<VerifyEmail />} />
            <Route path="change-email/:token" element={<ChangeEmail />} />
            <Route element={<RequireAccount />}>
              <Route index element={<Start />} />
              <Route element={<AccountLayout />}>
                <Route path="stores" element={<Stores />} />
                <Route path="stores/new" element={<NewStore />} />
                <Route path="account" element={<Profile />} />
                <Route path="*" element={<NotFound />} />
              </Route>
              {/* The page editor fills the screen, like Shopify's: no sidebar. */}
              <Route path="store/:handle" element={<Shell bare />}>
                <Route path="landing-pages/:id" element={<PageEditor />} />
                <Route path="online-store/templates/:id" element={<TemplateEditor />} />
              </Route>
              <Route path="store/:handle" element={<Shell />}>
                <Route index element={<Home />} />
                <Route path="orders" element={<Orders />} />
                <Route path="media" element={<Media />} />
                <Route path="products" element={<Products />} />
                <Route path="products/inventory" element={<Inventory />} />
                <Route path="products/warehouses" element={<Navigate replace to="../settings/warehouses" />} />
                <Route path="products/collections" element={<Collections />} />
                <Route path="products/attributes" element={<Attributes />} />
                <Route path="products/collections/new" element={<CollectionEdit />} />
                <Route path="products/collections/:id" element={<CollectionEdit />} />
                <Route path="products/new" element={<ProductEdit />} />
                <Route path="products/:id" element={<ProductEdit />} />
                <Route path="landing-pages" element={<Pages />} />
                <Route path="customers" element={<Customers />} />
                <Route path="discounts" element={<PlanGate feature="discounts"><Discounts /></PlanGate>} />
                <Route path="discounts/new" element={<PlanGate feature="discounts"><DiscountEdit key="discount" /></PlanGate>} />
                <Route path="discounts/:id" element={<PlanGate feature="discounts"><DiscountEdit key="discount" /></PlanGate>} />
                <Route path="analytics" element={<PlanGate feature="analytics"><Analytics /></PlanGate>} />
                <Route path="customers/repeat-sales" element={<PlanGate feature="repeatSales"><RepeatSales /></PlanGate>} />
                <Route path="online-store" element={<OnlineStore />} />
                <Route path="online-store/templates" element={<Templates />} />
                <Route path="online-store/site-settings" element={<Navigate to=".." relative="path" replace />} />
                <Route path="online-store/menus" element={<PlanGate feature="onlineStore"><Menus /></PlanGate>} />
                <Route path="online-store/menus/:id" element={<PlanGate feature="onlineStore"><MenuEdit /></PlanGate>} />
                <Route path="online-store/pages" element={<PlanGate feature="onlineStore"><StorePages /></PlanGate>} />
                <Route path="online-store/pages/:id" element={<PlanGate feature="onlineStore"><StorePageEdit /></PlanGate>} />
                <Route path="online-store/preferences" element={<Navigate to=".." relative="path" replace />} />
                <Route path="orders/new" element={<NewOrder />} />
                <Route path="orders/protection" element={<PlanGate feature="fakeOrderProtection"><Protection /></PlanGate>} />
                <Route path="orders/incomplete" element={<PlanGate feature="incompleteOrders"><Incomplete /></PlanGate>} />
                <Route path="orders/:id" element={<OrderDetail />} />
                {plannedPages.map((item) => <Route key={item.path} path={item.path.slice(1)} element={<Placeholder item={item.key} />} />)}
                <Route path="settings" element={<SettingsLayout />}>
                  <Route index element={<StoreSettings />} />
                  <Route path="warehouses" element={<Warehouses />} />
                  <Route path="delivery" element={<Delivery />} />
                  <Route path="couriers" element={<Couriers />} />
                  <Route path="invoices" element={<Invoices />} />
                  <Route path="tracking" element={<PlanGate feature="adTracking"><Tracking /></PlanGate>} />
                  <Route path="domains" element={<PlanGate feature="customDomain"><Domains /></PlanGate>} />
                  <Route path="members" element={<Members />} />
                  <Route path="notifications" element={<NotificationSettings />} />
                  <Route path="billing" element={<Billing />} />
                  {settingsNav.filter((item) => item.planned).map((item) => <Route key={item.path} path={item.path.slice('/settings/'.length)} element={<Placeholder item={item.key} />} />)}
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
