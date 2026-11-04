// The root of a merchant host is shared by campaign pages and system routes.
const reservedPages = new Set(['api', 'assets', 'products', 'collections', 'pages', 'checkout', 'cart', 'drafts', 'thanks', 'robots', 'robots-txt', 'sitemap', 'sitemap-xml', 'favicon', 'favicon-ico', 'favicon-svg', 'health', 'healthz', '_health', 'well-known', 'account', 'login', 'logout', 'admin'])
const reservedStores = new Set(['www', 'admin', 'api', 'app', 'media', 'domains', 'cdn', 'assets', 'mail', 'smtp', 'support', 'status', 'staging', 'beta'])
export const isReservedPageHandle = (handle: string) => reservedPages.has(handle.toLowerCase()) || handle.startsWith('.')
export const isReservedStoreHandle = (handle: string) => reservedStores.has(handle.toLowerCase())
// Existing pages with a reserved handle retain their legacy URL until the seller renames them.
export const pageHref = (handle: string) => `${isReservedPageHandle(handle) ? '/pages' : ''}/${encodeURIComponent(handle)}`
