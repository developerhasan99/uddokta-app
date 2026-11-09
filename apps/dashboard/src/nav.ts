import {
  ChartColumn, House, Image, LayoutTemplate, MessageCircle, Percent, Settings, ShoppingBag, Store, Tag, Users,
  type LucideIcon,
} from 'lucide-react'
import type { Key } from './i18n'

export type NavLeaf = { key: Key; path: string; planned?: boolean }
export type NavItem = NavLeaf & { icon: LucideIcon; children?: NavLeaf[] }

export const nav: NavItem[] = [
  { key: 'home', path: '/', icon: House },
  {
    key: 'orders', path: '/orders', icon: ShoppingBag,
    children: [
      { key: 'incomplete', path: '/orders/incomplete' },
      { key: 'fraud', path: '/orders/protection' },
    ],
  },
  {
    key: 'products', path: '/products', icon: Tag,
    children: [
      { key: 'collections', path: '/products/collections' },
      { key: 'inventory', path: '/products/inventory' },
    ],
  },
  {
    key: 'customers', path: '/customers', icon: Users,
    children: [
      { key: 'segments', path: '/customers/segments', planned: true },
      { key: 'repeatSales', path: '/customers/repeat-sales' },
    ],
  },
  {
    key: 'inbox', path: '/inbox', icon: MessageCircle, planned: true,
    children: [{ key: 'salesman', path: '/inbox/salesman', planned: true }],
  },
  { key: 'discounts', path: '/discounts', icon: Percent },
  { key: 'media', path: '/media', icon: Image },
  { key: 'analytics', path: '/analytics', icon: ChartColumn },
]

export const channels: NavItem[] = [
  { key: 'landingPages', path: '/landing-pages', icon: LayoutTemplate },
  {
    key: 'onlineStore', path: '/online-store', icon: Store,
    children: [
      { key: 'themes', path: '/online-store/themes' },
      { key: 'pages', path: '/online-store/pages', planned: true },
      { key: 'menus', path: '/online-store/menus' },
    ],
  },
]

export const settingsItem: NavItem = { key: 'settings', path: '/settings', icon: Settings }
export const settingsNav: NavLeaf[] = [
  { key: 'sStore', path: '/settings' },
  { key: 'domains', path: '/settings/domains' },
  { key: 'members', path: '/settings/members' },
  { key: 'notifications', path: '/settings/notifications' },
  { key: 'sms', path: '/settings/sms', planned: true },
  { key: 'payments', path: '/settings/payments', planned: true },
  { key: 'warehouses', path: '/settings/warehouses' },
  { key: 'shippingTitle', path: '/settings/delivery' },
  { key: 'couriers', path: '/settings/couriers' },
  { key: 'invoices', path: '/settings/invoices' },
  { key: 'tracking', path: '/settings/tracking' },
  { key: 'billing', path: '/settings/billing', planned: true },
]
