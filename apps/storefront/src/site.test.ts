import assert from 'node:assert/strict'
import { test } from 'node:test'
import { newSection, readContent } from './schema.ts'
import { presetIds } from './themes.ts'
import { builtInTemplates, readSiteStyle, readTemplateContent, readyMade, siteCss, styleFromPreset, templateTypes } from './site.ts'

test('every built-in and ready-made template passes validation', () => {
  for (const type of templateTypes) assert.deepEqual(readTemplateContent(builtInTemplates[type]), builtInTemplates[type], type)
  for (const [type, starts] of Object.entries(readyMade)) for (const start of starts ?? []) assert.ok(readTemplateContent(start.content), `${type} ${start.id}`)
})

test('Site settings come from every preset and refuse anything off', () => {
  for (const id of presetIds) assert.deepEqual(readSiteStyle(styleFromPreset(id)), styleFromPreset(id), id)
  const good = styleFromPreset('fresh')
  for (const bad of [
    { ...good, colors: { ...good.colors, accent: 'red;}body{display:none' } },
    { ...good, radius: 99 },
    { ...good, width: 100 },
    { ...good, bangla: 'Comic Sans' },
    { ...good, css: '</style><script>alert(1)</script>' },
  ]) assert.equal(readSiteStyle(bad), null, JSON.stringify(bad).slice(0, 80))
  assert.match(siteCss(styleFromPreset('night')), /--sf-muted:#a8a8a8/)
})

test('store blocks are for templates only; landing pages refuse them', () => {
  const page = { version: 2, sections: [newSection('productGrid', 'grid')] }
  assert.equal(readContent(page), null)
  assert.ok(readTemplateContent(page))
})

test('a landing page canvas may name a header and footer template by id only', () => {
  const id = '00000000-0000-4000-8000-000000000001'
  assert.equal(readContent({ version: 2, sections: [], canvas: { header: true, footer: true, headerId: id } })?.canvas?.headerId, id)
  assert.equal(readContent({ version: 2, sections: [], canvas: { header: true, footer: true, headerId: 'not-an-id' } }), null)
})
