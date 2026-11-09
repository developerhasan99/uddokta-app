import type { Role } from './account-context'
import type { Key } from './i18n'

// What each role can do, shown on Settings › Team. This list only explains the rules: they are enforced by
// row-level security (my_role / can_manage in the migrations) and a few API checks (analytics.ts, couriers.ts).
// Change the enforcement first, then this list, so the table never promises what the system refuses.
const all: Role[] = ['owner', 'admin', 'staff']
const managers: Role[] = ['owner', 'admin']

export const roleDescriptions: Record<Role, Key> = { owner: 'roleOwnerD', admin: 'roleAdminD', staff: 'roleStaffD' }

export const permissionGroups: { title: Key; rows: { label: Key; roles: Role[] }[] }[] = [
  { title: 'permOrders', rows: [
    { label: 'permOrdersWork', roles: all },
    { label: 'permOrdersAdd', roles: all },
    { label: 'permCustomers', roles: all },
  ] },
  { title: 'permProducts', rows: [
    { label: 'permProductsEdit', roles: all },
    { label: 'permProductsDelete', roles: managers },
    { label: 'permBuyingPrice', roles: managers },
  ] },
  { title: 'permSelling', rows: [
    { label: 'permPagesEdit', roles: all },
    { label: 'permDiscountsEdit', roles: all },
    { label: 'permMediaUpload', roles: all },
    { label: 'permSellingDelete', roles: managers },
  ] },
  { title: 'permReports', rows: [
    { label: 'permAnalytics', roles: managers },
  ] },
  { title: 'permSettings', rows: [
    { label: 'permSettingsStore', roles: managers },
    { label: 'permSettingsDelivery', roles: managers },
    { label: 'permWarehouses', roles: all },
    { label: 'permWarehousesDelete', roles: managers },
    { label: 'permNotifications', roles: all },
  ] },
  { title: 'permTeam', rows: [
    { label: 'permTeamManage', roles: managers },
    { label: 'permTeamOwners', roles: ['owner'] },
    { label: 'permTeamLeave', roles: all },
  ] },
]
