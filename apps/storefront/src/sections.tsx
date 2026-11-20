// The section components, rendered to HTML by the storefront and live inside the editor's preview frame.
// They hold no state and use no hooks, so both places draw exactly the same page.
import type { CSSProperties, ReactNode } from 'react'
import { IconBadge, MarketingIcon } from './icons/Icon.tsx'
import { iconCatalog, isIconName, isIconValue } from './icons/catalog.ts'
import { orderBlocks, videoEmbed, type Content, type Section, type SectionStyle } from './schema.ts'
import { LayoutSection, layoutBaseCss, layoutCss } from './layout.tsx'
import { pageFontCss } from './themes.ts'
import { Gallery as ProductImages, MenuTree, Pager, Price, ProductGrid, productHref, shown, type Card } from './catalog.tsx'
import type { ResolvedItem } from './menus.ts'
import { cleanRichText } from './rich.ts'
import { num, taka, tr, type Lang, type Pair } from './words.ts'
import { ActiveFilters, AttributeTable, FilterPanel, type FilterView, type ProductAttribute } from './filter-view.tsx'
import { activeFilters } from './filters.ts'

export { taka }

export type Img = { url: string; alt: string; width: number; height: number }
export type Variant = { id: string; label: string; price: number; comparePrice: number | null; available: boolean }
// offers: titles of the automatic discounts running for it (storefront_offers); the database decides what each takes off.
export type Product = { id: string; name: string; image: Img | null; variants: Variant[]; offers?: string[] }
export type OrderValues = Partial<Record<'variant' | 'quantity' | 'name' | 'phone' | 'address' | 'rate' | 'coupon' | 'checkout', string>>
// A delivery option from Settings › Delivery, as the storefront shows it.
export type ShippingOption = { id: string; name: string; note: string; price: number; freeOver: number | null; freeMinQty: number | null; freeProducts: string[] }

// What the form shows for delivery. The database works the charge out again itself (shipping_charge) when the order is placed,
// and the page script repeats this rule as the buyer changes the quantity or option.
export const deliveryCharge = (o: ShippingOption, productId: string, subtotal: number, qty: number) =>
  (o.freeOver !== null && subtotal >= o.freeOver) || (o.freeMinQty !== null && qty >= o.freeMinQty) || o.freeProducts.includes(productId) ? 0 : o.price

// "Free on orders of ৳1,000 or more", and so on, so buyers see how to get free delivery.
function freeHint(o: ShippingOption, productId: string, lang?: Lang) {
  if (o.price === 0) return ''
  if (o.freeProducts.includes(productId)) return tr(lang, ['এই পণ্যে ডেলিভারি ফ্রি', 'Free delivery on this product'])
  if (lang === 'en') {
    const ways = [o.freeOver !== null && `orders of ${taka(o.freeOver, lang)} or more`, o.freeMinQty !== null && `${num(lang, o.freeMinQty)} or more items`].filter(Boolean)
    return ways.length ? `Free delivery on ${ways.join(' or ')}` : ''
  }
  const ways = [o.freeOver !== null && `${taka(o.freeOver, lang)} বা বেশি অর্ডারে`, o.freeMinQty !== null && `${num(lang, o.freeMinQty)}টি বা বেশি নিলে`].filter(Boolean)
  return ways.length ? `${ways.join(' অথবা ')} ডেলিভারি ফ্রি` : ''
}

export type Ctx = {
  // The store's language for its own words (words.ts); Bangla when not set.
  lang?: Lang
  image: (id: string | null) => Img | undefined
  product: (id: string | null) => Product | undefined
  // The editor's preview: forms never submit and empty sections show a hint for the seller.
  preview: boolean
  // Set only by the storefront server for a buyer-facing page. Custom HTML runs only when this is true, so no other
  // render (the dashboard, thumbnails, tests, anything added later) can ever run a seller's code.
  live?: boolean
  // Editor only: cleans a Custom HTML block (scripts, event handlers and script URLs removed) so the preview can draw it
  // in place, matching the live page. Without it the block is drawn in a scripts-off frame.
  previewHtml?: (html: string) => string
  // Editor only: the icon drawn in a section's or box's corner handle (the same one as in the editor's tree).
  handleIcon?: (id: string) => ReactNode
  // The store's active delivery options, in the seller's order.
  shipping: ShippingOption[]
  checkoutToken?: string
  orderAction?: string
  order?: { sectionId: string; error: string; values: OrderValues }
  // Online store pages (themes): the store, its menus by handle, and what this page is about. Store blocks read these.
  store?: StoreInfo
  menus?: Record<string, ResolvedItem[]>
  current?: { path: string; product?: ProductPage; collection?: CollectionView; page?: StorePageView }
  // Products for each Product list block, by block id, loaded by the server before drawing.
  grid?: (blockId: string) => GridData | undefined
  collections?: CollectionCard[]
  // The buyer's cart: how many items (header link) and, on the cart page, its lines and checkout state.
  cartCount?: number
  // Addresses of the store's visible policy pages (refund, terms, …), linked under checkout forms.
  policies?: Partial<Record<'refund' | 'terms' | 'privacy' | 'shipping' | 'contact', string>>
  cart?: CartView
  search?: { query: string; cards: Card[]; filters?: FilterView }
  // The signed-in buyer (their saved name, phone and address fill order forms), and what /account shows.
  buyer?: Buyer
  account?: AccountView
}

export type Buyer = { name: string; phone: string; address: string }
export type BuyerOrder = { number: number; status: string; total: number; createdAt: string; items: string }
export type AccountView =
  | { mode: 'login' | 'register'; error?: string; values?: { name?: string; phone?: string }; next?: string }
  | { mode: 'view'; buyer: Buyer; orders: BuyerOrder[]; saved?: boolean; error?: string }

export type CartLine = { variantId: string; productId: string; name: string; handle: string; label: string; price: number; comparePrice: number | null; qty: number; image: Img | null; available: boolean }
export type CartView = { lines: CartLine[]; subtotal: number; qty: number; error?: string; values?: OrderValues; checkoutToken: string }

export type StoreInfo = { name: string; logo: Img | null; phone: string; whatsapp: string; email: string; address: string; facebook: string }
export type ProductPage = { id: string; name: string; description: string; images: Img[]; product: Product; attributes?: ProductAttribute[] }
export type CollectionView = { name: string; handle: string; description: string }
export type StorePageView = { title: string; body: string; policy: string | null }
export type GridData = { cards: Card[]; page: number; hasMore: boolean; base: string; filters?: FilterView }
export type CollectionCard = { id: string; name: string; handle: string; image: Img | null }


const str = (v: unknown) => (typeof v === 'string' ? v : '')
const items = (v: unknown) => (Array.isArray(v) ? v as Record<string, string | null>[] : [])

function Picture({ img, eager, className }: { img: Img | undefined; eager?: boolean; className?: string }) {
  if (!img) return null
  return <img className={className} src={img.url} alt={img.alt} width={img.width} height={img.height} loading={eager ? 'eager' : 'lazy'} decoding="async" />
}

function Hint({ ctx, children }: { ctx: Ctx; children: ReactNode }) {
  return ctx.preview ? <p className="sf-hint">{children}</p> : null
}

function Heading({ text }: { text: string }) {
  return text ? <h2 className="sf-heading">{text}</h2> : null
}

// Line breaks the seller typed are kept; the text itself is always escaped by React.
function Lines({ text, className }: { text: string; className?: string }) {
  if (!text) return null
  return <div className={className}>{text.split(/\n{2,}/).map((para, i) => <p key={i}>{para}</p>)}</div>
}

const firstOrderId = (content: Content) => orderBlocks(content)[0]?.id

