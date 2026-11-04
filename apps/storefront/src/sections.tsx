// The section components, rendered to HTML by the storefront and live inside the editor's preview frame.
// They hold no state and use no hooks, so both places draw exactly the same page.
import type { ReactNode } from 'react'
import { videoEmbed, type Content, type Section } from './schema.ts'

export type Img = { url: string; alt: string; width: number; height: number }
export type Variant = { id: string; label: string; price: number; comparePrice: number | null; available: boolean }
export type Product = { id: string; name: string; image: Img | null; variants: Variant[] }
export type OrderValues = Partial<Record<'variant' | 'quantity' | 'name' | 'phone' | 'address' | 'area', string>>

export type Ctx = {
  image: (id: string | null) => Img | undefined
  product: (id: string | null) => Product | undefined
  // The editor's preview: forms never submit and empty sections show a hint for the seller.
  preview: boolean
  // The store's delivery charges, from Settings. The database adds them again itself when the order is placed.
  delivery: { inside: number; outside: number }
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

const firstOrderId = (content: Content) => content.sections.find((s) => s.type === 'order' && !s.hidden)?.id

function Hero({ s, ctx, orderId }: { s: Section; ctx: Ctx; orderId?: string }) {
  const image = ctx.image(s.settings.image as string | null)
  return (
    <section className="sf-section sf-hero">
      <div className="sf-wrap sf-hero__grid">
        <div className="sf-hero__text">
          {str(s.settings.heading) && <h1>{str(s.settings.heading)}</h1>}
          <Lines text={str(s.settings.text)} className="sf-lead" />
          {str(s.settings.button) && orderId && <a className="sf-button" href={`#${orderId}`}>{str(s.settings.button)}</a>}
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

function Features({ s }: { s: Section }) {
  return (
    <section className="sf-section sf-section--tint">
      <div className="sf-wrap">
        <Heading text={str(s.settings.heading)} />
        <ul className="sf-features">
          {items(s.settings.items).map((item, i) => (
            <li key={i}>
              <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><path d="M4 10.5l4 4 8-9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
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
  if (!src) return ctx.preview ? <section className="sf-section"><div className="sf-wrap"><Hint ctx={ctx}>ইউটিউব বা ফেসবুক ভিডিওর লিংক দিন</Hint></div></section> : null
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
  area: 'ঢাকার ভেতরে না বাইরে, বেছে নিন।',
  variant: 'একটি অপশন বেছে নিন।',
  soldOut: 'দুঃখিত, এটি এখন স্টকে নেই। অন্য অপশন বেছে নিন।',
  tooMany: 'এই নম্বর থেকে অনেকগুলো অর্ডার এসেছে। একটু পরে চেষ্টা করুন, অথবা দোকানে ফোন করুন।',
  server: 'অর্ডারটি নেওয়া যায়নি। একটু পরে আবার চেষ্টা করুন।',
}

// Up to this many options show as buttons; more become a dropdown so the form stays short on a phone.
const maxChoices = 4

function OrderForm({ s, ctx }: { s: Section; ctx: Ctx }) {
  const product = ctx.product(s.settings.product as string | null)
  const { inside, outside } = ctx.delivery
  if (!product) {
    return ctx.preview
      ? <section className="sf-section" id={s.id}><div className="sf-wrap sf-narrow"><Hint ctx={ctx}>অর্ডার নিতে একটি পণ্য বেছে নিন</Hint></div></section>
      : null
  }
  const mine = ctx.order?.sectionId === s.id ? ctx.order : undefined
  const values = mine?.values ?? {}
  const available = product.variants.filter((v) => v.available)
  const chosen = product.variants.find((v) => v.id === values.variant && v.available) ?? available[0]
  const area = values.area ?? 'inside'
  const quantity = Math.min(Math.max(Number(values.quantity) || 1, 1), 20)
  const total = chosen ? chosen.price * quantity + (area === 'outside' ? outside : inside) : 0
  const field = (name: keyof OrderValues) => ({ name, defaultValue: values[name] ?? '', 'aria-invalid': mine?.error === name ? true : undefined })

  return (
    <section className="sf-section sf-section--tint" id={s.id}>
      <div className="sf-wrap sf-narrow">
        <Heading text={str(s.settings.heading)} />
        <form className="sf-order" method="post" action={ctx.preview ? undefined : ctx.orderAction} data-order data-inside={inside} data-outside={outside}>
          <input type="hidden" name="section" value={s.id} />
          {/* Left empty by people, who never see it; form-filling bots tend to fill every field. */}
          <label className="sf-trap" aria-hidden="true">Website<input name="website" tabIndex={-1} autoComplete="off" /></label>
          <div className="sf-order__product">
            <Picture img={product.image ?? undefined} />
            <p>{product.name}</p>
          </div>
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
          <label className="sf-field">
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
          <fieldset className="sf-choices">
            <legend>ডেলিভারি এলাকা</legend>
            <label className="sf-choice">
              <input type="radio" name="area" value="inside" defaultChecked={area !== 'outside'} />
              <span>ঢাকার ভেতরে</span>
              <strong>{taka(inside)}</strong>
            </label>
            <label className="sf-choice">
              <input type="radio" name="area" value="outside" defaultChecked={area === 'outside'} />
              <span>ঢাকার বাইরে</span>
              <strong>{taka(outside)}</strong>
            </label>
          </fieldset>

          <p className="sf-total">সর্বমোট <strong data-total>{taka(total)}</strong></p>
          <p className="sf-note">পণ্য হাতে পেয়ে টাকা দিন।</p>
          {mine && <p className="sf-error" role="alert">{orderErrors[mine.error] ?? orderErrors.server}</p>}
          <button className="sf-button sf-button--block" type={ctx.preview ? 'button' : 'submit'} disabled={available.length === 0}>{str(s.settings.button) || 'অর্ডার করুন'}</button>
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

export function SectionView({ s, ctx, orderId }: { s: Section; ctx: Ctx; orderId?: string }) {
  switch (s.type) {
    case 'hero': return <Hero s={s} ctx={ctx} orderId={orderId} />
    case 'text': return <TextSection s={s} />
    case 'image': return <ImageSection s={s} ctx={ctx} />
    case 'features': return <Features s={s} />
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
  return (
    <div className="sf-page">
      <header className="sf-bar"><div className="sf-wrap">{storeName}</div></header>
      <main>
        {content.sections.filter((s) => !s.hidden).map((s) => <div key={s.id} data-section={s.id}><SectionView s={s} ctx={ctx} orderId={orderId} /></div>)}
      </main>
      <footer className="sf-foot"><div className="sf-wrap">© {storeName}</div></footer>
    </div>
  )
}

// The only script on a page: keeps order totals and countdowns current. Forms work without it.
export const pageScript = `document.querySelectorAll('[data-countdown]').forEach(function(el){var end=Date.parse(el.dataset.countdown);var n=new Intl.NumberFormat('bn-BD',{minimumIntegerDigits:2});var h;function t(){var s=Math.max(0,Math.floor((end-Date.now())/1000));var v=[Math.floor(s/86400),Math.floor(s%86400/3600),Math.floor(s%3600/60),s%60];el.querySelectorAll('[data-unit]').forEach(function(u,i){u.textContent=n.format(v[i])});if(s===0){el.hidden=true;el.nextElementSibling.hidden=false;clearInterval(h)}}h=setInterval(t,1000);t()});`+`document.querySelectorAll('form[data-order]').forEach(function(f){var n=new Intl.NumberFormat('bn-BD');function u(){var s=f.querySelector('select[name=variant]');var v=s?s.selectedOptions[0]:f.querySelector('input[name=variant]:checked')||f.querySelector('input[type=hidden][name=variant]');var a=f.querySelector('input[name=area]:checked');var q=Math.min(Math.max(parseInt(f.elements.quantity.value,10)||1,1),20);var t=(v?Number(v.dataset.price):0)*q+Number(a&&a.value==='outside'?f.dataset.outside:f.dataset.inside);f.querySelector('[data-total]').textContent='৳'+n.format(t)}f.addEventListener('input',u);f.addEventListener('change',u)})`

export const fontsHref = 'https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@400;600;700&display=swap'

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
.sf-field input,.sf-field textarea,.sf-field select{font:inherit;font-weight:400;min-height:48px;padding:10px 12px;border:1px solid #c9ccc7;border-radius:8px;background:#fff;color:inherit;width:100%}
.sf-field input:focus,.sf-field textarea:focus,.sf-field select:focus,.sf-choice:focus-within{outline:2px solid var(--sf-accent);outline-offset:1px}
.sf-field [aria-invalid]{border-color:var(--sf-error)}
.sf-choices{border:0;margin:0;padding:0;display:grid;gap:8px}
.sf-choices legend{font-weight:600;font-size:15px;margin-bottom:4px;padding:0}
.sf-choice{display:flex;align-items:center;gap:10px;min-height:48px;padding:0 12px;border:1px solid #c9ccc7;border-radius:8px;cursor:pointer}
.sf-choice span{flex:1}
.sf-choice input{accent-color:var(--sf-accent);width:18px;height:18px;margin:0}
.sf-total{display:flex;justify-content:space-between;font-size:18px;border-top:1px solid var(--sf-rule);padding-top:12px}
.sf-note{color:var(--sf-muted);font-size:14px}
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
`
