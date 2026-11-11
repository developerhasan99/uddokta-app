import assert from 'node:assert/strict'
import { test } from 'node:test'
import './sections.tsx' // load first: layout.tsx and sections.tsx import each other
import { layoutCss } from './layout.tsx'
import { newSection, type Content, type PageNode } from './schema.ts'
import type { Ctx } from './sections.tsx'

const css = (node: PageNode) => {
  const content: Content = { version: 2, sections: [{ ...newSection('layout', 's1'), children: [node] }] }
  return layoutCss(content, { image: () => null } as unknown as Ctx)
}

test('borders: per-side widths, style and colour, with phone rules adding to desktop', () => {
  const desktop = css({ id: 'a', kind: 'box', props: {}, children: [], style: { borderTopWidth: 2, borderStyle: 'dashed' } })
  assert.match(desktop, /\.n-a\{[^}]*border-width:0px;border-top-width:2px;border-style:dashed;border-color:var\(--sf-rule\)/)

  const phoneOnly = css({ id: 'b', kind: 'box', props: {}, children: [], style: { borderColor: '#ff0000' }, mobile: { borderLeftWidth: 1 } })
  assert.match(phoneOnly, /@media \(max-width:719\.98px\)\{\.n-b\{border-width:0px;border-left-width:1px;border-style:solid;border-color:#ff0000/)

  const override = css({ id: 'c', kind: 'box', props: {}, children: [], style: { borderWidth: 1 }, mobile: { borderBottomWidth: 4 } })
  assert.match(override, /\.n-c\{[^}]*border-width:1px;border-style:solid/)
  assert.match(override, /@media \(max-width:719\.98px\)\{\.n-c\{border-bottom-width:4px\}/, 'the phone rule keeps the desktop style and colour')
})

test('corners: one size per corner, after the older all-corners size so they win', () => {
  const out = css({ id: 'd', kind: 'box', props: {}, children: [], style: { radius: 8, radiusTopLeft: 0, radiusBottomRight: 24 } })
  assert.match(out, /\.n-d\{[^}]*border-radius:8px;border-top-left-radius:0px;border-bottom-right-radius:24px/)
})

test('hover: only the values set for hover, after everything else and only where a pointer can hover', () => {
  const out = css({ id: 'e', kind: 'button', props: {}, style: { background: '#111111', borderTopWidth: 1, transitionDuration: 200 }, hover: { background: '#222222', borderColor: '#ff0000' } })
  assert.match(out, /\.n-e\{[^}]*transition-property:[^;]*background-color[^;]*;transition-duration:200ms;transition-timing-function:ease/)
  assert.match(out, /@media \(hover:hover\)\{\.n-e:hover\{--sf-accent:#222222;border-color:#ff0000\}\}$/, 'the hover rule keeps the normal border widths and style')
})
