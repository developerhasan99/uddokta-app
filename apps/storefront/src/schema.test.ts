import assert from 'node:assert/strict'
import { test } from 'node:test'
import { blankContent, newSection, readContent, references, sectionTypes, type Content } from './schema.ts'

test('legacy content preserves implicit chrome, and blank content persists explicit empty canvas', () => {
  const legacy: Content = { version: 1, sections: [newSection('text', 'old-section')] }
  assert.deepEqual(readContent(legacy), legacy)
  assert.deepEqual(readContent(blankContent()), blankContent())
  assert.equal(readContent({ ...blankContent(), canvas: { header: 'no', footer: false } }), null)
})

test('every section family survives validation, including layout variants and nested image references', () => {
  const content: Content = { version: 1, sections: sectionTypes.map((type, i) => newSection(type, `section-${i}`)) }
  const cards = content.sections.find((s) => s.type === 'cards')!
  const imageId = '00000000-0000-4000-8000-000000000001'
  cards.settings.items = [{ title: 'Ingredient', text: 'Details', image: imageId }]
  assert.deepEqual(readContent(content), content)
  assert.deepEqual(references(content).media, [imageId])
})

test('section presentation round-trips zero values and mobile overrides while discarding unknown properties', () => {
  const section = newSection('imageText', 'story')
  section.style = { background: '#123456', color: '#ffffff', headingSize: 56, mobileHeadingSize: 28, columns: 4, mobileColumns: 1, paddingTop: 0, paddingLeft: 16, paddingRight: 24, marginLeft: 12, mobilePaddingLeft: 8, mobileMarginRight: 4, borderWidth: 0, radius: 0, align: 'center', visibility: 'mobile', imageRatio: '4/3', imageFit: 'contain', shadow: 'soft', font: 'serif', unknown: 'ignored' }
  const parsed = readContent({ version: 1, sections: [section], arbitrary: 'ignored' })!
  assert.equal(parsed.sections[0].style?.paddingTop, 0)
  assert.equal(parsed.sections[0].style?.radius, 0)
  assert.equal(parsed.sections[0].style?.mobileHeadingSize, 28)
  assert.equal(parsed.sections[0].style?.unknown, undefined)
  assert.deepEqual(readContent(parsed), parsed)
})

test('unsafe CSS, invalid enums, out-of-range values and unsafe navigation links are rejected', () => {
  const section = newSection('cta', 'cta')
  for (const style of [{ background: 'url(https://evil.test/a)' }, { headingSize: 10000 }, { paddingTop: -1 }, { marginLeft: -1 }, { mobilePaddingRight: 161 }, { radius: 1.5 }, { columns: 5 }, { align: 'center;color:red' }, { visibility: 'hidden' }]) {
    assert.equal(readContent({ version: 1, sections: [{ ...section, style }] }), null)
  }
  for (const link of ['javascript:alert(1)', 'data:text/html,hello', '//evil.test', '#bad id']) {
    assert.equal(readContent({ version: 1, sections: [{ ...section, settings: { ...section.settings, link } }] }), null)
  }
  for (const link of ['', '#order-123', 'https://example.com/policy', 'tel:+8801700000000', 'mailto:hello@example.com']) {
    assert.ok(readContent({ version: 1, sections: [{ ...section, settings: { ...section.settings, link } }] }))
  }
})
