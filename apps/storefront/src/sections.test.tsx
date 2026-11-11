import assert from 'node:assert/strict'
import { test } from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { blankContent, newSection, sectionTypes, type Content } from './schema.ts'
import { PageView, type Ctx } from './sections.tsx'

const ctx: Ctx = { preview: true, shipping: [{ id: '00000000-0000-4000-8000-000000000003', name: 'ঢাকার ভেতরে', note: '', price: 60, freeOver: null, freeMinQty: null, freeProducts: [] }, { id: '00000000-0000-4000-8000-000000000004', name: 'ঢাকার বাইরে', note: '', price: 120, freeOver: null, freeMinQty: null, freeProducts: [] }], image: () => undefined, product: () => undefined }
const render = (content: Content) => renderToStaticMarkup(<PageView content={content} ctx={ctx} storeName="Legacy store" />)

test('legacy pages retain store chrome; blank pages omit it and accept custom header/footer sections', () => {
  assert.match(render({ version: 2, sections: [] }), /sf-bar/)
  assert.match(render({ version: 2, sections: [] }), /sf-foot/)
  const blank = render(blankContent())
  assert.doesNotMatch(blank, /sf-bar|sf-foot/)
  const custom = render({ ...blankContent(), sections: [newSection('header', 'top'), newSection('footer', 'bottom')] })
  assert.match(custom, /sf-custom-header/)
  assert.match(custom, /sf-custom-footer/)
  assert.doesNotMatch(custom, /class="sf-bar"|class="sf-foot"/)
})

