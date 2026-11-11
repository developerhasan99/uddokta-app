import assert from 'node:assert/strict'
import { test } from 'node:test'
import { cleanHtml } from './rich.ts'

test('custom HTML keeps layout markup and drops anything that could run code or break the page', () => {
  assert.equal(cleanHtml('<div class="box" style="color:red;padding:8px"><h2>Hi</h2><p>Text <a href="https://x.com" target="_blank">link</a></p><img src="https://x.com/a.png" alt="A" width="20"></div>'),
    '<div class="box" style="color:red;padding:8px"><h2>Hi</h2><p>Text <a href="https://x.com" target="_blank" rel="noopener noreferrer">link</a></p><img src="https://x.com/a.png" alt="A" width="20"></div>')
  const attacks = [
    '<script>alert(1)</script>', '<img src=x onerror=alert(1)>', '<a href="javascript:alert(1)">x</a>', '<a href="&#106;avascript:alert(1)">x</a>',
    '<iframe src="https://evil.example"></iframe>', '<svg onload=alert(1)><script>alert(1)</script></svg>', '<div onclick="alert(1)">x</div>',
    '<form action="https://evil.example"><input name=p></form>', '<style>body{display:none}</style>', '<img src="https://x.com/a.png" alt="x" onerror="alert(1)">',
    '<div style="x" onmouseover="alert(1)">', '<scr<script>ipt>alert(1)</script>',
  ]
  for (const attack of attacks) {
    const out = cleanHtml(attack)
    assert.doesNotMatch(out, /<script|<iframe|<svg|<form|<input|<style|\son[a-z]+=|javascript:/i, `${attack} → ${out}`)
  }
  assert.equal(cleanHtml('</div></main><p>x'), '<p>x</p>', 'unmatched closers are dropped and open tags are closed')
  assert.equal(cleanHtml('a < b'), 'a &lt; b')
  assert.equal(cleanHtml(`<p title="a' onmouseover='alert(1)">x</p>`), `<p title="a' onmouseover='alert(1)">x</p>`, 'quotes inside a title stay text')
})
