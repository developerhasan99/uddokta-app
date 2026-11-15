import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readContent, newSection } from './schema.ts'
import { presetIds } from './themes.ts'
import { readTheme, starterDesigns, starterTheme, templateFor, templateKinds, themeCss, themeReferences } from './theme.ts'

test('both starter designs pass validation in every style and have every template', () => {
  for (const design of starterDesigns) for (const id of presetIds) {
    const doc = starterTheme(id, design)
    assert.deepEqual(readTheme(doc), doc, `${design} ${id}`)
    for (const kind of templateKinds) assert.ok(doc.templates[kind], kind)
  }
})

test('readTheme refuses anything off: bad colours, missing templates, unknown keys, script-closing CSS, unknown blocks', () => {
  const good = starterTheme('fresh')
  const bad = [
    { ...good, version: 2 },
    { ...good, settings: { ...good.settings, colors: { ...good.settings.colors, accent: 'red;}body{display:none' } } },
    { ...good, settings: { ...good.settings, radius: 99 } },
    { ...good, settings: { ...good.settings, bangla: 'Comic Sans' } },
    { ...good, templates: { ...good.templates, 'product.<x>': good.templates.product } },
    { ...good, templates: Object.fromEntries(Object.entries(good.templates).filter(([k]) => k !== 'product')) },
    { ...good, css: '</style><script>alert(1)</script>' },
    { ...good, header: [{ ...good.header[0], type: 'nope' }] },
  ]
  for (const doc of bad) assert.equal(readTheme(doc), null, JSON.stringify(doc).slice(0, 120))
  const alt = readTheme({ ...good, templates: { ...good.templates, 'product.gift': good.templates.product } })
  assert.ok(alt)
  assert.equal(templateFor(alt, 'product', 'gift'), alt.templates['product.gift'])
  assert.equal(templateFor(alt, 'product', 'missing'), alt.templates.product, 'an unknown alternate falls back to the default')
})

test('store blocks are for themes only; landing pages refuse them', () => {
  const page = { version: 2, sections: [newSection('productGrid', 'grid')] }
  assert.equal(readContent(page), null)
  assert.ok(readContent(page, { theme: true }))
})

test('theme CSS comes only from checked values, with readable text on dark paper and accents', () => {
  const night = starterTheme('night').settings
  assert.match(themeCss(night), /--sf-paper:#141414/)
  assert.match(themeCss(night), /--sf-muted:#a8a8a8/)
  assert.match(themeCss(starterTheme('fresh').settings), /--sf-accent-ink:#ffffff/)
  assert.deepEqual(themeReferences(starterTheme('fresh')), { media: [], products: [], collections: [] })
})