test('section order, hiding, escaped text, mobile styling and custom call-to-action links render together', () => {
  const story = newSection('imageText', 'story')
  story.settings.heading = '<script>alert(1)</script>'
  story.style = { background: '#112233', mobileHeadingSize: 28, paddingTop: 0, paddingLeft: 16, mobilePaddingLeft: 8, marginRight: 12, mobileMarginRight: 4, radius: 0, visibility: 'mobile' }
  const cta = newSection('cta', 'action')
  cta.settings.link = '#story'
  const hidden = { ...newSection('trust', 'hidden'), hidden: true }
  const html = render({ ...blankContent(), sections: [story, hidden, cta] })
  assert.match(html, /--section-background:#112233/)
  assert.match(html, /--section-mobile-heading:28px/)
  assert.match(html, /--section-pt:0px/)
  assert.match(html, /--section-pl:16px/)
  assert.match(html, /--section-mobile-pl:8px/)
  assert.match(html, /--section-mr:12px/)
  assert.match(html, /--section-mobile-mr:4px/)
  assert.match(html, /data-visibility="mobile"/)
  assert.match(html, /&lt;script&gt;/)
  assert.doesNotMatch(html, /<script>|data-section="hidden"/)
  assert.ok(html.indexOf('data-section="story"') < html.indexOf('data-section="action"'))
  assert.match(html, /href="#story"/)
  assert.match(html, /id="story" data-section="story"/)
})

test('all section families render through the public shared renderer without requiring configured media', () => {
  for (const type of sectionTypes) assert.doesNotThrow(() => render({ ...blankContent(), sections: [newSection(type, `section-${type}`)] }))
})

test('split checkout retains a single real form with product variants, price data and server action', () => {
  const order = newSection('order', 'checkout')
  order.settings.product = 'product'
  order.settings.layout = 'split'
  order.settings.choices = 'cards'
  const live: Ctx = { ...ctx, preview: false, orderAction: '/my-page', checkoutToken: 'token', product: () => ({ id: 'product', name: 'Product', image: null, variants: [{ id: 'small', label: 'Small', price: 450, comparePrice: null, available: true }, { id: 'large', label: 'Large', price: 850, comparePrice: null, available: false }] }) }
  const html = renderToStaticMarkup(<PageView content={{ ...blankContent(), sections: [order] }} ctx={live} storeName="Store" />)
  assert.equal((html.match(/<form /g) ?? []).length, 1)
  assert.match(html, /<form[^>]*method="post"/)
  assert.match(html, /<form[^>]*action="\/my-page"/)
  assert.match(html, /data-layout="split" data-choices="cards"/)
  assert.match(html, /name="checkout" value="token"/)
  assert.match(html, /data-price="450"/)
  assert.match(html, /<input[^>]*disabled=""[^>]*value="large"/)
  assert.match(html, /type="submit"/)
})

test('layout sections render their tree, escape text and generate row/stack CSS with phone overrides', () => {
  const layout = newSection('layout', 'custom')
  layout.children = [{ id: 'row', kind: 'box', props: {}, style: { direction: 'row', gap: 20, background: '#fafafa' }, children: [
    { id: 'left', kind: 'heading', props: { text: '<b>বড় অফার</b>', level: 'h1' }, style: { width: 60, fontSize: 48 }, mobile: { fontSize: 28 } },
    { id: 'right', kind: 'button', props: { text: 'অর্ডার', link: '', icon: '', variant: 'outline' }, hide: 'desktop' },
  ] }]
  const order = newSection('order', 'buy')
  const html = renderToStaticMarkup(<PageView content={{ ...blankContent(), sections: [layout, order] }} ctx={{ ...ctx, preview: false }} storeName="S" />)
  assert.match(html, /<h1 class="sf-n sf-n-heading n-left"[^>]*>&lt;b&gt;বড় অফার&lt;\/b&gt;<\/h1>/)
  assert.match(html, /href="#buy"/, 'a blank button link goes to the order form')
  assert.match(html, /\.n-row\{flex-direction:row;gap:20px;background-color:#fafafa\}/)
  assert.match(html, /\.n-left\{font-size:48px;flex:0 1 calc\(60% - 8\.00px\);width:auto\}/)
  assert.match(html, /@media \(max-width:719\.98px\)\{[^@]*\.n-row\{flex-direction:column\}/, 'rows stack on phones')
  assert.match(html, /@media \(max-width:719\.98px\)\{[^@]*\.n-left\{font-size:28px;flex:none;width:auto\}/, "a desktop share does not carry into a stacked phone column")
  assert.match(html, /@media \(min-width:720px\)\{\.n-right\{display:none\}\}/)
})

test('flexbox controls: reversed rows, spacing, and per-item align, size and order', () => {
  const layout = newSection('layout', 'flex')
  layout.children = [{ id: 'f', kind: 'box', props: {}, style: { direction: 'row-reverse', justify: 'evenly' }, children: [
    { id: 'i1', kind: 'text', props: { text: 'a' }, style: { alignSelf: 'center', grow: 'none', order: 'last' } },
    { id: 'i2', kind: 'text', props: { text: 'b' }, mobile: { order: 'first' } },
  ] }]
  const html = renderToStaticMarkup(<PageView content={{ ...blankContent(), sections: [layout] }} ctx={ctx} storeName="S" />)
  assert.match(html, /\.n-f\{flex-direction:row-reverse;justify-content:space-evenly\}/)
  assert.match(html, /\.n-i1\{flex:1 1 0;width:auto;align-self:center;flex:none;order:99\}/, 'item rules come after the width rules')
  assert.match(html, /@media \(max-width:719\.98px\)\{\.n-f\{flex-direction:column\}[^}]*\}[^@]*\.n-i2\{[^}]*order:-1\}/, 'a reversed row stacks on phones too')
})

test('hidden layout elements are not drawn', () => {
  const layout = newSection('layout', 'l')
  layout.children = [{ id: 'gone', kind: 'heading', props: { text: 'secret heading', level: 'h2' }, hide: 'all' }, { id: 'shown', kind: 'text', props: { text: 'visible' } }]
  const html = renderToStaticMarkup(<PageView content={{ ...blankContent(), sections: [layout] }} ctx={ctx} storeName="S" />)
  assert.doesNotMatch(html, /secret heading/)
  assert.match(html, /visible/)
})

test('headings render every tag from h1 to h6 and p', () => {
  const layout = newSection('layout', 'tags')
  layout.children = (['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p'] as const).map((level) => ({ id: `t-${level}`, kind: 'heading' as const, props: { text: level, level } }))
  const html = renderToStaticMarkup(<PageView content={{ ...blankContent(), sections: [layout] }} ctx={ctx} storeName="S" />)
  for (const level of ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p']) assert.match(html, new RegExp(`<${level} class="sf-n sf-n-heading n-t-${level}"`))
})

test('rich text elements render their formatting, cleaned again at render time', () => {
  const layout = newSection('layout', 'r')
  layout.children = [{ id: 'rich', kind: 'text', props: { text: '<p>Big <strong>deal</strong></p><img src=x onerror=alert(1)>' } }, { id: 'plain', kind: 'text', props: { text: 'a <b>\n\nb' } }]
  const html = renderToStaticMarkup(<PageView content={{ ...blankContent(), sections: [layout] }} ctx={ctx} storeName="S" />)
  assert.match(html, /<p>Big <strong>deal<\/strong><\/p>/)
  assert.doesNotMatch(html, /onerror|<img src=x/)
})

test('section backgrounds: gradient, image with overlay, video, and a minimum height', () => {
  const photo = '00000000-0000-4000-8000-000000000011'
  const withImage: Ctx = { ...ctx, image: (id) => (id === photo ? { url: 'https://cdn.test/a.webp', alt: '', width: 10, height: 10 } : undefined) }
  const section = (id: string, style: Record<string, string | number>) => ({ ...newSection('layout', id), style })
  const html = renderToStaticMarkup(<PageView ctx={withImage} storeName="S" content={{ ...blankContent(), sections: [
    section('g', { bgType: 'gradient', gradientFrom: '#112233', gradientTo: '#445566', gradientAngle: 90, minHeight: 600 }),
    section('i', { bgType: 'image', bgImage: photo, bgPosition: 'top', overlayColor: '#000000', overlayOpacity: 40 }),
    section('v', { bgType: 'video', bgVideo: 'https://cdn.test/loop.mp4', bgImage: photo }),
    section('bad', { bgType: 'video', bgVideo: 'https://youtube.com/watch?v=x' }),
  ] }} />)
  assert.match(html, /background-image:linear-gradient\(90deg, #112233 0%, #445566 100%\)/)
  assert.match(html, /--section-min-height:600px/)
  assert.match(html, /background-image:url\(&quot;https:\/\/cdn\.test\/a\.webp&quot;\);background-size:cover;background-position:top/)
  assert.match(html, /class="sf-bg__overlay" style="background:#000000;opacity:0\.4"/)
  assert.match(html, /<video src="https:\/\/cdn\.test\/loop\.mp4" autoPlay="" muted="" loop="" playsInline="" preload="metadata" poster="https:\/\/cdn\.test\/a\.webp">/)
  assert.equal(html.match(/<video/g)?.length, 1, 'only direct video files play')
})

test('grid boxes: columns × rows, spans, and one column on phones', () => {
  const layout = newSection('layout', 'grid')
  layout.children = [{ id: 'g', kind: 'box', props: {}, style: { display: 'grid', gridColumns: 3, gridRows: 2, gap: 12 }, children: [
    { id: 'wide', kind: 'box', props: {}, style: { colSpan: 2, rowSpan: 2 }, children: [] },
    { id: 'cell', kind: 'box', props: {}, children: [] },
  ] }]
  const html = renderToStaticMarkup(<PageView content={{ ...blankContent(), sections: [layout] }} ctx={ctx} storeName="S" />)
  assert.match(html, /\.n-g\{display:grid;grid-template-columns:repeat\(3,minmax\(0,1fr\)\);grid-template-rows:repeat\(2,auto\);gap:12px\}/)
  assert.match(html, /\.n-wide\{grid-column:span 2;grid-row:span 2\}/, 'no flex sizing inside a grid')
  assert.match(html, /@media \(max-width:719\.98px\)\{[^@]*\.n-g\{grid-template-columns:minmax\(0,1fr\);grid-template-rows:none\}[^@]*\.n-wide\{grid-column:auto;grid-row:auto\}/)
})
