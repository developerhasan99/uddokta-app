// The store's own pages: home, collection and product. A fixed layout for now; themes come in build step 9.
import type { CSSProperties } from 'react'
import type { Img } from './sections.tsx'
import { taka, tr, type Lang } from './words.ts'
import { filterCss } from './filter-view.tsx'
import type { ResolvedItem } from './menus.ts'

export type Card = { id: string; name: string; handle: string; price: number; comparePrice: number | null; image: Img | null; inStock: boolean }
export type CollectionLink = { name: string; handle: string }

export const productHref = (handle: string) => `/products/${encodeURIComponent(handle)}`
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
            <span className={card.image ? 'sf-card__image' : 'sf-card__image sf-no-image'}>{card.image ? <img src={card.image.url} alt={card.image.alt} width={card.image.width} height={card.image.height} loading="lazy" decoding="async" /> : <NoImage />}</span>
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
  // base may carry the filters (?উৎস=…), which the next page keeps.
  const join = base.includes('?') ? '&' : '?'
  return (
    <nav className="sf-pager" aria-label={tr(lang, ['পাতা', 'Pages'])}>
      {page > 1 && <a className="sf-button sf-button--outline" href={page === 2 ? base : `${base}${join}page=${page - 1}`}>{tr(lang, ['আগের পাতা', 'Previous page'])}</a>}
      {hasMore && <a className="sf-button sf-button--outline" href={`${base}${join}page=${page + 1}`}>{tr(lang, ['পরের পাতা', 'Next page'])}</a>}
    </nav>
  )
}

// A product without a picture: a quiet picture icon on a white box, the same on cards and on the product page.
function NoImage() {
  return <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" /></svg>
}

export function Gallery({ images, name, stacked }: { images: Img[]; name: string; stacked?: boolean }) {
  if (images.length === 0) return <div className="sf-product__image sf-product__image--empty sf-no-image"><NoImage /></div>
  return (
    <div className={stacked ? 'sf-product__images sf-product__images--stacked' : 'sf-product__images'}>
      {images.map((img, i) => <img key={img.url} className="sf-product__image" src={img.url} alt={img.alt || name} width={img.width} height={img.height} loading={i === 0 ? 'eager' : 'lazy'} decoding="async" />)}
    </div>
  )
}

