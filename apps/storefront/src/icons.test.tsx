import assert from 'node:assert/strict'
import { test } from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { iconCatalog, iconCategories, iconNames, isIconName } from './icons/catalog.ts'
import { iconNodes } from './icons/nodes.ts'
import { MarketingIcon } from './icons/Icon.tsx'
import { blankContent, newSection, readContent } from './schema.ts'
import { PageView, type Ctx } from './sections.tsx'

const ctx: Ctx = { preview: false, shipping: [{ id: '00000000-0000-4000-8000-000000000003', name: 'ঢাকার ভেতরে', note: '', price: 60, freeOver: null, freeMinQty: null, freeProducts: [] }, { id: '00000000-0000-4000-8000-000000000004', name: 'ঢাকার বাইরে', note: '', price: 120, freeOver: null, freeMinQty: null, freeProducts: [] }], image: () => undefined, product: () => undefined }
const render = (sections: ReturnType<typeof newSection>[]) => renderToStaticMarkup(<PageView content={{ ...blankContent(), sections }} ctx={ctx} storeName="Shop" />)

test('the bounded catalog has safe, renderable SVG primitives and bilingual metadata for every icon', () => {
  assert.equal(iconNames.length, 80)
  assert.deepEqual(Object.keys(iconNodes), iconNames)
  const tags = new Set(['path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'ellipse'])
  const attrs = new Set(['d', 'cx', 'cy', 'r', 'x', 'y', 'x1', 'x2', 'y1', 'y2', 'width', 'height', 'rx', 'ry', 'points', 'fill', 'fillRule', 'clipRule', 'opacity', 'transform'])
  for (const name of iconNames) {
    assert.ok(iconCatalog[name].label.every(Boolean))
    assert.ok(iconCategories[iconCatalog[name].category])
    assert.ok(iconNodes[name].length)
    for (const [tag, attributes] of iconNodes[name]) {
      assert.ok(tags.has(tag))
      assert.ok(Object.keys(attributes).every((attr) => attrs.has(attr)))
      assert.doesNotMatch(JSON.stringify(attributes), /url\(|https?:|<|>/)
    }
    const svg = renderToStaticMarkup(<MarketingIcon name={name} />)
    assert.match(svg, /<svg[^>]*aria-hidden="true"/)
    assert.ok(svg.includes(`data-icon="${name}"`))
    assert.doesNotMatch(svg, /<script|<use|<image|href=/)
  }
  assert.match(renderToStaticMarkup(<MarketingIcon name="phone" label="Call us" />), /role="img" aria-label="Call us"/)
  for (const name of ['toString', '__proto__', '<svg onload=alert(1)>', 'https://example.com/icon.svg']) {
    assert.equal(isIconName(name), false)
    assert.equal(renderToStaticMarkup(<MarketingIcon name={name} />), '')
  }
})

test('icon IDs and presentation round-trip through JSON; arbitrary SVG and unknown IDs are refused', () => {
  const cards = newSection('iconCards', 'cards')
  cards.style = { iconSize: 40, iconColor: '#123456', iconBackground: '#ffffff', iconRadius: 24, iconStroke: '1.5', iconSurface: 'soft' }
  const button = newSection('announcement', 'action')
  button.settings.button = 'Shop'
  button.settings.buttonIcon = 'shopping-bag'
  button.settings.link = '#cards'
  const sections = [cards, newSection('iconList', 'list'), button]
  const content = { ...blankContent(), sections }
  assert.deepEqual(readContent(JSON.parse(JSON.stringify(content))), content)
  for (const bad of ['made-up', '<svg/>', 'data:image/svg+xml,x', 'https://example.com/icon.svg', '__proto__']) {
    assert.equal(readContent({ ...blankContent(), sections: [{ ...button, settings: { ...button.settings, buttonIcon: bad } }] }), null)
    const changed = structuredClone(cards)
    ;(changed.settings.items as { icon: string }[])[0].icon = bad
    assert.equal(readContent({ ...blankContent(), sections: [changed] }), null)
  }
  for (const style of [{ iconSize: 121 }, { iconStroke: '4' }, { iconSurface: 'unknown' }, { iconColor: 'url(x)' }]) {
    assert.equal(readContent({ ...blankContent(), sections: [{ ...cards, style }] }), null)
  }
  const html = render(sections)
  assert.match(html, /--section-icon-size:40px/)
  assert.match(html, /--section-icon-stroke:1.5/)
  assert.match(html, /data-icon-surface="soft"/)
  assert.match(html, /data-icon="shopping-bag"/)
})

test('legacy content stays identical, icons can be removed, and linked icons have accessible names', () => {
  const legacy = newSection('features', 'benefits')
  const content = { ...blankContent(), sections: [legacy] }
  assert.deepEqual(readContent(content), content)
  assert.match(render([legacy]), /sf-legacy-check/)
  const rows = legacy.settings.items as { icon?: string }[]
  rows.forEach((row) => { row.icon = '' })
  assert.doesNotMatch(render([legacy]), /<svg/)
  rows[0].icon = 'leaf'
  assert.match(render([legacy]), /data-icon="leaf"/)
  assert.doesNotMatch(render([legacy]), /<script|iconNodes|<link/)
})
