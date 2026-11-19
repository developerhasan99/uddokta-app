import { lazy, StrictMode, type ComponentType } from 'react'
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
import { PlanGate } from './components/Plan'
import { Placeholder, NotFound } from './pages/Placeholder'
import { SettingsLayout } from './pages/Settings'

// Screens load when first opened, so a phone downloads only the shell and the screen it needs. Sign-in screens and the
// layouts stay in the main bundle. React Router navigates in a transition, so the current screen stays until the next
// one has loaded; the Suspense boundaries at each Outlet only show on the first visit.
const screen = <K extends string>(load: () => Promise<Record<K, ComponentType<any>>>, name: K) => lazy(() => load().then((m) => ({ default: m[name] })))
const Profile = screen(() => import('./pages/Profile'), 'Profile')
const Billing = screen(() => import('./pages/Billing'), 'Billing')
const Home = screen(() => import('./pages/Home'), 'Home')
const Media = screen(() => import('./pages/Media'), 'Media')
const Menus = screen(() => import('./pages/Menus'), 'Menus')
const MenuEdit = screen(() => import('./pages/MenuEdit'), 'MenuEdit')
const StorePages = screen(() => import('./pages/StorePages'), 'StorePages')
const StorePageEdit = screen(() => import('./pages/StorePageEdit'), 'StorePageEdit')
const Members = screen(() => import('./pages/Members'), 'Members')
const CollectionEdit = screen(() => import('./pages/CollectionEdit'), 'CollectionEdit')
const Collections = screen(() => import('./pages/Collections'), 'Collections')
const Attributes = screen(() => import('./pages/Attributes'), 'Attributes')
const Incomplete = screen(() => import('./pages/Incomplete'), 'Incomplete')
const Inventory = screen(() => import('./pages/Inventory'), 'Inventory')
const NewOrder = screen(() => import('./pages/NewOrder'), 'NewOrder')
const OrderDetail = screen(() => import('./pages/OrderDetail'), 'OrderDetail')
const OnlineStore = screen(() => import('./pages/OnlineStore'), 'OnlineStore')
const Orders = screen(() => import('./pages/Orders'), 'Orders')
const Protection = screen(() => import('./pages/Protection'), 'Protection')
const PageEditor = screen(() => import('./pages/PageEditor'), 'PageEditor')
const TemplateEditor = screen(() => import('./pages/TemplateEditor'), 'TemplateEditor')
const Pages = screen(() => import('./pages/Pages'), 'Pages')
const Warehouses = screen(() => import('./pages/Warehouses'), 'Warehouses')
const ProductEdit = screen(() => import('./pages/ProductEdit'), 'ProductEdit')
const Products = screen(() => import('./pages/Products'), 'Products')
const RepeatSales = screen(() => import('./pages/RepeatSales'), 'RepeatSales')
const NotificationSettings = screen(() => import('./pages/NotificationSettings'), 'NotificationSettings')
const Delivery = screen(() => import('./pages/Delivery'), 'Delivery')
const Tracking = screen(() => import('./pages/Tracking'), 'Tracking')
const Domains = screen(() => import('./pages/Domains'), 'Domains')
const Templates = screen(() => import('./pages/Templates'), 'Templates')
const Invoices = screen(() => import('./pages/Invoices'), 'Invoices')
const StoreSettings = screen(() => import('./pages/StoreSettings'), 'StoreSettings')
const Analytics = screen(() => import('./pages/Analytics'), 'Analytics')
const Couriers = screen(() => import('./pages/Couriers'), 'Couriers')
const Customers = screen(() => import('./pages/Customers'), 'Customers')
const DesignSystem = screen(() => import('./pages/DesignSystem'), 'DesignSystem')
const DiscountEdit = screen(() => import('./pages/DiscountEdit'), 'DiscountEdit')
const Discounts = screen(() => import('./pages/Discounts'), 'Discounts')
const NewStore = screen(() => import('./pages/Stores'), 'NewStore')
const Stores = screen(() => import('./pages/Stores'), 'Stores')

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
