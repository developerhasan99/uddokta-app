// Menus: a tree of links (at most 3 levels). Links to the store's own things hold the thing's id, not its address,
// so renaming a product, collection or page never breaks a menu; the address is worked out when the page is drawn.
// Plain data, no JSX: the API validates with it and the dashboard reuses the types.
import { pageHref } from './paths.ts'

export const linkTypes = ['home', 'products', 'collections', 'search', 'cart', 'account', 'collection', 'product', 'page', 'storePage', 'url', 'phone', 'whatsapp'] as const
export type LinkType = typeof linkTypes[number]
// Links that point at one of the store's records by id.
export const idLinkTypes = ['collection', 'product', 'page', 'storePage'] as const satisfies readonly LinkType[]
export type IdLinkType = typeof idLinkTypes[number]

export type MenuLinkValue = { type: LinkType; id?: string; url?: string }
export type MenuItem = { id: string; title: string; link: MenuLinkValue; children: MenuItem[] }

export const maxMenuDepth = 3
export const maxMenuItems = 150
export const maxMenus = 30
export const fixedMenus = ['main-menu', 'footer'] as const

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const isIdLink = (type: LinkType): type is IdLinkType => (idLinkTypes as readonly string[]).includes(type)
// A web address: a path inside the store or an https address, so a menu can never run script.
export const isWebAddress = (v: unknown): v is string => typeof v === 'string' && v.length <= 500 && (/^\/(?!\/)[^\s]*$/.test(v) || /^https:\/\/[^\s]+$/.test(v))
export const isPhoneNumber = (v: unknown): v is string => typeof v === 'string' && /^\+?[0-9][0-9 -]{5,19}$/.test(v)

function readLink(raw: unknown): MenuLinkValue | null {
  if (!raw || typeof raw !== 'object') return null
  const { type, id, url } = raw as Record<string, unknown>
  if (!(linkTypes as readonly unknown[]).includes(type)) return null
  const t = type as LinkType
  if (isIdLink(t)) return typeof id === 'string' && uuid.test(id) ? { type: t, id: id.toLowerCase() } : null
  if (t === 'url') return isWebAddress(url) ? { type: t, url } : null
  if (t === 'phone' || t === 'whatsapp') return isPhoneNumber(url) ? { type: t, url: url.trim() } : null
  return { type: t }
}

// The menu tree from a request body, or null when anything is off. Item ids are kept when valid, so the editor can track rows.
export function readMenuItems(raw: unknown): MenuItem[] | null {
  let count = 0
  const read = (list: unknown, depth: number): MenuItem[] | null => {
    if (!Array.isArray(list)) return null
    if (list.length && depth > maxMenuDepth) return null
    const out: MenuItem[] = []
    for (const item of list) {
      if (!item || typeof item !== 'object' || ++count > maxMenuItems) return null
      const { id, title, link, children } = item as Record<string, unknown>
      const name = typeof title === 'string' ? title.trim() : ''
      const parsed = readLink(link)
      const kids = read(children ?? [], depth + 1)
      if (typeof id !== 'string' || !/^[a-z0-9-]{1,40}$/i.test(id) || !name || name.length > 60 || !parsed || !kids) return null
      out.push({ id, title: name, link: parsed, children: kids })
    }
    return out
  }
  const items = read(raw, 1)
  if (!items) return null
  const ids = new Set<string>()
  for (const item of walkMenu(items)) {
    if (ids.has(item.id)) return null
    ids.add(item.id)
  }
  return items
}

export function* walkMenu(items: MenuItem[]): Generator<MenuItem> {
  for (const item of items) {
    yield item
    yield* walkMenu(item.children)
  }
}

// Every record id a menu links to, to look up their addresses in one go.
export const linkedIds = (items: MenuItem[]) => [...new Set([...walkMenu(items)].flatMap((i) => (i.link.id ? [i.link.id] : [])))]

// Where linked records live now: id → handle, for the ones a buyer may see.
export type LinkTargets = Map<string, { type: IdLinkType; handle: string }>

const enc = encodeURIComponent
// A link's address, or null when its record is gone or hidden (the storefront then leaves the item out).
export function linkHref(link: MenuLinkValue, targets: LinkTargets): string | null {
  switch (link.type) {
    case 'home': return '/'
    case 'products': return '/products'
    case 'collections': return '/collections'
    case 'search': return '/search'
    case 'cart': return '/cart'
    case 'account': return '/account'
    case 'url': return link.url ?? null
    case 'phone': return `tel:${link.url!.replace(/[ -]/g, '')}`
    case 'whatsapp': {
      const digits = link.url!.replace(/\D/g, '')
      return `https://wa.me/${digits.startsWith('0') ? `88${digits}` : digits}`
    }
    default: {
      const found = link.id ? targets.get(link.id) : undefined
      if (!found || found.type !== link.type) return null
      if (found.type === 'collection') return `/collections/${enc(found.handle)}`
      if (found.type === 'product') return `/products/${enc(found.handle)}`
      return pageHref(found.handle)
    }
  }
}

export type ResolvedItem = { title: string; href: string; children: ResolvedItem[] }

// The tree a buyer sees: items whose record is gone are left out, along with their children.
export function resolveMenu(items: MenuItem[], targets: LinkTargets): ResolvedItem[] {
  return items.flatMap((item) => {
    const href = linkHref(item.link, targets)
    return href ? [{ title: item.title, href, children: resolveMenu(item.children, targets) }] : []
  })
}
