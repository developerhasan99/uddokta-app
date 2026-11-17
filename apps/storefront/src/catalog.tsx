// The store's own pages: home, collection and product. A fixed layout for now; themes come in build step 9.
import type { CSSProperties } from 'react'
import type { Img } from './sections.tsx'
import { taka, tr, type Lang } from './words.ts'
import type { ResolvedItem } from './menus.ts'

export type Card = { id: string; name: string; handle: string; price: number; comparePrice: number | null; image: Img | null; inStock: boolean }
export type CollectionLink = { name: string; handle: string }

const productHref = (handle: string) => `/products/${encodeURIComponent(handle)}`
export const collectionHref = (handle: string) => `/collections/${encodeURIComponent(handle)}`

// The seller's menus. Addresses come from resolveMenu, and are checked again here as they go into the page.
export const safeHref = (href: string) => /^\/(?!\/)[^\s]*$/.test(href) || /^https:\/\/[^\s]+$/.test(href) || /^tel:\+?[0-9]{6,20}$/.test(href)
export const shown = (items: ResolvedItem[]): ResolvedItem[] => items.filter((i) => safeHref(i.href)).map((i) => ({ ...i, children: shown(i.children) }))
const external = (href: string) => (href.startsWith('https:') ? 'noopener' : undefined)

function MenuLinkItem({ item, current }: { item: ResolvedItem; current?: string }) {
  return <a href={item.href} aria-current={item.href === current ? 'page' : undefined} rel={external(item.href)}>{item.title}</a>
}

// Nested items open with <details>, so menus work without JavaScript. A parent's own link comes first inside it.
export function MenuTree({ items, current, level = 1 }: { items: ResolvedItem[]; current?: string; level?: number }) {
  return (
    <ul className={`sf-menu-list sf-menu-list--${level}`}>
      {items.map((item, i) => (
        <li key={i}>
          {item.children.length > 0
            ? <details className="sf-menu-group"><summary>{item.title}</summary><ul className={`sf-menu-list sf-menu-list--${level + 1}`}><li><MenuLinkItem item={item} current={current} /></li>{item.children.map((child, j) => <li key={j}>{child.children.length ? <><MenuLinkItem item={child} current={current} /><MenuTree items={child.children} current={current} level={level + 2} /></> : <MenuLinkItem item={child} current={current} />}</li>)}</ul></details>
            : <MenuLinkItem item={item} current={current} />}
        </li>
      ))}
    </ul>
  )
}

export function Price({ price, comparePrice, lang }: { price: number; comparePrice: number | null; lang?: Lang }) {
  return (
    <span className="sf-price">
      <strong>{taka(price, lang)}</strong>
      {comparePrice !== null && comparePrice > price && <s>{taka(comparePrice, lang)}</s>}
    </span>
  )
}

export function ProductGrid({ cards, columns, mobileColumns, lang }: { cards: Card[]; columns?: number; mobileColumns?: number; lang?: Lang }) {
  return (
    <ul className="sf-grid" style={{ ...(columns ? { '--cols': columns } : {}), ...(mobileColumns ? { '--mcols': mobileColumns } : {}) } as CSSProperties}>
      {cards.map((card) => (
        <li key={card.id}>
          <a className="sf-card" href={productHref(card.handle)}>
            <span className="sf-card__image">{card.image && <img src={card.image.url} alt={card.image.alt} width={card.image.width} height={card.image.height} loading="lazy" decoding="async" />}</span>
            <span className="sf-card__name">{card.name}</span>
            <Price price={card.price} comparePrice={card.comparePrice} lang={lang} />
            {!card.inStock && <span className="sf-card__out">{tr(lang, ['স্টকে নেই', 'Out of stock'])}</span>}
          </a>
        </li>
      ))}
    </ul>
  )
}

