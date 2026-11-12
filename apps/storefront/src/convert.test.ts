import assert from 'node:assert/strict'
import { test } from 'node:test'
import { toLayout } from './convert.ts'
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
  const story = newSection('imageText', 'h')
  story.settings.heading = 'Big sale'
  story.settings.button = 'Buy'
  const tree = [...walk(toLayout(story, id).children!)]
  assert.ok(tree.some((x) => x.kind === 'heading' && x.props.text === 'Big sale'))
  assert.ok(tree.some((x) => x.kind === 'button'))
  const order = newSection('order', 'buy')
  order.settings.product = '00000000-0000-4000-8000-000000000001'
  const converted: Content = { version: 2, sections: [toLayout(order, id)] }
  assert.equal(orderBlocks(converted)[0].settings.product, order.settings.product, 'the order form becomes a working block')
  const features = toLayout(newSection('features', 'f'), id)
  assert.equal([...walk(features.children!)].filter((x) => x.kind === 'icon').length, 3, 'each benefit becomes its own card')
})
