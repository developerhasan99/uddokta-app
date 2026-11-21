import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseCsv, readProductFile } from './product-import.ts'

const csv = (rows: (string | number)[][]) => rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n')

test('CSV fields may hold commas, quotes, line breaks and a byte-order mark', () => {
  assert.deepEqual(parseCsv('﻿a,"b, c","say ""hi""\nthere"\r\n1,,3\n\n'), [['a', 'b, c', 'say "hi"\nthere'], ['1', '', '3']])
})

test('other files are not product exports', () => {
  assert.equal(readProductFile('name,price\nShirt,100'), null)
  assert.equal(readProductFile(''), null)
})

const shopifyHead = ['Handle', 'Title', 'Body (HTML)', 'Vendor', 'Type', 'Tags', 'Published', 'Option1 Name', 'Option1 Value', 'Option2 Name', 'Option2 Value', 'Variant SKU', 'Variant Inventory Tracker', 'Variant Inventory Qty', 'Variant Price', 'Variant Compare At Price', 'Image Src', 'Image Position', 'Image Alt Text', 'SEO Title', 'SEO Description', 'Variant Image', 'Cost per item', 'Status']

test('Shopify: variants, images, prices, stock and costs come in; image rows are not variants', () => {
  const file = readProductFile(csv([
    shopifyHead,
    ['tee', 'Cotton tee', '<h1 class="x">Soft</h1><p style="color:red">Pure <b>cotton</b></p><script>bad()</script><img src="a.jpg">', 'Acme', 'Shirts', 'summer, cotton', 'true', 'Size', 'M', 'Colour', 'Red', 'T-M-R', 'shopify', '5', '499.50', '650', 'https://cdn.shopify.com/tee-1.jpg', '1', 'Front', 'Tee SEO', 'Tee description', 'https://cdn.shopify.com/tee-red.jpg', '200', 'active'],
    ['tee', '', '', '', '', '', '', '', 'M', '', 'Blue', 'T-M-B', 'shopify', '-2', '499', '', 'https://cdn.shopify.com/tee-2.jpg', '2', '', '', '', '', '', ''],
    ['tee', '', '', '', '', '', '', '', 'L', '', 'Red', 'T-L-R', 'shopify', '1', '520', '', '', '', '', '', '', '', '', ''],
    ['tee', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', 'https://cdn.shopify.com/tee-3.jpg', '3', 'Back', '', '', '', '', ''],
  ]))!
  assert.equal(file.source, 'shopify')
  const [tee] = file.products
  assert.equal(tee.handle, 'tee')
  assert.equal(tee.description, '<h2>Soft</h2><p>Pure <strong>cotton</strong></p>')
  assert.deepEqual([tee.brand, tee.productType, tee.tags, tee.seoTitle, tee.status], ['Acme', 'Shirts', ['summer', 'cotton'], 'Tee SEO', 'draft'])
  assert.deepEqual(tee.options, [{ name: 'Size', values: ['M', 'L'] }, { name: 'Colour', values: ['Red', 'Blue'] }])
  // L/Blue was not in the file: added out of stock so the seller can sell or remove it.
  assert.deepEqual(tee.variants.map((v) => [v.options.join('/'), v.price, v.comparePrice, v.stock, v.sku, v.cost]), [
    ['M/Red', 500, 650, 5, 'T-M-R', 200], ['M/Blue', 499, null, 0, 'T-M-B', null], ['L/Red', 520, null, 1, 'T-L-R', null], ['L/Blue', 500, 650, 0, '', 200],
  ])
  assert.deepEqual(tee.notes, ['addedVariants'])
  assert.deepEqual(tee.images.map((i) => [i.url.split('/').pop(), i.alt]), [['tee-1.jpg', 'Front'], ['tee-2.jpg', ''], ['tee-3.jpg', 'Back'], ['tee-red.jpg', '']])
  assert.equal(tee.variants[0].image, 'https://cdn.shopify.com/tee-red.jpg')
})

test('Shopify: a single "Default Title" variant means no options; every product arrives as a draft, whatever its status there', () => {
  const row = (handle: string, status: string, published: string, price = '100') => [handle, `Item ${handle}`, 'Plain words', '', '', '', published, 'Title', 'Default Title', '', '', '', '', '', price, '', '', '', '', '', '', '', '', status]
  const file = readProductFile(csv([shopifyHead, row('a', 'active', 'true'), row('b', 'draft', 'true'), row('c', 'archived', 'true'), row('d', 'active', 'false'), row('e', 'active', 'true', '')]))!
  const [a, b, c, d, e] = file.products
  assert.deepEqual(a.options, [])
  assert.deepEqual(a.variants.map((v) => [v.options, v.price, v.stock]), [[[], 100, null]])
  assert.equal(a.description, '<p>Plain words</p>')
  assert.deepEqual([a, b, c, d].map((p) => p.status), ['draft', 'draft', 'draft', 'draft'])
  // No price: kept as a draft at ৳0 so it cannot sell for nothing.
  assert.deepEqual([e.status, e.variants[0].price, e.notes], ['draft', 0, ['noPrice']])
})

test('Shopify: products over our variant limit are skipped with a reason', () => {
  const rows = [shopifyHead]
  for (let s = 0; s < 11; s++) for (let c = 0; c < 10; c++) rows.push(['big', s + c === 0 ? 'Big' : '', '', '', '', '', '', s + c === 0 ? 'Size' : '', `S${s}`, s + c === 0 ? 'Colour' : '', `C${c}`, '', '', '', '100', '', '', '', '', '', '', '', '', 'active'])
  const file = readProductFile(csv(rows))!
  assert.deepEqual(file.products, [])
  assert.deepEqual(file.skipped, [{ name: 'Big', reason: 'tooManyVariants' }])
})

const wooHead = ['ID', 'Type', 'SKU', 'Name', 'Published', 'Visibility in catalog', 'Short description', 'Description', 'In stock?', 'Stock', 'Sale price', 'Regular price', 'Categories', 'Tags', 'Images', 'Parent', 'Brands', 'Attribute 1 name', 'Attribute 1 value(s)', 'Attribute 2 name', 'Attribute 2 value(s)']

test('WooCommerce: simple and variable products, "any" values, sale prices and categories', () => {
  const file = readProductFile(csv([
    wooHead,
    [10, 'simple', 'MUG', 'Mug', 1, 'visible', '', 'First line\\nsecond line\\n\\nNew <em>paragraph</em>', 1, 7, '250', '300', 'Kitchen > Mugs, Gifts', 'gift, ceramic', 'https://shop.example/mug.jpg, https://shop.example/mug-2.jpg', '', 'Acme', 'Material', 'Ceramic', '', ''],
    [11, 'variable', 'HOOD', 'Hoodie', 1, 'hidden', 'Warm', '', 1, '', '', '', 'Clothes', '', 'https://shop.example/hood.jpg', '', '', 'Size', 'S\\, small, M, L', 'Colour', 'Grey, Black', ],
    [12, 'variation', 'HOOD-S-G', 'Hoodie - S, small', 1, '', '', '', 1, 3, '', '900', '', '', 'https://shop.example/hood-grey.jpg', 'id:11', '', 'Size', 'S\\, small', 'Colour', 'Grey'],
    [13, 'variation', 'HOOD-M', 'Hoodie - M', 1, '', '', '', 0, '', '', '950', '', '', '', 'HOOD', '', 'Size', 'M', 'Colour', ''],
    [14, 'grouped', '', 'Bundle', 1, '', '', '', 1, '', '', '', '', '', '', '', '', '', '', '', ''],
    [15, 'simple', '', 'Secret', 0, '', '', '', 1, '', '', '', '', '', '', '', '', '', '', '', ''],
  ]))!
  assert.equal(file.source, 'woocommerce')
  const [mug, hoodie, secret] = file.products
  assert.deepEqual([mug.handle, mug.status, mug.productType, mug.brand, mug.tags], ['Mug', 'draft', 'Mugs', 'Acme', ['gift', 'ceramic']])
  assert.equal(mug.description, '<p>First line<br>second line</p><p>New <em>paragraph</em></p>')
  // A simple product's attributes are facts, not buyer choices; the seller sets those up as Attributes later.
  assert.deepEqual(mug.options, [])
  assert.deepEqual(mug.variants.map((v) => [v.price, v.comparePrice, v.stock, v.sku]), [[250, 300, 7, 'MUG']])
  assert.equal(mug.images.length, 2)

  assert.equal(hoodie.status, 'draft', 'imports wait as drafts for the seller to check')
  assert.equal(hoodie.description, '<p>Warm</p>')
  // Colour is "any" on the M variation, so every parent colour is offered; Size uses only the sizes sold.
  assert.deepEqual(hoodie.options, [{ name: 'Size', values: ['S, small', 'M'] }, { name: 'Colour', values: ['Grey', 'Black'] }])
  assert.deepEqual(hoodie.variants.map((v) => [v.options.join('/'), v.price, v.stock, v.sku, v.image?.split('/').pop() ?? null]), [
    ['S, small/Grey', 900, 3, 'HOOD-S-G', 'hood-grey.jpg'], ['S, small/Black', 900, 0, '', null], ['M/Grey', 950, 0, 'HOOD-M', null], ['M/Black', 950, 0, '', null],
  ])
  assert.deepEqual(hoodie.notes, ['addedVariants'])
  assert.deepEqual(hoodie.images.map((i) => i.url.split('/').pop()), ['hood.jpg', 'hood-grey.jpg'])

  assert.deepEqual([secret.status, secret.notes], ['draft', ['noPrice']])
  assert.deepEqual(file.skipped, [{ name: 'Bundle', reason: 'unsupportedType' }])
})

test('more than 20 images keeps the first 20, and a variant image that did not fit is cleared', () => {
  const rows = [shopifyHead, ['p', 'P', '', '', '', '', '', 'Title', 'Default Title', '', '', '', '', '', '10', '', 'https://x.test/0.jpg', '1', '', '', '', 'https://x.test/v.jpg', '', 'active']]
  for (let i = 1; i < 21; i++) rows.push(['p', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', `https://x.test/${i}.jpg`, String(i + 1), '', '', '', '', '', ''])
  const [p] = readProductFile(csv(rows))!.products
  assert.equal(p.images.length, 20)
  assert.equal(p.variants[0].image, null)
  assert.deepEqual(p.notes, ['imagesCut'])
})
