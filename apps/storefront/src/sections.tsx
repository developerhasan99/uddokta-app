// The section components, rendered to HTML by the storefront and live inside the editor's preview frame.
// They hold no state and use no hooks, so both places draw exactly the same page.
import type { CSSProperties, ReactNode } from 'react'
import { IconBadge, MarketingIcon } from './icons/Icon.tsx'
import { iconCatalog, isIconName, isIconValue } from './icons/catalog.ts'
import { orderBlocks, videoEmbed, type Content, type Section, type SectionStyle } from './schema.ts'
import { LayoutSection, layoutBaseCss, layoutCss } from './layout.tsx'

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
function freeHint(o: ShippingOption, productId: string) {
  if (o.price === 0) return ''
  if (o.freeProducts.includes(productId)) return 'এই পণ্যে ডেলিভারি ফ্রি'
  const ways = [o.freeOver !== null && `${taka(o.freeOver)} বা বেশি অর্ডারে`, o.freeMinQty !== null && `${number.format(o.freeMinQty)}টি বা বেশি নিলে`].filter(Boolean)
  return ways.length ? `${ways.join(' অথবা ')} ডেলিভারি ফ্রি` : ''
}

export type Ctx = {
  image: (id: string | null) => Img | undefined
  product: (id: string | null) => Product | undefined
  // The editor's preview: forms never submit and empty sections show a hint for the seller.
  preview: boolean
  // Set only by the storefront server for a buyer-facing page. Custom HTML runs only when this is true, so no other
  // render (the dashboard, thumbnails, tests, anything added later) can ever run a seller's code.
  live?: boolean
  // Editor only: the icon drawn in a section's or box's corner handle (the same one as in the editor's tree).
  handleIcon?: (id: string) => ReactNode
  // The store's active delivery options, in the seller's order.
  shipping: ShippingOption[]
  checkoutToken?: string
  orderAction?: string
  order?: { sectionId: string; error: string; values: OrderValues }
}

const number = new Intl.NumberFormat('bn-BD')
export const taka = (n: number) => `৳${number.format(n)}`

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

function Hero({ s, ctx, orderId }: { s: Section; ctx: Ctx; orderId?: string }) {
  const image = ctx.image(s.settings.image as string | null)
  return (
    <section className="sf-section sf-hero" data-layout={str(s.settings.layout) || 'split'}>
      <div className="sf-wrap sf-hero__grid">
        <div className="sf-hero__text">
          {str(s.settings.eyebrow) && <p className="sf-eyebrow">{str(s.settings.eyebrow)}</p>}
          {str(s.settings.heading) && <h1>{str(s.settings.heading)}</h1>}
          <Lines text={str(s.settings.text)} className="sf-lead" />
          <SectionButton s={s} orderId={orderId} ctx={ctx} />
        </div>
        {image ? <Picture img={image} eager className="sf-hero__image" /> : <Hint ctx={ctx}>ছবি দিলে এখানে দেখাবে</Hint>}
      </div>
    </section>
  )
}

function TextSection({ s }: { s: Section }) {
  return (
    <section className="sf-section">
      <div className="sf-wrap sf-narrow">
        <Heading text={str(s.settings.heading)} />
        <Lines text={str(s.settings.body)} className="sf-body" />
      </div>
    </section>
  )
}

function ImageSection({ s, ctx }: { s: Section; ctx: Ctx }) {
  const image = ctx.image(s.settings.image as string | null)
  if (!image) return ctx.preview ? <section className="sf-section"><div className="sf-wrap"><Hint ctx={ctx}>একটি ছবি বেছে নিন</Hint></div></section> : null
  return (
    <section className="sf-section">
      <figure className="sf-wrap sf-narrow sf-figure">
        <Picture img={image} />
        {str(s.settings.caption) && <figcaption>{str(s.settings.caption)}</figcaption>}
      </figure>
    </section>
  )
}

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

