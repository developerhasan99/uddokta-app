// The store's own pages: home, collection and product. A fixed layout for now; themes come in build step 9.
import type { ReactNode } from 'react'
import { taka, type Img } from './sections.tsx'

export type Card = { id: string; name: string; handle: string; price: number; comparePrice: number | null; image: Img | null; inStock: boolean }
export type CollectionLink = { name: string; handle: string }

const productHref = (handle: string) => `/products/${encodeURIComponent(handle)}`
export const collectionHref = (handle: string) => `/collections/${encodeURIComponent(handle)}`

export type MenuLink = { label: string; href: string }

// The seller's menu, or their collections until they make one. Links are checked again here, as they go into the page.
export const safeHref = (href: string) => /^\/(?!\/)[^\s]*$/.test(href) || /^https:\/\/[^\s]+$/.test(href)

export function StoreLayout({ storeName, links, current, children }: { storeName: string; links: MenuLink[]; current?: string; children: ReactNode }) {
  const shown = links.filter((l) => safeHref(l.href))
  return (
    <div className="sf-page">
      <header className="sf-bar">
        <div className="sf-wrap sf-bar__row">
          <a className="sf-bar__name" href="/">{storeName}</a>
          {shown.length > 0 && (
            <nav className="sf-nav" aria-label="মেনু">
              {shown.map((l) => <a key={l.href + l.label} href={l.href} aria-current={l.href === current ? 'page' : undefined} rel={l.href.startsWith('https:') ? 'noopener' : undefined}>{l.label}</a>)}
            </nav>
          )}
        </div>
      </header>
      <main>{children}</main>
      <footer className="sf-foot"><div className="sf-wrap">© {storeName}</div></footer>
    </div>
  )
}

export function Price({ price, comparePrice }: { price: number; comparePrice: number | null }) {
  return (
    <span className="sf-price">
      <strong>{taka(price)}</strong>
      {comparePrice !== null && comparePrice > price && <s>{taka(comparePrice)}</s>}
    </span>
  )
}

export function ProductGrid({ cards }: { cards: Card[] }) {
  return (
    <ul className="sf-grid">
      {cards.map((card) => (
        <li key={card.id}>
          <a className="sf-card" href={productHref(card.handle)}>
            <span className="sf-card__image">{card.image && <img src={card.image.url} alt={card.image.alt} width={card.image.width} height={card.image.height} loading="lazy" decoding="async" />}</span>
            <span className="sf-card__name">{card.name}</span>
            <Price price={card.price} comparePrice={card.comparePrice} />
            {!card.inStock && <span className="sf-card__out">স্টকে নেই</span>}
          </a>
        </li>
      ))}
    </ul>
  )
}

export function Pager({ page, hasMore, base }: { page: number; hasMore: boolean; base: string }) {
  if (page === 1 && !hasMore) return null
  return (
    <nav className="sf-pager" aria-label="পাতা">
      {page > 1 && <a className="sf-button sf-button--outline" href={page === 2 ? base : `${base}?page=${page - 1}`}>আগের পাতা</a>}
      {hasMore && <a className="sf-button sf-button--outline" href={`${base}?page=${page + 1}`}>পরের পাতা</a>}
    </nav>
  )
}

export function Gallery({ images, name }: { images: Img[]; name: string }) {
  if (images.length === 0) return <div className="sf-product__image sf-product__image--empty" />
  return (
    <div className="sf-product__images">
      {images.map((img, i) => <img key={img.url} className="sf-product__image" src={img.url} alt={img.alt || name} width={img.width} height={img.height} loading={i === 0 ? 'eager' : 'lazy'} decoding="async" />)}
    </div>
  )
}

export const catalogCss = `
.sf-bar__row{display:flex;flex-wrap:wrap;align-items:center;gap:8px 24px}
.sf-bar__name{color:inherit;text-decoration:none}
.sf-nav{display:flex;gap:16px;overflow-x:auto;font-weight:400;font-size:15px}
.sf-nav a{color:var(--sf-muted);text-decoration:none;white-space:nowrap}
.sf-nav a[aria-current],.sf-nav a:hover{color:var(--sf-ink)}
.sf-grid{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(2,1fr);gap:16px 12px}
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
.sf-product__image{width:100%;border-radius:var(--sf-radius);background:var(--sf-tint)}
.sf-product__image--empty{aspect-ratio:1}
.sf-product h1{font-size:26px;line-height:1.3;margin-bottom:8px}
.sf-product .sf-price strong{font-size:22px;color:var(--sf-accent)}
.sf-description{margin-top:16px}
.sf-description p,.sf-description ul,.sf-description ol{margin:0 0 12px}
.sf-description h2{font-size:20px;margin:16px 0 8px}
@media (min-width:720px){
  .sf-grid{grid-template-columns:repeat(4,1fr);gap:24px 16px}
  .sf-product{grid-template-columns:1fr 1fr;gap:40px;align-items:start}
}
`