export const catalogCss = `${filterCss}
:root{--sf-base-ink:var(--sf-ink);--sf-base-paper:var(--sf-paper)}
/* Header pieces: plain black and white by default (the seller recolours them), thin outline icons, no brand colour. */
:where(.sf-n-block):has(>.sf-hlogo){font-size:22px;font-weight:800;letter-spacing:-.01em}
.sf-hlogo{display:inline-flex;align-items:center;gap:var(--hl-gap,10px);color:inherit;text-decoration:none;line-height:1.1;white-space:nowrap}
.sf-hlogo img{display:block;height:var(--hl-h,40px);width:auto;max-width:240px;object-fit:contain}
:where(.sf-n-block):has(>.sf-hmenu){font-size:16px;font-weight:500}
.sf-hmenu{position:relative;min-width:0}
.sf-hmenu>.sf-menu-list{display:flex;flex-wrap:wrap;align-items:center;justify-content:var(--hm-align,flex-start);gap:6px var(--hm-gap,28px)}
.sf-hmenu a,.sf-hmenu summary{color:var(--hm-color,inherit);text-decoration:none;white-space:nowrap;cursor:pointer;text-underline-offset:7px;text-decoration-thickness:1.5px}
.sf-hmenu>.sf-menu-list>li:last-child>a,.sf-hmenu>.sf-menu-list>li:last-child>.sf-menu-group>summary{color:var(--hm-last,var(--hm-color,inherit))}
.sf-hmenu a[aria-current]{color:var(--hm-active,var(--hm-color,inherit));text-decoration-line:underline}
.sf-hmenu .sf-menu-group{position:relative}
.sf-hmenu .sf-menu-group>summary::after{width:5px;height:5px;margin-left:6px;opacity:.7}
.sf-hmenu .sf-menu-group>.sf-menu-list{position:absolute;z-index:40;top:calc(100% + 12px);left:-14px;min-width:220px;display:grid;gap:0;padding:8px;background:var(--hm-drop-bg,#fff);color:var(--hm-drop-color,#111);border-radius:8px;box-shadow:0 12px 36px rgb(0 0 0/.14);font-size:15px;font-weight:400;text-align:start}
.sf-hmenu .sf-menu-group .sf-menu-list a{display:block;padding:8px 10px;border-radius:6px;color:inherit;text-decoration:none}
.sf-hmenu .sf-menu-group .sf-menu-list a:hover{background:color-mix(in srgb,currentColor 7%,transparent)}
.sf-hmenu--empty{display:block;padding:6px 10px;border:1px dashed currentColor;border-radius:6px;font-size:13px;font-weight:400;opacity:.6}
:where(.sf-n-block):has(>.sf-hicons){font-size:12px;font-weight:500}
.sf-hicons{display:flex;align-items:center;justify-content:flex-end;gap:var(--hi-gap,16px)}
.sf-hicons__item{position:relative;display:inline-flex;align-items:center;gap:8px;color:var(--hi-color,inherit);text-decoration:none;line-height:1.2;transition:opacity .15s}
.sf-hicons svg{stroke-width:1.6}
.sf-hicons[data-labels=below] .sf-hicons__item{flex-direction:column;gap:3px}
.sf-hicons__label{display:grid;white-space:nowrap}
.sf-hicons[data-labels=beside] .sf-hicons__label{font-size:14px;font-weight:700}
.sf-hicons__label small{font-size:12px;font-weight:400;opacity:.8}
.sf-hicons__icon{position:relative;display:inline-flex}
.sf-hicons__count{position:absolute;top:-7px;right:-9px;display:inline-grid;place-items:center;min-width:18px;height:18px;padding:0 5px;border-radius:999px;background:var(--hi-badge,#111);color:var(--hi-badge-ink,#fff);font-size:11px;font-weight:700;line-height:1}
.sf-hsearch{position:relative;display:flex;width:100%;min-width:0;height:var(--hs-h,42px)}
.sf-hsearch input{flex:1;min-width:0;height:100%;padding:0 14px;border:1px solid var(--hs-border,transparent);border-right:0;border-radius:var(--hs-radius,8px) 0 0 var(--hs-radius,8px);background:var(--hs-bg,#f0f0f0);color:var(--hs-color,#111);font:inherit;font-size:15px;-webkit-appearance:none;appearance:none}
.sf-hsearch input::placeholder{color:color-mix(in srgb,var(--hs-color,#111) 50%,transparent)}
.sf-hsearch input:focus{outline:none;border-color:var(--hs-color,#111)}
.sf-hsearch button{flex:none;display:grid;place-items:center;width:calc(var(--hs-h,42px) + 10px);height:100%;padding:0;border:0;border-radius:0 var(--hs-radius,8px) var(--hs-radius,8px) 0;background:var(--hs-button,#111);color:var(--hs-button-ink,#fff);cursor:pointer}
.sf-hsearch[data-look=icon] input{padding-left:42px;border-right:1px solid var(--hs-border,transparent);border-radius:var(--hs-radius,8px)}
.sf-hsearch[data-look=icon] button{position:absolute;inset:0 auto 0 0;width:42px;background:transparent;color:var(--hs-color,#111);border-radius:var(--hs-radius,8px) 0 0 var(--hs-radius,8px)}
.sf-mbtn{display:flex;align-items:center}
.sf-mbtn>summary{display:inline-flex;align-items:center;gap:8px;list-style:none;cursor:pointer;color:inherit;font-weight:inherit;line-height:1.2;user-select:none}
.sf-mbtn>summary svg{stroke-width:1.75}
.sf-mbtn>summary::-webkit-details-marker{display:none}
.sf-mbtn[open]{position:relative;z-index:70}
.sf-mbtn[open]>summary::after{content:"";position:fixed;inset:0;z-index:1;background:rgb(0 0 0/.45);cursor:default}
.sf-mbtn[open]>summary::before{content:"×";position:fixed;top:12px;left:calc(min(340px,86vw) - 48px);z-index:3;width:36px;height:36px;display:grid;place-items:center;border-radius:50%;color:var(--mb-color,#111);font-size:26px;line-height:1;font-weight:300}
.sf-mbtn__panel{position:fixed;inset:0 auto 0 0;z-index:2;width:min(340px,86vw);overflow-y:auto;padding:16px 24px 32px;background:var(--mb-bg,#fff);color:var(--mb-color,#111);box-shadow:8px 0 32px rgb(0 0 0/.15);font-size:17px;font-weight:500;text-align:start}
.sf-mbtn[open] .sf-mbtn__panel{animation:sf-panel-in .2s ease-out}@keyframes sf-panel-in{from{transform:translateX(-100%)}}
.sf-mbtn__title{margin:0 48px 8px 0;padding:8px 0 10px;font-weight:800;font-size:20px}
.sf-mbtn__panel a,.sf-mbtn__panel summary{display:block;padding:12px 0;color:inherit;text-decoration:none;cursor:pointer}
.sf-mbtn__panel .sf-menu-group>summary{list-style:none;display:flex;justify-content:space-between;align-items:center}.sf-mbtn__panel .sf-menu-group>summary::-webkit-details-marker{display:none}
.sf-mbtn__panel .sf-menu-list .sf-menu-list{padding-left:14px;font-size:15px;font-weight:400}
.sf-mbtn__panel a[aria-current]{text-decoration:underline;text-underline-offset:6px}
@media (prefers-reduced-motion:reduce){.sf-mbtn[open] .sf-mbtn__panel{animation:none}}
@media (hover:hover){.sf-hmenu>.sf-menu-list>li>a:hover,.sf-hmenu>.sf-menu-list>li>.sf-menu-group>summary:hover{color:var(--hm-hover,inherit);text-decoration-line:underline}.sf-hicons__item:hover{color:var(--hi-hover,inherit);opacity:var(--hi-fade,.65)}.sf-hicons[style*="--hi-hover"] .sf-hicons__item:hover{opacity:1}}
@media (min-width:720px){.sf-hicons__item--phone{display:none}}
@media (max-width:719.98px){
  .sf-hlogo img{height:var(--hl-mh,var(--hl-h,32px))}
  .sf-hicons__label,.sf-hicons__item--desktop{display:none}
  .sf-hmenu>.sf-menu-list{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none;justify-content:flex-start;padding:2px 0}
  .sf-hmenu>.sf-menu-list::-webkit-scrollbar{display:none}
  .sf-hmenu .sf-menu-group{position:static}
  .sf-hmenu .sf-menu-group>.sf-menu-list{left:0;right:0;top:calc(100% + 6px);min-width:0}
}
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
.sf-drawer{margin:0;inset:0 0 0 auto;width:min(420px,100vw);height:100dvh;max-height:none;max-width:none;padding:0;border:0;background:var(--sf-paper);color:var(--sf-ink);box-shadow:-8px 0 32px rgba(0,0,0,.12)}
.sf-drawer::backdrop{background:rgba(0,0,0,.4)}.sf-drawer[open]{animation:sf-drawer-in .22s ease-out}@keyframes sf-drawer-in{from{transform:translateX(100%)}}@media (prefers-reduced-motion:reduce){.sf-drawer[open]{animation:none}}
.sf-drawer__body{display:flex;flex-direction:column;height:100%}.sf-drawer__head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 20px;border-bottom:1px solid var(--sf-rule)}.sf-drawer__head h2{font-size:18px}.sf-drawer__head h2 span{color:var(--sf-muted);font-weight:400}
.sf-drawer__close{width:36px;height:36px;border:0;border-radius:50%;background:var(--sf-tint);color:inherit;font-size:22px;line-height:1;cursor:pointer}
.sf-drawer__empty{display:grid;gap:8px;justify-items:center;margin:auto;padding:24px;text-align:center;color:var(--sf-muted)}
.sf-drawer__free{padding:12px 20px;background:var(--sf-tint);font-size:14px;font-weight:600}.sf-drawer__bar{display:block;height:6px;margin-top:8px;border-radius:999px;background:var(--sf-rule);overflow:hidden}.sf-drawer__bar span{display:block;height:100%;background:var(--sf-accent)}
.sf-drawer__lines{flex:1;overflow:auto;list-style:none;margin:0;padding:8px 20px}.sf-drawer__lines li{display:grid;grid-template-columns:64px 1fr auto;gap:12px;padding:12px 0;border-bottom:1px solid var(--sf-rule)}
.sf-drawer__image{width:64px;height:64px;border-radius:8px;background:var(--sf-tint);overflow:hidden}.sf-drawer__image img{width:100%;height:100%;object-fit:cover}
.sf-drawer__info{display:grid;gap:2px;min-width:0;font-size:14px}.sf-drawer__info>a{color:inherit;font-weight:600;text-decoration:none}.sf-drawer__label{color:var(--sf-muted)}.sf-drawer__price s{margin-inline-start:6px;color:var(--sf-muted)}
.sf-drawer__qty{display:flex;align-items:center;gap:8px;margin-top:6px}.sf-drawer__qty button:not(.sf-link-button){width:32px;height:32px;border:1px solid var(--sf-rule);border-radius:8px;background:var(--sf-paper);color:inherit;font:inherit;font-size:18px;cursor:pointer}.sf-drawer__qty button:disabled{opacity:.4;cursor:not-allowed}.sf-drawer__qty>span{min-width:20px;text-align:center;font-weight:600}.sf-drawer__qty .sf-link-button{margin-inline-start:8px}
.sf-drawer__total{font-size:14px}.sf-drawer__foot{display:grid;gap:8px;padding:16px 20px;border-top:1px solid var(--sf-rule)}.sf-drawer__foot .sf-total{border:0;padding:0}.sf-drawer__foot .sf-button{margin:0}.sf-drawer__keep{justify-self:center}
[aria-busy=true]{opacity:.6;pointer-events:none}
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
.sf-card__image{display:block;aspect-ratio:1;border-radius:var(--sf-image-radius,var(--sf-radius));overflow:hidden;background:var(--sf-paper)}
.sf-card__image img{width:100%;height:100%;object-fit:cover}
.sf-card__name{font-weight:600;line-height:1.35}
.sf-card__out{color:var(--sf-muted);font-size:14px}
.sf-price{display:flex;gap:8px;align-items:baseline}
.sf-price s{color:var(--sf-muted);font-size:14px}
.sf-pager{display:flex;justify-content:center;gap:12px;margin-top:24px}
.sf-empty{text-align:center;color:var(--sf-muted);padding:48px 0}
.sf-product{display:grid;gap:24px;padding-block:24px 8px}
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
.sf-product__image{width:100%;border-radius:var(--sf-image-radius,var(--sf-radius));background:var(--sf-tint)}
.sf-product__image--empty{aspect-ratio:1}
.sf-no-image{display:grid;place-items:center;background:var(--sf-paper);color:color-mix(in srgb,var(--sf-ink) 30%,transparent)}
.sf-product h1{font-size:var(--sf-h1,26px);font-weight:var(--sf-heading-weight,700);line-height:1.3;margin-bottom:8px}
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