export function Pager({ page, hasMore, base, lang }: { page: number; hasMore: boolean; base: string; lang?: Lang }) {
  if (page === 1 && !hasMore) return null
  return (
    <nav className="sf-pager" aria-label={tr(lang, ['পাতা', 'Pages'])}>
      {page > 1 && <a className="sf-button sf-button--outline" href={page === 2 ? base : `${base}?page=${page - 1}`}>{tr(lang, ['আগের পাতা', 'Previous page'])}</a>}
      {hasMore && <a className="sf-button sf-button--outline" href={`${base}?page=${page + 1}`}>{tr(lang, ['পরের পাতা', 'Next page'])}</a>}
    </nav>
  )
}

export function Gallery({ images, name, stacked }: { images: Img[]; name: string; stacked?: boolean }) {
  if (images.length === 0) return <div className="sf-product__image sf-product__image--empty" />
  return (
    <div className={stacked ? 'sf-product__images sf-product__images--stacked' : 'sf-product__images'}>
      {images.map((img, i) => <img key={img.url} className="sf-product__image" src={img.url} alt={img.alt || name} width={img.width} height={img.height} loading={i === 0 ? 'eager' : 'lazy'} decoding="async" />)}
    </div>
  )
}

export const catalogCss = `
.sf-bar__row{display:flex;flex-wrap:wrap;align-items:center;gap:8px 24px}
.sf-bar__name{color:inherit;text-decoration:none}
.sf-nav{font-weight:400;font-size:15px}
.sf-menu-list{list-style:none;margin:0;padding:0}
.sf-nav>.sf-menu-list{display:flex;flex-wrap:wrap;gap:4px 20px;align-items:center}
.sf-nav a,.sf-nav summary,.sf-nav-phone a,.sf-nav-phone summary{color:var(--sf-muted);text-decoration:none;white-space:nowrap;cursor:pointer}
.sf-nav a[aria-current],.sf-nav a:hover,.sf-nav summary:hover,.sf-nav-phone a[aria-current]{color:var(--sf-ink)}
.sf-menu-group{position:relative}
.sf-menu-group>summary{list-style:none}.sf-menu-group>summary::-webkit-details-marker{display:none}
.sf-menu-group>summary::after{content:'';display:inline-block;width:6px;height:6px;margin-left:6px;border:solid currentColor;border-width:0 1.5px 1.5px 0;transform:translateY(-3px) rotate(45deg)}
.sf-nav .sf-menu-group>.sf-menu-list{position:absolute;z-index:20;top:calc(100% + 8px);left:-12px;min-width:200px;display:grid;gap:2px;padding:8px;background:var(--sf-paper);border:1px solid var(--sf-rule);border-radius:var(--sf-radius);box-shadow:0 8px 24px rgb(0 0 0/.08)}
.sf-nav .sf-menu-group .sf-menu-list a{display:block;padding:6px 8px}
.sf-menu-list--3,.sf-menu-list--4{padding-left:12px}
.sf-nav-phone{display:none;margin-left:auto}
.sf-nav-phone>summary{list-style:none;padding:6px 0}.sf-nav-phone>summary::-webkit-details-marker{display:none}
.sf-nav-phone nav{font-weight:400;position:absolute;left:0;right:0;z-index:20;padding:8px 16px 16px;background:var(--sf-paper);border-bottom:1px solid var(--sf-rule)}
.sf-nav-phone .sf-menu-list a,.sf-nav-phone .sf-menu-group>summary{display:block;padding:10px 0;font-size:15px}
.sf-nav-phone .sf-menu-list .sf-menu-list{padding-left:16px}
.sf-bar{position:relative}
.sf-foot__menu{margin-bottom:12px}
.sf-foot__menu>.sf-menu-list{display:flex;flex-wrap:wrap;justify-content:center;gap:8px 20px}
.sf-foot__menu a{color:inherit}
.sf-foot__menu .sf-menu-group>.sf-menu-list{display:grid;gap:4px;margin-top:8px}
.sf-foot p{margin:0}
.sf-collections{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(2,1fr);gap:16px 12px}
.sf-collections a{display:flex;align-items:center;min-height:96px;padding:16px;border:1px solid var(--sf-rule);border-radius:var(--sf-radius);background:var(--sf-tint);color:inherit;text-decoration:none;font-weight:600}
.sf-collections a:hover{border-color:var(--sf-ink)}
.sf-store-page .sf-description{margin-top:8px}
.sf-contact-list{list-style:none;margin:24px 0 0;padding:0;display:grid;gap:12px}
.sf-contact-list li{display:grid;grid-template-columns:120px 1fr;gap:12px;padding-bottom:12px;border-bottom:1px solid var(--sf-rule)}
.sf-contact-list span:first-child{color:var(--sf-muted)}
.sf-contact-list a{color:inherit}
.sf-bar__links{display:flex;align-items:center;gap:16px;margin-left:auto;font-size:15px;font-weight:400}
.sf-bar__links a{color:var(--sf-muted);text-decoration:none}.sf-bar__links a:hover,.sf-bar__links a[aria-current]{color:var(--sf-ink)}
.sf-bar__links .sf-button{margin:0;min-height:40px;font-size:15px}
.sf-bar__count{display:inline-grid;place-items:center;min-width:20px;height:20px;margin-left:4px;padding:0 6px;border-radius:999px;background:var(--sf-accent);color:var(--sf-accent-ink);font-size:12px;font-weight:700}
.sf-nav-phone{margin-left:0}
.sf-buy{display:grid;gap:12px;margin:16px 0}.sf-buy .sf-button{margin:0}
.sf-add{display:flex;flex-wrap:wrap;align-items:end;gap:12px}.sf-add .sf-field{flex:1 1 160px}.sf-add__qty{flex:0 0 96px!important}
.sf-link-button{border:0;background:none;padding:4px 0;color:var(--sf-muted);font:inherit;font-size:14px;text-decoration:underline;cursor:pointer}
.sf-cart__layout{display:grid;gap:24px;align-items:start}
.sf-cart__lines{list-style:none;margin:0;padding:0;display:grid}
.sf-cart__line{display:grid;grid-template-columns:72px 1fr auto;gap:8px 12px;align-items:center;padding:12px 0;border-bottom:1px solid var(--sf-rule)}
.sf-cart__image{display:block;width:72px;aspect-ratio:1;border-radius:var(--sf-radius);overflow:hidden;background:var(--sf-tint)}.sf-cart__image img{width:100%;height:100%;object-fit:cover}
.sf-cart__info{display:grid;gap:2px;min-width:0}.sf-cart__info a{color:inherit;font-weight:600;text-decoration:none}.sf-cart__info small{color:var(--sf-muted)}
.sf-cart__qty{grid-column:2;display:flex;align-items:center;gap:12px}.sf-cart__qty input{width:64px;min-height:40px;padding:6px 8px;border:1px solid var(--sf-rule);border-radius:8px;font:inherit;background:var(--sf-paper);color:inherit}
.sf-cart__total{grid-column:3;grid-row:1}
.sf-search{display:flex;gap:8px;max-width:560px;margin:0 auto 24px}.sf-search input{flex:1;min-height:48px;padding:10px 12px;border:1px solid var(--sf-rule);border-radius:8px;font:inherit;background:var(--sf-paper);color:inherit}.sf-search .sf-button{margin:0}
@media (min-width:720px){.sf-cart__layout{grid-template-columns:minmax(0,1.4fr) minmax(0,1fr)}}
.sf-account__head{display:flex;align-items:baseline;justify-content:space-between;gap:16px}.sf-account__head .sf-heading{text-align:start;margin:0}
.sf-account__switch{margin-top:16px;text-align:center;color:var(--sf-muted)}.sf-account__switch a{color:var(--sf-accent);font-weight:600}
.sf-account__grid{display:grid;gap:24px;margin-top:24px}@media (min-width:720px){.sf-account__grid{grid-template-columns:minmax(0,1.4fr) minmax(0,1fr);align-items:start}}
.sf-account__title{font-size:18px;margin-bottom:12px}
.sf-account__orders{list-style:none;margin:0;padding:0;display:grid;gap:12px}.sf-account__orders li{display:grid;gap:6px;padding:16px;border:1px solid var(--sf-rule);border-radius:var(--sf-radius);background:var(--sf-paper)}
.sf-account__orders li>div{display:flex;justify-content:space-between;gap:12px;align-items:center}.sf-account__orders p{color:var(--sf-muted);font-size:14px}
.sf-account__status{padding:2px 10px;border-radius:999px;background:var(--sf-tint);font-size:13px;font-weight:600}.sf-account__meta{color:var(--sf-muted);font-size:14px}.sf-account__meta strong{color:var(--sf-ink)}
.sf-account__saved{color:var(--sf-accent);font-weight:600}
.sf-password{display:grid;gap:16px;justify-items:center}.sf-password__logo{max-height:80px;width:auto}.sf-password .sf-search{width:100%}
.sf-burger{display:inline-block;vertical-align:middle;width:16px;height:2px;margin:0 8px 2px 0;background:currentColor;box-shadow:0 -5px 0 currentColor,0 5px 0 currentColor}
@media (max-width:719px){.sf-nav{display:none}.sf-nav-phone{display:block}}
.sf-grid{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(var(--mcols,2),minmax(0,1fr));gap:16px 12px}
.sf-card{display:grid;gap:4px;color:inherit;text-decoration:none}
.sf-card__image{display:block;aspect-ratio:1;border-radius:var(--sf-radius);overflow:hidden;background:var(--sf-tint)}
.sf-card__image img{width:100%;height:100%;object-fit:cover}
.sf-card__name{font-weight:600;line-height:1.35}
.sf-card__out{color:var(--sf-muted);font-size:14px}
.sf-price{display:flex;gap:8px;align-items:baseline}
.sf-price s{color:var(--sf-muted);font-size:14px}
.sf-pager{display:flex;justify-content:center;gap:12px;margin-top:24px}
.sf-empty{text-align:center;color:var(--sf-muted);padding:48px 0}
.sf-product{display:grid;gap:24px;padding:24px 0 8px}
.sf-product__images{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
.sf-product__images .sf-product__image:not(:first-child){aspect-ratio:1;object-fit:cover}
.sf-product__images .sf-product__image:first-child{grid-column:1/-1}
.sf-product__images--stacked{grid-template-columns:1fr}.sf-product__images--stacked .sf-product__image:not(:first-child){aspect-ratio:auto}
.sf-bar--sticky{position:sticky;top:0;z-index:30;background:var(--sf-paper)}
.sf-bar__logo{display:block;width:auto;max-width:200px;object-fit:contain}
.sf-bar__name{display:flex;align-items:center;gap:10px}
.sf-bar__button{margin:0 0 0 auto}
.sf-foot__text{max-width:640px;margin:0 auto 12px;white-space:pre-line}
.sf-foot__contact{display:flex;flex-wrap:wrap;justify-content:center;gap:4px 16px;margin:0 0 12px;padding:0;list-style:none}
.sf-foot__contact li{display:flex;gap:6px}.sf-foot__contact li>span:first-child{opacity:.75}.sf-foot__contact a{color:inherit}
.sf-collection-head{padding-bottom:0}
.sf-product__image{width:100%;border-radius:var(--sf-radius);background:var(--sf-tint)}
.sf-product__image--empty{aspect-ratio:1}
.sf-product h1{font-size:26px;line-height:1.3;margin-bottom:8px}
.sf-product .sf-price strong{font-size:22px;color:var(--sf-accent)}
.sf-description{margin-top:16px}
.sf-description p,.sf-description ul,.sf-description ol{margin:0 0 12px}
.sf-description h2{font-size:20px;margin:16px 0 8px}
@media (min-width:720px){
  .sf-grid{grid-template-columns:repeat(var(--cols,4),minmax(0,1fr));gap:24px 16px}
  .sf-collections{grid-template-columns:repeat(var(--cols,4),minmax(0,1fr));gap:24px 16px}
  .sf-product{grid-template-columns:1fr 1fr;gap:40px;align-items:start}
}
`