function Features({ s, ctx }: { s: Section; ctx?: Ctx }) {
  return (
    <section className="sf-section sf-section--tint">
      <div className="sf-wrap">
        <Heading text={str(s.settings.heading)} />
        <ul className="sf-features">
          {items(s.settings.items).map((item, i) => (
            <li key={i}>
              {item.icon === undefined ? <svg className="sf-legacy-check" viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><path d="M4 10.5l4 4 8-9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg> : <IconBadge name={item.icon ?? ''} surface={s.style?.iconSurface} image={ctx?.image} />}
              <div>
                <h3>{item.title}</h3>
                {item.text && <p>{item.text}</p>}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

function Reviews({ s, ctx }: { s: Section; ctx: Ctx }) {
  return (
    <section className="sf-section sf-section--tint">
      <div className="sf-wrap">
        <Heading text={str(s.settings.heading)} />
        <ul className="sf-reviews">
          {items(s.settings.items).map((item, i) => (
            <li key={i}>
              <Picture img={ctx.image(item.image)} />
              {item.text && <blockquote>{item.text}</blockquote>}
              {item.name && <p className="sf-reviews__name">{item.name}</p>}
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

function Faq({ s }: { s: Section }) {
  return (
    <section className="sf-section">
      <div className="sf-wrap sf-narrow">
        <Heading text={str(s.settings.heading)} />
        <div className="sf-faq">
          {items(s.settings.items).map((item, i) => (
            <details key={i}>
              <summary>{item.question}</summary>
              <Lines text={item.answer ?? ''} />
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}

// A signed-in buyer's saved name, phone and address start the order form (they can still change them).
const prefill = (ctx: Ctx, name: keyof OrderValues) => (ctx.buyer && (name === 'name' || name === 'phone' || name === 'address') ? ctx.buyer[name] : '')

export const orderErrors: Record<string, Pair> = {
  name: ['আপনার নাম লিখুন।', 'Enter your name.'],
  phone: ['সঠিক মোবাইল নম্বর দিন, যেমন 01712345678।', 'Enter a valid mobile number, like 01712345678.'],
  address: ['পুরো ঠিকানা লিখুন: বাসা, রাস্তা, এলাকা, জেলা।', 'Enter your full address: house, road, area, district.'],
  rate: ['ডেলিভারি কোথায় হবে, বেছে নিন।', 'Choose where to deliver.'],
  noDelivery: ['এই দোকানে এখন ডেলিভারি নেওয়া হচ্ছে না। অর্ডার করতে দোকানে যোগাযোগ করুন।', 'This store is not taking deliveries right now. Contact the store to order.'],
  variant: ['একটি অপশন বেছে নিন।', 'Choose an option.'],
  soldOut: ['দুঃখিত, এটি এখন স্টকে নেই। অন্য অপশন বেছে নিন।', 'Sorry, this is out of stock. Choose another option.'],
  coupon: ['এই কুপন কোডটি চলছে না। কোডটি দেখে আবার লিখুন, অথবা ফাঁকা রাখুন।', 'This coupon code does not work. Check it and try again, or leave it blank.'],
  tooMany: ['এই নম্বর থেকে অনেকগুলো অর্ডার এসেছে। একটু পরে চেষ্টা করুন, অথবা দোকানে ফোন করুন।', 'Too many orders from this number. Try again later, or call the store.'],
  blocked: ['এই নম্বর থেকে অনলাইনে অর্ডার নেওয়া যাচ্ছে না। অর্ডার করতে দোকানে ফোন করুন।', 'Online orders from this number are not accepted. Call the store to order.'],
  checkout: ['এই অর্ডার ফর্মটি আগে ব্যবহার হয়েছে। আবার অর্ডার করতে পেজটি নতুন করে খুলুন।', 'This order form was already used. Reload the page to order again.'],
  server: ['অর্ডারটি নেওয়া যায়নি। একটু পরে আবার চেষ্টা করুন।', 'The order could not be placed. Please try again shortly.'],
}

// Up to this many options show as buttons; more become a dropdown so the form stays short on a phone.
const maxChoices = 4

function OrderForm({ s, ctx }: { s: Section; ctx: Ctx }) {
  const product = ctx.product(s.settings.product as string | null)
  if (!product) {
    return ctx.preview
      ? <section className="sf-section" id={s.id}><div className="sf-wrap sf-narrow"><Hint ctx={ctx}>অর্ডার নিতে একটি পণ্য বেছে নিন</Hint></div></section>
      : null
  }
  const mine = ctx.order?.sectionId === s.id ? ctx.order : undefined
  const values = mine?.values ?? {}
  const available = product.variants.filter((v) => v.available)
  const chosen = product.variants.find((v) => v.id === values.variant && v.available) ?? available[0]
  const options = ctx.shipping
  const rate = options.find((o) => o.id === values.rate) ?? options[0]
  const quantity = Math.min(Math.max(Number(values.quantity) || 1, 1), 20)
  const subtotal = chosen ? chosen.price * quantity : 0
  const total = chosen ? subtotal + (rate ? deliveryCharge(rate, product.id, subtotal, quantity) : 0) : 0
  const field = (name: keyof OrderValues) => ({ name, defaultValue: values[name] ?? prefill(ctx, name), 'aria-invalid': mine?.error === name ? true : undefined })

  return (
    <section className="sf-section sf-section--tint" id={s.id}>
      <div className={`sf-wrap ${s.settings.layout === 'split' ? '' : 'sf-narrow'}`}>
        <Heading text={str(s.settings.heading)} />
        <form className="sf-order" method="post" action={ctx.preview ? undefined : ctx.orderAction} data-order data-layout={str(s.settings.layout)} data-choices={str(s.settings.choices)} data-product={product.name}>
          <input type="hidden" name="section" value={s.id} />
          {!ctx.preview && <input type="hidden" name="checkout" value={ctx.checkoutToken} />}
          {/* Left empty by people, who never see it; form-filling bots tend to fill every field. */}
          <label className="sf-trap" aria-hidden="true">Website<input name="website" tabIndex={-1} autoComplete="off" /></label>
          <div className="sf-order__selection"><div className="sf-order__product">
            <Picture img={product.image ?? undefined} />
            <p>{product.name}</p>
          </div>
          {product.offers && product.offers.length > 0 && <ul className="sf-offers">{product.offers.map((o) => <li key={o}>{o}</li>)}</ul>}
          {available.length === 0 && <p className="sf-error" role="alert">{tr(ctx.lang, orderErrors.soldOut)}</p>}

          {product.variants.length > 1 && product.variants.length <= maxChoices && (
            <fieldset className="sf-choices">
              <legend>{tr(ctx.lang, ['অপশন', 'Option'])}</legend>
              {product.variants.map((v) => (
                <label key={v.id} className="sf-choice">
                  <input type="radio" name="variant" value={v.id} defaultChecked={v.id === chosen?.id} disabled={!v.available} data-price={v.price} />
                  <span>{v.label}{!v.available && tr(ctx.lang, [' (স্টকে নেই)', ' (out of stock)'])}</span>
                  <strong>{taka(v.price, ctx.lang)}</strong>
                </label>
              ))}
            </fieldset>
          )}
          {product.variants.length > maxChoices && (
            <label className="sf-field">
              <span>{tr(ctx.lang, ['অপশন', 'Option'])}</span>
              <select name="variant" defaultValue={chosen?.id}>
                {product.variants.map((v) => (
                  <option key={v.id} value={v.id} disabled={!v.available} data-price={v.price}>{v.label} · {taka(v.price, ctx.lang)}{!v.available && tr(ctx.lang, [' (স্টকে নেই)', ' (out of stock)'])}</option>
                ))}
              </select>
            </label>
          )}
          {product.variants.length === 1 && chosen && <input type="hidden" name="variant" value={chosen.id} data-price={chosen.price} />}

          <label className="sf-field">
            <span>{tr(ctx.lang, ['পরিমাণ', 'Quantity'])}</span>
            <input type="number" min={1} max={20} inputMode="numeric" {...field('quantity')} defaultValue={String(quantity)} />
          </label>
          </div><div className="sf-order__customer"><label className="sf-field">
            <span>{tr(ctx.lang, ['আপনার নাম', 'Your name'])}</span>
            <input autoComplete="name" maxLength={100} required {...field('name')} />
          </label>
          <label className="sf-field">
            <span>{tr(ctx.lang, ['মোবাইল নম্বর', 'Mobile number'])}</span>
            <input type="tel" inputMode="tel" autoComplete="tel" maxLength={20} placeholder="01XXXXXXXXX" required {...field('phone')} />
          </label>
          <label className="sf-field">
            <span>{tr(ctx.lang, ['পুরো ঠিকানা', 'Full address'])}</span>
            <textarea rows={3} autoComplete="street-address" maxLength={500} required {...field('address')} />
          </label>
          {options.length > 0 && (
            <fieldset className="sf-choices">
              <legend>{tr(ctx.lang, ['ডেলিভারি', 'Delivery'])}</legend>
              {options.map((o) => {
                const hint = freeHint(o, product.id, ctx.lang)
                const charge = deliveryCharge(o, product.id, subtotal, quantity)
                return (
                  <label key={o.id} className="sf-choice">
                    <input type="radio" name="rate" value={o.id} defaultChecked={o.id === rate?.id} data-price={o.price}
                      data-free-over={o.freeOver ?? undefined} data-free-qty={o.freeMinQty ?? undefined} data-free-product={o.freeProducts.includes(product.id) ? '' : undefined} />
                    <span className="sf-choice__text">
                      <span>{o.name}</span>
                      {o.note && <small>{o.note}</small>}
                      {hint && <small className="sf-choice__free">{hint}</small>}
                    </span>
                    <strong data-charge>{charge === 0 ? tr(ctx.lang, ['ফ্রি', 'Free']) : taka(charge, ctx.lang)}</strong>
                  </label>
                )
              })}
            </fieldset>
          )}
          {options.length === 0 && <p className="sf-error" role="alert">{tr(ctx.lang, orderErrors.noDelivery)}</p>}

          <label className="sf-field">
            <span>{tr(ctx.lang, ['কুপন কোড (থাকলে)', 'Coupon code (if any)'])}</span>
            <input autoComplete="off" autoCapitalize="characters" maxLength={30} {...field('coupon')} />
          </label>
          <p className="sf-total">{tr(ctx.lang, ['সর্বমোট', 'Total'])} <strong data-total>{taka(total, ctx.lang)}</strong></p>
          <p className="sf-note">{tr(ctx.lang, ['অফার বা কুপনের ছাড় অর্ডার নিশ্চিত করার সময় যোগ হবে। পণ্য হাতে পেয়ে টাকা দিন।', 'Offer and coupon discounts are added when the order is confirmed. Pay when you receive your order.'])}</p>
          {mine && <p className="sf-error" role="alert">{tr(ctx.lang, orderErrors[mine.error] ?? orderErrors.server)}</p>}
          <button className="sf-button sf-button--block" type={ctx.preview ? 'button' : 'submit'} disabled={available.length === 0 || options.length === 0}><IconBadge name={str(s.settings.buttonIcon)} surface={s.style?.iconSurface} image={ctx?.image} />{str(s.settings.button) || tr(ctx.lang, ['অর্ডার করুন', 'Place order'])}</button>
          <PolicyNote ctx={ctx} /></div>
        </form>
      </div>
    </section>
  )
}

function Gallery({ s, ctx }: { s: Section; ctx: Ctx }) {
  const images = items(s.settings.items).map((item) => ctx.image(item.image)).filter((img) => img !== undefined)
  if (images.length === 0) return ctx.preview ? <section className="sf-section"><div className="sf-wrap"><Hint ctx={ctx}>গ্যালারিতে ছবি দিন</Hint></div></section> : null
  return (
    <section className="sf-section">
      <div className="sf-wrap">
        <Heading text={str(s.settings.heading)} />
        <ul className="sf-gallery">{images.map((img, i) => <li key={i}><Picture img={img} /></li>)}</ul>
      </div>
    </section>
  )
}

const countdownUnits: Pair[] = [['দিন', 'Days'], ['ঘণ্টা', 'Hours'], ['মিনিট', 'Minutes'], ['সেকেন্ড', 'Seconds']]

// Drawn with the time left when the page is rendered; the page script keeps it ticking in the buyer's browser.
function Countdown({ s, ctx }: { s: Section; ctx: Ctx }) {
  const ends = Date.parse(str(s.settings.ends))
  if (Number.isNaN(ends)) return ctx.preview ? <section className="sf-section"><div className="sf-wrap"><Hint ctx={ctx}>অফার কখন শেষ হবে, বেছে নিন</Hint></div></section> : null
  const left = Math.max(0, Math.floor((ends - Date.now()) / 1000))
  const parts = [Math.floor(left / 86400), Math.floor((left % 86400) / 3600), Math.floor((left % 3600) / 60), left % 60]
  return (
    <section className="sf-section sf-section--tint">
      <div className="sf-wrap sf-narrow sf-countdown-wrap">
        <Heading text={str(s.settings.heading)} />
        <div className="sf-countdown" data-countdown={new Date(ends).toISOString()} hidden={left === 0}>
          {parts.map((n, i) => <div key={i}><strong data-unit>{num(ctx.lang, n, { minimumIntegerDigits: 2 })}</strong><span>{tr(ctx.lang, countdownUnits[i])}</span></div>)}
        </div>
        <p className="sf-countdown__ended" hidden={left > 0}>{str(s.settings.ended)}</p>
      </div>
    </section>
  )
}

const telHref = (phone: string) => phone.replace(/[^\d+]/g, '')

function Contact({ s, ctx }: { s: Section; ctx: Ctx }) {
  const phone = str(s.settings.phone)
  const whatsapp = str(s.settings.whatsapp)
  if (!phone && !whatsapp) return ctx.preview ? <section className="sf-section"><div className="sf-wrap"><Hint ctx={ctx}>ফোন বা হোয়াটসঅ্যাপ নম্বর দিন</Hint></div></section> : null
  return (
    <section className="sf-section">
      <div className="sf-wrap sf-narrow sf-contact">
        <Heading text={str(s.settings.heading)} />
        <div className="sf-contact__buttons">
          {phone && <a className="sf-button sf-button--outline" href={`tel:${telHref(phone)}`}>{tr(ctx.lang, ['কল করুন', 'Call'])} {phone}</a>}
          {whatsapp && <a className="sf-button sf-button--outline" href={`https://wa.me/${telHref(whatsapp).replace(/^\+?(88)?0/, '880')}`} target="_blank" rel="noopener">{tr(ctx.lang, ['হোয়াটসঅ্যাপ', 'WhatsApp'])}</a>}
        </div>
      </div>
    </section>
  )
}


function SectionButton({ s, orderId, ctx }: { s: Section; orderId?: string; ctx?: Ctx }) {
  const href = str(s.settings.link) || (orderId ? `#${orderId}` : '')
  return str(s.settings.button) && href ? <a className="sf-button" href={href}><IconBadge name={str(s.settings.buttonIcon)} surface={s.style?.iconSurface} image={ctx?.image} />{str(s.settings.button)}</a> : null
}

function LandingHeader({ s, ctx, orderId }: { s: Section; ctx: Ctx; orderId?: string }) {
  return <section className="sf-section sf-custom-header"><div className="sf-wrap sf-header-row">
    <div className="sf-brand"><Picture img={ctx.image(s.settings.image as string | null)} /><strong>{str(s.settings.brand)}</strong></div>
    <nav className="sf-section-links" aria-label={tr(ctx.lang, ['পেজ নেভিগেশন', 'Page navigation'])}>{items(s.settings.items).filter((i) => i.link && i.title).map((item, i) => <a key={i} href={item.link!}>{item.title}</a>)}</nav>
    <SectionButton s={s} orderId={orderId} ctx={ctx} />
  </div></section>
}

function LandingFooter({ s, ctx }: { s: Section; ctx: Ctx }) {
  return <section className="sf-section sf-custom-footer"><div className="sf-wrap">
    <Heading text={str(s.settings.heading)} /><Lines text={str(s.settings.text)} className="sf-body" />
    <nav className="sf-section-links" aria-label={tr(ctx.lang, ['ফুটার লিংক', 'Footer links'])}>{items(s.settings.items).filter((i) => i.link && i.title).map((item, i) => <a key={i} href={item.link!}>{item.title}</a>)}</nav>
  </div></section>
}

function InfoItems({ s, ctx }: { s: Section; ctx: Ctx }) {
  const rows = items(s.settings.items)
  return <section className={`sf-section sf-info sf-info--${s.type}`} data-layout={str(s.settings.layout)}><div className="sf-wrap">
    <Heading text={str(s.settings.heading)} />
    <ol className="sf-info-grid">{rows.map((item, i) => <li key={i}>
      {item.icon && <IconBadge name={item.icon} surface={s.style?.iconSurface} image={ctx.image} />}
      {s.type === 'steps' && !item.icon && <span className="sf-step-number">{num(ctx.lang, i + 1, { minimumIntegerDigits: 2 })}</span>}
      {s.type === 'cards' && (ctx.image(item.image) ? <Picture img={ctx.image(item.image)} className="sf-card-image" /> : <Hint ctx={ctx}>কার্ডে ছবি দিন</Hint>)}
      <div className="sf-info-copy"><h3>{item.title}</h3>{item.text && <p>{item.text}</p>}</div>
    </li>)}</ol>
  </div></section>
}

// Icon list: icon + one line of text (a link when given) per item, down or across, with optional dividers.
// Values are schema-checked (numbers in range, colours as hex, selects from fixed lists) before they reach the style.
function IconList({ s, ctx }: { s: Section; ctx: Ctx }) {
  const st = s.settings
  const rows = items(st.items).filter((item) => str(item.text) || isIconValue(str(item.icon)))
  if (!rows.length) return ctx.preview ? <Hint ctx={ctx}>তালিকায় আইটেম যোগ করুন</Hint> : null
  const vars = {
    '--il-gap': `${Number(st.itemGap ?? 12)}px`, '--il-icon-gap': `${Number(st.iconGap ?? 10)}px`, '--il-icon-size': `${Number(st.iconSize ?? 20)}px`,
    ...(str(st.iconColor) ? { '--il-icon': str(st.iconColor) } : {}),
    ...(str(st.textColor) ? { '--il-text': str(st.textColor) } : {}),
    ...(str(st.iconHoverColor) ? { '--il-icon-hover': str(st.iconHoverColor) } : {}),
    ...(str(st.textHoverColor) ? { '--il-text-hover': str(st.textHoverColor) } : {}),
    ...(st.divider && st.divider !== 'none' ? { '--il-divider': `${Number(st.dividerWidth ?? 1)}px ${str(st.divider)} ${str(st.dividerColor) || 'var(--sf-rule)'}` } : {}),
  } as CSSProperties
  return <ul className="sf-iconlist" data-direction={str(st.direction) || 'vertical'} data-align={str(st.align) || 'start'} data-divider={st.divider && st.divider !== 'none' ? '' : undefined} style={vars}>
    {rows.map((item, i) => {
      const inner = <>{isIconValue(str(item.icon)) && <MarketingIcon name={str(item.icon)} size={Number(st.iconSize ?? 20)} image={ctx.image} />}<span>{str(item.text)}</span></>
      return <li key={i}>{str(item.link) ? <a href={str(item.link)}>{inner}</a> : inner}</li>
    })}
  </ul>
}

function Specifications({ s }: { s: Section }) {
  return <section className="sf-section"><div className="sf-wrap sf-narrow"><Heading text={str(s.settings.heading)} />
    <dl className="sf-specifications">{items(s.settings.items).map((item, i) => <div key={i}><dt>{item.title}</dt><dd>{item.text}</dd></div>)}</dl>
  </div></section>
}

function Comparison({ s, ctx }: { s: Section; ctx: Ctx }) {
  return <section className="sf-section"><div className="sf-wrap"><Heading text={str(s.settings.heading)} />
    <div className="sf-table-scroll" role="region" aria-label={str(s.settings.heading) || tr(ctx.lang, ['পণ্যের তুলনা', 'Product comparison'])} tabIndex={0}><table className="sf-comparison"><thead><tr><th scope="col">{tr(ctx.lang, ['বৈশিষ্ট্য', 'Feature'])}</th><th scope="col">{str(s.settings.left)}</th><th scope="col">{str(s.settings.right)}</th></tr></thead>
      <tbody>{items(s.settings.items).map((item, i) => <tr key={i}><th scope="row">{item.title}</th><td>{item.left}</td><td>{item.right}</td></tr>)}</tbody>
    </table></div>
  </div></section>
}

function CallToAction({ s, orderId, ctx }: { s: Section; orderId?: string; ctx?: Ctx }) {
  return <section className={`sf-section sf-cta ${s.type === 'announcement' ? 'sf-announcement' : ''}`}><div className="sf-wrap">
    <Heading text={str(s.settings.heading)} /><Lines text={str(s.settings.text)} className="sf-body" /><SectionButton s={s} orderId={orderId} ctx={ctx} />
  </div></section>
}

// Only these typed settings become CSS variables; arbitrary CSS is never interpolated.
export function sectionStyle(style?: SectionStyle): CSSProperties {
  const out: Record<string, string | number> = {}
  const lengths: Record<string, string> = { iconSize: 'icon-size', iconRadius: 'icon-radius', maxWidth: 'width', headingSize: 'heading', mobileHeadingSize: 'mobile-heading', bodySize: 'body', buttonSize: 'button-size', paddingTop: 'pt', paddingBottom: 'pb', paddingX: 'px', paddingLeft: 'pl', paddingRight: 'pr', marginLeft: 'ml', marginRight: 'mr', mobilePaddingLeft: 'mobile-pl', mobilePaddingRight: 'mobile-pr', mobileMarginTop: 'mobile-mt', mobileMarginRight: 'mobile-mr', mobileMarginBottom: 'mobile-mb', mobileMarginLeft: 'mobile-ml', mobilePaddingTop: 'mobile-pt', mobilePaddingBottom: 'mobile-pb', marginTop: 'mt', marginBottom: 'mb', gap: 'gap', borderWidth: 'border-width', borderTopWidth: 'bt', borderBottomWidth: 'bb', radius: 'radius', sectionRadius: 'section-radius', buttonRadius: 'button-radius' }
  const colors: Record<string, string[]> = { iconColor: ['--section-icon-color'], iconBackground: ['--section-icon-background'], background: ['--section-background'], color: ['--sf-ink', '--sf-muted'], accent: ['--sf-accent'], buttonText: ['--sf-accent-ink'], cardBackground: ['--section-card'], borderColor: ['--section-border'] }
  for (const [key, value] of Object.entries(style ?? {})) {
    if (lengths[key] && typeof value === 'number') out[`--section-${lengths[key]}`] = `${value}px`
    if (colors[key] && typeof value === 'string' && /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(value)) for (const variable of colors[key]) out[variable] = value
  }
  if (style?.iconStroke) out['--section-icon-stroke'] = style.iconStroke
  if (style?.align) out['--section-align'] = style.align
  if (style?.columns) out['--section-columns'] = style.columns
  if (style?.mobileColumns) out['--section-mobile-columns'] = style.mobileColumns
  if (style?.headingWeight) out['--section-weight'] = style.headingWeight
  if (style?.borderStyle) out['--section-border-style'] = style.borderStyle
  if (style?.imageFit) out['--section-image-fit'] = style.imageFit
  if (style?.imageRatio) out['--section-image-ratio'] = style.imageRatio
  if (typeof style?.minHeight === 'number') out['--section-min-height'] = `${style.minHeight}px`
  if (style?.font) out['--section-font'] = style.font === 'serif' ? '"Tiro Bangla", Georgia, serif' : '"Noto Sans Bengali", system-ui, sans-serif'
  if (style?.radius !== undefined) out['--sf-radius'] = `${style.radius}px`
  if (style?.shadow) out['--section-shadow'] = ({ none: 'none', soft: '0 6px 24px #00000012', strong: '0 12px 40px #00000029' } as Record<string, string>)[style.shadow] ?? 'none'
  return out as CSSProperties
}

// Background layers behind a section: gradient or image (painted), a looping muted video, and an overlay on top.
// Values were checked by readSectionStyle; the video must be a direct .mp4/.webm link.
// Values here were validated by readContent (colours, numbers in range, positions from a fixed list).
export function gradientCss(style: SectionStyle): string {
  const stops = `${style.gradientFrom} ${Number(style.gradientFromStop ?? 0)}%, ${style.gradientTo} ${Number(style.gradientToStop ?? 100)}%`
  return style.gradientType === 'radial'
    ? `radial-gradient(${style.gradientShape ?? 'circle'} at ${style.gradientPosition ?? 'center'}, ${stops})`
    : `linear-gradient(${Number(style.gradientAngle ?? 180)}deg, ${stops})`
}
const isVideoFile = (url: unknown): url is string => typeof url === 'string' && /^https:\/\/[^\s"'<>]+\.(mp4|webm)(\?[^\s"'<>]*)?$/i.test(url)
function backgroundLayer(style: SectionStyle | undefined, ctx?: Ctx) {
  if (!style) return null
  const type = style.bgType
  const image = typeof style.bgImage === 'string' ? ctx?.image(style.bgImage) : undefined
  const paint: CSSProperties = {}
  if (type === 'gradient' && style.gradientFrom && style.gradientTo) paint.backgroundImage = gradientCss(style)
  if ((type === 'image' || type === 'video') && image) {
    paint.backgroundImage = `url(${JSON.stringify(image.url)})`
    paint.backgroundSize = style.bgSize === 'contain' ? 'contain' : 'cover'
    paint.backgroundPosition = String(style.bgPosition ?? 'center')
    paint.backgroundRepeat = 'no-repeat'
  }
  const video = type === 'video' && isVideoFile(style.bgVideo) ? style.bgVideo : null
  const overlay = (type === 'image' || type === 'video') && style.overlayColor ? { background: String(style.overlayColor), opacity: Number(style.overlayOpacity ?? 50) / 100 } : null
  if (!paint.backgroundImage && !video && !overlay) return null
  return <div className="sf-bg" aria-hidden="true" style={paint}>
    {video && <video src={video} autoPlay muted loop playsInline preload="metadata" poster={image?.url} />}
    {overlay && <span className="sf-bg__overlay" style={overlay} />}
  </div>
}

export function SectionFrame({ s, children, ctx }: { s: Section; children: ReactNode; ctx?: Ctx }) {
  const layer = backgroundLayer(s.style, ctx)
  return <div id={s.type === 'order' ? undefined : s.id} data-section={s.id} className={`${s.style ? 'sf-section-frame sf-styled' : 'sf-section-frame'}${layer ? ' sf-has-bg' : ''}`} style={sectionStyle(s.style)} data-visibility={s.style?.visibility} data-sticky={s.style?.sticky} data-align={s.style?.align} data-body-size={s.style?.bodySize} data-image-ratio={s.style?.imageRatio} data-background={s.style?.bgType && s.style.bgType !== 'color' ? undefined : s.style?.background} data-min-height={s.style?.minHeight}>
    {layer}
    {children}
  </div>
}

// Custom HTML. On live pages the seller's code is part of the page, as written (scripts run, styles reach the whole
// page; the page gets the open policy, see server.tsx). In the editor it must never run, because the preview shares the
// dashboard's origin: there it is drawn in a frame with scripts off (allow-same-origin only, so the preview can
// measure the height), showing the markup and CSS.
const embedBase = 'html,body{margin:0}body{display:flow-root}'
function EmbedFrame({ html, ctx }: { html: string; ctx: Ctx }) {
  if (!ctx.live && ctx.previewHtml) return <div className="sf-html" dangerouslySetInnerHTML={{ __html: ctx.previewHtml(html) }} />
  if (!ctx.live) {
    const fit = (frame: HTMLIFrameElement) => {
      const doc = frame.contentDocument
      if (!doc) return
      const size = () => { frame.style.height = `${Math.ceil(doc.body.getBoundingClientRect().height)}px` }
      size()
      new ResizeObserver(size).observe(doc.body)
    }
    // pointer-events off: a click selects the block in the editor instead of vanishing into the frame.
    return <iframe className="sf-embed" title="Custom HTML" sandbox="allow-same-origin" style={{ pointerEvents: 'none' }} srcDoc={`<!doctype html><meta charset="utf-8"><style>${embedBase}</style>${html}`} onLoad={(e) => fit(e.currentTarget)} />
  }
  return <div className="sf-html" dangerouslySetInnerHTML={{ __html: html }} />
}

// Online store blocks. Each reads its data from ctx; without it (an editor preview with nothing to show) it shows a hint.
const shownSetting = (s: Section, key: string) => str(s.settings[key]) !== 'no'
const digitsOnly = (v: string) => v.replace(/[^\d+]/g, '')
const whatsappHref = (v: string) => { const d = v.replace(/\D/g, ''); return `https://wa.me/${d.startsWith('0') ? `88${d}` : d}` }

function StoreHeader({ s, ctx }: { s: Section; ctx: Ctx }) {
  const name = ctx.store?.name ?? ''
  const logo = ctx.image(str(s.settings.logo) || null) ?? ctx.store?.logo ?? undefined
  const menu = shown(ctx.menus?.[str(s.settings.menu)] ?? [])
  const height = typeof s.settings.logoHeight === 'number' ? s.settings.logoHeight : 40
  const button = str(s.settings.button)
  const current = ctx.current?.path
  return (
    <header className={`sf-bar${s.settings.sticky === 'yes' ? ' sf-bar--sticky' : ''}`}>
      <div className="sf-wrap sf-bar__row">
        <a className="sf-bar__name" href="/">
          {logo && <img className="sf-bar__logo" src={logo.url} alt={shownSetting(s, 'showName') ? '' : name} style={{ height }} />}
          {shownSetting(s, 'showName') && name}
        </a>
        {menu.length > 0 && (
          <>
            <nav className="sf-nav" aria-label={tr(ctx.lang, ['মেনু', 'Menu'])}><MenuTree items={menu} current={current} /></nav>
            <details className="sf-nav-phone">
              <summary><span className="sf-burger" aria-hidden="true" />{tr(ctx.lang, ['মেনু', 'Menu'])}</summary>
              <nav aria-label={tr(ctx.lang, ['মেনু', 'Menu'])}><MenuTree items={menu} current={current} /></nav>
            </details>
          </>
        )}
        <span className="sf-bar__links">
          {s.settings.showSearch !== 'no' && <a href="/search">{tr(ctx.lang, ['খুঁজুন', 'Search'])}</a>}
          {s.settings.showAccount === 'yes' && <a href="/account" aria-current={current === '/account' ? 'page' : undefined}>{ctx.buyer ? tr(ctx.lang, ['অ্যাকাউন্ট', 'Account']) : tr(ctx.lang, ['লগ ইন', 'Sign in'])}</a>}
          {s.settings.showCart !== 'no' && <a href="/cart" data-cart-drawer={s.settings.cartStyle === 'page' ? undefined : ''} aria-current={current === '/cart' ? 'page' : undefined}>{tr(ctx.lang, ['কার্ট', 'Cart'])}{(ctx.cartCount ?? 0) > 0 && <span className="sf-bar__count">{num(ctx.lang, ctx.cartCount!)}</span>}</a>}
          {button && <a className="sf-button sf-bar__button" href={str(s.settings.link) || '/products'}>{button}</a>}
        </span>
      </div>
    </header>
  )
}

// ---- Header pieces (blocks in a header template's rows) ----
// Their look is CSS variables from the block's own settings (checked colours and numbers), styled in catalogCss.
const px = (v: unknown) => (typeof v === 'number' ? `${v}px` : undefined)
const cssVars = (vars: Record<string, string | undefined>) => Object.fromEntries(Object.entries(vars).filter(([, v]) => v)) as CSSProperties
const flexAlign: Record<string, string> = { start: 'flex-start', center: 'center', end: 'flex-end' }

function StoreLogo({ s, ctx }: { s: Section; ctx: Ctx }) {
  const name = ctx.store?.name ?? ''
  const logo = ctx.image(str(s.settings.logo) || null) ?? ctx.store?.logo ?? undefined
  const mode = str(s.settings.showName) || 'auto'
  const withName = mode === 'yes' || (mode === 'auto' && !logo)
  return (
    <a className="sf-hlogo" href="/" style={cssVars({ '--hl-h': px(s.settings.logoHeight), '--hl-mh': px(s.settings.mobileLogoHeight), '--hl-gap': px(s.settings.nameGap) })}>
      {logo && <img src={logo.url} alt={withName ? '' : name} width={logo.width} height={logo.height} />}
      {withName && <span className="sf-hlogo__name">{name || (ctx.preview ? 'দোকানের নাম' : '')}</span>}
    </a>
  )
}

function StoreMenu({ s, ctx }: { s: Section; ctx: Ctx }) {
  const items = shown(ctx.menus?.[str(s.settings.menu)] ?? [])
  if (!items.length) return ctx.preview ? <span className="sf-hmenu sf-hmenu--empty">মেনু বেছে নিন বা অনলাইন স্টোর › মেনুতে লিংক যোগ করুন</span> : null
  return (
    <nav className="sf-hmenu" aria-label={tr(ctx.lang, ['মেনু', 'Menu'])} style={cssVars({
      '--hm-align': flexAlign[str(s.settings.align)], '--hm-gap': px(s.settings.itemGap), '--hm-color': str(s.settings.linkColor), '--hm-hover': str(s.settings.linkHoverColor),
      '--hm-active': str(s.settings.activeColor), '--hm-last': str(s.settings.lastLinkColor), '--hm-drop-bg': str(s.settings.dropdownBackground), '--hm-drop-color': str(s.settings.dropdownColor),
    })}><MenuTree items={items} current={ctx.current?.path} /></nav>
  )
}

function StoreIcons({ s, ctx }: { s: Section; ctx: Ctx }) {
  const labels = str(s.settings.labels) || 'none'
  const size = typeof s.settings.iconSize === 'number' ? s.settings.iconSize : 22
  const current = ctx.current?.path
  const count = ctx.cartCount ?? 0
  // Beside: two lines, a small greeting over the name ("Hello, sign in" / "Account"), as big shops do.
  const item = (href: string, icon: string, label: string, extra: { className?: string; drawer?: boolean; badge?: ReactNode; small?: string } = {}) => (
    <a className={`sf-hicons__item${extra.className ? ` ${extra.className}` : ''}`} href={href} aria-label={labels === 'none' ? label : undefined} aria-current={current === href ? 'page' : undefined} data-cart-drawer={extra.drawer ? '' : undefined}>
      <span className="sf-hicons__icon"><MarketingIcon name={icon} size={size} />{extra.badge}</span>
      {labels !== 'none' && <span className="sf-hicons__label">{labels === 'beside' && extra.small && <small>{extra.small}</small>}{label}</span>}
    </a>
  )
  const search = str(s.settings.showSearch) || 'yes'
  return (
    <div className="sf-hicons" data-labels={labels} style={cssVars({
      '--hi-gap': px(s.settings.itemGap), '--hi-color': str(s.settings.linkColor), '--hi-hover': str(s.settings.linkHoverColor),
      '--hi-badge': str(s.settings.badgeColor), '--hi-badge-ink': str(s.settings.badgeTextColor),
    })}>
      {search !== 'no' && item('/search', 'search', tr(ctx.lang, ['খুঁজুন', 'Search']), { className: search === 'mobile' ? 'sf-hicons__item--phone' : undefined })}
      {s.settings.showAccount !== 'no' && item('/account', 'user-round', labels === 'beside' ? tr(ctx.lang, ['অ্যাকাউন্ট', 'Account']) : ctx.buyer ? tr(ctx.lang, ['অ্যাকাউন্ট', 'Account']) : tr(ctx.lang, ['লগ ইন', 'Sign in']), {
        className: s.settings.showAccount === 'desktop' ? 'sf-hicons__item--desktop' : undefined,
        small: ctx.buyer ? tr(ctx.lang, ['হ্যালো', 'Hello']) : tr(ctx.lang, ['হ্যালো, লগ ইন করুন', 'Hello, sign in']),
      })}
      {s.settings.showCart !== 'no' && item('/cart', 'shopping-bag', tr(ctx.lang, ['কার্ট', 'Cart']), {
        drawer: s.settings.cartStyle !== 'page',
        badge: count > 0 && <span className="sf-hicons__count">{num(ctx.lang, count)}</span>,
      })}
    </div>
  )
}

function StoreSearch({ s, ctx }: { s: Section; ctx: Ctx }) {
  const label = tr(ctx.lang, ['খুঁজুন', 'Search'])
  return (
    <form className="sf-hsearch" data-look={str(s.settings.look) || 'button'} role="search" method="get" action={ctx.preview ? undefined : '/search'} style={cssVars({
      '--hs-h': px(s.settings.height), '--hs-radius': px(s.settings.radius), '--hs-bg': str(s.settings.fieldBackground), '--hs-color': str(s.settings.fieldColor),
      '--hs-border': str(s.settings.borderColor), '--hs-button': str(s.settings.buttonColor), '--hs-button-ink': str(s.settings.buttonIconColor),
    })}>
      <input type="search" name="q" placeholder={str(s.settings.placeholder)} aria-label={label} defaultValue={ctx.preview ? undefined : ctx.search?.query ?? ''} />
      <button type="submit" aria-label={label}><MarketingIcon name="search" size={20} /></button>
    </form>
  )
}

// The menu in a side panel. A plain <details>: while open, its summary's ::after is the dimmed backdrop and its
// ::before the close mark, so a tap outside or on × closes it without a script.
function MenuButton({ s, ctx }: { s: Section; ctx: Ctx }) {
  const items = shown(ctx.menus?.[str(s.settings.menu)] ?? [])
  const label = str(s.settings.label)
  return (
    <details className="sf-mbtn" style={cssVars({ '--mb-bg': str(s.settings.drawerBackground), '--mb-color': str(s.settings.drawerColor) })}>
      <summary aria-label={label ? undefined : tr(ctx.lang, ['মেনু', 'Menu'])}><MarketingIcon name="menu" size={typeof s.settings.iconSize === 'number' ? s.settings.iconSize : 24} />{label && <span>{label}</span>}</summary>
      <div className="sf-mbtn__panel">
        <p className="sf-mbtn__title">{label || ctx.store?.name || tr(ctx.lang, ['মেনু', 'Menu'])}</p>
        {items.length ? <nav aria-label={tr(ctx.lang, ['মেনু', 'Menu'])}><MenuTree items={items} current={ctx.current?.path} /></nav> : ctx.preview ? <p>মেনু বেছে নিন</p> : null}
      </div>
    </details>
  )
}

function ContactList({ store, className, lang }: { store: StoreInfo; className: string; lang?: Lang }) {
  if (!store.phone && !store.whatsapp && !store.email && !store.address && !store.facebook) return null
  return (
    <ul className={className}>
      {store.phone && <li><span>{tr(lang, ['ফোন', 'Phone'])}</span><a href={`tel:${digitsOnly(store.phone)}`}>{store.phone}</a></li>}
      {store.whatsapp && <li><span>{tr(lang, ['হোয়াটসঅ্যাপ', 'WhatsApp'])}</span><a href={whatsappHref(store.whatsapp)} rel="noopener">{store.whatsapp}</a></li>}
      {store.email && <li><span>{tr(lang, ['ইমেইল', 'Email'])}</span><a href={`mailto:${store.email}`}>{store.email}</a></li>}
      {store.facebook && /^https:\/\//.test(store.facebook) && <li><span>{tr(lang, ['ফেসবুক', 'Facebook'])}</span><a href={store.facebook} rel="noopener">{store.facebook.replace(/^https:\/\/(www\.)?/, '')}</a></li>}
      {store.address && <li><span>{tr(lang, ['ঠিকানা', 'Address'])}</span><span>{store.address}</span></li>}
    </ul>
  )
}

function StoreFooter({ s, ctx }: { s: Section; ctx: Ctx }) {
  const menu = shown(ctx.menus?.[str(s.settings.menu)] ?? [])
  const text = str(s.settings.text)
  return (
    <footer className="sf-foot">
      <div className="sf-wrap">
        {menu.length > 0 && <nav className="sf-foot__menu" aria-label={tr(ctx.lang, ['ফুটার মেনু', 'Footer menu'])}><MenuTree items={menu} current={ctx.current?.path} /></nav>}
        {text && <p className="sf-foot__text">{text}</p>}
        {s.settings.showContact === 'yes' && ctx.store && <ContactList store={ctx.store} className="sf-foot__contact" lang={ctx.lang} />}
        <p>{str(s.settings.copyright) || `© ${ctx.store?.name ?? ''}`}</p>
      </div>
    </footer>
  )
}

function ProductInfo({ s, ctx }: { s: Section; ctx: Ctx }) {
  const item = ctx.current?.product
  if (!item) return ctx.preview ? <section className="sf-section"><div className="sf-wrap"><Hint ctx={ctx}>পণ্যের পেজে এখানে পণ্যটি, দাম ও অর্ডার ফর্ম দেখাবে</Hint></div></section> : null
  const prices = item.product.variants.map((v) => v.price)
  const compare = Math.max(0, ...item.product.variants.map((v) => v.comparePrice ?? 0))
  const order: Section = { id: 'buy', type: 'order', hidden: false, settings: { heading: str(s.settings.formHeading) || tr(ctx.lang, ['অর্ডার করুন', 'Order now']), product: item.id, button: str(s.settings.formButton) || tr(ctx.lang, ['অর্ডার নিশ্চিত করুন', 'Confirm order']) } }
  const mode = str(s.settings.buyMode) || 'both'
  return (
    <>
      <div className="sf-wrap sf-product">
        <ProductImages images={item.images} name={item.name} stacked={s.settings.galleryLayout === 'stack'} />
        <div>
          <h1>{item.name}</h1>
          {prices.length > 0 && <Price price={Math.min(...prices)} comparePrice={compare > 0 ? compare : null} lang={ctx.lang} />}
          {!item.product.variants.some((v) => v.available) && <p className="sf-error">{tr(ctx.lang, ['এখন স্টকে নেই', 'Out of stock'])}</p>}
          {item.product.variants.some((v) => v.available) && <div className="sf-buy">
            {mode !== 'cart' && <a className="sf-button" href="#buy">{str(s.settings.buyButton) || tr(ctx.lang, ['এখনই অর্ডার করুন', 'Order now'])}</a>}
            {mode !== 'order' && (
              <form className="sf-add" method="post" action={ctx.preview ? undefined : '/cart/add'}>
                {item.product.variants.length > 1
                  ? <label className="sf-field"><span>{tr(ctx.lang, ['অপশন', 'Option'])}</span><select name="variant">{item.product.variants.map((v) => <option key={v.id} value={v.id} disabled={!v.available}>{v.label} · {taka(v.price, ctx.lang)}{!v.available && tr(ctx.lang, [' (স্টকে নেই)', ' (out of stock)'])}</option>)}</select></label>
                  : <input type="hidden" name="variant" value={item.product.variants[0].id} />}
                <label className="sf-field sf-add__qty"><span>{tr(ctx.lang, ['পরিমাণ', 'Quantity'])}</span><input type="number" name="quantity" min={1} max={20} defaultValue="1" inputMode="numeric" /></label>
                <button type="submit" className={`sf-button${mode === 'both' ? ' sf-button--outline' : ''}`}>{str(s.settings.cartButton) || tr(ctx.lang, ['কার্টে রাখুন', 'Add to cart'])}</button>
              </form>
            )}
          </div>}
          {shownSetting(s, 'showDescription') && item.description && <div className="sf-description" dangerouslySetInnerHTML={{ __html: cleanRichText(item.description) }} />}
          {s.settings.showAttributes !== 'no' && item.attributes && <AttributeTable attributes={item.attributes} lang={ctx.lang} />}
        </div>
      </div>
      {mode !== 'cart' && <OrderForm s={order} ctx={ctx} />}
    </>
  )
}

function ProductList({ s, ctx }: { s: Section; ctx: Ctx }) {
  const data = ctx.grid?.(s.id)
  const heading = str(s.settings.heading)
  if (!data) return ctx.preview ? <section className="sf-section"><div className="sf-wrap"><Hint ctx={ctx}>এখানে দোকানের পণ্যগুলো দেখাবে</Hint></div></section> : null
  const filters = s.settings.filters !== 'no' ? data.filters : undefined
  const list = <>
    {filters && <ActiveFilters view={filters} lang={ctx.lang} />}
    {data.cards.length > 0
      ? <ProductGrid lang={ctx.lang} cards={data.cards} columns={typeof s.settings.columns === 'number' ? s.settings.columns : undefined} mobileColumns={typeof s.settings.mobileColumns === 'number' ? s.settings.mobileColumns : undefined} />
      : <p className="sf-empty">{filters && activeFilters(filters.sel) > 0
        ? tr(ctx.lang, ['এই ফিল্টারে কোনো পণ্য নেই। একটি ফিল্টার সরিয়ে দেখুন।', 'No products match these filters. Try removing one.'])
        : tr(ctx.lang, ['শিগগিরই নতুন পণ্য আসছে।', 'New products are coming soon.'])}</p>}
    {shownSetting(s, 'pager') && <Pager page={data.page} hasMore={data.hasMore} base={data.base} lang={ctx.lang} />}
  </>
  return (
    <section className="sf-section">
      <div className="sf-wrap">
        {heading && <h2 className="sf-heading">{heading}</h2>}
        {filters ? <div className="sf-filtered"><FilterPanel view={filters} lang={ctx.lang} /><div>{list}</div></div> : list}
      </div>
    </section>
  )
}

function CollectionHeader({ s, ctx }: { s: Section; ctx: Ctx }) {
  const collection = ctx.current?.collection
  if (!collection) return ctx.preview ? <section className="sf-section"><div className="sf-wrap"><Hint ctx={ctx}>কালেকশনের পেজে এখানে কালেকশনের নাম ও বর্ণনা দেখাবে</Hint></div></section> : null
  return (
    <section className="sf-section sf-collection-head">
      <div className="sf-wrap">
        <h1 className="sf-heading">{collection.name}</h1>
        {shownSetting(s, 'showDescription') && collection.description && <div className="sf-description sf-narrow" dangerouslySetInnerHTML={{ __html: cleanRichText(collection.description) }} />}
      </div>
    </section>
  )
}

function CollectionList({ s, ctx }: { s: Section; ctx: Ctx }) {
  const list = ctx.collections
  const heading = str(s.settings.heading)
  if (!list) return ctx.preview ? <section className="sf-section"><div className="sf-wrap"><Hint ctx={ctx}>এখানে দোকানের কালেকশনগুলো দেখাবে</Hint></div></section> : null
  const columns = typeof s.settings.columns === 'number' ? s.settings.columns : 4
  return (
    <section className="sf-section">
      <div className="sf-wrap">
        {heading && <h1 className="sf-heading">{heading}</h1>}
        {list.length > 0
          ? <ul className="sf-collections" style={{ '--cols': columns } as CSSProperties}>{list.map((x) => <li key={x.id}><a href={`/collections/${encodeURIComponent(x.handle)}`}>{x.image && <img src={x.image.url} alt="" width={x.image.width} height={x.image.height} loading="lazy" />}<span>{x.name}</span></a></li>)}</ul>
          : <p className="sf-empty">{tr(ctx.lang, ['শিগগিরই নতুন কালেকশন আসছে।', 'New collections are coming soon.'])}</p>}
      </div>
    </section>
  )
}

// "By ordering you accept…" with links to the store's visible terms and return policy, when it has them.
function PolicyNote({ ctx }: { ctx: Ctx }) {
  const terms = ctx.policies?.terms
  const refund = ctx.policies?.refund
  if (!terms && !refund) return null
  if (ctx.lang === 'en') return <p className="sf-note">By ordering you accept the store’s {terms && <a href={terms}>terms</a>}{terms && refund && ' and '}{refund && <a href={refund}>return policy</a>}.</p>
  return <p className="sf-note">অর্ডার করে আপনি দোকানের {terms && <a href={terms}>শর্তাবলি</a>}{terms && refund && ' ও '}{refund && <a href={refund}>রিটার্ন নীতি</a>} মেনে নিচ্ছেন।</p>
}

// Delivery for a cart: free when the option's conditions hold for the whole cart. Display only; shipping_charge decides.
const cartCharge = (o: ShippingOption, productIds: string[], subtotal: number, qty: number) =>
  (o.freeOver !== null && subtotal >= o.freeOver) || (o.freeMinQty !== null && qty >= o.freeMinQty) || productIds.some((id) => o.freeProducts.includes(id)) ? 0 : o.price

function CartBlock({ s, ctx }: { s: Section; ctx: Ctx }) {
  const cart = ctx.cart
  if (!cart) return ctx.preview ? <section className="sf-section"><div className="sf-wrap"><Hint ctx={ctx}>কার্টের পেজে এখানে ক্রেতার কার্ট ও অর্ডার ফর্ম দেখাবে</Hint></div></section> : null
  const values = cart.values ?? {}
  const options = ctx.shipping
  const rate = options.find((o) => o.id === values.rate) ?? options[0]
  const productIds = [...new Set(cart.lines.map((l) => l.productId))]
  const charge = rate ? cartCharge(rate, productIds, cart.subtotal, cart.qty) : 0
  const field = (name: keyof OrderValues) => ({ name, defaultValue: values[name] ?? prefill(ctx, name), 'aria-invalid': cart.error === name ? true : undefined })
  return (
    <section className="sf-section">
      <div className="sf-wrap sf-cart">
        {str(s.settings.heading) && <h1 className="sf-heading">{str(s.settings.heading)}</h1>}
        {cart.lines.length === 0
          ? <div className="sf-empty"><p>{str(s.settings.emptyText) || tr(ctx.lang, ['কার্টে এখনো কিছু নেই।', 'Your cart is empty.'])}</p><a className="sf-button sf-button--outline" href="/products">{tr(ctx.lang, ['কেনাকাটা করুন', 'Start shopping'])}</a></div>
          : <div className="sf-cart__layout">
            <div>
              <ul className="sf-cart__lines">
                {cart.lines.map((l) => (
                  <li key={l.variantId} className="sf-cart__line">
                    <a className="sf-cart__image" href={`/products/${encodeURIComponent(l.handle)}`}>{l.image && <img src={l.image.url} alt="" width={l.image.width} height={l.image.height} loading="lazy" />}</a>
                    <div className="sf-cart__info">
                      <a href={`/products/${encodeURIComponent(l.handle)}`}>{l.name}</a>
                      {l.label && <small>{l.label}</small>}
                      <span>{taka(l.price, ctx.lang)}</span>
                      {!l.available && <span className="sf-error">{tr(ctx.lang, ['এখন স্টকে নেই, অর্ডারের আগে সরিয়ে দিন।', 'Out of stock. Remove it before ordering.'])}</span>}
                    </div>
                    <form className="sf-cart__qty" method="post" action={ctx.preview ? undefined : '/cart/update'}>
                      <input type="hidden" name="variant" value={l.variantId} />
                      <label><span className="sf-trap">{tr(ctx.lang, ['পরিমাণ', 'Quantity'])}</span><input type="number" name="quantity" min={0} max={20} defaultValue={String(l.qty)} inputMode="numeric" aria-label={`${l.name}: ${tr(ctx.lang, ['পরিমাণ', 'Quantity'])}`} /></label>
                      <button type="submit" className="sf-link-button">{tr(ctx.lang, ['বদলান', 'Update'])}</button>
                      <button type="submit" name="quantity" value="0" className="sf-link-button">{tr(ctx.lang, ['সরান', 'Remove'])}</button>
                    </form>
                    <strong className="sf-cart__total">{taka(l.price * l.qty, ctx.lang)}</strong>
                  </li>
                ))}
              </ul>
            </div>
            <form className="sf-order" method="post" action={ctx.preview ? undefined : '/cart'} data-cart data-subtotal={cart.subtotal} data-qty={cart.qty}>
              {!ctx.preview && <input type="hidden" name="checkout" value={cart.checkoutToken} />}
              <label className="sf-trap" aria-hidden="true">Website<input name="website" tabIndex={-1} autoComplete="off" /></label>
              {cart.error && <p className="sf-error" role="alert">{tr(ctx.lang, orderErrors[cart.error] ?? orderErrors.server)}</p>}
              <label className="sf-field"><span>{tr(ctx.lang, ['আপনার নাম', 'Your name'])}</span><input autoComplete="name" maxLength={100} required {...field('name')} /></label>
              <label className="sf-field"><span>{tr(ctx.lang, ['মোবাইল নম্বর', 'Mobile number'])}</span><input type="tel" inputMode="tel" autoComplete="tel" maxLength={20} placeholder="01XXXXXXXXX" required {...field('phone')} /></label>
              <label className="sf-field"><span>{tr(ctx.lang, ['পুরো ঠিকানা', 'Full address'])}</span><textarea rows={3} autoComplete="street-address" maxLength={500} required {...field('address')} /></label>
              {options.length > 0 && (
                <fieldset className="sf-choices">
                  <legend>{tr(ctx.lang, ['ডেলিভারি', 'Delivery'])}</legend>
                  {options.map((o) => {
                    const c = cartCharge(o, productIds, cart.subtotal, cart.qty)
                    return (
                      <label key={o.id} className="sf-choice">
                        <input type="radio" name="rate" value={o.id} defaultChecked={o.id === rate?.id} data-charge-value={c} />
                        <span className="sf-choice__text"><span>{o.name}</span>{o.note && <small>{o.note}</small>}</span>
                        <strong>{c === 0 ? tr(ctx.lang, ['ফ্রি', 'Free']) : taka(c, ctx.lang)}</strong>
                      </label>
                    )
                  })}
                </fieldset>
              )}
              {options.length === 0 && <p className="sf-error" role="alert">{tr(ctx.lang, orderErrors.noDelivery)}</p>}
              <label className="sf-field"><span>{tr(ctx.lang, ['কুপন কোড (থাকলে)', 'Coupon code (if any)'])}</span><input autoComplete="off" autoCapitalize="characters" maxLength={30} {...field('coupon')} /></label>
              <p className="sf-total"><span>{tr(ctx.lang, ['পণ্য', 'Products'])}</span><span>{taka(cart.subtotal, ctx.lang)}</span></p>
              <p className="sf-total"><span>{tr(ctx.lang, ['সর্বমোট (ডিসকাউন্টের আগে)', 'Total (before discounts)'])}</span><strong data-total>{taka(cart.subtotal + charge, ctx.lang)}</strong></p>
              <button type="submit" className="sf-button sf-button--block" disabled={options.length === 0 || cart.lines.some((l) => !l.available)}>{str(s.settings.button) || tr(ctx.lang, ['অর্ডার নিশ্চিত করুন', 'Confirm order'])}</button>
              {str(s.settings.note) && <p className="sf-note">{str(s.settings.note)}</p>}
              <PolicyNote ctx={ctx} />
            </form>
          </div>}
      </div>
    </section>
  )
}

const accountErrors: Record<string, Pair> = {
  name: ['আপনার নাম লিখুন।', 'Enter your name.'],
  phone: ['সঠিক মোবাইল নম্বর দিন, যেমন 01712345678।', 'Enter a valid mobile number, like 01712345678.'],
  password: ['পাসওয়ার্ড অন্তত ৬ অক্ষরের হতে হবে।', 'The password needs at least 6 characters.'],
  wrong: ['মোবাইল নম্বর বা পাসওয়ার্ড মেলেনি।', 'The mobile number or password is wrong.'],
  taken: ['এই নম্বরে আগেই অ্যাকাউন্ট আছে। লগ ইন করুন।', 'This number already has an account. Sign in instead.'],
  tooMany: ['অনেকবার ভুল হয়েছে। ১৫ মিনিট পরে আবার চেষ্টা করুন।', 'Too many wrong tries. Try again in 15 minutes.'],
  address: ['ঠিকানা ৫০০ অক্ষরের মধ্যে লিখুন।', 'Keep the address under 500 characters.'],
  server: ['এখন করা গেল না। একটু পরে আবার চেষ্টা করুন।', 'That did not work. Please try again shortly.'],
}
export const orderStatusLabels: Record<string, Pair> = {
  new: ['নতুন', 'Placed'], hold: ['অপেক্ষায়', 'On hold'], confirmed: ['নিশ্চিত', 'Confirmed'], packed: ['প্যাক হয়েছে', 'Packed'],
  courier: ['পথে আছে', 'On the way'], delivered: ['পৌঁছেছে', 'Delivered'], returned: ['ফেরত', 'Returned'], cancelled: ['বাতিল', 'Cancelled'],
}

// /account, /account/login and /account/register: plain forms, no script. Passwords are never echoed back.
function AccountBlock({ s, ctx }: { s: Section; ctx: Ctx }) {
  const account = ctx.account
  if (!account) return ctx.preview ? <section className="sf-section"><div className="sf-wrap"><Hint ctx={ctx}>ক্রেতার অ্যাকাউন্টের পেজে এখানে লগ ইন, নতুন অ্যাকাউন্ট আর অর্ডারের তালিকা দেখাবে</Hint></div></section> : null
  const L = (pair: Pair) => tr(ctx.lang, pair)
  const error = account.error && <p className="sf-error" role="alert">{L(accountErrors[account.error] ?? accountErrors.server)}</p>
  const submit = ctx.preview ? 'button' : 'submit'
  if (account.mode !== 'view') {
    const register = account.mode === 'register'
    const next = account.next ? `?next=${encodeURIComponent(account.next)}` : ''
    return (
      <section className="sf-section">
        <div className="sf-wrap sf-narrow sf-account">
          <h1 className="sf-heading">{register ? L(['নতুন অ্যাকাউন্ট', 'Create account']) : L(['লগ ইন', 'Sign in'])}</h1>
          {!register && str(s.settings.intro) && <p className="sf-note">{str(s.settings.intro)}</p>}
          <form className="sf-order" method="post" action={register ? '/account/register' : '/account/login'}>
            {account.next && <input type="hidden" name="next" value={account.next} />}
            {register && <label className="sf-field"><span>{L(['আপনার নাম', 'Your name'])}</span><input name="name" autoComplete="name" maxLength={100} required defaultValue={account.values?.name ?? ''} aria-invalid={account.error === 'name' || undefined} /></label>}
            <label className="sf-field"><span>{L(['মোবাইল নম্বর', 'Mobile number'])}</span><input name="phone" type="tel" inputMode="tel" autoComplete="tel" maxLength={20} placeholder="01XXXXXXXXX" required defaultValue={account.values?.phone ?? ''} aria-invalid={account.error === 'phone' || account.error === 'taken' || undefined} /></label>
            <label className="sf-field"><span>{L(['পাসওয়ার্ড', 'Password'])}</span><input name="password" type="password" autoComplete={register ? 'new-password' : 'current-password'} minLength={register ? 6 : undefined} maxLength={100} required aria-invalid={account.error === 'password' || account.error === 'wrong' || undefined} /></label>
            {error}
            <button className="sf-button sf-button--block" type={submit}>{register ? L(['অ্যাকাউন্ট খুলুন', 'Create account']) : L(['লগ ইন', 'Sign in'])}</button>
          </form>
          <p className="sf-account__switch">{register
            ? <>{L(['আগে থেকেই অ্যাকাউন্ট আছে?', 'Already have an account?'])} <a href={`/account/login${next}`}>{L(['লগ ইন করুন', 'Sign in'])}</a></>
            : <>{L(['নতুন ক্রেতা?', 'New here?'])} <a href={`/account/register${next}`}>{L(['অ্যাকাউন্ট খুলুন', 'Create an account'])}</a></>}</p>
        </div>
      </section>
    )
  }
  const date = (iso: string) => new Date(iso).toLocaleDateString(ctx.lang === 'en' ? 'en-GB' : 'bn-BD', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Dhaka' })
  return (
    <section className="sf-section">
      <div className="sf-wrap sf-account">
        <div className="sf-account__head">
          <h1 className="sf-heading">{L(['আমার অ্যাকাউন্ট', 'My account'])}</h1>
          <form method="post" action="/account/logout"><button className="sf-link-button" type={submit}>{L(['লগ আউট', 'Sign out'])}</button></form>
        </div>
        <div className="sf-account__grid">
          <div>
            <h2 className="sf-account__title">{L(['আমার অর্ডার', 'My orders'])}</h2>
            {account.orders.length === 0
              ? <div className="sf-empty"><p>{L(['এই অ্যাকাউন্ট থেকে এখনো কোনো অর্ডার হয়নি।', 'No orders from this account yet.'])}</p><a className="sf-button sf-button--outline" href="/products">{L(['কেনাকাটা করুন', 'Start shopping'])}</a></div>
              : <ul className="sf-account__orders">{account.orders.map((o) => (
                <li key={o.number}>
                  <div><strong>#{num(ctx.lang, o.number, { useGrouping: false })}</strong><span className="sf-account__status">{L(orderStatusLabels[o.status] ?? [o.status, o.status])}</span></div>
                  <p>{o.items}</p>
                  <div className="sf-account__meta"><span>{date(o.createdAt)}</span><strong>{taka(o.total, ctx.lang)}</strong></div>
                </li>
              ))}</ul>}
          </div>
          <form className="sf-order" method="post" action="/account">
            <h2 className="sf-account__title">{L(['আমার তথ্য', 'My details'])}</h2>
            <p className="sf-note">{L(['অর্ডার ফর্মে এগুলো আগে থেকেই বসানো থাকবে।', 'These fill in the order form for you.'])}</p>
            <label className="sf-field"><span>{L(['মোবাইল নম্বর', 'Mobile number'])}</span><input value={account.buyer.phone} readOnly /></label>
            <label className="sf-field"><span>{L(['আপনার নাম', 'Your name'])}</span><input name="name" autoComplete="name" maxLength={100} required defaultValue={account.buyer.name} aria-invalid={account.error === 'name' || undefined} /></label>
            <label className="sf-field"><span>{L(['পুরো ঠিকানা', 'Full address'])}</span><textarea name="address" rows={3} autoComplete="street-address" maxLength={500} defaultValue={account.buyer.address} /></label>
            {error}
            {account.saved && <p className="sf-account__saved" role="status">{L(['সেভ হয়েছে।', 'Saved.'])}</p>}
            <button className="sf-button sf-button--block" type={submit}>{L(['সেভ করুন', 'Save'])}</button>
          </form>
        </div>
      </div>
    </section>
  )
}

function ProductAttributesBlock({ s, ctx }: { s: Section; ctx: Ctx }) {
  const item = ctx.current?.product
  if (!item?.attributes?.length) return ctx.preview ? <section className="sf-section"><div className="sf-wrap"><Hint ctx={ctx}>পণ্যের পেজে এখানে পণ্যের বৈশিষ্ট্যের তালিকা দেখাবে (পণ্য › অ্যাট্রিবিউট)</Hint></div></section> : null
  return <section className="sf-section"><div className="sf-wrap sf-narrow"><AttributeTable attributes={item.attributes} lang={ctx.lang} heading={str(s.settings.heading)} /></div></section>
}

function SearchBlock({ s, ctx }: { s: Section; ctx: Ctx }) {
  const search = ctx.search
  if (!search) return ctx.preview ? <section className="sf-section"><div className="sf-wrap"><Hint ctx={ctx}>খোঁজার পেজে এখানে খোঁজার ঘর ও ফল দেখাবে</Hint></div></section> : null
  return (
    <section className="sf-section">
      <div className="sf-wrap">
        {str(s.settings.heading) && <h1 className="sf-heading">{str(s.settings.heading)}</h1>}
        <form className="sf-search" method="get" action="/search" role="search">
          <input type="search" name="q" defaultValue={search.query} maxLength={100} placeholder={tr(ctx.lang, ['পণ্যের নাম লিখুন', 'Type a product name'])} aria-label={tr(ctx.lang, ['পণ্য খুঁজুন', 'Search products'])} />
          <button type="submit" className="sf-button">{tr(ctx.lang, ['খুঁজুন', 'Search'])}</button>
        </form>
        {search.query && (() => {
          const filters = s.settings.filters !== 'no' ? search.filters : undefined
          const results = search.cards.length > 0
            ? <ProductGrid lang={ctx.lang} cards={search.cards} columns={typeof s.settings.columns === 'number' ? s.settings.columns : undefined} />
            : <p className="sf-empty">{ctx.lang === 'en' ? `Nothing found for "${search.query}". Try other words.` : `"${search.query}" দিয়ে কিছু পাওয়া যায়নি। অন্য শব্দ দিয়ে খুঁজুন।`}</p>
          return filters ? <div className="sf-filtered"><FilterPanel view={filters} lang={ctx.lang} /><div><ActiveFilters view={filters} lang={ctx.lang} />{results}</div></div> : results
        })()}
      </div>
    </section>
  )
}

function PageContent({ s, ctx }: { s: Section; ctx: Ctx }) {
  const page = ctx.current?.page
  if (!page) return ctx.preview ? <section className="sf-section"><div className="sf-wrap"><Hint ctx={ctx}>দোকানের পেজে এখানে পেজের লেখা দেখাবে</Hint></div></section> : null
  return (
    <section className="sf-section">
      <div className="sf-wrap sf-narrow sf-store-page">
        {shownSetting(s, 'showTitle') && <h1 className="sf-heading">{page.title}</h1>}
        <div className="sf-description" dangerouslySetInnerHTML={{ __html: cleanRichText(page.body) }} />
        {page.policy === 'contact' && ctx.store && <ContactList store={ctx.store} className="sf-contact-list" lang={ctx.lang} />}
      </div>
    </section>
  )
}

export function SectionView({ s, ctx, orderId }: { s: Section; ctx: Ctx; orderId?: string }) {
  switch (s.type) {
    case 'layout': return <LayoutSection s={s} ctx={ctx} orderId={orderId} />
    case 'html': return str(s.settings.html) ? <EmbedFrame html={str(s.settings.html)} ctx={ctx} /> : ctx.preview ? <div className="sf-n-placeholder">HTML লিখুন</div> : null
    case 'iconCards': return <InfoItems s={s} ctx={ctx} />
    case 'iconList': return <IconList s={s} ctx={ctx} />
    case 'header': return <LandingHeader s={s} ctx={ctx} orderId={orderId} />
    case 'footer': return <LandingFooter s={s} ctx={ctx} />
    case 'announcement': return <CallToAction s={s} orderId={orderId} ctx={ctx} />
    case 'trust':
    case 'steps':
    case 'cards': return <InfoItems s={s} ctx={ctx} />
    case 'specifications': return <Specifications s={s} />
    case 'comparison': return <Comparison s={s} ctx={ctx} />
    case 'features': return <Features s={s} ctx={ctx} />
    case 'reviews': return <Reviews s={s} ctx={ctx} />
    case 'faq': return <Faq s={s} />
    case 'order': return <OrderForm s={s} ctx={ctx} />
    case 'contact': return <Contact s={s} ctx={ctx} />
    case 'gallery': return <Gallery s={s} ctx={ctx} />
    case 'countdown': return <Countdown s={s} ctx={ctx} />
    case 'storeHeader': return <StoreHeader s={s} ctx={ctx} />
    case 'storeLogo': return <StoreLogo s={s} ctx={ctx} />
    case 'storeMenu': return <StoreMenu s={s} ctx={ctx} />
    case 'storeIcons': return <StoreIcons s={s} ctx={ctx} />
    case 'storeSearch': return <StoreSearch s={s} ctx={ctx} />
    case 'menuButton': return <MenuButton s={s} ctx={ctx} />
    case 'storeFooter': return <StoreFooter s={s} ctx={ctx} />
    case 'productInfo': return <ProductInfo s={s} ctx={ctx} />
    case 'productGrid': return <ProductList s={s} ctx={ctx} />
    case 'collectionHeader': return <CollectionHeader s={s} ctx={ctx} />
    case 'collectionList': return <CollectionList s={s} ctx={ctx} />
    case 'pageContent': return <PageContent s={s} ctx={ctx} />
    case 'cart': return <CartBlock s={s} ctx={ctx} />
    case 'search': return <SearchBlock s={s} ctx={ctx} />
    case 'account': return <AccountBlock s={s} ctx={ctx} />
    case 'productAttributes': return <ProductAttributesBlock s={s} ctx={ctx} />
  }
}

const visible = (sections: Section[]) => sections.filter((s) => !s.hidden)

// A page: the theme's header and footer groups around the page's own sections. Landing pages get the store's header and
// footer from its theme while their canvas switches are on (frame); without a frame they keep the plain name bar.
export function PageView({ content, ctx, storeName, frame, themeCss }: { content: Content; ctx: Ctx; storeName: string; frame?: { header: Section[]; footer: Section[] }; themeCss?: string }) {
  const header = content.canvas?.header === false ? [] : frame?.header
  const footer = content.canvas?.footer === false ? [] : frame?.footer
  const all: Content = { ...content, sections: [...(header ?? []), ...content.sections, ...(footer ?? [])] }
  const orderId = firstOrderId(content)
  const fonts = new Set(visible(all.sections).map((s) => s.style?.font).filter(Boolean))
  const nodes = layoutCss(all, ctx)
  const pageFont = pageFontCss(content.fonts)
  const draw = (list: Section[]) => visible(list).map((s) => <SectionFrame key={s.id} s={s} ctx={ctx}><SectionView s={s} ctx={ctx} orderId={orderId} /></SectionFrame>)
  return (
    <div className="sf-page">
      {pageFont && <link rel="stylesheet" href={pageFont.href} />}
      {pageFont && <style dangerouslySetInnerHTML={{ __html: pageFont.css }} />}
      {fonts.has('serif') && <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Tiro+Bangla&display=swap" />}
      {fonts.has('sans') && <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+Bengali:wght@400;600;700&display=swap" />}
      {nodes && <style dangerouslySetInnerHTML={{ __html: nodes }} />}
      {header ? draw(header) : content.canvas?.header !== false && <header className="sf-bar"><div className="sf-wrap">{storeName}</div></header>}
      <main>{draw(content.sections)}</main>
      {footer ? draw(footer) : content.canvas?.footer !== false && <footer className="sf-foot"><div className="sf-wrap">© {storeName}</div></footer>}
      {themeCss && <style dangerouslySetInnerHTML={{ __html: themeCss }} />}
      {content.css && <style dangerouslySetInnerHTML={{ __html: content.css }} />}
    </div>
  )
}

// The cart page's script: keeps the shown total in step with the chosen delivery option. Display only.
// The side cart's contents, drawn by the server (prices from storefront_cart_lines) and swapped into the drawer by
// drawerScript. Each change is a plain form post, so without the script the same forms work on the cart page.
export function CartDrawerBody({ lines, shipping, lang }: { lines: CartLine[]; shipping: ShippingOption[]; lang?: Lang }) {
  const L = (pair: Pair) => tr(lang, pair)
  const qty = lines.reduce((n, l) => n + l.qty, 0)
  const subtotal = lines.reduce((n, l) => n + l.price * l.qty, 0)
  // The nearest free-delivery amount among the delivery options (display only; shipping_charge decides at checkout).
  const free = shipping.filter((o) => o.freeOver !== null && o.price > 0).sort((a, b) => a.freeOver! - b.freeOver!)[0]
  const close = <button type="button" className="sf-drawer__close" data-cart-close aria-label={L(['বন্ধ করুন', 'Close'])}><span aria-hidden="true">×</span></button>
  return <>
    <div className="sf-drawer__head"><h2>{L(['আপনার কার্ট', 'Your cart'])}{qty > 0 && <span> ({num(lang, qty)})</span>}</h2>{close}</div>
    {lines.length === 0
      ? <div className="sf-drawer__empty"><p>{L(['কার্টে এখনো কিছু নেই।', 'Your cart is empty.'])}</p><a className="sf-button" href="/products">{L(['কেনাকাটা করুন', 'Start shopping'])}</a></div>
      : <>
        {free && <div className="sf-drawer__free">
          <p>{subtotal >= free.freeOver!
            ? (lang === 'en' ? `Free delivery unlocked: ${free.name}` : `${free.name} ডেলিভারি ফ্রি হয়ে গেছে`)
            : (lang === 'en' ? `Add ${taka(free.freeOver! - subtotal, lang)} more for free delivery (${free.name})` : `আর ${taka(free.freeOver! - subtotal, lang)} কিনলে ${free.name} ডেলিভারি ফ্রি`)}</p>
          <span className="sf-drawer__bar"><span style={{ width: `${Math.min(100, Math.round((subtotal / free.freeOver!) * 100))}%` }} /></span>
        </div>}
        <ul className="sf-drawer__lines">{lines.map((l) => (
          <li key={l.variantId}>
            <a className="sf-drawer__image" href={productHref(l.handle)} tabIndex={-1} aria-hidden="true">{l.image && <img src={l.image.url} alt="" width={l.image.width} height={l.image.height} loading="lazy" />}</a>
            <div className="sf-drawer__info">
              <a href={productHref(l.handle)}>{l.name}</a>
              {l.label && <span className="sf-drawer__label">{l.label}</span>}
              <span className="sf-drawer__price">{taka(l.price, lang)}{l.comparePrice !== null && l.comparePrice > l.price && <s>{taka(l.comparePrice, lang)}</s>}</span>
              {!l.available && <span className="sf-error">{L(['এখন স্টকে নেই, অর্ডারের আগে সরিয়ে দিন।', 'Out of stock. Remove it before ordering.'])}</span>}
              <form className="sf-drawer__qty" method="post" action="/cart/update" data-cart-form>
                <input type="hidden" name="variant" value={l.variantId} />
                <button type="submit" name="quantity" value={String(l.qty - 1)} aria-label={`${l.name}: ${L(['একটি কমান', 'One less'])}`}>−</button>
                <span aria-label={L(['পরিমাণ', 'Quantity'])}>{num(lang, l.qty)}</span>
                <button type="submit" name="quantity" value={String(l.qty + 1)} disabled={l.qty >= 20} aria-label={`${l.name}: ${L(['একটি বাড়ান', 'One more'])}`}>+</button>
                <button type="submit" name="quantity" value="0" className="sf-link-button">{L(['সরান', 'Remove'])}</button>
              </form>
            </div>
            <strong className="sf-drawer__total">{taka(l.price * l.qty, lang)}</strong>
          </li>
        ))}</ul>
        <div className="sf-drawer__foot">
          <p className="sf-total"><span>{L(['পণ্যের দাম', 'Subtotal'])}</span><strong>{taka(subtotal, lang)}</strong></p>
          <p className="sf-note">{L(['ডেলিভারি চার্জ ও ছাড় চেকআউটে যোগ হবে। পণ্য হাতে পেয়ে টাকা দিন।', 'Delivery and discounts are added at checkout. Pay when you receive your order.'])}</p>
          <a className="sf-button sf-button--block" href="/cart">{L(['চেকআউট করুন', 'Checkout'])}</a>
          <button type="button" className="sf-link-button sf-drawer__keep" data-cart-close>{L(['কেনাকাটা চালিয়ে যান', 'Keep shopping'])}</button>
        </div>
      </>}
  </>
}

// The empty drawer every store page carries; drawerScript fills and opens it.
export const CartDrawer = ({ lang }: { lang?: Lang }) => <dialog className="sf-drawer" id="sf-cart" aria-label={tr(lang, ['কার্ট', 'Cart'])}><div className="sf-drawer__body" data-cart-body /></dialog>

// Opens the side cart from the header's Cart link and after Add to cart, and keeps quantity and remove changes in it.
// Only when the header asks for the drawer (data-cart-drawer); any failure falls back to the plain form or the cart page.
export const drawerScript = `(function(){var d=document.getElementById('sf-cart');if(!d||!d.showModal||!document.querySelector('[data-cart-drawer]'))return;var b=d.querySelector('[data-cart-body]');var fmt=new Intl.NumberFormat(document.documentElement.lang==='en'?'en-US':'bn-BD');function show(html,count){b.innerHTML=html;document.querySelectorAll('[data-cart-drawer]').forEach(function(a){var s=a.querySelector('.sf-bar__count');if(count>0){if(!s){s=document.createElement('span');s.className='sf-bar__count';a.appendChild(s)}s.textContent=fmt.format(count)}else if(s){s.remove()}});if(!d.open)d.showModal()}function load(r){if(!r.ok)throw new Error();var n=Number(r.headers.get('x-cart-count'))||0;return r.text().then(function(h){show(h,n)})}document.addEventListener('click',function(e){var a=e.target.closest('[data-cart-drawer]');if(a){e.preventDefault();fetch('/cart/drawer',{headers:{'x-cart':'drawer'}}).then(load).catch(function(){location.href='/cart'});return}if(e.target===d||e.target.closest('[data-cart-close]'))d.close()});document.addEventListener('submit',function(e){var f=e.target;if(!f.matches('form[action="/cart/add"],form[data-cart-form]'))return;e.preventDefault();var fd=new FormData(f);var s=e.submitter;if(s&&s.name)fd.set(s.name,s.value);f.setAttribute('aria-busy','true');fetch(f.action,{method:'POST',body:fd,headers:{'x-cart':'drawer'}}).then(load).catch(function(){f.submit()}).finally(function(){f.removeAttribute('aria-busy')})})})()`

export const cartScript = `document.querySelectorAll('form[data-cart]').forEach(function(f){var n=new Intl.NumberFormat(document.documentElement.lang==='en'?'en-US':'bn-BD');function u(){var r=f.querySelector('input[name=rate]:checked');var c=r?Number(r.dataset.chargeValue):0;f.querySelector('[data-total]').textContent='৳'+n.format(Number(f.dataset.subtotal)+c)}f.addEventListener('change',u)})`

// The only script on a page: keeps order totals and countdowns current, and once the phone number is valid,
// saves what the buyer typed so the store can call if they do not finish. Forms work without it.
export const pageScript = `document.querySelectorAll('[data-countdown]').forEach(function(el){var end=Date.parse(el.dataset.countdown);var n=new Intl.NumberFormat(document.documentElement.lang==='en'?'en-US':'bn-BD',{minimumIntegerDigits:2});var h;function t(){var s=Math.max(0,Math.floor((end-Date.now())/1000));var v=[Math.floor(s/86400),Math.floor(s%86400/3600),Math.floor(s%3600/60),s%60];el.querySelectorAll('[data-unit]').forEach(function(u,i){u.textContent=n.format(v[i])});if(s===0){el.hidden=true;el.nextElementSibling.hidden=false;clearInterval(h)}}h=setInterval(t,1000);t()});`+`document.querySelectorAll('form[data-order]').forEach(function(f){var en=document.documentElement.lang==='en',n=new Intl.NumberFormat(en?'en-US':'bn-BD');function u(){var s=f.querySelector('select[name=variant]');var v=s?s.selectedOptions[0]:f.querySelector('input[name=variant]:checked')||f.querySelector('input[type=hidden][name=variant]');var q=Math.min(Math.max(parseInt(f.elements.quantity.value,10)||1,1),20);var sub=(v?Number(v.dataset.price):0)*q;var d=0;f.querySelectorAll('input[name=rate]').forEach(function(r){var o=r.dataset;var c=('freeProduct' in o)||(o.freeOver&&sub>=Number(o.freeOver))||(o.freeQty&&q>=Number(o.freeQty))?0:Number(o.price);r.closest('label').querySelector('[data-charge]').textContent=c?'৳'+n.format(c):en?'Free':'ফ্রি';if(r.checked)d=c});f.querySelector('[data-total]').textContent='৳'+n.format(sub+d)}f.addEventListener('input',u);f.addEventListener('change',u);var tm;f.addEventListener('input',function(){clearTimeout(tm);tm=setTimeout(function(){var p=f.elements.phone.value.replace(/[০-৯]/g,function(c){return '০১২৩৪৫৬৭৮৯'.indexOf(c)}).replace(/[\\s-]/g,'');if(!/^(\\+?88)?01[3-9]\\d{8}$/.test(p))return;fetch('/drafts',{method:'POST',keepalive:true,body:new URLSearchParams({phone:p,name:f.elements.name.value,address:f.elements.address.value,product:f.dataset.product||''})}).catch(function(){})},800)})})`


export const css = `
:root{--sf-ink:#1d1d1f;--sf-muted:#5f6368;--sf-paper:#fff;--sf-tint:#f5f6f4;--sf-rule:#e3e5e1;--sf-accent:#1f7a4d;--sf-accent-ink:#fff;--sf-error:#b3261e;--sf-radius:10px}
*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--sf-page,var(--sf-paper));color:var(--sf-ink);font:16px/1.6 "Hind Siliguri","Noto Sans Bengali",system-ui,sans-serif}
img{max-width:100%;height:auto;display:block}
h1,h2,h3,p{margin:0}
/* Content width (Site settings, default 1200px) is the content itself; the side padding sits outside it. */
.sf-wrap{max-width:calc(var(--sf-width,1200px) + 32px);margin:0 auto;padding:0 16px}
.sf-narrow{max-width:680px}
.sf-bar{border-bottom:1px solid var(--sf-rule);padding:12px 0;font-weight:700;font-size:18px}
.sf-foot{border-top:1px solid var(--sf-rule);padding:24px 0;color:var(--sf-muted);font-size:14px;text-align:center}
.sf-section{padding:40px 0}
.sf-section--tint{background:var(--sf-tint)}
.sf-heading{font-size:24px;line-height:1.3;margin-bottom:20px;text-align:center}
.sf-body p{margin-bottom:12px}
.sf-button{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:0 24px;margin-top:16px;border:0;border-radius:var(--sf-radius);background:var(--sf-accent);color:var(--sf-accent-ink);font:inherit;font-weight:700;font-size:18px;text-decoration:none;cursor:pointer}
.sf-button:disabled{opacity:.5;cursor:not-allowed}
.sf-button--block{width:100%}
.sf-button--outline{background:transparent;color:var(--sf-accent);box-shadow:inset 0 0 0 2px var(--sf-accent)}
.sf-features{list-style:none;margin:0;padding:0;display:grid;gap:12px}
.sf-features li{display:flex;gap:12px;background:var(--sf-paper);border:1px solid var(--sf-rule);border-radius:var(--sf-radius);padding:16px}
.sf-features svg{flex:none;color:var(--sf-accent);margin-top:4px}
.sf-features h3{font-size:17px}
.sf-features p{color:var(--sf-muted)}
.sf-video{position:relative;aspect-ratio:16/9;border-radius:var(--sf-radius);overflow:hidden;background:#000}
.sf-video iframe{position:absolute;inset:0;width:100%;height:100%;border:0}
.sf-reviews{list-style:none;margin:0;padding:0;display:grid;gap:12px}
.sf-reviews li{background:var(--sf-paper);border:1px solid var(--sf-rule);border-radius:var(--sf-radius);padding:16px;display:grid;gap:8px}
.sf-reviews img{border-radius:6px}
.sf-reviews blockquote{margin:0}
.sf-reviews__name{font-weight:600;color:var(--sf-muted);font-size:14px}
.sf-faq details{border-bottom:1px solid var(--sf-rule);padding:12px 0}
.sf-faq summary{font-weight:600;cursor:pointer}
.sf-faq details p{color:var(--sf-muted);margin-top:8px}
.sf-order{background:var(--sf-paper);border:1px solid var(--sf-rule);border-radius:var(--sf-radius);padding:16px;display:grid;gap:14px}
.sf-order__product{display:flex;gap:12px;align-items:center;font-weight:600}
.sf-order__product img{width:64px;height:64px;object-fit:cover;border-radius:6px}
.sf-field{display:grid;gap:4px;font-weight:600;font-size:15px}
.sf-field input,.sf-field textarea,.sf-field select{font:inherit;font-weight:400;min-height:48px;padding:10px 12px;border:1px solid color-mix(in srgb,var(--sf-ink) 25%,transparent);border-radius:8px;background:var(--sf-paper);color:inherit;width:100%}
.sf-field input:focus,.sf-field textarea:focus,.sf-field select:focus,.sf-choice:focus-within{outline:2px solid var(--sf-accent);outline-offset:1px}
.sf-field [aria-invalid]{border-color:var(--sf-error)}
.sf-choices{border:0;margin:0;padding:0;display:grid;gap:8px}
.sf-choices legend{font-weight:600;font-size:15px;margin-bottom:4px;padding:0}
.sf-choice{display:flex;align-items:center;gap:10px;min-height:48px;padding:0 12px;border:1px solid color-mix(in srgb,var(--sf-ink) 25%,transparent);border-radius:8px;cursor:pointer}
.sf-choice span{flex:1}.sf-choice__text{display:grid;gap:2px;padding:8px 0}.sf-choice__text small{font-size:13px;opacity:.75}.sf-choice__text .sf-choice__free{color:var(--sf-accent);opacity:1;font-weight:600}
.sf-choice input{accent-color:var(--sf-accent);width:18px;height:18px;margin:0}
.sf-total{display:flex;justify-content:space-between;font-size:18px;border-top:1px solid var(--sf-rule);padding-top:12px}
.sf-note{color:var(--sf-muted);font-size:14px}
.sf-offers{display:grid;gap:4px;margin:0;padding:0;list-style:none}
.sf-offers li{padding:6px 10px;border-radius:6px;background:color-mix(in oklab,var(--sf-accent) 12%,transparent);color:var(--sf-ink);font-size:14px;font-weight:600}
.sf-error{color:var(--sf-error);font-weight:600}
.sf-contact{text-align:center}
.sf-gallery{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(2,1fr);gap:8px}
.sf-gallery img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:var(--sf-radius)}
.sf-countdown-wrap{text-align:center}
.sf-countdown{display:flex;justify-content:center;gap:8px}
.sf-countdown div{display:grid;min-width:68px;padding:12px 8px;background:var(--sf-paper);border:1px solid var(--sf-rule);border-radius:var(--sf-radius)}
.sf-countdown strong{font-size:28px;line-height:1.1;color:var(--sf-accent)}
.sf-countdown span{font-size:13px;color:var(--sf-muted)}
.sf-countdown__ended{font-weight:600;font-size:18px}
[hidden]{display:none!important}
.sf-contact__buttons{display:flex;flex-wrap:wrap;gap:12px;justify-content:center}
.sf-trap{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}
.sf-hint{border:1px dashed #b9bdb6;border-radius:var(--sf-radius);padding:24px;text-align:center;color:var(--sf-muted)}
.sf-done{padding:64px 0;text-align:center}
.sf-done h1{font-size:26px;margin-bottom:8px}
.sf-done p{color:var(--sf-muted)}
@media (min-width:720px){
  .sf-section{padding:56px 0}
  .sf-heading{font-size:28px}
  .sf-features,.sf-reviews{grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}
  .sf-gallery{grid-template-columns:repeat(3,1fr);gap:12px}
}
.sf-video-placeholder{display:grid;place-content:center;text-align:center;gap:12px;color:white}.sf-video-placeholder span{font-size:40px}.sf-video-placeholder p{font-size:15px}
.sf-section-frame :is(h1,h2,h3,p,blockquote){overflow-wrap:anywhere}
/* New section families and optional per-section overrides. Legacy pages retain their defaults. */
.sf-section-frame{min-width:0;margin-top:var(--section-mt,0);margin-bottom:var(--section-mb,0);margin-left:var(--section-ml,0);margin-right:var(--section-mr,0);color:var(--sf-ink);font-family:var(--section-font,inherit)}
.sf-styled>.sf-section{padding:var(--section-pt,40px) 0 var(--section-pb,40px);border:var(--section-border-width,0px) var(--section-border-style,solid) var(--section-border,var(--sf-rule));border-radius:var(--section-section-radius,0);box-shadow:var(--section-shadow,none);border-top-width:var(--section-bt,var(--section-border-width,0px));border-bottom-width:var(--section-bb,var(--section-border-width,0px))}
.sf-section-frame[data-sticky]{position:sticky;top:0;z-index:30}.sf-section-frame[data-sticky]>.sf-section{background:var(--section-background,var(--sf-paper))}
.sf-section-frame[data-background]>.sf-section{background:var(--section-background)}
.sf-styled .sf-wrap{max-width:calc(var(--section-width,var(--sf-width,1200px)) + var(--section-pl,var(--section-px,16px)) + var(--section-pr,var(--section-px,16px)));padding-left:var(--section-pl,var(--section-px,16px));padding-right:var(--section-pr,var(--section-px,16px))}
.sf-styled .sf-narrow{max-width:var(--section-width,680px)}
.sf-styled .sf-heading{font-size:var(--section-heading,24px);font-weight:var(--section-weight,700)}
.sf-section-frame[data-align]>.sf-section{text-align:var(--section-align)}
.sf-section-frame[data-align] :is(.sf-heading,.sf-body,.sf-info-grid li){text-align:var(--section-align)}
.sf-section-frame[data-body-size] :is(p,blockquote,dd,td){font-size:var(--section-body)}
:where(.sf-styled) .sf-button{font-size:var(--section-button-size,18px);border-radius:var(--section-button-radius,var(--sf-radius))}
.sf-styled :is(.sf-features,.sf-reviews,.sf-gallery,.sf-info-grid){gap:var(--section-gap,12px)}
.sf-styled :is(.sf-features li,.sf-reviews li,.sf-info-grid li,.sf-order){background:var(--section-card,var(--sf-paper))}
.sf-section-frame :is(.sf-card-image,.sf-gallery img){object-fit:var(--section-image-fit,cover)}
.sf-section-frame[data-image-ratio] :is(.sf-card-image,.sf-gallery img){aspect-ratio:var(--section-image-ratio);width:100%;height:auto}
.sf-header-row{display:flex;flex-wrap:wrap;gap:24px;align-items:center;justify-content:space-between}.sf-brand{display:flex;align-items:center;gap:12px;font-size:22px}.sf-brand img{width:auto;max-width:160px;height:44px;object-fit:contain}
.sf-section-links{display:flex;flex-wrap:wrap;gap:20px;align-items:center}.sf-section-links a{color:inherit;text-underline-offset:4px}.sf-custom-header .sf-button{margin:0}.sf-custom-header{padding:20px 0}.sf-custom-footer{text-align:center}.sf-custom-footer .sf-section-links{justify-content:center;margin-top:24px}
.sf-info-grid{display:grid;grid-template-columns:1fr;list-style:none;padding:0;margin:0;gap:var(--section-gap,20px)}
.sf-info-grid li{min-width:0;border:1px solid var(--sf-rule);border-radius:var(--sf-radius);padding:24px;background:var(--section-card,var(--sf-paper))}.sf-info-grid h3{font-size:20px;margin-bottom:8px}.sf-info-grid p{color:var(--sf-muted)}
.sf-info--trust .sf-info-grid li{padding:16px;border:0;background:transparent}.sf-info--trust h3{font-size:17px}.sf-info--trust p{font-size:14px}.sf-info--trust{border-block:1px solid var(--sf-rule);padding:20px 0}
.sf-step-number{display:block;color:var(--sf-accent);font-size:22px;margin-bottom:20px}.sf-info[data-layout=list] .sf-info-grid{grid-template-columns:1fr}.sf-info[data-layout=list] li{position:relative;padding-inline-start:74px}.sf-info[data-layout=list] .sf-step-number{position:absolute;inset-inline-start:24px;top:24px}
.sf-card-image{width:100%;aspect-ratio:4/3;border-radius:var(--sf-radius);margin-bottom:20px}
.sf-specifications{margin:0}.sf-specifications>div{display:grid;grid-template-columns:1fr 1fr;gap:24px;padding:18px 0;border-bottom:1px solid var(--sf-rule)}.sf-specifications dt{font-weight:600}.sf-specifications dd{margin:0;color:var(--sf-muted);overflow-wrap:anywhere}
.sf-table-scroll{overflow-x:auto;max-width:100%}.sf-comparison{width:100%;border-collapse:collapse;table-layout:fixed}.sf-comparison :is(th,td){padding:18px;text-align:start;border-bottom:1px solid var(--sf-rule);overflow-wrap:anywhere}.sf-comparison thead th{font-weight:700}.sf-comparison :is(th,td):nth-child(2){background:var(--section-card,var(--sf-tint))}
.sf-cta{text-align:center}.sf-cta .sf-wrap{max-width:var(--section-width,800px)}.sf-announcement{padding:14px 0}.sf-announcement .sf-wrap{max-width:calc(var(--section-width,var(--sf-width,1200px)) + 32px);display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:16px}.sf-announcement .sf-body p{margin:0}.sf-announcement .sf-button{margin:0;min-height:36px;font-size:14px}
.sf-order__selection,.sf-order__customer{display:grid;gap:14px;align-content:start;min-width:0}.sf-order[data-choices=cards] .sf-order__selection .sf-choices{grid-template-columns:repeat(2,minmax(0,1fr))}.sf-order[data-choices=cards] .sf-order__selection legend{grid-column:1/-1}.sf-order[data-choices=cards] .sf-order__selection .sf-choice{flex-wrap:wrap;padding:16px}.sf-choice:has(input:checked){border-color:var(--sf-accent);box-shadow:inset 0 0 0 1px var(--sf-accent)}
.sf-button:focus-visible,.sf-section-links a:focus-visible,.sf-faq summary:focus-visible,.sf-table-scroll:focus-visible{outline:3px solid var(--sf-accent);outline-offset:4px}
@media(min-width:720px){
 .sf-info-grid{grid-template-columns:repeat(3,minmax(0,1fr))}
 .sf-styled>.sf-section{padding-top:var(--section-pt,56px);padding-bottom:var(--section-pb,56px)}
 .sf-styled .sf-heading{font-size:var(--section-heading,28px)}
 .sf-styled :is(.sf-features,.sf-reviews,.sf-gallery,.sf-info-grid){grid-template-columns:repeat(var(--section-columns,3),minmax(0,1fr))}
 .sf-styled .sf-info[data-layout=list] .sf-info-grid{grid-template-columns:1fr}
 .sf-order[data-layout=split]{grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:32px}
 .sf-section-frame[data-visibility=mobile]{display:none}
}
@media(max-width:719px){
 .sf-styled>.sf-section{padding-top:var(--section-mobile-pt,var(--section-pt,40px));padding-bottom:var(--section-mobile-pb,var(--section-pb,40px))}
 .sf-styled .sf-heading{font-size:var(--section-mobile-heading,var(--section-heading,24px))}
 .sf-styled :is(.sf-features,.sf-reviews,.sf-info-grid){grid-template-columns:repeat(var(--section-mobile-columns,1),minmax(0,1fr))}
 .sf-styled .sf-gallery{grid-template-columns:repeat(var(--section-mobile-columns,2),minmax(0,1fr))}
 .sf-section-frame[data-visibility=desktop]{display:none}
 .sf-comparison :is(th,td){padding:12px 8px;font-size:14px}.sf-header-row{gap:16px}.sf-header-row .sf-section-links{width:100%;order:3;font-size:14px}
}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}

.sf-styled>.sf-custom-header,.sf-styled>.sf-info--trust{padding-top:var(--section-pt,20px);padding-bottom:var(--section-pb,20px)}
.sf-styled>.sf-announcement{padding-top:var(--section-pt,14px);padding-bottom:var(--section-pb,14px)}
@media(max-width:719px){
 .sf-styled>.sf-custom-header,.sf-styled>.sf-info--trust{padding-top:var(--section-mobile-pt,var(--section-pt,20px));padding-bottom:var(--section-mobile-pb,var(--section-pb,20px))}
 .sf-styled>.sf-announcement{padding-top:var(--section-mobile-pt,var(--section-pt,14px));padding-bottom:var(--section-mobile-pb,var(--section-pb,14px))}
}

@media(max-width:719px){
 .sf-section-frame{margin-top:var(--section-mobile-mt,var(--section-mt,0));margin-right:var(--section-mobile-mr,var(--section-mr,0));margin-bottom:var(--section-mobile-mb,var(--section-mb,0));margin-left:var(--section-mobile-ml,var(--section-ml,0))}
 .sf-styled .sf-wrap{padding-left:var(--section-mobile-pl,var(--section-pl,var(--section-px,16px)));padding-right:var(--section-mobile-pr,var(--section-pr,var(--section-px,16px)))}
}

/* Curated marketing icons are inline SVG, rendered on the server. */
.sf-icon-badge{display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;vertical-align:middle;color:var(--section-icon-color,var(--sf-accent));line-height:1}
.sf-icon-badge>.sf-marketing-icon{width:var(--section-icon-size,28px);height:var(--section-icon-size,28px);stroke-width:var(--section-icon-stroke,2);flex-shrink:0;margin:0;color:inherit}
.sf-icon-badge:not([data-icon-surface=plain]){padding:12px;border-radius:var(--section-icon-radius,12px)}
.sf-icon-badge[data-icon-surface=soft]{background:var(--section-icon-background,color-mix(in srgb,var(--sf-accent) 10%,transparent))}
.sf-icon-badge[data-icon-surface=outline]{border:1px solid currentColor;background:var(--section-icon-background,transparent)}
.sf-icon-badge[data-icon-surface=solid]{background:var(--section-icon-background,var(--sf-accent));color:var(--section-icon-color,var(--sf-accent-ink))}
.sf-features .sf-icon-badge{align-self:flex-start;margin-top:2px}.sf-features .sf-legacy-check{width:var(--section-icon-size,20px);height:var(--section-icon-size,20px);color:var(--section-icon-color,var(--sf-accent))}.sf-legacy-check path{stroke-width:var(--section-icon-stroke,2)}
.sf-info-grid li>.sf-icon-badge{margin-bottom:18px}.sf-info--trust .sf-icon-badge{margin-bottom:10px}
.sf-embed{display:block;width:100%;height:150px;border:0}
.sf-marketing-icon--image{object-fit:contain}
.sf-iconlist{display:flex;flex-direction:column;gap:var(--il-gap);margin:0;padding:0;list-style:none}
.sf-iconlist[data-direction=horizontal]{flex-direction:row;flex-wrap:wrap;align-items:center}
.sf-iconlist[data-align=center]{align-items:center;justify-content:center}.sf-iconlist[data-align=end]{align-items:flex-end;justify-content:flex-end}
.sf-iconlist[data-direction=horizontal][data-align=start]{justify-content:flex-start}
.sf-iconlist li,.sf-iconlist a{display:flex;align-items:center;gap:var(--il-icon-gap);color:inherit;text-decoration:none}
.sf-iconlist a:hover span{text-decoration:underline}
.sf-iconlist .sf-marketing-icon{flex:none;width:var(--il-icon-size);height:var(--il-icon-size);color:var(--il-icon,var(--sf-accent));transition:color .15s}
.sf-iconlist li>span,.sf-iconlist a>span{color:var(--il-text,inherit);transition:color .15s}
.sf-iconlist li:hover>span,.sf-iconlist li:hover a>span{color:var(--il-text-hover,var(--il-text,inherit))}
.sf-iconlist li:hover .sf-marketing-icon{color:var(--il-icon-hover,var(--il-icon,var(--sf-accent)))}
.sf-iconlist[data-divider][data-direction=vertical] li+li{padding-top:var(--il-gap);border-top:var(--il-divider)}
.sf-iconlist[data-divider][data-direction=horizontal] li+li{padding-left:var(--il-gap);border-left:var(--il-divider)}
.sf-info--iconList .sf-info-grid{grid-template-columns:1fr;max-width:var(--section-width,800px);margin-inline:auto}
.sf-info--iconList .sf-info-grid li{display:flex;gap:var(--section-gap,16px);align-items:flex-start;background:transparent;border:0;padding:16px 0;border-bottom:1px solid var(--sf-rule);border-radius:0}
.sf-info--iconList .sf-info-grid li>.sf-icon-badge{margin:0}.sf-info-copy{min-width:0}
.sf-button{gap:10px}.sf-button>.sf-icon-badge>.sf-marketing-icon{width:var(--section-icon-size,20px);height:var(--section-icon-size,20px)}.sf-button>.sf-icon-badge[data-icon-surface=plain]{color:var(--section-icon-color,inherit)}

${layoutBaseCss}
.sf-section-frame{position:relative}
.sf-bg{position:absolute;inset:0;z-index:0;overflow:hidden;border-radius:var(--section-section-radius,0);pointer-events:none}
.sf-bg video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.sf-bg__overlay{position:absolute;inset:0}
.sf-has-bg>.sf-section{position:relative;z-index:1;background:transparent!important}
.sf-section-frame[data-min-height]>.sf-section{display:flex;flex-direction:column;justify-content:center;min-height:var(--section-min-height)}
.sf-section-frame[data-min-height]>.sf-section>.sf-wrap{width:100%}
`
