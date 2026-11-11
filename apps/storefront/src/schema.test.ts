import assert from 'node:assert/strict'
import { test } from 'node:test'
import { blankContent, maxBoxDepth, maxDepth, maxNodes, newBlock, newSection, orderBlocks, readContent, references, sectionTypes, type Content, type PageNode } from './schema.ts'

test('legacy content preserves implicit chrome, and blank content persists explicit empty canvas', () => {
  const legacy = { version: 2, sections: [newSection('text', 'old-section')] }
  assert.deepEqual(readContent(legacy), legacy)
  assert.equal(readContent({ ...legacy, version: 1 }), null, 'only version 2 is accepted')
  assert.deepEqual(readContent(blankContent()), blankContent())
  assert.equal(readContent({ ...blankContent(), canvas: { header: 'no', footer: false } }), null)
  assert.equal(readContent({ ...blankContent(), css: '.sf-page { color: red }' })?.css, '.sf-page { color: red }')
  assert.equal(readContent({ ...blankContent(), css: '  ' })?.css, undefined)
  assert.equal(readContent({ ...blankContent(), css: 'a{}</style><script>x()</script>' }), null)
})

test('every section family survives validation, including layout variants and nested image references', () => {
  const content: Content = { version: 2, sections: sectionTypes.map((type, i) => newSection(type, `section-${i}`)) }
  const cards = content.sections.find((s) => s.type === 'cards')!
  const imageId = '00000000-0000-4000-8000-000000000001'
  cards.settings.items = [{ title: 'Ingredient', text: 'Details', image: imageId }]
  assert.deepEqual(readContent(content), content)
  assert.deepEqual(references(content).media, [imageId])
})

test('section presentation round-trips zero values and mobile overrides while discarding unknown properties', () => {
  const section = newSection('imageText', 'story')
  section.style = { background: '#123456', color: '#ffffff', headingSize: 56, mobileHeadingSize: 28, columns: 4, mobileColumns: 1, paddingTop: 0, paddingLeft: 16, paddingRight: 24, marginLeft: 12, mobilePaddingLeft: 8, mobileMarginRight: 4, borderWidth: 0, radius: 0, align: 'center', visibility: 'mobile', imageRatio: '4/3', imageFit: 'contain', shadow: 'soft', font: 'serif', unknown: 'ignored' }
  const parsed = readContent({ version: 2, sections: [section], arbitrary: 'ignored' })!
  assert.equal(parsed.sections[0].style?.paddingTop, 0)
  assert.equal(parsed.sections[0].style?.radius, 0)
  assert.equal(parsed.sections[0].style?.mobileHeadingSize, 28)
  assert.equal(parsed.sections[0].style?.unknown, undefined)
  assert.deepEqual(readContent(parsed), parsed)
})

test('unsafe CSS, invalid enums, out-of-range values and unsafe navigation links are rejected', () => {
  const section = newSection('cta', 'cta')
  for (const style of [{ background: 'url(https://evil.test/a)' }, { headingSize: 10000 }, { paddingTop: -1 }, { marginLeft: -1 }, { mobilePaddingRight: 161 }, { radius: 1.5 }, { columns: 5 }, { align: 'center;color:red' }, { visibility: 'hidden' }]) {
    assert.equal(readContent({ version: 2, sections: [{ ...section, style }] }), null)
  }
  for (const link of ['javascript:alert(1)', 'data:text/html,hello', '//evil.test', '#bad id']) {
    assert.equal(readContent({ version: 2, sections: [{ ...section, settings: { ...section.settings, link } }] }), null)
  }
  for (const link of ['', '#order-123', 'https://example.com/policy', 'tel:+8801700000000', 'mailto:hello@example.com']) {
    assert.ok(readContent({ version: 2, sections: [{ ...section, settings: { ...section.settings, link } }] }))
  }
})

