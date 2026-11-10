import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { PageNode, Section } from 'storefront/schema'
import { boxDepth, boxesAbove, columns, findNode, layoutPresets, reIdSection, relocate, setGrid } from './layout-tree.ts'

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

test('grid columns × rows add empty cells and only remove empty ones from the end', () => {
  let n = 0
  const id = () => `c${n++}`
  const two = columns(2, id)
  assert.equal(two.style?.display, 'grid')
  const six = setGrid(two, 3, 2, id)
  assert.equal(six.node.children!.length, 6, '3 columns × 2 rows = 6 cells')
  assert.deepEqual([six.node.style?.gridColumns, six.node.style?.gridRows], [3, 2])
  const filled = { ...six.node, children: [...six.node.children!.slice(0, 5), { ...six.node.children![5], children: [{ id: 't', kind: 'text' as const, props: { text: 'keep' } }] }] }
  const back = setGrid(filled, 2, 1, id)
  assert.equal(back.blocked, true)
  assert.equal(back.node.children!.length, 6, 'a cell with content is never removed')
  assert.equal(setGrid(six.node, 2, 1, id).node.children!.length, 2)
})

test('box depth helpers count nesting so nothing goes past four boxes', () => {
  let n = 0
  const id = () => `d${n++}`
  const grid = columns(2, id)
  assert.equal(boxDepth(grid), 2, 'a structure is a grid with cell boxes inside')
  const section: Section = { id: 's', type: 'layout', hidden: false, settings: {}, children: [grid] }
  const cell = grid.children![0].id
  assert.equal(boxesAbove([section], null), 0)
  assert.equal(boxesAbove([section], grid.id), 1)
  assert.equal(boxesAbove([section], cell), 2)
})
