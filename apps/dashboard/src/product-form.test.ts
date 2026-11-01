import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseAmount, variantsFor, variantTotal, type VariantDraft } from './product-form.ts'

const draft = (options: string[], price = '100', extra = {}): VariantDraft => ({ options, price, comparePrice: '', cost: '50', sku: '', stock: '', ...extra })

test('amounts accept Bangla and English digits and nothing else', () => {
  assert.equal(parseAmount('১২০০'), 1200)
  assert.equal(parseAmount(' 1,250 '), 1250)
  for (const bad of ['', '12.5', '-1', 'abc', '99999999999']) assert.equal(parseAmount(bad), null, bad)
})

test('every combination gets a variant, in option order', () => {
  const options = [{ name: 'Size', values: ['M', 'L'] }, { name: 'Colour', values: ['Red', 'Blue'] }]
  assert.equal(variantTotal(options), 4)
  assert.deepEqual(variantsFor(options, []).map((v) => v.options), [['M', 'Red'], ['M', 'Blue'], ['L', 'Red'], ['L', 'Blue']])
})

test('an option with no values yet does not change anything', () => {
  const options = [{ name: 'Size', values: [] }]
  assert.equal(variantTotal(options), 1)
  const only = draft([], '100', { id: 'a', sku: 'X' })
  assert.deepEqual(variantsFor(options, [only]), [only])
})

test('existing variants stay as they are; new ones copy prices but not SKU or stock', () => {
  const m = draft(['M'], '500', { id: 'a', sku: 'S-M', stock: '3' })
  const [kept, added] = variantsFor([{ name: 'Size', values: ['M', 'L'] }], [m])
  assert.equal(kept, m)
  assert.deepEqual(added, { options: ['L'], price: '500', comparePrice: '', cost: '50', sku: '', stock: '' })
})