test('layout sections hold a validated tree of boxes and elements', () => {
  const image = '00000000-0000-4000-8000-000000000002'
  const background = '00000000-0000-4000-8000-000000000003'
  const tree: PageNode[] = [{ id: 'row', kind: 'box', props: {}, style: { direction: 'row', gap: 24, backgroundImage: background }, mobile: { direction: 'column', gap: 12 }, children: [
    { id: 'pic', kind: 'image', props: { image, link: '' }, style: { width: 40, radius: 16 } },
    { id: 'copy', kind: 'box', props: {}, style: { width: 60 }, children: [
      { id: 'title', kind: 'heading', props: { text: 'শিরোনাম', level: 'h1' }, style: { fontSize: 48 }, mobile: { fontSize: 28 } },
      { id: 'cta', kind: 'button', props: { text: 'অর্ডার', link: '', icon: '', variant: 'solid' }, hide: 'desktop' },
    ] },
  ] }]
  const content: Content = { version: 2, sections: [{ ...newSection('layout', 'custom'), children: tree }] }
  assert.deepEqual(readContent(content), content)
  assert.deepEqual(references(content).media.sort(), [image, background].sort())

  const layout = (children: unknown) => ({ version: 2, sections: [{ id: 'custom', type: 'layout', hidden: false, settings: {}, children }] })
  const box = (extra: object) => [{ id: 'b', kind: 'box', props: {}, children: [], ...extra }]
  assert.equal(readContent(layout([{ id: 'x', kind: 'script', props: {} }])), null)
  assert.equal(readContent(layout([{ id: 'h', kind: 'heading', props: {}, children: [] }])), null)
  for (const style of [{ width: 0 }, { color: 'red' }, { fontSize: 1000 }, { direction: 'diagonal' }, { gap: 1.5 }]) assert.equal(readContent(layout(box({ style }))), null)
  assert.equal(readContent(layout(box({ hide: 'tablet' }))), null)
  assert.equal(readContent(layout([...box({}), ...box({})])), null, 'ids must be unique')
  let deep: Record<string, unknown> = { id: 'leaf', kind: 'text', props: {} }
  for (let i = 0; i < maxDepth; i++) deep = { id: `d${i}`, kind: 'box', props: {}, children: [deep] }
  assert.equal(readContent(layout([deep])), null, 'too deep')
  assert.equal(readContent(layout(Array.from({ length: maxNodes + 1 }, (_, i) => ({ id: `n${i}`, kind: 'spacer', props: {} })))), null, 'too many nodes')
  assert.equal(readContent({ version: 2, sections: [{ ...newSection('text', 't'), children: [] }] }), null, 'only layout sections have children')
  assert.equal(readContent(layout([{ id: 'h', kind: 'heading', props: { text: 'x'.repeat(301) } }])), null)
})

test('blocks put built-in sections inside layouts, validated by that section type', () => {
  const product = '00000000-0000-4000-8000-000000000009'
  let n = 0
  const order = newBlock('order', () => `b${n++}`)
  order.block!.settings.product = product
  const faq = newBlock('faq', () => `b${n++}`)
  const content: Content = { version: 2, sections: [{ ...newSection('layout', 'l'), children: [{ id: 'row', kind: 'box', props: {}, children: [order, faq] }] }] }
  assert.deepEqual(readContent(content), content)
  assert.deepEqual(references(content).products, [product])
  assert.deepEqual(orderBlocks(content).map((o) => o.id), ['b0'])
  const bad = (block: unknown) => readContent({ version: 2, sections: [{ id: 'l', type: 'layout', hidden: false, settings: {}, children: [{ id: 'x', kind: 'block', props: {}, block }] }] })
  assert.equal(bad({ type: 'layout', settings: {} }), null, 'no layouts inside layouts')
  assert.equal(bad({ type: 'order', settings: { product: 'nope' } }), null, 'the section type\'s own rules apply')
  assert.equal(bad(undefined), null)
  assert.equal(readContent({ version: 2, sections: [{ id: 'l', type: 'layout', hidden: false, settings: {}, children: [{ id: 'x', kind: 'text', props: {}, block: { type: 'faq', settings: {} } }] }] }), null, 'only block nodes carry a block')
})

