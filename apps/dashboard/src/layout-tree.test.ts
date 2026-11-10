import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { PageNode, Section } from 'storefront/schema'
import { findNode, layoutPresets, reIdSection, relocate, setColumns } from './layout-tree.ts'

const leaf = (id: string): PageNode => ({ id, kind: 'text', props: { text: id } })
const tree = (): PageNode[] => [{ id: 'a', kind: 'box', props: {}, children: [leaf('a1'), leaf('a2')] }, { id: 'b', kind: 'box', props: {}, children: [] }, leaf('c')]
const ids = (nodes: PageNode[]): unknown => nodes.map((n) => (n.children ? { [n.id]: ids(n.children) } : n.id))

test('drag and drop moves before, after and into boxes, never into itself', () => {
  assert.deepEqual(ids(relocate(tree(), 'c', 'a', 'before')!), ['c', { a: ['a1', 'a2'] }, { b: [] }])
  assert.deepEqual(ids(relocate(tree(), 'a1', 'b', 'inside')!), [{ a: ['a2'] }, { b: ['a1'] }, 'c'])
  assert.deepEqual(ids(relocate(tree(), 'c', 'a1', 'after')!), [{ a: ['a1', 'c', 'a2'] }, { b: [] }])
  assert.equal(relocate(tree(), 'a', 'a1', 'before'), null, 'a box cannot go inside itself')
  assert.equal(relocate(tree(), 'a', 'a', 'after'), null)
  assert.equal(relocate(tree(), 'b', 'c', 'inside'), null, 'only boxes take children')
})

test('duplicated sections get fresh ids for every node, and presets are well formed', () => {
  let n = 0
  const id = () => `x${n++}`
  const section: Section = { id: 's', type: 'layout', hidden: false, settings: {}, children: tree() }
  const copy = reIdSection(section, id)
  const all = (nodes: PageNode[]): string[] => nodes.flatMap((x) => [x.id, ...all(x.children ?? [])])
  assert.equal(new Set([...all(section.children!), ...all(copy.children!)]).size, 10)
  assert.ok(findNode([copy], all(copy.children!)[1]))
  for (const preset of layoutPresets) assert.equal(preset.build(id).kind, 'box', preset.key)
})

test('the Columns setting adds empty columns and only removes empty ones from the end', () => {
  let n = 0
  const id = () => `c${n++}`
  const one = { id: 'b', kind: 'box' as const, props: {}, children: [{ id: 'x', kind: 'box' as const, props: {}, children: [] }] }
  const three = setColumns(one, 3, id)
  assert.equal(three.node.children!.length, 3)
  assert.equal(three.node.style?.direction, 'row', 'more than one column means side by side')
  const filled = { ...three.node, children: [...three.node.children!.slice(0, 2), { ...three.node.children![2], children: [{ id: 't', kind: 'text' as const, props: { text: 'keep' } }] }] }
  const back = setColumns(filled, 1, id)
  assert.equal(back.blocked, true)
  assert.equal(back.node.children!.length, 3, 'a column with content is never removed')
  assert.equal(setColumns(three.node, 1, id).node.children!.length, 1)
})
