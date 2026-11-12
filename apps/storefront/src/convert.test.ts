import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hasRetiredBlocks, retireOldBlocks, toLayout } from './convert.ts'
import { newSection, orderBlocks, readContent, sectionTypes, walk, type Content } from './schema.ts'

test('every built-in section converts into a valid layout section that keeps its content', () => {
  let n = 0
  const id = () => `n${n++}`
  for (const type of sectionTypes) {
    const section = toLayout(newSection(type, `s-${type}`), id)
    const content: Content = { version: 2, sections: [section] }
    assert.equal(section.type, 'layout', type)
    assert.equal(section.id, `s-${type}`, 'the section keeps its id, so links to it still work')
    assert.deepEqual(readContent(content), content, type)
  }
  const retiredStory = readContent(retireOldBlocks({ version: 2, sections: [{ id: 'h', type: 'imageText', hidden: false, settings: { heading: 'Big sale', button: 'Buy', layout: 'split' } }] }, id))!
  const tree = [...walk(retiredStory.sections[0].children!)]
  assert.ok(tree.some((x) => x.kind === 'heading' && x.props.text === 'Big sale'), 'a retired Image with text keeps its heading')
  assert.ok(tree.some((x) => x.kind === 'button'))
  const order = newSection('order', 'buy')
  order.settings.product = '00000000-0000-4000-8000-000000000001'
  const converted: Content = { version: 2, sections: [toLayout(order, id)] }
  assert.equal(orderBlocks(converted)[0].settings.product, order.settings.product, 'the order form becomes a working block')
  const features = toLayout(newSection('features', 'f'), id)
  assert.equal([...walk(features.children!)].filter((x) => x.kind === 'icon').length, 3, 'each benefit becomes its own card')
})

test('retired Text and Image blocks and sections become elements that pass the schema, keeping id and style', () => {
  let n = 0
  const id = () => `r${n++}`
  const raw = { version: 2, sections: [
    { id: 'old', type: 'text', hidden: false, settings: { heading: 'Details', body: 'Line one' } },
    { id: 'lay', type: 'layout', hidden: false, settings: { name: '' }, children: [
      { id: 'tb', kind: 'block', props: {}, style: { paddingTop: 12 }, hide: 'mobile', block: { type: 'text', settings: { heading: '', body: 'Body only' } } },
      { id: 'bx', kind: 'box', props: {}, children: [{ id: 'ib', kind: 'block', props: {}, block: { type: 'image', settings: { image: null, caption: 'Fresh' } } }] },
      { id: 'faq', kind: 'block', props: {}, block: { type: 'faq', settings: newSection('faq', 'q').settings } },
    ] },
  ] }
  assert.ok(hasRetiredBlocks(raw))
  const out = readContent(retireOldBlocks(raw, id))
  assert.ok(out, 'the result passes the schema')
  assert.ok(!hasRetiredBlocks(out))
  const [old, lay] = out!.sections
  assert.equal(old.type, 'layout')
  assert.deepEqual(old.children!.map((c) => [c.kind, c.props.text]), [['heading', 'Details'], ['text', 'Line one']])
  const [tb, bx, faq] = lay.children!
  assert.deepEqual([tb.id, tb.kind, tb.style, tb.hide], ['tb', 'box', { paddingTop: 12 }, 'mobile'], 'same id, style and visibility')
  assert.deepEqual(tb.children!.map((c) => c.kind), ['text'])
  assert.deepEqual(bx.children![0].children!.map((c) => [c.kind, c.props.text ?? null]), [['image', null], ['text', 'Fresh']])
  assert.equal(faq.block?.type, 'faq', 'other blocks stay as they are')
})

test('retired Video, Call to action and Standalone icon blocks become their elements', () => {
  let n = 0
  const id = () => `v${n++}`
  const block = (bid: string, type: string, settings: object) => ({ id: bid, kind: 'block', props: {}, block: { type, settings } })
  const out = readContent(retireOldBlocks({ version: 2, sections: [{ id: 'l', type: 'layout', hidden: false, settings: { name: '' }, children: [
    block('vid', 'video', { heading: 'Watch', url: 'https://www.youtube.com/watch?v=abcdefghijk' }),
    block('act', 'cta', { heading: 'Order today', text: 'Fresh stock', button: 'Order', link: '#buy' }),
    block('sym', 'icon', { icon: 'phone', label: '', link: '' }),
  ] }] }, id))!
  const kinds = [...walk(out.sections[0].children!)].map((x) => x.kind)
  assert.deepEqual(kinds.filter((k) => k !== 'box'), ['heading', 'video', 'heading', 'text', 'button', 'icon'])
  assert.ok(!hasRetiredBlocks(out))
})

test('a retired Video block with no link stays invisible on the live page, as it was', () => {
  const out = readContent(retireOldBlocks({ version: 2, sections: [{ id: 'l', type: 'layout', hidden: false, settings: { name: '' }, children: [{ id: 'v', kind: 'block', props: {}, block: { type: 'video', settings: { heading: 'Watch', url: '' } } }] }] }, () => 'x1'))!
  assert.deepEqual([...walk(out.sections[0].children!)].map((x) => x.kind), ['box', 'video'], 'no heading without a video')
})