test('a fully hidden node is kept in the page but never drawn', () => {
  const content: Content = { version: 2, sections: [{ ...newSection('layout', 'l'), children: [{ id: 'gone', kind: 'heading', props: { text: 'secret', level: 'h2' }, hide: 'all' }] }] }
  assert.deepEqual(readContent(content), content)
})

test('text elements keep safe rich text and drop everything else', () => {
  const content = (text: string) => ({ version: 2, sections: [{ id: 'l', type: 'layout', hidden: false, settings: {}, children: [{ id: 't', kind: 'text', props: { text } }] }] })
  const read = (text: string) => readContent(content(text))!.sections[0].children![0].props.text
  assert.equal(read('<p>Hello <b>world</b></p><ul><li>One</li></ul>'), '<p>Hello <strong>world</strong></p><ul><li>One</li></ul>')
  assert.equal(read('<p onclick="x()">Hi</p><script>alert(1)</script><img src=x onerror=alert(1)>'), '<p>Hi</p>alert(1)')
  assert.equal(read('<a href="javascript:alert(1)">x</a><a href="https://ok.test/a">y</a>'), 'x</a><a href="https://ok.test/a">y</a>')
  assert.equal(read('plain\n\ntext'), 'plain\n\ntext', 'older plain text stays as it was')
})

test('section backgrounds are validated, spacing goes to 300px, and background images are tracked', () => {
  const photo = '00000000-0000-4000-8000-000000000012'
  const page = (style: object) => readContent({ version: 2, sections: [{ ...newSection('layout', 'l'), style }] })
  const ok = page({ bgType: 'image', bgImage: photo, overlayColor: '#000000', overlayOpacity: 60, paddingTop: 300, marginBottom: 300, mobilePaddingTop: 300 })!
  assert.equal(ok.sections[0].style?.paddingTop, 300)
  assert.deepEqual(references(ok).media, [photo])
  for (const style of [{ paddingTop: 301 }, { overlayOpacity: 101 }, { bgVideo: 'http://insecure.test/a.mp4' }, { bgType: 'pattern' }, { gradientFrom: 'red' }, { bgImage: 'not-an-id' }]) assert.equal(page(style), null, JSON.stringify(style))
})

test('boxes nest at most four deep', () => {
  const nest = (levels: number) => {
    let node: Record<string, unknown> = { id: 'leaf', kind: 'text', props: {} }
    for (let i = 0; i < levels; i++) node = { id: `b${i}`, kind: 'box', props: {}, children: [node] }
    return { version: 2, sections: [{ id: 'l', type: 'layout', hidden: false, settings: {}, children: [node] }] }
  }
  assert.ok(readContent(nest(maxBoxDepth)), 'four boxes with an element inside is fine')
  assert.equal(readContent(nest(maxBoxDepth + 1)), null, 'a fifth box is refused')
})

test('colours are #RRGGBB or #RRGGBBAA (see-through), nothing else', () => {
  const page = (color: string): Content => ({ version: 2, sections: [{ ...newSection('layout', 's1'), children: [{ id: 'h', kind: 'heading', props: {}, style: { color } } as PageNode] }] })
  assert.equal((readContent(page('#2121cc7d'))?.sections[0].children?.[0].style as Record<string, unknown>).color, '#2121cc7d')
  assert.equal((readContent(page('#2121cc'))?.sections[0].children?.[0].style as Record<string, unknown>).color, '#2121cc')
  for (const bad of ['#2121cc7', '#2121cc7d0', 'red', '#21c', 'rgba(0,0,0,.5)']) assert.equal(readContent(page(bad)), null, bad)
})

test('hover keeps only Style values', () => {
  const content: Content = { version: 2, sections: [{ ...newSection('layout', 's1'), children: [{ id: 'b', kind: 'button', props: {}, hover: { background: '#123456', width: 50, transitionDuration: 100 } } as PageNode] }] }
  assert.deepEqual(readContent(content)?.sections[0].children?.[0].hover, { background: '#123456' })
})