function Video({ s, ctx }: { s: Section; ctx: Ctx }) {
  const src = videoEmbed(str(s.settings.url))
  if (!src) return ctx.preview ? <section className="sf-section"><div className="sf-wrap sf-narrow"><Heading text={str(s.settings.heading)} /><div className="sf-video sf-video-placeholder"><span aria-hidden="true">▶</span><p>ইউটিউব বা ফেসবুক ভিডিওর লিংক দিন</p></div></div></section> : null
  return (
    <section className="sf-section">
      <div className="sf-wrap sf-narrow">
        <Heading text={str(s.settings.heading)} />
        <div className="sf-video">
          <iframe src={src} title={str(s.settings.heading) || 'ভিডিও'} loading="lazy" allow="encrypted-media; picture-in-picture" allowFullScreen />
        </div>
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

export const orderErrors: Record<string, string> = {
  name: 'আপনার নাম লিখুন।',
  phone: 'সঠিক মোবাইল নম্বর দিন, যেমন 01712345678।',
  address: 'পুরো ঠিকানা লিখুন: বাসা, রাস্তা, এলাকা, জেলা।',
  rate: 'ডেলিভারি কোথায় হবে, বেছে নিন।',
  noDelivery: 'এই দোকানে এখন ডেলিভারি নেওয়া হচ্ছে না। অর্ডার করতে দোকানে যোগাযোগ করুন।',
  variant: 'একটি অপশন বেছে নিন।',
  soldOut: 'দুঃখিত, এটি এখন স্টকে নেই। অন্য অপশন বেছে নিন।',
  coupon: 'এই কুপন কোডটি চলছে না। কোডটি দেখে আবার লিখুন, অথবা ফাঁকা রাখুন।',
  tooMany: 'এই নম্বর থেকে অনেকগুলো অর্ডার এসেছে। একটু পরে চেষ্টা করুন, অথবা দোকানে ফোন করুন।',
  blocked: 'এই নম্বর থেকে অনলাইনে অর্ডার নেওয়া যাচ্ছে না। অর্ডার করতে দোকানে ফোন করুন।',
  checkout: 'এই অর্ডার ফর্মটি আগে ব্যবহার হয়েছে। আবার অর্ডার করতে পেজটি নতুন করে খুলুন।',
  server: 'অর্ডারটি নেওয়া যায়নি। একটু পরে আবার চেষ্টা করুন।',
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
  const field = (name: keyof OrderValues) => ({ name, defaultValue: values[name] ?? '', 'aria-invalid': mine?.error === name ? true : undefined })

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
          {available.length === 0 && <p className="sf-error" role="alert">{orderErrors.soldOut}</p>}

          {product.variants.length > 1 && product.variants.length <= maxChoices && (
            <fieldset className="sf-choices">
              <legend>অপশন</legend>
              {product.variants.map((v) => (
                <label key={v.id} className="sf-choice">
                  <input type="radio" name="variant" value={v.id} defaultChecked={v.id === chosen?.id} disabled={!v.available} data-price={v.price} />
                  <span>{v.label}{!v.available && ' (স্টকে নেই)'}</span>
                  <strong>{taka(v.price)}</strong>
                </label>
              ))}
            </fieldset>
          )}
          {product.variants.length > maxChoices && (
            <label className="sf-field">
              <span>অপশন</span>
              <select name="variant" defaultValue={chosen?.id}>
                {product.variants.map((v) => (
                  <option key={v.id} value={v.id} disabled={!v.available} data-price={v.price}>{v.label} · {taka(v.price)}{!v.available && ' (স্টকে নেই)'}</option>
                ))}
              </select>
            </label>
          )}
          {product.variants.length === 1 && chosen && <input type="hidden" name="variant" value={chosen.id} data-price={chosen.price} />}

          <label className="sf-field">
            <span>পরিমাণ</span>
            <input type="number" min={1} max={20} inputMode="numeric" {...field('quantity')} defaultValue={String(quantity)} />
          </label>
          </div><div className="sf-order__customer"><label className="sf-field">
            <span>আপনার নাম</span>
            <input autoComplete="name" maxLength={100} required {...field('name')} />
          </label>
          <label className="sf-field">
            <span>মোবাইল নম্বর</span>
            <input type="tel" inputMode="tel" autoComplete="tel" maxLength={20} placeholder="01XXXXXXXXX" required {...field('phone')} />
          </label>
          <label className="sf-field">
            <span>পুরো ঠিকানা</span>
            <textarea rows={3} autoComplete="street-address" maxLength={500} required {...field('address')} />
          </label>
          {options.length > 0 && (
            <fieldset className="sf-choices">
              <legend>ডেলিভারি</legend>
              {options.map((o) => {
                const hint = freeHint(o, product.id)
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
                    <strong data-charge>{charge === 0 ? 'ফ্রি' : taka(charge)}</strong>
                  </label>
                )
              })}
            </fieldset>
          )}
          {options.length === 0 && <p className="sf-error" role="alert">{orderErrors.noDelivery}</p>}

          <label className="sf-field">
            <span>কুপন কোড (থাকলে)</span>
            <input autoComplete="off" autoCapitalize="characters" maxLength={30} {...field('coupon')} />
          </label>
          <p className="sf-total">সর্বমোট <strong data-total>{taka(total)}</strong></p>
          <p className="sf-note">অফার বা কুপনের ছাড় অর্ডার নিশ্চিত করার সময় যোগ হবে। পণ্য হাতে পেয়ে টাকা দিন।</p>
          {mine && <p className="sf-error" role="alert">{orderErrors[mine.error] ?? orderErrors.server}</p>}
          <button className="sf-button sf-button--block" type={ctx.preview ? 'button' : 'submit'} disabled={available.length === 0 || options.length === 0}><IconBadge name={str(s.settings.buttonIcon)} surface={s.style?.iconSurface} image={ctx?.image} />{str(s.settings.button) || 'অর্ডার করুন'}</button></div>
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

const countdownUnits = ['দিন', 'ঘণ্টা', 'মিনিট', 'সেকেন্ড']
const twoDigits = new Intl.NumberFormat('bn-BD', { minimumIntegerDigits: 2 })

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
          {parts.map((n, i) => <div key={i}><strong data-unit>{twoDigits.format(n)}</strong><span>{countdownUnits[i]}</span></div>)}
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
          {phone && <a className="sf-button sf-button--outline" href={`tel:${telHref(phone)}`}>কল করুন {phone}</a>}
          {whatsapp && <a className="sf-button sf-button--outline" href={`https://wa.me/${telHref(whatsapp).replace(/^\+?(88)?0/, '880')}`} target="_blank" rel="noopener">হোয়াটসঅ্যাপ</a>}
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
    <nav className="sf-section-links" aria-label="পেজ নেভিগেশন">{items(s.settings.items).filter((i) => i.link && i.title).map((item, i) => <a key={i} href={item.link!}>{item.title}</a>)}</nav>
    <SectionButton s={s} orderId={orderId} ctx={ctx} />
  </div></section>
}

function LandingFooter({ s }: { s: Section }) {
  return <section className="sf-section sf-custom-footer"><div className="sf-wrap">
    <Heading text={str(s.settings.heading)} /><Lines text={str(s.settings.text)} className="sf-body" />
    <nav className="sf-section-links" aria-label="ফুটার লিংক">{items(s.settings.items).filter((i) => i.link && i.title).map((item, i) => <a key={i} href={item.link!}>{item.title}</a>)}</nav>
  </div></section>
}

function ImageText({ s, ctx, orderId }: { s: Section; ctx: Ctx; orderId?: string }) {
  return <section className="sf-section sf-story" data-layout={str(s.settings.layout)}><div className="sf-wrap sf-story__grid">
    <div><Heading text={str(s.settings.heading)} /><Lines text={str(s.settings.text)} className="sf-body" /><SectionButton s={s} orderId={orderId} ctx={ctx} /></div>
    {ctx.image(s.settings.image as string | null) ? <Picture img={ctx.image(s.settings.image as string | null)} className="sf-story__image" /> : <Hint ctx={ctx}>একটি ছবি বেছে নিন</Hint>}
  </div></section>
}

function InfoItems({ s, ctx }: { s: Section; ctx: Ctx }) {
  const rows = items(s.settings.items)
  return <section className={`sf-section sf-info sf-info--${s.type}`} data-layout={str(s.settings.layout)}><div className="sf-wrap">
    <Heading text={str(s.settings.heading)} />
    <ol className="sf-info-grid">{rows.map((item, i) => <li key={i}>
      {item.icon && <IconBadge name={item.icon} surface={s.style?.iconSurface} image={ctx.image} />}
      {s.type === 'steps' && !item.icon && <span className="sf-step-number">{number.format(i + 1).padStart(2, '০')}</span>}
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

function StandaloneIcon({ s, ctx }: { s: Section; ctx: Ctx }) {
  const name = str(s.settings.icon)
  if (!isIconValue(name)) return ctx.preview ? <section className="sf-section"><div className="sf-wrap"><Hint ctx={ctx}>একটি আইকন বেছে নিন</Hint></div></section> : null
  const label = str(s.settings.label)
  const href = str(s.settings.link)
  return <section className="sf-section sf-standalone-icon"><div className="sf-wrap">
    {href ? <a className="sf-icon-link" href={href} aria-label={label || (isIconName(name) ? iconCatalog[name].label[0] : 'আইকন')}><IconBadge name={name} surface={s.style?.iconSurface} image={ctx.image} /></a> : <IconBadge name={name} surface={s.style?.iconSurface} label={label} image={ctx.image} />}
  </div></section>
}

function Specifications({ s }: { s: Section }) {
  return <section className="sf-section"><div className="sf-wrap sf-narrow"><Heading text={str(s.settings.heading)} />
    <dl className="sf-specifications">{items(s.settings.items).map((item, i) => <div key={i}><dt>{item.title}</dt><dd>{item.text}</dd></div>)}</dl>
  </div></section>
}

function Comparison({ s }: { s: Section }) {
  return <section className="sf-section"><div className="sf-wrap"><Heading text={str(s.settings.heading)} />
    <div className="sf-table-scroll" role="region" aria-label={str(s.settings.heading) || 'পণ্যের তুলনা'} tabIndex={0}><table className="sf-comparison"><thead><tr><th scope="col">বৈশিষ্ট্য</th><th scope="col">{str(s.settings.left)}</th><th scope="col">{str(s.settings.right)}</th></tr></thead>
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
  const lengths: Record<string, string> = { iconSize: 'icon-size', iconRadius: 'icon-radius', maxWidth: 'width', headingSize: 'heading', mobileHeadingSize: 'mobile-heading', bodySize: 'body', buttonSize: 'button-size', paddingTop: 'pt', paddingBottom: 'pb', paddingX: 'px', paddingLeft: 'pl', paddingRight: 'pr', marginLeft: 'ml', marginRight: 'mr', mobilePaddingLeft: 'mobile-pl', mobilePaddingRight: 'mobile-pr', mobileMarginTop: 'mobile-mt', mobileMarginRight: 'mobile-mr', mobileMarginBottom: 'mobile-mb', mobileMarginLeft: 'mobile-ml', mobilePaddingTop: 'mobile-pt', mobilePaddingBottom: 'mobile-pb', marginTop: 'mt', marginBottom: 'mb', gap: 'gap', borderWidth: 'border-width', radius: 'radius', sectionRadius: 'section-radius', buttonRadius: 'button-radius' }
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
  return <div id={s.type === 'order' ? undefined : s.id} data-section={s.id} className={`${s.style ? 'sf-section-frame sf-styled' : 'sf-section-frame'}${layer ? ' sf-has-bg' : ''}`} style={sectionStyle(s.style)} data-visibility={s.style?.visibility} data-align={s.style?.align} data-body-size={s.style?.bodySize} data-image-ratio={s.style?.imageRatio} data-background={s.style?.bgType && s.style.bgType !== 'color' ? undefined : s.style?.background} data-min-height={s.style?.minHeight}>
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

export function SectionView({ s, ctx, orderId }: { s: Section; ctx: Ctx; orderId?: string }) {
  switch (s.type) {
    case 'layout': return <LayoutSection s={s} ctx={ctx} orderId={orderId} />
    case 'icon': return <StandaloneIcon s={s} ctx={ctx} />
    case 'html': return str(s.settings.html) ? <EmbedFrame html={str(s.settings.html)} ctx={ctx} /> : ctx.preview ? <div className="sf-n-placeholder">HTML লিখুন</div> : null
    case 'iconCards': return <InfoItems s={s} ctx={ctx} />
    case 'iconList': return <IconList s={s} ctx={ctx} />
    case 'header': return <LandingHeader s={s} ctx={ctx} orderId={orderId} />
    case 'footer': return <LandingFooter s={s} />
    case 'announcement':
    case 'cta': return <CallToAction s={s} orderId={orderId} ctx={ctx} />
    case 'imageText': return <ImageText s={s} ctx={ctx} orderId={orderId} />
    case 'trust':
    case 'steps':
    case 'cards': return <InfoItems s={s} ctx={ctx} />
    case 'specifications': return <Specifications s={s} />
    case 'comparison': return <Comparison s={s} />
    case 'hero': return <Hero s={s} ctx={ctx} orderId={orderId} />
    case 'text': return <TextSection s={s} />
    case 'image': return <ImageSection s={s} ctx={ctx} />
    case 'features': return <Features s={s} ctx={ctx} />
    case 'video': return <Video s={s} ctx={ctx} />
    case 'reviews': return <Reviews s={s} ctx={ctx} />
    case 'faq': return <Faq s={s} />
    case 'order': return <OrderForm s={s} ctx={ctx} />
    case 'contact': return <Contact s={s} ctx={ctx} />
    case 'gallery': return <Gallery s={s} ctx={ctx} />
    case 'countdown': return <Countdown s={s} ctx={ctx} />
  }
}

export function PageView({ content, ctx, storeName }: { content: Content; ctx: Ctx; storeName: string }) {
  const orderId = firstOrderId(content)
  const fonts = new Set(content.sections.filter((s) => !s.hidden).map((s) => s.style?.font).filter(Boolean))
  const nodes = layoutCss(content, ctx)
  return (
    <div className="sf-page">
      {fonts.has('serif') && <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Tiro+Bangla&display=swap" />}
      {fonts.has('sans') && <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+Bengali:wght@400;600;700&display=swap" />}
      {nodes && <style dangerouslySetInnerHTML={{ __html: nodes }} />}
      {content.canvas?.header !== false && <header className="sf-bar"><div className="sf-wrap">{storeName}</div></header>}
      <main>
        {content.sections.filter((s) => !s.hidden).map((s) => <SectionFrame key={s.id} s={s} ctx={ctx}><SectionView s={s} ctx={ctx} orderId={orderId} /></SectionFrame>)}
      </main>
      {content.canvas?.footer !== false && <footer className="sf-foot"><div className="sf-wrap">© {storeName}</div></footer>}
      {content.css && <style dangerouslySetInnerHTML={{ __html: content.css }} />}
    </div>
  )
}

// The only script on a page: keeps order totals and countdowns current, and once the phone number is valid,
// saves what the buyer typed so the store can call if they do not finish. Forms work without it.
export const pageScript = `document.querySelectorAll('[data-countdown]').forEach(function(el){var end=Date.parse(el.dataset.countdown);var n=new Intl.NumberFormat('bn-BD',{minimumIntegerDigits:2});var h;function t(){var s=Math.max(0,Math.floor((end-Date.now())/1000));var v=[Math.floor(s/86400),Math.floor(s%86400/3600),Math.floor(s%3600/60),s%60];el.querySelectorAll('[data-unit]').forEach(function(u,i){u.textContent=n.format(v[i])});if(s===0){el.hidden=true;el.nextElementSibling.hidden=false;clearInterval(h)}}h=setInterval(t,1000);t()});`+`document.querySelectorAll('form[data-order]').forEach(function(f){var n=new Intl.NumberFormat('bn-BD');function u(){var s=f.querySelector('select[name=variant]');var v=s?s.selectedOptions[0]:f.querySelector('input[name=variant]:checked')||f.querySelector('input[type=hidden][name=variant]');var q=Math.min(Math.max(parseInt(f.elements.quantity.value,10)||1,1),20);var sub=(v?Number(v.dataset.price):0)*q;var d=0;f.querySelectorAll('input[name=rate]').forEach(function(r){var o=r.dataset;var c=('freeProduct' in o)||(o.freeOver&&sub>=Number(o.freeOver))||(o.freeQty&&q>=Number(o.freeQty))?0:Number(o.price);r.closest('label').querySelector('[data-charge]').textContent=c?'৳'+n.format(c):'ফ্রি';if(r.checked)d=c});f.querySelector('[data-total]').textContent='৳'+n.format(sub+d)}f.addEventListener('input',u);f.addEventListener('change',u);var tm;f.addEventListener('input',function(){clearTimeout(tm);tm=setTimeout(function(){var p=f.elements.phone.value.replace(/[০-৯]/g,function(c){return '০১২৩৪৫৬৭৮৯'.indexOf(c)}).replace(/[\\s-]/g,'');if(!/^(\\+?88)?01[3-9]\\d{8}$/.test(p))return;fetch('/drafts',{method:'POST',keepalive:true,body:new URLSearchParams({phone:p,name:f.elements.name.value,address:f.elements.address.value,product:f.dataset.product||''})}).catch(function(){})},800)})})`


export const css = `
:root{--sf-ink:#1d1d1f;--sf-muted:#5f6368;--sf-paper:#fff;--sf-tint:#f5f6f4;--sf-rule:#e3e5e1;--sf-accent:#1f7a4d;--sf-accent-ink:#fff;--sf-error:#b3261e;--sf-radius:10px}
*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--sf-paper);color:var(--sf-ink);font:16px/1.6 "Hind Siliguri","Noto Sans Bengali",system-ui,sans-serif}
img{max-width:100%;height:auto;display:block}
h1,h2,h3,p{margin:0}
.sf-wrap{max-width:1080px;margin:0 auto;padding:0 16px}
.sf-narrow{max-width:680px}
.sf-bar{border-bottom:1px solid var(--sf-rule);padding:12px 0;font-weight:700;font-size:18px}
.sf-foot{border-top:1px solid var(--sf-rule);padding:24px 0;color:var(--sf-muted);font-size:14px;text-align:center}
.sf-section{padding:40px 0}
.sf-section--tint{background:var(--sf-tint)}
.sf-heading{font-size:24px;line-height:1.3;margin-bottom:20px;text-align:center}
.sf-hero__grid{display:grid;gap:24px;align-items:center}
.sf-hero h1{font-size:30px;line-height:1.25;margin-bottom:12px}
.sf-lead p{color:var(--sf-muted);font-size:18px;margin-bottom:8px}
.sf-hero__image{border-radius:var(--sf-radius);width:100%}
.sf-body p{margin-bottom:12px}
.sf-button{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:0 24px;margin-top:16px;border:0;border-radius:var(--sf-radius);background:var(--sf-accent);color:var(--sf-accent-ink);font:inherit;font-weight:700;font-size:18px;text-decoration:none;cursor:pointer}
.sf-button:disabled{opacity:.5;cursor:not-allowed}
.sf-button--block{width:100%}
.sf-button--outline{background:transparent;color:var(--sf-accent);box-shadow:inset 0 0 0 2px var(--sf-accent)}
.sf-figure img{border-radius:var(--sf-radius);margin:0 auto}
.sf-figure figcaption{color:var(--sf-muted);text-align:center;margin-top:8px;font-size:14px}
.sf-figure{margin:0 auto}
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
  .sf-hero__grid{grid-template-columns:1fr 1fr;gap:40px}
  .sf-hero h1{font-size:40px}
  .sf-section{padding:56px 0}
  .sf-heading{font-size:28px}
  .sf-features,.sf-reviews{grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}
  .sf-gallery{grid-template-columns:repeat(3,1fr);gap:12px}
}
.sf-video-placeholder{display:grid;place-content:center;text-align:center;gap:12px;color:white}.sf-video-placeholder span{font-size:40px}.sf-video-placeholder p{font-size:15px}
.sf-section-frame :is(h1,h2,h3,p,blockquote){overflow-wrap:anywhere}.sf-hero__grid>*,.sf-story__grid>*{min-width:0}
/* New section families and optional per-section overrides. Legacy pages retain their defaults. */
.sf-section-frame{min-width:0;margin-top:var(--section-mt,0);margin-bottom:var(--section-mb,0);margin-left:var(--section-ml,0);margin-right:var(--section-mr,0);color:var(--sf-ink);font-family:var(--section-font,inherit)}
.sf-styled>.sf-section{padding:var(--section-pt,40px) 0 var(--section-pb,40px);border:var(--section-border-width,0px) var(--section-border-style,solid) var(--section-border,var(--sf-rule));border-radius:var(--section-section-radius,0);box-shadow:var(--section-shadow,none)}
.sf-section-frame[data-background]>.sf-section{background:var(--section-background)}
.sf-styled .sf-wrap{max-width:var(--section-width,1080px);padding-left:var(--section-pl,var(--section-px,16px));padding-right:var(--section-pr,var(--section-px,16px))}
.sf-styled .sf-narrow{max-width:var(--section-width,680px)}
.sf-styled .sf-heading{font-size:var(--section-heading,24px);font-weight:var(--section-weight,700)}
.sf-styled .sf-hero h1{font-size:var(--section-heading,30px);font-weight:var(--section-weight,700)}
.sf-section-frame[data-align]>.sf-section{text-align:var(--section-align)}
.sf-section-frame[data-align] :is(.sf-heading,.sf-hero__text,.sf-body,.sf-info-grid li){text-align:var(--section-align)}
.sf-section-frame[data-body-size] :is(p,blockquote,dd,td){font-size:var(--section-body)}
:where(.sf-styled) .sf-button{font-size:var(--section-button-size,18px);border-radius:var(--section-button-radius,var(--sf-radius))}
.sf-styled :is(.sf-features,.sf-reviews,.sf-gallery,.sf-info-grid){gap:var(--section-gap,12px)}
.sf-styled :is(.sf-features li,.sf-reviews li,.sf-info-grid li,.sf-order){background:var(--section-card,var(--sf-paper))}
.sf-section-frame :is(.sf-hero__image,.sf-story__image,.sf-card-image,.sf-figure img,.sf-gallery img){object-fit:var(--section-image-fit,cover)}
.sf-section-frame[data-image-ratio] :is(.sf-hero__image,.sf-story__image,.sf-card-image,.sf-figure img,.sf-gallery img){aspect-ratio:var(--section-image-ratio);width:100%;height:auto}
.sf-eyebrow{color:var(--sf-accent);font-size:13px;letter-spacing:1px;margin-bottom:16px}
.sf-hero[data-layout=center] .sf-hero__grid,.sf-story[data-layout=center] .sf-story__grid{grid-template-columns:1fr;text-align:center;max-width:var(--section-width,800px)}
.sf-story__grid{display:grid;gap:var(--section-gap,32px);align-items:center}.sf-story__image{width:100%;border-radius:var(--sf-radius)}
.sf-story .sf-heading{text-align:inherit}.sf-story .sf-body{line-height:1.8}
.sf-header-row{display:flex;flex-wrap:wrap;gap:24px;align-items:center;justify-content:space-between}.sf-brand{display:flex;align-items:center;gap:12px;font-size:22px}.sf-brand img{width:auto;max-width:160px;height:44px;object-fit:contain}
.sf-section-links{display:flex;flex-wrap:wrap;gap:20px;align-items:center}.sf-section-links a{color:inherit;text-underline-offset:4px}.sf-custom-header .sf-button{margin:0}.sf-custom-header{padding:20px 0}.sf-custom-footer{text-align:center}.sf-custom-footer .sf-section-links{justify-content:center;margin-top:24px}
.sf-info-grid{display:grid;grid-template-columns:1fr;list-style:none;padding:0;margin:0;gap:var(--section-gap,20px)}
.sf-info-grid li{min-width:0;border:1px solid var(--sf-rule);border-radius:var(--sf-radius);padding:24px;background:var(--section-card,var(--sf-paper))}.sf-info-grid h3{font-size:20px;margin-bottom:8px}.sf-info-grid p{color:var(--sf-muted)}
.sf-info--trust .sf-info-grid li{padding:16px;border:0;background:transparent}.sf-info--trust h3{font-size:17px}.sf-info--trust p{font-size:14px}.sf-info--trust{border-block:1px solid var(--sf-rule);padding:20px 0}
.sf-step-number{display:block;color:var(--sf-accent);font-size:22px;margin-bottom:20px}.sf-info[data-layout=list] .sf-info-grid{grid-template-columns:1fr}.sf-info[data-layout=list] li{position:relative;padding-inline-start:74px}.sf-info[data-layout=list] .sf-step-number{position:absolute;inset-inline-start:24px;top:24px}
.sf-card-image{width:100%;aspect-ratio:4/3;border-radius:var(--sf-radius);margin-bottom:20px}
.sf-specifications{margin:0}.sf-specifications>div{display:grid;grid-template-columns:1fr 1fr;gap:24px;padding:18px 0;border-bottom:1px solid var(--sf-rule)}.sf-specifications dt{font-weight:600}.sf-specifications dd{margin:0;color:var(--sf-muted);overflow-wrap:anywhere}
.sf-table-scroll{overflow-x:auto;max-width:100%}.sf-comparison{width:100%;border-collapse:collapse;table-layout:fixed}.sf-comparison :is(th,td){padding:18px;text-align:start;border-bottom:1px solid var(--sf-rule);overflow-wrap:anywhere}.sf-comparison thead th{font-weight:700}.sf-comparison :is(th,td):nth-child(2){background:var(--section-card,var(--sf-tint))}
.sf-cta{text-align:center}.sf-cta .sf-wrap{max-width:var(--section-width,800px)}.sf-announcement{padding:14px 0}.sf-announcement .sf-wrap{max-width:var(--section-width,1080px);display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:16px}.sf-announcement .sf-body p{margin:0}.sf-announcement .sf-button{margin:0;min-height:36px;font-size:14px}
.sf-order__selection,.sf-order__customer{display:grid;gap:14px;align-content:start;min-width:0}.sf-order[data-choices=cards] .sf-order__selection .sf-choices{grid-template-columns:repeat(2,minmax(0,1fr))}.sf-order[data-choices=cards] .sf-order__selection legend{grid-column:1/-1}.sf-order[data-choices=cards] .sf-order__selection .sf-choice{flex-wrap:wrap;padding:16px}.sf-choice:has(input:checked){border-color:var(--sf-accent);box-shadow:inset 0 0 0 1px var(--sf-accent)}
.sf-button:focus-visible,.sf-section-links a:focus-visible,.sf-faq summary:focus-visible,.sf-table-scroll:focus-visible{outline:3px solid var(--sf-accent);outline-offset:4px}
@media(min-width:720px){
 .sf-info-grid{grid-template-columns:repeat(3,minmax(0,1fr))}
 .sf-story__grid{grid-template-columns:1fr 1fr}.sf-hero[data-layout=reverse] .sf-hero__text,.sf-story[data-layout=reverse] .sf-story__grid>div:first-child{order:2}
 .sf-styled>.sf-section{padding-top:var(--section-pt,56px);padding-bottom:var(--section-pb,56px)}
 .sf-styled .sf-heading{font-size:var(--section-heading,28px)}.sf-styled .sf-hero h1{font-size:var(--section-heading,40px)}
 .sf-styled :is(.sf-features,.sf-reviews,.sf-gallery,.sf-info-grid){grid-template-columns:repeat(var(--section-columns,3),minmax(0,1fr))}
 .sf-styled .sf-info[data-layout=list] .sf-info-grid{grid-template-columns:1fr}
 .sf-order[data-layout=split]{grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:32px}
 .sf-section-frame[data-visibility=mobile]{display:none}
}
@media(max-width:719px){
 .sf-styled>.sf-section{padding-top:var(--section-mobile-pt,var(--section-pt,40px));padding-bottom:var(--section-mobile-pb,var(--section-pb,40px))}
 .sf-styled .sf-heading{font-size:var(--section-mobile-heading,var(--section-heading,24px))}
 .sf-styled .sf-hero h1{font-size:var(--section-mobile-heading,var(--section-heading,30px))}
 .sf-styled :is(.sf-features,.sf-reviews,.sf-info-grid){grid-template-columns:repeat(var(--section-mobile-columns,1),minmax(0,1fr))}
 .sf-styled .sf-gallery{grid-template-columns:repeat(var(--section-mobile-columns,2),minmax(0,1fr))}
 .sf-section-frame[data-visibility=desktop]{display:none}
 .sf-comparison :is(th,td){padding:12px 8px;font-size:14px}.sf-header-row{gap:16px}.sf-header-row .sf-section-links{width:100%;order:3;font-size:14px}
}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}

.sf-styled .sf-hero__grid{gap:var(--section-gap,24px)}
.sf-styled>.sf-custom-header,.sf-styled>.sf-info--trust{padding-top:var(--section-pt,20px);padding-bottom:var(--section-pb,20px)}
.sf-styled>.sf-announcement{padding-top:var(--section-pt,14px);padding-bottom:var(--section-pb,14px)}
@media(min-width:720px){.sf-styled .sf-hero__grid{gap:var(--section-gap,40px)}}
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
.sf-standalone-icon{text-align:center}.sf-icon-link{display:inline-flex;color:inherit}.sf-icon-link:focus-visible{outline:2px solid var(--sf-accent);outline-offset:6px}
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
