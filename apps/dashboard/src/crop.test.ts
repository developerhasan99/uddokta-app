import assert from 'node:assert/strict'
import { test } from 'node:test'
import { centered, moved, resized, toPixels } from './crop.ts'

test('a centred crop is the largest that fits the ratio', () => {
  assert.deepEqual(centered(1, 2000, 1000), { x: 500, y: 0, w: 1000, h: 1000 })
  assert.deepEqual(centered(2, 1000, 1000), { x: 0, y: 250, w: 1000, h: 500 })
  assert.deepEqual(centered(null, 800, 600), { x: 0, y: 0, w: 800, h: 600 })
})

test('moving stays inside the image', () => {
  const rect = { x: 10, y: 10, w: 100, h: 100 }
  assert.deepEqual(moved(rect, -50, 9999, 500, 500), { x: 0, y: 400, w: 100, h: 100 })
})

test('resizing keeps the opposite corner fixed', () => {
  const rect = { x: 100, y: 100, w: 200, h: 200 }
  assert.deepEqual(resized(rect, 'se', 50, 20, null, 1000, 1000), { x: 100, y: 100, w: 250, h: 220 })
  assert.deepEqual(resized(rect, 'nw', -50, -20, null, 1000, 1000), { x: 50, y: 80, w: 250, h: 220 })
})

test('resizing stops at the image edge and at a minimum size', () => {
  const rect = { x: 100, y: 100, w: 200, h: 200 }
  assert.deepEqual(resized(rect, 'se', 9999, 9999, null, 500, 400), { x: 100, y: 100, w: 400, h: 300 })
  assert.deepEqual(resized(rect, 'se', -9999, -9999, null, 500, 400), { x: 100, y: 100, w: 20, h: 20 })
})

test('resizing keeps the ratio, even against an edge', () => {
  const next = resized({ x: 0, y: 0, w: 100, h: 100 }, 'se', 9999, 0, 1, 1000, 300)
  assert.deepEqual([next.w, next.h], [300, 300])
  const wide = resized({ x: 0, y: 0, w: 160, h: 90 }, 'se', 160, 0, 16 / 9, 1000, 1000)
  assert.equal(Math.round(wide.w / wide.h * 100) / 100, 1.78)
})

test('pixel values never pass the image edge', () => {
  assert.deepEqual(toPixels({ x: 99.6, y: 0, w: 900.6, h: 10.4 }, 1000, 1000), { x: 100, y: 0, width: 900, height: 10 })
})
