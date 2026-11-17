import assert from 'node:assert/strict'
import { test } from 'node:test'
import { activeFilters, applyFilters, isAttributeName, readSelection, selectionQuery, without, type FilterAttribute, type FilterRow } from './filters.ts'

const origin: FilterAttribute = { id: 'o', name: 'উৎস', kind: 'choice', unit: '', choices: [{ id: 's', label: 'সুন্দরবন' }, { id: 'r', label: 'রাজশাহী' }, { id: 'j', label: 'যশোর' }] }
const weight: FilterAttribute = { id: 'w', name: 'ওজন', kind: 'number', unit: 'গ্রাম', choices: [] }
const certified: FilterAttribute = { id: 'c', name: 'সার্টিফায়েড', kind: 'flag', unit: '', choices: [] }
const attrs = [origin, weight, certified]
const rows: FilterRow[] = [
  { id: 'honey', minPrice: 650, inStock: true, attrs: [['o', 's', null, null], ['w', null, '500', null], ['c', null, null, true]] },
  { id: 'mango', minPrice: 750, inStock: true, attrs: [['o', 'r', null, null], ['w', null, '5000', null]] },
  { id: 'gur', minPrice: 450, inStock: false, attrs: [['o', 'j', null, null], ['w', null, '1000', null]] },
  { id: 'plain', minPrice: 120, inStock: true, attrs: [] },
]

test('reads the address, filters with any-of inside an attribute and all-of across, and counts without each own filter', () => {
  const sel = readSelection(new URLSearchParams('উৎস=সুন্দরবন&উৎস=রাজশাহী&min.ওজন=৪০০&max.price=1,000&unknown=x'), attrs)
  assert.equal(activeFilters(sel), 4)
  const out = applyFilters(rows, attrs, sel)
  assert.deepEqual(out.ids, ['honey', 'mango'])
  const originFacet = out.facets.find((f) => f.attr.id === 'o')!
  assert.ok(originFacet.kind === 'choice')
  assert.deepEqual(originFacet.choices.map((c) => [c.label, c.count, c.on]), [['সুন্দরবন', 1, true], ['রাজশাহী', 1, true], ['যশোর', 1, false]], 'other origins still show with their counts')
  const flag = out.facets.find((f) => f.attr.id === 'c')!
  assert.ok(flag.kind === 'flag' && flag.count === 1)
  assert.deepEqual(out.price, { low: 650, high: 750, value: [null, 1000] }, 'price range ignores its own filter')
})

test('in stock, flags, links without one filter, and names that would clash with the address are refused', () => {
  const sel = readSelection(new URLSearchParams('stock=1&সার্টিফায়েড=1'), attrs)
  assert.deepEqual(applyFilters(rows, attrs, sel).ids, ['honey'])
  assert.equal(selectionQuery(without(sel, { stock: true }), attrs, 'মধু'), new URLSearchParams({ q: 'মধু', 'সার্টিফায়েড': '1' }).toString())
  assert.deepEqual(applyFilters(rows, attrs, readSelection(new URLSearchParams(''), attrs)).ids, ['honey', 'mango', 'gur', 'plain'])
  for (const bad of ['page', 'Q', 'min.weight', 'price.x', 'a=b', '']) assert.equal(isAttributeName(bad), false, bad)
  assert.equal(isAttributeName('উৎস'), true)
})
