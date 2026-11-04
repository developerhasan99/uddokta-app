import {
  ChartColumn, House, Image, LayoutTemplate, Megaphone, MessageCircle, Percent, Settings, ShoppingBag, Store, Tag, UserCheck, Users,
  type LucideIcon,
} from 'lucide-react'
import type { Key } from './i18n'

export type NavLeaf = { key: Key; path: string }
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
      { key: 'warehouses', path: '/products/warehouses' },
    ],
  },
  {
    key: 'customers', path: '/customers', icon: Users,
    children: [
      { key: 'segments', path: '/customers/segments' },
      { key: 'repeatSales', path: '/customers/repeat-sales' },
    ],
  },
  {
    key: 'inbox', path: '/inbox', icon: MessageCircle,
    children: [{ key: 'salesman', path: '/inbox/salesman' }],
  },
  {
    key: 'marketing', path: '/marketing', icon: Megaphone,
    children: [
      { key: 'followups', path: '/marketing/follow-ups' },
      { key: 'offers', path: '/marketing/offers' },
    ],
  },
  { key: 'discounts', path: '/discounts', icon: Percent },
  { key: 'media', path: '/media', icon: Image },
  {
    key: 'analytics', path: '/analytics', icon: ChartColumn,
    children: [{ key: 'expenses', path: '/analytics/expenses' }],
  },
  {
    key: 'team', path: '/team', icon: UserCheck,
    children: [
      { key: 'tasks', path: '/team/tasks' },
      { key: 'attendance', path: '/team/attendance' },
    ],
  },
]

export const channels: NavItem[] = [
  { key: 'landingPages', path: '/landing-pages', icon: LayoutTemplate },
  {
    key: 'onlineStore', path: '/online-store', icon: Store,
    children: [
      { key: 'themes', path: '/online-store/themes' },
      { key: 'pages', path: '/online-store/pages' },
      { key: 'menus', path: '/online-store/menus' },
    ],
  },
]

export const settingsItem: NavItem = { key: 'settings', path: '/settings', icon: Settings }
export const settingsNav: NavLeaf[] = [
  { key: 'sStore', path: '/settings' },
  { key: 'couriers', path: '/settings/couriers' },
  { key: 'payments', path: '/settings/payments' },
  { key: 'sms', path: '/settings/sms' },
  { key: 'tracking', path: '/settings/tracking' },
  { key: 'domains', path: '/settings/domains' },
  { key: 'members', path: '/settings/members' },
  { key: 'billing', path: '/settings/billing' },
  { key: 'referrals', path: '/settings/referrals' },
]
