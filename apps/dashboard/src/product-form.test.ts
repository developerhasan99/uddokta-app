import assert from 'node:assert/strict'
import { test } from 'node:test'
import { linkAddress, parseAmount, searchDescription, slugify, variantsFor, variantTotal, type VariantDraft } from './product-form.ts'

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

test('links accept what sellers type and refuse anything that could run', () => {
  assert.equal(linkAddress('facebook.com/shop'), 'https://facebook.com/shop')
  assert.equal(linkAddress('http://a.com'), 'http://a.com/')
  assert.equal(linkAddress('a.com:8080/x'), 'https://a.com:8080/x')
  assert.equal(linkAddress('shop@a.com'), 'mailto:shop@a.com')
  assert.equal(linkAddress('+880 1700-000000'), 'tel:+8801700000000')
  for (const bad of ['', 'javascript:alert(1)', 'data:text/html,x', 'not a link', 'word', 'https://a.com/"x']) assert.equal(linkAddress(bad), null, bad)
})

test('addresses keep Bangla and lose punctuation', () => {
  assert.equal(slugify('লাল শাড়ি, Red!'), 'লাল-শাড়ি-red')
  assert.equal(slugify('র‍্যাক'), 'র‍্যাক')
  assert.equal(slugify('!!!'), '')
})

test('the search description is plain text that fits', () => {
  assert.equal(searchDescription('<h2>সুতি</h2><p><strong>নরম</strong>&nbsp;&amp; <a href="https://a.com">ভালো</a></p><ul><li>এক</li></ul>'), 'সুতি নরম & ভালো এক')
  const long = searchDescription(`<p>${'ক'.repeat(300)}</p>`)
  assert.equal(long.length, 160)
  assert.ok(long.endsWith('...'))
})
