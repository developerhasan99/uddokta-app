import assert from 'node:assert/strict'
import { test } from 'node:test'

// Production loads the console on its own, never after the seller API. A circular import that only works when the API
// is loaded first (console.test.ts does that) must fail here instead of in a deploy.
test('the console server loads on its own', async () => {
  const { createConsole } = await import('./app.ts')
  assert.equal(typeof createConsole().fetch, 'function')
})
