import assert from 'node:assert/strict'
import { test } from 'node:test'
import { registrationAllowed, validateRuntime } from './runtime.ts'

test('production registration is closed by default and allowlists match complete emails', () => {
  assert.equal(registrationAllowed('owner@example.test', { NODE_ENV: 'production' }), false)
  const env = { SIGNUP_MODE: 'allowlist', SIGNUP_EMAIL_ALLOWLIST: ' Owner@Example.test, staff@example.test ' }
  assert.equal(registrationAllowed('owner@example.test', env), true)
  assert.equal(registrationAllowed('owner@example.test.attacker.com', env), false)
  assert.equal(registrationAllowed('any@example.test', {}), true)
})
test('startup errors identify missing configuration without disclosing secret values', () => {
  assert.throws(() => validateRuntime('api', { NODE_ENV: 'production', COURIER_KEY: 'do-not-print-this' }), /DATABASE_URL/)
  validateRuntime('api', {})
  const env = { NODE_ENV: 'production', DATABASE_URL: 'postgres://secret', R2_BUCKET: 'media', R2_ACCOUNT_ID: 'id', R2_ACCESS_KEY_ID: 'key', R2_SECRET_ACCESS_KEY: 'secret', MEDIA_PUBLIC_URL: 'https://media.example.test', COURIER_KEY: 'x'.repeat(32), STOREFRONT_DOMAIN: 'shops.example.test' }
  validateRuntime('api', env)
  validateRuntime('storefront', env)
  assert.throws(() => validateRuntime('storefront', { ...env, STOREFRONT_DOMAIN: 'https://shops.example.test' }), /STOREFRONT_DOMAIN/)
  assert.throws(() => validateRuntime('api', { ...env, SIGNUP_MODE: 'allowlist' }), /SIGNUP_EMAIL_ALLOWLIST/)
})
