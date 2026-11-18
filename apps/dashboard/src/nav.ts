import {
  ChartColumn, House, Image, LayoutTemplate, MessageCircle, Percent, Settings, ShoppingBag, Store, Tag, Users,
  type LucideIcon,
} from 'lucide-react'
import type { PlanFeature } from 'storefront/plans'
import type { Key } from './i18n'

// feature: the plan tool the screen belongs to; without it the menu shows a lock and the screen explains why.
export type NavLeaf = { key: Key; path: string; planned?: boolean; feature?: PlanFeature }
export type NavItem = NavLeaf & { icon: LucideIcon; children?: NavLeaf[] }

export const nav: NavItem[] = [
  { key: 'home', path: '/', icon: House },
  {
    key: 'orders', path: '/orders', icon: ShoppingBag,
    children: [
      { key: 'incomplete', path: '/orders/incomplete', feature: 'incompleteOrders' },
      { key: 'fraud', path: '/orders/protection', feature: 'fakeOrderProtection' },
    ],
  },
  {
    key: 'products', path: '/products', icon: Tag,
    children: [
      { key: 'collections', path: '/products/collections' },
      { key: 'inventory', path: '/products/inventory' },
      { key: 'attributes', path: '/products/attributes' },
    ],
  },
  {
    key: 'customers', path: '/customers', icon: Users,
    children: [
      { key: 'segments', path: '/customers/segments', planned: true },
      { key: 'repeatSales', path: '/customers/repeat-sales', feature: 'repeatSales' },
    ],
  },
  {
    key: 'inbox', path: '/inbox', icon: MessageCircle, planned: true,
    children: [{ key: 'salesman', path: '/inbox/salesman', planned: true }],
  },
  { key: 'discounts', path: '/discounts', icon: Percent, feature: 'discounts' },
  { key: 'media', path: '/media', icon: Image },
  { key: 'analytics', path: '/analytics', icon: ChartColumn, feature: 'analytics' },
]

export const channels: NavItem[] = [
  { key: 'landingPages', path: '/landing-pages', icon: LayoutTemplate },
  {
    key: 'onlineStore', path: '/online-store', icon: Store,
    children: [
      { key: 'templates', path: '/online-store/templates' },
      { key: 'pages', path: '/online-store/pages', feature: 'onlineStore' },
      { key: 'menus', path: '/online-store/menus', feature: 'onlineStore' },
    ],
  },
]

export const settingsItem: NavItem = { key: 'settings', path: '/settings', icon: Settings }
export const settingsNav: NavLeaf[] = [
  { key: 'sStore', path: '/settings' },
  { key: 'domains', path: '/settings/domains', feature: 'customDomain' },
  { key: 'members', path: '/settings/members' },
  { key: 'notifications', path: '/settings/notifications' },
  { key: 'sms', path: '/settings/sms', planned: true },
  { key: 'payments', path: '/settings/payments', planned: true },
  { key: 'warehouses', path: '/settings/warehouses' },
  { key: 'shippingTitle', path: '/settings/delivery' },
  { key: 'couriers', path: '/settings/couriers' },
  { key: 'invoices', path: '/settings/invoices' },
  { key: 'tracking', path: '/settings/tracking', feature: 'adTracking' },
  { key: 'billing', path: '/settings/billing' },
]
