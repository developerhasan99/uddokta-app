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
